/**
 * GET  /api/user/preferences?userId=...  — fetch profile
 * POST /api/user/preferences              — update preferences
 */

import { NextRequest, NextResponse } from "next/server";
import {
  getOrCreateUserProfile,
  updateUserPreferences,
} from "@/lib/db/users";

export async function GET(request: NextRequest) {
  const userId = request.nextUrl.searchParams.get("userId");
  if (!userId) {
    return NextResponse.json({ error: "userId required" }, { status: 400 });
  }

  try {
    const profile = await getOrCreateUserProfile(userId);
    return NextResponse.json(profile);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, ...prefs } = body;

    if (!userId) {
      return NextResponse.json({ error: "userId required" }, { status: 400 });
    }

    const updated = await updateUserPreferences(userId, prefs);
    return NextResponse.json(updated);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
