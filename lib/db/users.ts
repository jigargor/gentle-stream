import { db } from "./client";
import type { UserProfile, UserRole } from "../types";
import type { Category } from "../constants";
import {
  CATEGORIES,
  DEFAULT_CATEGORY_WEIGHTS,
  DEFAULT_GAME_RATIO,
} from "../constants";
import { USERNAME_CHANGE_COOLDOWN_MS } from "../user/username-policy";

interface UserProfileRow {
  user_id: string;
  category_weights: Record<string, number>;
  game_ratio: number;
  user_role?: string;
  display_name?: string | null;
  username?: string | null;
  username_set_at?: string | null;
  avatar_url?: string | null;
  preferred_emotions: string[];
  preferred_locales: string[];
  seen_article_ids: string[];
  created_at: string;
  updated_at: string;
}

export class UsernameCooldownError extends Error {
  readonly unlockAtIso: string;

  constructor(unlockAtIso: string) {
    super("Username cannot be changed until the cooldown ends.");
    this.name = "UsernameCooldownError";
    this.unlockAtIso = unlockAtIso;
  }
}

function normalizeUsernameValue(s: string | null | undefined): string | null {
  if (s == null) return null;
  const t = String(s).trim().toLowerCase();
  return t.length ? t : null;
}

function rowToProfile(row: UserProfileRow): UserProfile {
  // Merge stored weights with defaults so new categories are always present
  const weights = { ...DEFAULT_CATEGORY_WEIGHTS } as Record<Category, number>;
  for (const cat of CATEGORIES) {
    if (row.category_weights?.[cat] !== undefined) {
      weights[cat] = row.category_weights[cat];
    }
  }

  const role: UserRole =
    row.user_role === "creator" ? "creator" : "general";

  return {
    userId: row.user_id,
    categoryWeights: weights,
    gameRatio: row.game_ratio ?? DEFAULT_GAME_RATIO,
    userRole: role,
    displayName: row.display_name ?? null,
    username: row.username ?? null,
    usernameSetAt: row.username_set_at ?? null,
    avatarUrl: row.avatar_url ?? null,
    preferredEmotions: row.preferred_emotions ?? [],
    preferredLocales: row.preferred_locales ?? ["global"],
    seenArticleIds: row.seen_article_ids ?? [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Get a user profile, or create a default one if it doesn't exist.
 */
export async function getOrCreateUserProfile(
  userId: string
): Promise<UserProfile> {
  const { data, error } = await db
    .from("user_profiles")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (data && !error) return rowToProfile(data as UserProfileRow);

  // Create a new default profile
  const newProfile = {
    user_id: userId,
    category_weights: DEFAULT_CATEGORY_WEIGHTS,
    game_ratio: DEFAULT_GAME_RATIO,
    user_role: "general" as const,
    preferred_emotions: [],
    preferred_locales: ["global"],
    seen_article_ids: [],
  };

  const { data: created, error: createError } = await db
    .from("user_profiles")
    .insert(newProfile)
    .select()
    .single();

  if (createError) throw new Error(`getOrCreateUserProfile: ${createError.message}`);
  return rowToProfile(created as UserProfileRow);
}

/**
 * Mark article IDs as seen for a user.
 * Keeps the seen list capped at 500 (oldest dropped first).
 */
export async function markArticlesSeen(
  userId: string,
  articleIds: string[]
): Promise<void> {
  if (articleIds.length === 0) return;

  const profile = await getOrCreateUserProfile(userId);
  const updated = [...profile.seenArticleIds, ...articleIds];
  // Cap at 500 — beyond this, articles will have expired anyway
  const capped = updated.slice(-500);

  const { error } = await db
    .from("user_profiles")
    .update({ seen_article_ids: capped })
    .eq("user_id", userId);

  if (error) throw new Error(`markArticlesSeen: ${error.message}`);
}

/**
 * Update user preferences (category weights, game ratio, etc.)
 */
export async function updateUserPreferences(
  userId: string,
  prefs: Partial<
    Pick<
      UserProfile,
      | "categoryWeights"
      | "gameRatio"
      | "preferredEmotions"
      | "preferredLocales"
    >
  >
): Promise<UserProfile> {
  const updates: Partial<UserProfileRow> = {};
  if (prefs.categoryWeights) updates.category_weights = prefs.categoryWeights;
  if (prefs.gameRatio !== undefined) updates.game_ratio = prefs.gameRatio;
  if (prefs.preferredEmotions) updates.preferred_emotions = prefs.preferredEmotions;
  if (prefs.preferredLocales) updates.preferred_locales = prefs.preferredLocales;

  const { data, error } = await db
    .from("user_profiles")
    .update(updates)
    .eq("user_id", userId)
    .select()
    .single();

  if (error) throw new Error(`updateUserPreferences: ${error.message}`);
  return rowToProfile(data as UserProfileRow);
}

/**
 * Update public profile fields (display name, @username, avatar URL).
 */
export async function updateUserDisplay(
  userId: string,
  fields: {
    displayName?: string | null;
    username?: string | null;
    avatarUrl?: string | null;
  }
): Promise<UserProfile> {
  const updates: Partial<UserProfileRow> = {};
  if (fields.displayName !== undefined) updates.display_name = fields.displayName;
  if (fields.avatarUrl !== undefined) updates.avatar_url = fields.avatarUrl;

  if (fields.username !== undefined) {
    const { data: row, error: selErr } = await db
      .from("user_profiles")
      .select("username, username_set_at")
      .eq("user_id", userId)
      .single();

    if (selErr) throw new Error(`updateUserDisplay: ${selErr.message}`);

    const current = normalizeUsernameValue(row?.username as string | null);
    const next = normalizeUsernameValue(fields.username);

    if (current !== next) {
      const setAt = (row?.username_set_at as string | null) ?? null;
      if (setAt != null && current != null) {
        const unlockMs = new Date(setAt).getTime() + USERNAME_CHANGE_COOLDOWN_MS;
        if (Date.now() < unlockMs) {
          throw new UsernameCooldownError(new Date(unlockMs).toISOString());
        }
      }

      updates.username = next;
      updates.username_set_at =
        next === null ? null : new Date().toISOString();
    }
  }

  if (Object.keys(updates).length === 0) {
    const { data, error } = await db
      .from("user_profiles")
      .select("*")
      .eq("user_id", userId)
      .single();
    if (error) throw new Error(`updateUserDisplay: ${error.message}`);
    return rowToProfile(data as UserProfileRow);
  }

  const { data, error } = await db
    .from("user_profiles")
    .update(updates)
    .eq("user_id", userId)
    .select()
    .single();

  if (error) throw new Error(`updateUserDisplay: ${error.message}`);
  return rowToProfile(data as UserProfileRow);
}
