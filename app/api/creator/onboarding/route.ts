import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { CATEGORIES, type Category } from "@/lib/constants";
import {
  getCreatorProfile,
  promoteUserToCreator,
  upsertCreatorProfile,
} from "@/lib/db/creator";
import { getOrCreateUserProfile } from "@/lib/db/users";
import { parseJsonBody } from "@/lib/validation/http";
import { API_ERROR_CODES, apiErrorResponse } from "@/lib/api/errors";
import { CREATOR_ONBOARDING_ENABLED } from "@/lib/feature-flags/regulatory";
import { hasTrustedOrigin } from "@/lib/security/origin";

function isCategory(value: string): value is Category {
  return CATEGORIES.includes(value as Category);
}

function cleanNullableString(value: unknown, maxLen: number): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLen);
}

const onboardingBodySchema = z.object({
  penName: z.string().trim().min(1).max(80),
  bio: z.string().trim().max(400).optional().nullable(),
  interestCategories: z.array(z.string()).optional().default([]),
  websiteUrl: z.string().trim().max(300).optional().nullable(),
  locale: z.string().trim().max(64).optional().nullable(),
  timezone: z.string().trim().max(64).optional().nullable(),
  guidelinesAccepted: z.boolean(),
  consentOptIn: z.boolean(),
  consentProof: z.string().trim().max(500),
});

export async function GET(request: NextRequest) {
  if (!CREATOR_ONBOARDING_ENABLED) {
    return apiErrorResponse({
      request,
      status: 503,
      code: API_ERROR_CODES.INVALID_REQUEST,
      message:
        "Creator onboarding is a work in progress and is temporarily disabled pending approval from the appropriate regulatory agencies.",
    });
  }

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
  if (!user.email_confirmed_at) {
    return apiErrorResponse({
      request,
      status: 403,
      code: API_ERROR_CODES.FORBIDDEN,
      message: "Creator onboarding requires verified email.",
    });
  }

  const profile = await getCreatorProfile(user.id);
  const userRoleProfile = await getOrCreateUserProfile(user.id);
  return NextResponse.json({
    creatorProfile: profile,
    userRole: userRoleProfile.userRole,
    phone: user.phone ?? null,
    phoneConfirmedAt: (user as { phone_confirmed_at?: string | null }).phone_confirmed_at ?? null,
  });
}

export async function POST(request: NextRequest) {
  if (!hasTrustedOrigin(request)) {
    return apiErrorResponse({
      request,
      status: 403,
      code: API_ERROR_CODES.FORBIDDEN_ORIGIN,
      message: "Invalid request origin.",
    });
  }
  if (!CREATOR_ONBOARDING_ENABLED) {
    return apiErrorResponse({
      request,
      status: 503,
      code: API_ERROR_CODES.INVALID_REQUEST,
      message:
        "Creator onboarding is a work in progress and is temporarily disabled pending approval from the appropriate regulatory agencies.",
    });
  }

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
  if (!user.email_confirmed_at) {
    return apiErrorResponse({
      request,
      status: 403,
      code: API_ERROR_CODES.FORBIDDEN,
      message: "Creator onboarding requires verified email.",
    });
  }

  const parsedBody = await parseJsonBody({
    request,
    schema: onboardingBodySchema,
  });
  if (!parsedBody.ok) return parsedBody.response;
  const body = parsedBody.data;

  const penNameRaw = cleanNullableString(body.penName, 80);
  if (!penNameRaw) {
    return apiErrorResponse({
      request,
      status: 400,
      code: API_ERROR_CODES.MISSING_FIELD,
      message: "penName is required",
    });
  }

  const bio = cleanNullableString(body.bio, 400) ?? "";
  const interestValues = body.interestCategories;
  const interestCategories = interestValues
    .map((v) => v.trim())
    .filter(isCategory);
  const websiteUrl = cleanNullableString(body.websiteUrl, 300);
  const locale = cleanNullableString(body.locale, 64);
  const timezone = cleanNullableString(body.timezone, 64);
  const guidelinesAccepted = body.guidelinesAccepted === true;
  const consentOptIn = body.consentOptIn === true;
  const consentProof = cleanNullableString(body.consentProof, 500);
  if (!guidelinesAccepted) {
    return apiErrorResponse({
      request,
      status: 400,
      code: API_ERROR_CODES.INVALID_REQUEST,
      message: "You must acknowledge the creator content guidelines.",
    });
  }
  if (!consentOptIn) {
    return apiErrorResponse({
      request,
      status: 400,
      code: API_ERROR_CODES.INVALID_REQUEST,
      message: "You must confirm consent opt-in is collected.",
    });
  }
  if (!consentProof) {
    return apiErrorResponse({
      request,
      status: 400,
      code: API_ERROR_CODES.MISSING_FIELD,
      message:
        "Provide proof of consent (URL to the SMS consent screenshot evidence).",
    });
  }

  await getOrCreateUserProfile(user.id);
  await promoteUserToCreator(user.id);
  const now = new Date().toISOString();
  const creatorProfile = await upsertCreatorProfile({
    userId: user.id,
    penName: penNameRaw,
    bio,
    interestCategories,
    websiteUrl,
    locale,
    timezone,
    guidelinesAcknowledgedAt: now,
    consentOptIn: true,
    consentProof,
    consentOptInAt: now,
    onboardingCompletedAt: now,
  });

  return NextResponse.json({ creatorProfile, userRole: "creator" as const });
}
