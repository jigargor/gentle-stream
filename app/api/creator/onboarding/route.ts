import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { CATEGORIES, type Category } from "@/lib/constants";
import {
  getCreatorProfile,
  promoteUserToCreator,
  upsertCreatorProfile,
} from "@/lib/db/creator";
import { getOrCreateUserProfile } from "@/lib/db/users";

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

export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const phoneConfirmedAt = (user as { phone_confirmed_at?: string | null }).phone_confirmed_at ?? null;
  if (!user.phone || !phoneConfirmedAt) {
    return NextResponse.json(
      { error: "Phone verification is required before creator onboarding." },
      { status: 400 }
    );
  }

  const body = (await request.json()) as {
    penName?: unknown;
    bio?: unknown;
    interestCategories?: unknown;
    websiteUrl?: unknown;
    locale?: unknown;
    timezone?: unknown;
    guidelinesAccepted?: unknown;
    consentOptIn?: unknown;
    consentProof?: unknown;
  };

  const penNameRaw = cleanNullableString(body.penName, 80);
  if (!penNameRaw) {
    return NextResponse.json({ error: "penName is required" }, { status: 400 });
  }

  const bio = cleanNullableString(body.bio, 400) ?? "";
  const interestValues = Array.isArray(body.interestCategories)
    ? body.interestCategories.filter((v): v is string => typeof v === "string")
    : [];
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
    return NextResponse.json(
      { error: "You must acknowledge the creator content guidelines." },
      { status: 400 }
    );
  }
  if (!consentOptIn) {
    return NextResponse.json(
      { error: "You must confirm consent opt-in is collected." },
      { status: 400 }
    );
  }
  if (!consentProof) {
    return NextResponse.json(
      { error: "Provide proof of consent (link, source, or policy reference)." },
      { status: 400 }
    );
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
