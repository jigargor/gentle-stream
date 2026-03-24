/**
 * GET  /api/user/preferences  — current session user’s profile (requires cookie auth)
 * POST /api/user/preferences  — update allowed fields (currently `gameRatio` only)
 *
 * `userRole` is not writable from the client; promote creators in Supabase / admin only.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  getOrCreateUserProfile,
  updateUserPreferences,
} from "@/lib/db/users";

export async function GET() {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const profile = await getOrCreateUserProfile(user.id);
    return NextResponse.json(profile);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as { gameRatio?: unknown };

    if (body.gameRatio === undefined) {
      return NextResponse.json(
        { error: "Provide gameRatio (number from 0 to 1)" },
        { status: 400 }
      );
    }

    const gameRatio = body.gameRatio;
    if (
      typeof gameRatio !== "number" ||
      Number.isNaN(gameRatio) ||
      gameRatio < 0 ||
      gameRatio > 1
    ) {
      return NextResponse.json(
        { error: "gameRatio must be a number from 0 to 1" },
        { status: 400 }
      );
    }

    const updated = await updateUserPreferences(user.id, { gameRatio });
    return NextResponse.json(updated);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
