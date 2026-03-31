import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/cron/verifyRequest";
import { db } from "@/lib/db/client";
import { API_ERROR_CODES, apiErrorResponse } from "@/lib/api/errors";
import { captureException, captureMessage, flushOnShutdown, startSpan } from "@/lib/observability";

const WINDOW_HOURS = 24;
const MIN_EVENT_ACCEPT_RATE = 0.95;
const MIN_DIVERSITY_PER_10 = 3;
const MAX_FEED_P95_MS = 1500;

interface HealthStatus {
  ok: boolean;
  alerts: string[];
  metrics: Record<string, number>;
  checkedAt: string;
}

async function getEventMetrics(sinceIso: string): Promise<Record<string, number>> {
  const { count: totalEvents, error: totalErr } = await db
    .from("article_engagement_events")
    .select("id", { count: "exact", head: true })
    .gte("occurred_at", sinceIso);
  if (totalErr) throw new Error(totalErr.message);

  const { count: affinityRows, error: affinityErr } = await db
    .from("user_article_affinity")
    .select("user_id", { count: "exact", head: true })
    .gt("updated_at", sinceIso);
  if (affinityErr) throw new Error(affinityErr.message);

  const { data: articles, error: articlesErr } = await db
    .from("articles")
    .select("category,fetched_at,used_count");
  if (articlesErr) throw new Error(articlesErr.message);

  const categoryCounts: Record<string, number> = {};
  let usedCountTotal = 0;
  let newestFetch = 0;
  for (const row of articles ?? []) {
    categoryCounts[row.category] = (categoryCounts[row.category] ?? 0) + 1;
    usedCountTotal += row.used_count ?? 0;
    const t = Date.parse(row.fetched_at);
    if (!Number.isNaN(t)) newestFetch = Math.max(newestFetch, t);
  }

  const uniqueCats = Object.values(categoryCounts).filter((n) => n > 0).length;
  const repeatRate = (articles?.length ?? 0) === 0 ? 0 : usedCountTotal / (articles?.length ?? 1);
  const freshnessHours =
    newestFetch === 0 ? 999 : (Date.now() - newestFetch) / (1000 * 60 * 60);

  return {
    totalEvents24h: totalEvents ?? 0,
    affinityRows24h: affinityRows ?? 0,
    uniqueCategoriesAvailable: uniqueCats,
    repeatExposureRate: repeatRate,
    freshnessHours,
    diversityPer10: uniqueCats, // proxy when per-feed sampling telemetry is absent
    eventAcceptRate: 1, // endpoint currently returns accepted insert count only
    feedApiP95Ms: 0, // placeholder until request timing metrics are persisted
  };
}

function evaluateAlerts(metrics: Record<string, number>): string[] {
  const alerts: string[] = [];
  if ((metrics.eventAcceptRate ?? 0) < MIN_EVENT_ACCEPT_RATE) {
    alerts.push(
      `eventAcceptRate below threshold (${metrics.eventAcceptRate.toFixed(
        3
      )} < ${MIN_EVENT_ACCEPT_RATE})`
    );
  }
  if ((metrics.diversityPer10 ?? 0) < MIN_DIVERSITY_PER_10) {
    alerts.push(
      `diversityPer10 below threshold (${metrics.diversityPer10.toFixed(
        2
      )} < ${MIN_DIVERSITY_PER_10})`
    );
  }
  if ((metrics.feedApiP95Ms ?? 0) > MAX_FEED_P95_MS) {
    alerts.push(
      `feedApiP95Ms above threshold (${metrics.feedApiP95Ms.toFixed(
        0
      )} > ${MAX_FEED_P95_MS})`
    );
  }
  if ((metrics.freshnessHours ?? 0) > WINDOW_HOURS) {
    alerts.push(
      `freshnessHours stale (${metrics.freshnessHours.toFixed(
        1
      )}h > ${WINDOW_HOURS}h)`
    );
  }
  return alerts;
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

  try {
    const span = startSpan("cron.engagement_health", {
      traceId: request.headers.get("x-trace-id") ?? undefined,
    });
    const sinceIso = new Date(
      Date.now() - WINDOW_HOURS * 60 * 60 * 1000
    ).toISOString();
    const metrics = await getEventMetrics(sinceIso);
    const alerts = evaluateAlerts(metrics);
    const status: HealthStatus = {
      ok: alerts.length === 0,
      alerts,
      metrics,
      checkedAt: new Date().toISOString(),
    };
    if (!status.ok) {
      console.error("[EngagementHealth] Alerts:", alerts, metrics);
      captureMessage({
        level: "warning",
        message: "cron.engagement_health.alerts",
        context: { alertCount: alerts.length, sinceIso },
      });
    } else {
      console.log("[EngagementHealth] OK", metrics);
    }
    span.end({ ok: status.ok, alertCount: alerts.length });
    await flushOnShutdown();
    return NextResponse.json(status);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    captureException(error, {
      route: "cron.engagement_health",
      traceId: request.headers.get("x-trace-id") ?? undefined,
    });
    await flushOnShutdown();
    return apiErrorResponse({
      request,
      status: 500,
      code: API_ERROR_CODES.INTERNAL,
      message,
    });
  }
}

