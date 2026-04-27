import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { API_ERROR_CODES, apiErrorResponse, internalErrorResponse } from "@/lib/api/errors";
import { isCreatorAccessDenied, requireCreatorAccess } from "@/lib/auth/creator-security";
import {
  type LlmProviderCallListRow,
  listLlmProviderCallsForUser,
} from "@/lib/db/llmProviderCalls";
import { getCreatorSettings } from "@/lib/db/creatorStudio";

const querySchema = z
  .object({
    days: z.coerce.number().int().min(1).max(366).optional(),
  })
  .strict();

function buildUsageSummary(rows: LlmProviderCallListRow[]) {
  let totalCost = 0;
  let totalIn = 0;
  let totalOut = 0;
  const byKey = new Map<
    string,
    {
      provider: string;
      model: string;
      estimatedCostUsd: number;
      callCount: number;
      inputTokens: number;
      outputTokens: number;
    }
  >();
  for (const row of rows) {
    const c = row.estimatedCostUsd != null && Number.isFinite(row.estimatedCostUsd) ? row.estimatedCostUsd : 0;
    totalCost += c;
    totalIn += row.inputTokens;
    totalOut += row.outputTokens;
    const k = `${row.provider}::${row.model ?? ""}`;
    const prev = byKey.get(k) ?? {
      provider: row.provider,
      model: row.model ?? "—",
      estimatedCostUsd: 0,
      callCount: 0,
      inputTokens: 0,
      outputTokens: 0,
    };
    prev.estimatedCostUsd += c;
    prev.callCount += 1;
    prev.inputTokens += row.inputTokens;
    prev.outputTokens += row.outputTokens;
    byKey.set(k, prev);
  }
  const byModel = Array.from(byKey.values())
    .map((entry) => ({
      ...entry,
      estimatedCostUsd: Number(entry.estimatedCostUsd.toFixed(6)),
    }))
    .sort((a, b) => b.estimatedCostUsd - a.estimatedCostUsd);
  return {
    totalEstimatedCostUsd: Number(totalCost.toFixed(6)),
    totalInputTokens: totalIn,
    totalOutputTokens: totalOut,
    callCount: rows.length,
    byModel,
  };
}

export async function GET(request: NextRequest) {
  try {
    const access = await requireCreatorAccess(request);
    if (isCreatorAccessDenied(access)) return access;
    const { searchParams } = new URL(request.url);
    const parsed = querySchema.safeParse({
      days: searchParams.get("days") ?? undefined,
    });
    if (!parsed.success) {
      return apiErrorResponse({
        request,
        status: 400,
        code: API_ERROR_CODES.VALIDATION,
        message: "Invalid query parameters.",
        details: parsed.error.flatten(),
      });
    }
    const days = parsed.data.days ?? 90;
    const since = new Date();
    since.setUTCDate(since.getUTCDate() - days);
    const { schemaAvailable } = await getCreatorSettings(access.userId);
    if (!schemaAvailable) {
      const res = NextResponse.json({
        period: { days, since: since.toISOString() },
        summary: {
          totalEstimatedCostUsd: 0,
          totalInputTokens: 0,
          totalOutputTokens: 0,
          callCount: 0,
          byModel: [] as Array<{
            provider: string;
            model: string;
            estimatedCostUsd: number;
            callCount: number;
            inputTokens: number;
            outputTokens: number;
          }>,
        },
        calls: [] as LlmProviderCallListRow[],
      });
      res.headers.set("X-Gentle-Stream-Creator-Db", "unavailable");
      return res;
    }
    const calls = await listLlmProviderCallsForUser({
      userId: access.userId,
      limit: 500,
      since,
    });
    const summary = buildUsageSummary(calls);
    return NextResponse.json({
      period: { days, since: since.toISOString() },
      summary,
      calls,
    });
  } catch (error: unknown) {
    return internalErrorResponse({ request, error });
  }
}
