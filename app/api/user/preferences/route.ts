/**
 * GET  /api/user/preferences  — current session user’s profile (requires cookie auth)
 * POST /api/user/preferences  — update allowed fields (currently `gameRatio` only)
 *
 * `userRole` is not writable from the client; promote creators in Supabase / admin only.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  getOrCreateUserProfile,
  updateUserPreferences,
} from "@/lib/db/users";
import type { GameType } from "@gentle-stream/domain/games/types";
import { API_ERROR_CODES, apiErrorResponse } from "@/lib/api/errors";

const preferencesBodySchema = z
  .object({
    gameRatio: z.number().min(0).max(1).optional(),
    enabledGameTypes: z.array(z.string()).min(1).optional(),
    themePreference: z.union([z.literal("light"), z.literal("dark"), z.null()]).optional(),
    weatherUnitSystem: z.union([z.literal("metric"), z.literal("imperial")]).optional(),
  })
  .strict();

export async function GET(request: NextRequest) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return apiErrorResponse({
        request,
        status: 401,
        code: API_ERROR_CODES.UNAUTHORIZED,
        message: "Unauthorized",
      });
    }

    const profile = await getOrCreateUserProfile(user.id);
    return NextResponse.json(profile);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return apiErrorResponse({
      request,
      status: 500,
      code: API_ERROR_CODES.INTERNAL,
      message,
    });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return apiErrorResponse({
        request,
        status: 401,
        code: API_ERROR_CODES.UNAUTHORIZED,
        message: "Unauthorized",
      });
    }

    const parsedBody = preferencesBodySchema.safeParse(await request.json());
    if (!parsedBody.success) {
      return apiErrorResponse({
        request,
        status: 400,
        code: API_ERROR_CODES.VALIDATION,
        message: "Invalid preferences payload.",
        details: parsedBody.error.flatten(),
      });
    }
    const body = parsedBody.data;

    const wantsGameRatio = body.gameRatio !== undefined;
    const wantsEnabledTypes = body.enabledGameTypes !== undefined;
    const wantsThemePreference = body.themePreference !== undefined;
    const wantsWeatherUnitSystem = body.weatherUnitSystem !== undefined;
    if (!wantsGameRatio && !wantsEnabledTypes && !wantsThemePreference && !wantsWeatherUnitSystem) {
      return apiErrorResponse({
        request,
        status: 400,
        code: API_ERROR_CODES.MISSING_FIELD,
        message: "Provide gameRatio, enabledGameTypes, themePreference, and/or weatherUnitSystem",
      });
    }

    let gameRatio: number | undefined;
    if (wantsGameRatio) {
      if (
        typeof body.gameRatio !== "number" ||
        Number.isNaN(body.gameRatio) ||
        body.gameRatio < 0 ||
        body.gameRatio > 1
      ) {
        return apiErrorResponse({
          request,
          status: 400,
          code: API_ERROR_CODES.VALIDATION,
          message: "gameRatio must be a number from 0 to 1",
        });
      }
      gameRatio = body.gameRatio;
    }

    let enabledGameTypes: GameType[] | undefined;
    if (wantsEnabledTypes) {
      if (!Array.isArray(body.enabledGameTypes)) {
        return apiErrorResponse({
          request,
          status: 400,
          code: API_ERROR_CODES.VALIDATION,
          message: "enabledGameTypes must be an array of game type strings",
        });
      }
      enabledGameTypes = body.enabledGameTypes.filter(
        (v): v is GameType => typeof v === "string"
      ) as GameType[];
      if (enabledGameTypes.length === 0) {
        return apiErrorResponse({
          request,
          status: 400,
          code: API_ERROR_CODES.VALIDATION,
          message: "Select at least one game type",
        });
      }
    }

    let themePreference: "light" | "dark" | null | undefined;
    if (wantsThemePreference) {
      if (body.themePreference == null) {
        themePreference = null;
      } else if (body.themePreference === "light" || body.themePreference === "dark") {
        themePreference = body.themePreference;
      } else {
        return apiErrorResponse({
          request,
          status: 400,
          code: API_ERROR_CODES.VALIDATION,
          message: "themePreference must be one of: light, dark, null",
        });
      }
    }

    let weatherUnitSystem: "metric" | "imperial" | undefined;
    if (wantsWeatherUnitSystem) {
      if (body.weatherUnitSystem === "metric" || body.weatherUnitSystem === "imperial") {
        weatherUnitSystem = body.weatherUnitSystem;
      } else {
        return apiErrorResponse({
          request,
          status: 400,
          code: API_ERROR_CODES.VALIDATION,
          message: "weatherUnitSystem must be one of: metric, imperial",
        });
      }
    }

    const updated = await updateUserPreferences(user.id, {
      ...(gameRatio !== undefined ? { gameRatio } : {}),
      ...(enabledGameTypes !== undefined ? { enabledGameTypes } : {}),
      ...(themePreference !== undefined ? { themePreference } : {}),
      ...(weatherUnitSystem !== undefined ? { weatherUnitSystem } : {}),
    });
    return NextResponse.json(updated);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return apiErrorResponse({
      request,
      status: 500,
      code: API_ERROR_CODES.INTERNAL,
      message,
    });
  }
}
