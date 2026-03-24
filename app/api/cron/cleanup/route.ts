/**
 * GET /api/cron/cleanup
 *
 * Deletes expired articles from the DB.
 * Run nightly (e.g. 3am UTC).
 *
 * Protect with CRON_SECRET.
 */

import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/cron/verifyRequest";
import { deleteExpiredArticles } from "@/lib/db/articles";

export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const deleted = await deleteExpiredArticles();
    console.log(`[Cleanup] Deleted ${deleted} expired articles`);
    return NextResponse.json({ ok: true, deleted, ranAt: new Date().toISOString() });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
