import { NextResponse } from "next/server";

/**
 * Stub route so Next.js type validation matches the App Router layout.
 * Magic-link email auth is not enabled; clients should use email-password or OAuth.
 */
export async function GET() {
  return NextResponse.json(
    { error: "Email magic link is not enabled." },
    { status: 501 }
  );
}

export async function POST() {
  return NextResponse.json(
    { error: "Email magic link is not enabled." },
    { status: 501 }
  );
}
