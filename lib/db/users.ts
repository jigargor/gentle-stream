import { db } from "./client";
import type { UserProfile, UserRole } from "../types";
import type { GameType } from "../games/types";
import type { Category } from "../constants";
import {
  CATEGORIES,
  DEFAULT_CATEGORY_WEIGHTS,
  DEFAULT_GAME_RATIO,
} from "../constants";
import { USERNAME_CHANGE_COOLDOWN_MS } from "../user/username-policy";
import { getEnv } from "@/lib/env";

interface UserProfileRow {
  user_id: string;
  category_weights: Record<string, number>;
  game_ratio: number;
  enabled_game_types?: string[] | null;
  user_role?: string;
  display_name?: string | null;
  username?: string | null;
  username_set_at?: string | null;
  avatar_url?: string | null;
  weather_location?: string | null;
  theme_preference?: "light" | "dark" | null;
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

const DEFAULT_ENABLED_GAME_TYPES: GameType[] = [
  "sudoku",
  "word_search",
  "crossword",
  "killer_sudoku",
  "nonogram",
  "connections",
] as const;
let isUserSeenArticlesTableAvailable = true;
const env = getEnv();
const isSeenTableEnabled =
  env.FEED_SEEN_TABLE_READS_ENABLED == null
    ? true
    : env.FEED_SEEN_TABLE_READS_ENABLED;

function isMissingUserSeenArticlesTable(errorMessage: string): boolean {
  return (
    errorMessage.includes("Could not find the table 'public.user_seen_articles'") ||
    errorMessage.includes("schema cache")
  );
}

function normalizeEnabledGameTypes(input: unknown): GameType[] {
  if (!Array.isArray(input)) return [...DEFAULT_ENABLED_GAME_TYPES];
  const allowed = new Set<string>([
    "sudoku",
    "killer_sudoku",
    "word_search",
    "nonogram",
    "crossword",
    "connections",
  ]);
  const out: GameType[] = [];
  const seen = new Set<GameType>();
  for (const v of input) {
    if (typeof v !== "string") continue;
    const t = v.trim().toLowerCase();
    if (!allowed.has(t)) continue;
    const gt = t as GameType;
    if (seen.has(gt)) continue;
    seen.add(gt);
    out.push(gt);
  }
  return out.length > 0 ? out : [...DEFAULT_ENABLED_GAME_TYPES];
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
    enabledGameTypes: normalizeEnabledGameTypes(row.enabled_game_types ?? null),
    userRole: role,
    displayName: row.display_name ?? null,
    username: row.username ?? null,
    usernameSetAt: row.username_set_at ?? null,
    avatarUrl: row.avatar_url ?? null,
    weatherLocation: row.weather_location ?? null,
    themePreference: row.theme_preference ?? null,
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
    enabled_game_types: [...DEFAULT_ENABLED_GAME_TYPES],
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

export interface AuthorDisplayFields {
  avatarUrl: string | null;
  username: string | null;
}

/** Batch read avatar + @username for bylines (creator articles). */
export async function getAuthorDisplayByUserIds(
  userIds: string[]
): Promise<Map<string, AuthorDisplayFields>> {
  const unique = [...new Set(userIds.filter(Boolean))];
  if (unique.length === 0) return new Map();
  const { data, error } = await db
    .from("user_profiles")
    .select("user_id, avatar_url, username")
    .in("user_id", unique);
  if (error) throw new Error(`getAuthorDisplayByUserIds: ${error.message}`);
  const map = new Map<string, AuthorDisplayFields>();
  for (const row of data ?? []) {
    const r = row as { user_id: string; avatar_url: string | null; username: string | null };
    const u = r.username?.trim();
    map.set(r.user_id, {
      avatarUrl: r.avatar_url ?? null,
      username: u ? u.toLowerCase() : null,
    });
  }
  return map;
}

/** Read-only profile lookup (no insert). Used for public creator pages. */
export async function getUserProfileById(userId: string): Promise<UserProfile | null> {
  const { data, error } = await db
    .from("user_profiles")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) return null;
  return rowToProfile(data as UserProfileRow);
}

/**
 * Mark article IDs as seen for a user.
 * Keeps the seen list capped at 500 (oldest dropped first).
 */
export async function markArticlesSeen(
  userId: string,
  articleIds: string[],
  metadata?: { source?: string; sectionIndex?: number | null }
): Promise<void> {
  if (articleIds.length === 0) return;

  const seenAtIso = new Date().toISOString();
  const source = metadata?.source?.trim() || "feed";
  const sectionIndex =
    typeof metadata?.sectionIndex === "number" && Number.isFinite(metadata.sectionIndex)
      ? Math.trunc(metadata.sectionIndex)
      : null;
  const seenRows = Array.from(new Set(articleIds)).map((articleId) => ({
    user_id: userId,
    article_id: articleId,
    seen_at: seenAtIso,
    source,
    section_index: sectionIndex,
  }));
  if (isSeenTableEnabled && isUserSeenArticlesTableAvailable) {
    const { error: seenError } = await db
      .from("user_seen_articles")
      .upsert(seenRows, { onConflict: "user_id,article_id" });
    if (seenError) {
      if (isMissingUserSeenArticlesTable(seenError.message)) {
        isUserSeenArticlesTableAvailable = false;
        console.warn(
          "[markArticlesSeen] user_seen_articles unavailable; falling back to profile array: %s",
          seenError.message
        );
      } else {
        throw new Error(`markArticlesSeen user_seen_articles: ${seenError.message}`);
      }
    }
  }

  // Legacy compatibility window: continue updating profile array while dual-write is enabled.
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

export async function listRecentlySeenArticleIds(
  userId: string,
  limit = 500
): Promise<string[]> {
  if (!isSeenTableEnabled || !isUserSeenArticlesTableAvailable) {
    const profile = await getOrCreateUserProfile(userId);
    return profile.seenArticleIds.slice(-limit);
  }
  const capped = Math.max(1, Math.min(5000, Math.trunc(limit)));
  const { data, error } = await db
    .from("user_seen_articles")
    .select("article_id")
    .eq("user_id", userId)
    .order("seen_at", { ascending: false })
    .limit(capped);
  if (error) {
    if (isMissingUserSeenArticlesTable(error.message)) {
      isUserSeenArticlesTableAvailable = false;
      const profile = await getOrCreateUserProfile(userId);
      return profile.seenArticleIds.slice(-limit);
    }
    throw new Error(`listRecentlySeenArticleIds: ${error.message}`);
  }
  return (data ?? []).map((row) => String((row as { article_id: string }).article_id));
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
      | "enabledGameTypes"
      | "themePreference"
      | "preferredEmotions"
      | "preferredLocales"
    >
  >
): Promise<UserProfile> {
  const updates: Partial<UserProfileRow> = {};
  if (prefs.categoryWeights) updates.category_weights = prefs.categoryWeights;
  if (prefs.gameRatio !== undefined) updates.game_ratio = prefs.gameRatio;
  if (prefs.enabledGameTypes !== undefined) {
    updates.enabled_game_types = normalizeEnabledGameTypes(prefs.enabledGameTypes);
  }
  if (prefs.themePreference !== undefined) {
    updates.theme_preference = prefs.themePreference ?? null;
  }
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
    weatherLocation?: string | null;
  }
): Promise<UserProfile> {
  const updates: Partial<UserProfileRow> = {};
  if (fields.displayName !== undefined) updates.display_name = fields.displayName;
  if (fields.avatarUrl !== undefined) updates.avatar_url = fields.avatarUrl;
  if (fields.weatherLocation !== undefined) updates.weather_location = fields.weatherLocation;

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
