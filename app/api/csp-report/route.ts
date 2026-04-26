import { NextRequest, NextResponse } from "next/server";
import { logWarning } from "@/lib/observability/logger";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    logWarning("security.csp_violation", { report: body });
  } catch {
    // Ignore malformed reports.
  }
  return new NextResponse(null, { status: 204 });
}
