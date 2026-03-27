/**
 * GET /api/cron/cleanup
 *
 * TTL cleanup is currently disabled.
 * This route remains for operational compatibility and observability.
 *
 * Protect with CRON_SECRET.
 */

import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/cron/verifyRequest";

export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    console.log("[Cleanup] Skipped: article TTL cleanup is disabled");
    return NextResponse.json({
      ok: true,
      deleted: 0,
      skipped: true,
      reason: "article TTL cleanup disabled",
      ranAt: new Date().toISOString(),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
