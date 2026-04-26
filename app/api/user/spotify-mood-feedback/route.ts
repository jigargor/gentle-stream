import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUserId } from "@/lib/api/sessionUser";
import { applySpotifyMoodVote } from "@/lib/db/spotifyMoodFeedback";
import { getSpotifyFeedbackValidMoods } from "@/lib/feed/modules/spotify";
import {
  buildRateLimitKey,
  consumeRateLimit,
  rateLimitExceededResponse,
} from "@/lib/security/rateLimit";
import { hasTrustedOrigin } from "@/lib/security/origin";
import { parseJsonBody } from "@/lib/validation/http";
import { API_ERROR_CODES, apiErrorResponse, internalErrorResponse } from "@/lib/api/errors";

const bodySchema = z.object({
  mood: z.string().min(1).max(48),
  vote: z.enum(["up", "down"]),
});

export async function POST(request: NextRequest) {
  if (!hasTrustedOrigin(request)) {
    return apiErrorResponse({
      request,
      status: 403,
      code: API_ERROR_CODES.FORBIDDEN_ORIGIN,
      message: "Invalid request origin.",
    });
  }

  const userId = await getSessionUserId();
  if (!userId) {
    return apiErrorResponse({
      request,
      status: 401,
      code: API_ERROR_CODES.UNAUTHORIZED,
      message: "Unauthorized",
    });
  }

  const rateLimit = await consumeRateLimit({
    policy: { id: "spotify-mood-feedback", windowMs: 60_000, max: 60 },
    key: buildRateLimitKey({
      request,
      userId,
      routeId: "api-user-spotify-mood-feedback",
    }),
  });
  if (!rateLimit.allowed) return rateLimitExceededResponse(rateLimit, request);

  const parsedBody = await parseJsonBody({ request, schema: bodySchema });
  if (!parsedBody.ok) return parsedBody.response;

  const moodKey = parsedBody.data.mood.trim().toLowerCase();
  const valid = getSpotifyFeedbackValidMoods();
  if (!valid.has(moodKey)) {
    return apiErrorResponse({
      request,
      status: 400,
      code: API_ERROR_CODES.INVALID_REQUEST,
      message: "Unknown mood for feedback.",
    });
  }

  const delta = parsedBody.data.vote === "up" ? 1 : -1;
  try {
    const score = await applySpotifyMoodVote({ userId, mood: moodKey, delta });
    return NextResponse.json({ mood: moodKey, score });
  } catch (error: unknown) {
    return internalErrorResponse({ request, error });
  }
}
