/**
 * GET /api/cron/scheduler
 *
 * Checks article stock per category. For any category below STOCK_THRESHOLD,
 * triggers the ingest agent. Designed to run on a schedule (e.g. every 30 min).
 *
 * On Vercel: add to vercel.json crons array (see README).
 * Protect with CRON_SECRET so only the scheduler can call it.
 */

import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/cron/verifyRequest";
import { getAvailableStockSnapshotByCategory } from "@/lib/db/articles";
import { runIngestAgent } from "@/lib/agents/ingestAgent";
import {
  appendCronIngestCategoryLogs,
  createCronIngestRun,
  finishCronIngestRun,
  type CronIngestCategoryLogInput,
} from "@/lib/db/cronIngestLogs";
import {
  CATEGORIES,
  FRESHNESS_INGEST_HOURS,
  INGEST_BATCH_SIZE,
  STOCK_TARGET,
  STOCK_THRESHOLD,
  STOCK_TOP_UP_MAX_PER_RUN,
} from "@/lib/constants";
import type { Category } from "@/lib/constants";
import { API_ERROR_CODES, apiErrorResponse } from "@/lib/api/errors";
import { captureException, captureMessage, flushOnShutdown, startSpan } from "@/lib/observability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const DEFAULT_RUNTIME_BUDGET_MS = 240_000;
const DEFAULT_MAX_EXPANSIONS_PER_RUN = 20;

function readPositiveInt(value: string | undefined, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.trunc(n);
}

function isTruthy(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function resolveIngestPipeline(category: Category): "legacy" | "overhaul" {
  const enabledFlag = process.env.INGEST_OVERHAUL_ENABLED;
  const enabled = enabledFlag == null ? true : isTruthy(enabledFlag);
  if (!enabled) return "legacy";

  const canaryRaw = process.env.INGEST_OVERHAUL_CANARY_CATEGORIES ?? "";
  const canary = canaryRaw
    .split(",")
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);
  if (canary.length === 0) return "overhaul";
  return canary.includes(category.toLowerCase()) ? "overhaul" : "legacy";
}

export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return apiErrorResponse({
      request,
      status: 401,
      code: API_ERROR_CODES.UNAUTHORIZED,
      message: "Unauthorized",
    });
  }

  const runStartedAt = Date.now();
  const traceId = request.headers.get("x-trace-id") ?? undefined;
  const span = startSpan("cron.scheduler", { traceId });
  const triggerSource = request.headers.get("x-vercel-cron") ? "vercel-cron" : "manual";
  let runId: string;
  try {
    runId = await createCronIngestRun(triggerSource);
    captureMessage({
      level: "info",
      message: "cron.scheduler.run_started",
      context: { runId, triggerSource, traceId },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    captureException(error, { route: "cron.scheduler", phase: "create_run", traceId });
    return apiErrorResponse({
      request,
      status: 500,
      code: API_ERROR_CODES.INTERNAL,
      message: `Could not create ingest run: ${message}`,
    });
  }

  const report: Record<
    string,
    {
      before: number;
      requested: number;
      ingested: number;
      newestFetchedAt: string | null;
      reason: "threshold" | "freshness" | "none";
      error?: string;
    }
  > = {};
  const categoryLogs: CronIngestCategoryLogInput[] = [];
  let hadErrors = false;
  let warningCount = 0;
  let totalInserted = 0;
  let totalAttempted = 0;
  let totalSkipped = 0;
  let totalFailed = 0;
  let totalRetried = 0;
  let totalCandidates = 0;
  let totalPrecheckRejected = 0;
  let totalExpansions = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let categoriesChecked = 0;
  let remainingExpansionBudget = readPositiveInt(
    process.env.CRON_INGEST_MAX_EXPANSIONS_PER_RUN,
    DEFAULT_MAX_EXPANSIONS_PER_RUN
  );
  const runtimeBudgetMs = readPositiveInt(
    process.env.CRON_INGEST_RUNTIME_BUDGET_MS,
    DEFAULT_RUNTIME_BUDGET_MS
  );
  let stoppedByRuntimeBudget = false;
  let stoppedByExpansionBudget = false;
  const errorSummaryParts: string[] = [];

  try {
    const snapshot = await getAvailableStockSnapshotByCategory();
    const nowMs = Date.now();

    for (const cat of CATEGORIES) {
      const elapsedMs = Date.now() - runStartedAt;
      if (elapsedMs >= runtimeBudgetMs) {
        stoppedByRuntimeBudget = true;
        console.warn(
          `[Scheduler] Runtime budget hit (${elapsedMs}ms/${runtimeBudgetMs}ms). Ending run early.`
        );
        break;
      }
      if (remainingExpansionBudget <= 0) {
        stoppedByExpansionBudget = true;
        console.warn("[Scheduler] Expansion budget exhausted. Ending run early.");
        break;
      }

      const row = snapshot[cat];
      const available = row?.count ?? 0;
      const newestFetchedAt = row?.newestFetchedAt ?? null;
      report[cat] = {
        before: available,
        requested: 0,
        ingested: 0,
        newestFetchedAt,
        reason: "none",
      };

      const freshnessStale =
        newestFetchedAt == null ||
        nowMs - Date.parse(newestFetchedAt) >
          FRESHNESS_INGEST_HOURS * 60 * 60 * 1000;

      let ingestCount = 0;
      let reason: "threshold" | "freshness" | "none" = "none";
      if (available < STOCK_THRESHOLD) {
        const deficitToTarget = Math.max(INGEST_BATCH_SIZE, STOCK_TARGET - available);
        ingestCount = Math.min(STOCK_TOP_UP_MAX_PER_RUN, deficitToTarget);
        reason = "threshold";
      } else if (freshnessStale) {
        ingestCount = 2;
        reason = "freshness";
      }

      report[cat].requested = ingestCount;
      report[cat].reason = reason;

      if (ingestCount === 0) {
        categoriesChecked += 1;
        categoryLogs.push({
          category: cat,
          beforeCount: available,
          requestedCount: 0,
          insertedCount: 0,
          attemptedCount: 0,
          skippedCount: 0,
          failedCount: 0,
          retryCount: 0,
          durationMs: 0,
          warningFlag: false,
          reason,
          newestFetchedAt,
          candidateCount: 0,
          precheckRejectedCount: 0,
          expansionCount: 0,
          inputTokens: 0,
          outputTokens: 0,
          insertPer1kTokens: 0,
          duplicateSkipRate: 0,
          pipelineMode: "legacy",
        });
        continue;
      }

      const cappedIngestCount = Math.min(ingestCount, remainingExpansionBudget);
      report[cat].requested = cappedIngestCount;

      console.log(
        reason === "threshold"
          ? `[Scheduler] "${cat}" has ${available} articles (threshold: ${STOCK_THRESHOLD}, target: ${STOCK_TARGET}) — ingesting ${cappedIngestCount}`
          : `[Scheduler] "${cat}" stock is healthy (${available}) but stale (>${FRESHNESS_INGEST_HOURS}h) — ingesting freshness refill (${cappedIngestCount})`
      );

      const categoryStartedAt = Date.now();
      try {
        const pipeline = resolveIngestPipeline(cat as Category);
        const remainingRuntimeMs = Math.max(5_000, runtimeBudgetMs - (Date.now() - runStartedAt) - 2_000);
        const result = await runIngestAgent(cat as Category, cappedIngestCount, {
          pipeline,
          maxExpansionCalls: cappedIngestCount,
          softDeadlineMs: remainingRuntimeMs,
        });
        const insertedCount = result.inserted.length;
        const warningFlag =
          result.failedCount > 0 || (cappedIngestCount > 0 && insertedCount === 0);
        if (warningFlag) warningCount += 1;
        categoriesChecked += 1;

        report[cat].ingested = insertedCount;
        if (result.errorSummary) report[cat].error = result.errorSummary;

        totalInserted += insertedCount;
        totalAttempted += result.attemptedCount;
        totalSkipped += result.skippedCount;
        totalFailed += result.failedCount;
        totalRetried += result.retryCount;
        totalCandidates += result.candidateCount;
        totalPrecheckRejected += result.precheckRejectedCount;
        totalExpansions += result.expansionCount;
        totalInputTokens += result.inputTokens;
        totalOutputTokens += result.outputTokens;
        remainingExpansionBudget = Math.max(0, remainingExpansionBudget - result.expansionCount);

        if (result.errorSummary) {
          errorSummaryParts.push(`${cat}: ${result.errorSummary}`);
        }

        categoryLogs.push({
          category: cat,
          beforeCount: available,
          requestedCount: cappedIngestCount,
          insertedCount,
          attemptedCount: result.attemptedCount,
          skippedCount: result.skippedCount,
          failedCount: result.failedCount,
          retryCount: result.retryCount,
          durationMs: result.durationMs || Date.now() - categoryStartedAt,
          warningFlag,
          reason,
          newestFetchedAt,
          errorMessage: report[cat].error,
          errorSummary: result.errorSummary ?? undefined,
          candidateCount: result.candidateCount,
          precheckRejectedCount: result.precheckRejectedCount,
          expansionCount: result.expansionCount,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          insertPer1kTokens: result.insertPer1kTokens,
          duplicateSkipRate: result.duplicateSkipRate,
          pipelineMode: result.pipelineMode,
        });
      } catch (e) {
        console.error(`[Scheduler] Ingest failed for "${cat}":`, e);
        captureException(e, {
          route: "cron.scheduler",
          runId,
          category: cat,
          traceId,
        });
        hadErrors = true;
        categoriesChecked += 1;
        const message = e instanceof Error ? e.message : "Unknown ingest error";
        report[cat].error = message;
        errorSummaryParts.push(`${cat}: ${message}`);
        totalFailed += cappedIngestCount;
        warningCount += 1;

        categoryLogs.push({
          category: cat,
          beforeCount: available,
          requestedCount: cappedIngestCount,
          insertedCount: 0,
          attemptedCount: cappedIngestCount,
          skippedCount: 0,
          failedCount: cappedIngestCount,
          retryCount: 0,
          durationMs: Date.now() - categoryStartedAt,
          warningFlag: true,
          reason,
          newestFetchedAt,
          errorMessage: message,
          errorSummary: message,
          candidateCount: 0,
          precheckRejectedCount: 0,
          expansionCount: cappedIngestCount,
          inputTokens: 0,
          outputTokens: 0,
          insertPer1kTokens: 0,
          duplicateSkipRate: 0,
          pipelineMode: resolveIngestPipeline(cat as Category),
        });
      }
    }
  } catch (e) {
    captureException(e, { route: "cron.scheduler", runId, phase: "loop", traceId });
    hadErrors = true;
    errorSummaryParts.push(
      e instanceof Error ? e.message : "Scheduler loop failed"
    );
  } finally {
    try {
      await appendCronIngestCategoryLogs(runId, categoryLogs);
    } catch (e) {
      captureException(e, { route: "cron.scheduler", runId, phase: "append_logs", traceId });
      hadErrors = true;
      errorSummaryParts.push(
        e instanceof Error ? e.message : "Could not append category logs"
      );
    }

    const insertPer1kTokens =
      totalInputTokens > 0 ? Number(((totalInserted * 1000) / totalInputTokens).toFixed(3)) : 0;
    const duplicateSkipRate =
      totalCandidates > 0 ? Number((totalPrecheckRejected / totalCandidates).toFixed(4)) : 0;

    const notes = `durationMs=${Date.now() - runStartedAt}; checked=${categoriesChecked}; runtimeBudgetMs=${runtimeBudgetMs}; stopRuntime=${stoppedByRuntimeBudget}; stopExpansion=${stoppedByExpansionBudget}`;
    try {
      await finishCronIngestRun(runId, {
        ok: !hadErrors,
        totalInserted,
        totalAttempted,
        totalSkipped,
        totalFailed,
        totalRetried,
        warningCount,
        errorSummary: errorSummaryParts.join(" | ").slice(0, 1200),
        categoriesChecked,
        totalCandidates,
        totalPrecheckRejected,
        totalExpansions,
        totalInputTokens,
        totalOutputTokens,
        insertPer1kTokens,
        duplicateSkipRate,
        notes,
      });
    } catch (e) {
      console.error("[Scheduler] Could not finish ingest run:", e);
      captureException(e, { route: "cron.scheduler", runId, phase: "finish_run", traceId });
    }
    captureMessage({
      level: hadErrors ? "warning" : "info",
      message: "cron.scheduler.run_finished",
      context: {
        runId,
        traceId,
        hadErrors,
        totalInserted,
        totalFailed,
        warningCount,
        durationMs: Date.now() - runStartedAt,
      },
    });
    span.end({
      runId,
      hadErrors,
      totalInserted,
      totalFailed,
      warningCount,
    });
    await flushOnShutdown();
  }

  return NextResponse.json({
    ok: !hadErrors,
    runId,
    totalInserted,
    totals: {
      attempted: totalAttempted,
      skipped: totalSkipped,
      failed: totalFailed,
      retried: totalRetried,
      warnings: warningCount,
      candidates: totalCandidates,
      precheckRejected: totalPrecheckRejected,
      expansions: totalExpansions,
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
    },
    budget: {
      runtimeMs: runtimeBudgetMs,
      stoppedByRuntimeBudget,
      stoppedByExpansionBudget,
      remainingExpansionBudget,
      categoriesChecked,
    },
    report,
    checkedAt: new Date().toISOString(),
  });
}
