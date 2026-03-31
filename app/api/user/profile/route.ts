import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  getOrCreateUserProfile,
  updateUserDisplay,
  UsernameCooldownError,
} from "@/lib/db/users";
import { getSessionUserId } from "@/lib/api/sessionUser";
import { parseJsonBody } from "@/lib/validation/http";
import { API_ERROR_CODES, apiErrorResponse } from "@/lib/api/errors";

const USERNAME_RE = /^[a-z0-9_]{3,30}$/;
const EDGE_PUNCTUATION = ",.;:/\\|_-";

function collapseSpaces(input: string): string {
  return input
    .split(/\s+/)
    .filter(Boolean)
    .join(" ");
}

function trimEdgePunctuation(input: string): string {
  let start = 0;
  let end = input.length;
  while (start < end && EDGE_PUNCTUATION.includes(input[start] ?? "")) start += 1;
  while (end > start && EDGE_PUNCTUATION.includes(input[end - 1] ?? "")) end -= 1;
  return input.slice(start, end).trim();
}

function normalizeWeatherLocation(input: string): string {
  const collapsed = collapseSpaces(input.trim());
  return trimEdgePunctuation(collapsed);
}

const profilePatchSchema = z.object({
  displayName: z.union([z.string(), z.null()]).optional(),
  username: z.union([z.string(), z.null()]).optional(),
  avatarUrl: z.union([z.string(), z.null()]).optional(),
  weatherLocation: z.union([z.string(), z.null()]).optional(),
});

export async function GET(request: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) {
    return apiErrorResponse({
      request,
      status: 401,
      code: API_ERROR_CODES.UNAUTHORIZED,
      message: "Unauthorized",
    });
  }

  try {
    const profile = await getOrCreateUserProfile(userId);
    return NextResponse.json(profile);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return apiErrorResponse({
      request,
      status: 500,
      code: API_ERROR_CODES.INTERNAL,
      message,
    });
  }
}

export async function PATCH(request: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) {
    return apiErrorResponse({
      request,
      status: 401,
      code: API_ERROR_CODES.UNAUTHORIZED,
      message: "Unauthorized",
    });
  }

  const parsedBody = await parseJsonBody({
    request,
    schema: profilePatchSchema,
  });
  if (!parsedBody.ok) return parsedBody.response;
  const body = parsedBody.data;

  await getOrCreateUserProfile(userId);

  let displayName: string | null | undefined;
  let username: string | null | undefined;
  let avatarUrl: string | null | undefined;
  let weatherLocation: string | null | undefined;

  if (body.displayName !== undefined) {
    if (body.displayName === null) displayName = null;
    else if (typeof body.displayName === "string") {
      const t = body.displayName.trim();
      displayName = t.length ? t.slice(0, 80) : null;
    } else {
      return apiErrorResponse({
        request,
        status: 400,
        code: API_ERROR_CODES.VALIDATION,
        message: "Invalid displayName",
      });
    }
  }

  if (body.username !== undefined) {
    if (body.username === null || body.username === "") username = null;
    else if (typeof body.username === "string") {
      const u = body.username.trim().toLowerCase();
      if (!USERNAME_RE.test(u)) {
        return apiErrorResponse({
          request,
          status: 400,
          code: API_ERROR_CODES.VALIDATION,
          message:
            "Username must be 3–30 characters: lowercase letters, numbers, underscore",
        });
      }
      username = u;
    } else {
      return apiErrorResponse({
        request,
        status: 400,
        code: API_ERROR_CODES.VALIDATION,
        message: "Invalid username",
      });
    }
  }

  if (body.avatarUrl !== undefined) {
    if (body.avatarUrl === null || body.avatarUrl === "") avatarUrl = null;
    else if (typeof body.avatarUrl === "string") {
      const u = body.avatarUrl.trim();
      if (u.length > 2000) {
        return apiErrorResponse({
          request,
          status: 400,
          code: API_ERROR_CODES.VALIDATION,
          message: "avatarUrl too long",
        });
      }
      avatarUrl = u;
    } else {
      return apiErrorResponse({
        request,
        status: 400,
        code: API_ERROR_CODES.VALIDATION,
        message: "Invalid avatarUrl",
      });
    }
  }

  if (body.weatherLocation !== undefined) {
    if (body.weatherLocation === null || body.weatherLocation === "") weatherLocation = null;
    else if (typeof body.weatherLocation === "string") {
      const t = normalizeWeatherLocation(body.weatherLocation);
      if (t.length > 120) {
        return apiErrorResponse({
          request,
          status: 400,
          code: API_ERROR_CODES.VALIDATION,
          message: "weatherLocation too long",
        });
      }
      weatherLocation = t.length ? t : null;
    } else {
      return apiErrorResponse({
        request,
        status: 400,
        code: API_ERROR_CODES.VALIDATION,
        message: "Invalid weatherLocation",
      });
    }
  }

  if (
    displayName === undefined &&
    username === undefined &&
    avatarUrl === undefined &&
    weatherLocation === undefined
  ) {
    return apiErrorResponse({
      request,
      status: 400,
      code: API_ERROR_CODES.MISSING_FIELD,
      message: "No fields to update",
    });
  }

  try {
    const profile = await updateUserDisplay(userId, {
      ...(displayName !== undefined ? { displayName } : {}),
      ...(username !== undefined ? { username } : {}),
      ...(avatarUrl !== undefined ? { avatarUrl } : {}),
      ...(weatherLocation !== undefined ? { weatherLocation } : {}),
    });
    return NextResponse.json(profile);
  } catch (e: unknown) {
    if (e instanceof UsernameCooldownError) {
      return apiErrorResponse({
        request,
        status: 429,
        code: API_ERROR_CODES.RATE_LIMITED,
        message: e.message,
        unlockAt: e.unlockAtIso,
      });
    }
    const message = e instanceof Error ? e.message : "Unknown error";
    if (message.includes("unique") || message.includes("duplicate")) {
      return apiErrorResponse({
        request,
        status: 409,
        code: API_ERROR_CODES.INVALID_REQUEST,
        message: "That username is taken",
      });
    }
    return apiErrorResponse({
      request,
      status: 500,
      code: API_ERROR_CODES.INTERNAL,
      message,
    });
  }
}
