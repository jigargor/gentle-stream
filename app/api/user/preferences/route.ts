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
import type { GameType } from "@/lib/games/types";

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

    const body = (await request.json()) as {
      gameRatio?: unknown;
      enabledGameTypes?: unknown;
    };

    const wantsGameRatio = body.gameRatio !== undefined;
    const wantsEnabledTypes = body.enabledGameTypes !== undefined;
    if (!wantsGameRatio && !wantsEnabledTypes) {
      return NextResponse.json(
        { error: "Provide gameRatio and/or enabledGameTypes" },
        { status: 400 }
      );
    }

    let gameRatio: number | undefined;
    if (wantsGameRatio) {
      if (
        typeof body.gameRatio !== "number" ||
        Number.isNaN(body.gameRatio) ||
        body.gameRatio < 0 ||
        body.gameRatio > 1
      ) {
        return NextResponse.json(
          { error: "gameRatio must be a number from 0 to 1" },
          { status: 400 }
        );
      }
      gameRatio = body.gameRatio;
    }

    let enabledGameTypes: GameType[] | undefined;
    if (wantsEnabledTypes) {
      if (!Array.isArray(body.enabledGameTypes)) {
        return NextResponse.json(
          { error: "enabledGameTypes must be an array of game type strings" },
          { status: 400 }
        );
      }
      enabledGameTypes = body.enabledGameTypes.filter(
        (v): v is GameType => typeof v === "string"
      ) as GameType[];
      if (enabledGameTypes.length === 0) {
        return NextResponse.json(
          { error: "Select at least one game type" },
          { status: 400 }
        );
      }
    }

    const updated = await updateUserPreferences(user.id, {
      ...(gameRatio !== undefined ? { gameRatio } : {}),
      ...(enabledGameTypes !== undefined ? { enabledGameTypes } : {}),
    });
    return NextResponse.json(updated);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
