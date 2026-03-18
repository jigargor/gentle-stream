/**
 * GET /api/cron/tagger
 *
 * Processes up to 20 untagged articles per run.
 * Runs on a faster schedule than the scheduler (e.g. every 5 min)
 * so articles are enriched quickly after ingest.
 *
 * Protect with CRON_SECRET.
 */

import { NextRequest, NextResponse } from "next/server";
import { runTaggerAgent } from "@/lib/agents/taggerAgent";

export async function GET(request: NextRequest) {
  const secret = request.headers.get("x-cron-secret");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await runTaggerAgent(20);
    return NextResponse.json({ ok: true, ranAt: new Date().toISOString() });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[/api/cron/tagger] Error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
