import { db } from "./client";
import type { RssFeedRecord } from "@/lib/types";

interface RssFeedRow {
  id: string;
  feed_url: string;
  publisher: string;
  label: string;
  category_hint: string;
  locale_hint: string;
  is_enabled: boolean;
  tone_risk_score: number;
  last_fetched_at: string | null;
  last_success_at: string | null;
  last_error: string | null;
  consecutive_failures: number;
  created_at: string;
  updated_at: string;
}

export interface UpsertRssFeedInput {
  feedUrl: string;
  publisher?: string;
  label?: string;
  categoryHint?: string;
  localeHint?: string;
  isEnabled?: boolean;
  toneRiskScore?: number;
}

function normalizeFeedUrl(feedUrl: string): string {
  const parsed = new URL(feedUrl.trim());
  parsed.hash = "";
  return parsed.toString();
}

function rowToRssFeed(row: RssFeedRow): RssFeedRecord {
  return {
    id: row.id,
    feedUrl: row.feed_url,
    publisher: row.publisher,
    label: row.label,
    categoryHint: row.category_hint,
    localeHint: row.locale_hint,
    isEnabled: row.is_enabled,
    toneRiskScore: row.tone_risk_score,
    lastFetchedAt: row.last_fetched_at,
    lastSuccessAt: row.last_success_at,
    lastError: row.last_error,
    consecutiveFailures: row.consecutive_failures,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listRssFeeds(): Promise<RssFeedRecord[]> {
  const { data, error } = await db
    .from("rss_feeds")
    .select("*")
    .order("is_enabled", { ascending: false })
    .order("publisher", { ascending: true })
    .order("label", { ascending: true });
  if (error) throw new Error(`listRssFeeds: ${error.message}`);
  return ((data ?? []) as RssFeedRow[]).map(rowToRssFeed);
}

export async function listEnabledRssFeeds(input?: {
  localeHint?: string;
  categoryHint?: string;
  limit?: number;
}): Promise<RssFeedRecord[]> {
  const localeHint = input?.localeHint?.trim();
  const categoryHint = input?.categoryHint?.trim();
  const limit = Math.max(1, Math.min(100, Math.trunc(input?.limit ?? 30)));
  let query = db
    .from("rss_feeds")
    .select("*")
    .eq("is_enabled", true)
    .order("tone_risk_score", { ascending: true })
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (localeHint) {
    const localeCandidates =
      localeHint.toLowerCase() === "global"
        ? ["global", "US"]
        : [localeHint, "global"];
    query = query.in("locale_hint", localeCandidates);
  }
  if (categoryHint) query = query.in("category_hint", [categoryHint, ""]);
  const { data, error } = await query;
  if (error) throw new Error(`listEnabledRssFeeds: ${error.message}`);
  return ((data ?? []) as RssFeedRow[]).map(rowToRssFeed);
}

export async function createRssFeed(input: UpsertRssFeedInput): Promise<RssFeedRecord> {
  const feedUrl = normalizeFeedUrl(input.feedUrl);
  const toneRiskScore = Math.max(0, Math.min(10, Math.trunc(input.toneRiskScore ?? 2)));
  const { data, error } = await db
    .from("rss_feeds")
    .insert({
      feed_url: feedUrl,
      publisher: (input.publisher ?? "").trim(),
      label: (input.label ?? "").trim(),
      category_hint: (input.categoryHint ?? "").trim(),
      locale_hint: (input.localeHint ?? "global").trim() || "global",
      is_enabled: input.isEnabled ?? true,
      tone_risk_score: toneRiskScore,
    })
    .select("*")
    .single();
  if (error) throw new Error(`createRssFeed: ${error.message}`);
  return rowToRssFeed(data as RssFeedRow);
}

export async function updateRssFeed(
  id: string,
  input: Partial<UpsertRssFeedInput>
): Promise<RssFeedRecord> {
  const payload: Record<string, unknown> = {};
  if (typeof input.feedUrl === "string") payload.feed_url = normalizeFeedUrl(input.feedUrl);
  if (typeof input.publisher === "string") payload.publisher = input.publisher.trim();
  if (typeof input.label === "string") payload.label = input.label.trim();
  if (typeof input.categoryHint === "string") payload.category_hint = input.categoryHint.trim();
  if (typeof input.localeHint === "string") payload.locale_hint = input.localeHint.trim() || "global";
  if (typeof input.isEnabled === "boolean") payload.is_enabled = input.isEnabled;
  if (typeof input.toneRiskScore === "number")
    payload.tone_risk_score = Math.max(0, Math.min(10, Math.trunc(input.toneRiskScore)));

  const { data, error } = await db
    .from("rss_feeds")
    .update(payload)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(`updateRssFeed: ${error.message}`);
  return rowToRssFeed(data as RssFeedRow);
}

export async function deleteRssFeed(id: string): Promise<void> {
  const { error } = await db.from("rss_feeds").delete().eq("id", id);
  if (error) throw new Error(`deleteRssFeed: ${error.message}`);
}

export async function recordRssFeedHealth(input: {
  id: string;
  ok: boolean;
  errorMessage?: string | null;
}): Promise<void> {
  const nowIso = new Date().toISOString();
  if (input.ok) {
    const { error } = await db
      .from("rss_feeds")
      .update({
        last_fetched_at: nowIso,
        last_success_at: nowIso,
        last_error: null,
        consecutive_failures: 0,
      })
      .eq("id", input.id);
    if (error) throw new Error(`recordRssFeedHealth(ok): ${error.message}`);
    return;
  }

  const { data: current, error: readError } = await db
    .from("rss_feeds")
    .select("consecutive_failures")
    .eq("id", input.id)
    .single();
  if (readError) throw new Error(`recordRssFeedHealth(read): ${readError.message}`);
  const nextFailures = ((current as { consecutive_failures?: number } | null)?.consecutive_failures ?? 0) + 1;
  const disableThreshold = Number(process.env.RSS_FEED_AUTO_DISABLE_FAILURES ?? 8);
  const payload: Record<string, unknown> = {
    last_fetched_at: nowIso,
    last_error: (input.errorMessage ?? "unknown rss fetch error").slice(0, 400),
    consecutive_failures: nextFailures,
  };
  if (nextFailures >= disableThreshold) payload.is_enabled = false;
  const { error } = await db
    .from("rss_feeds")
    .update(payload)
    .eq("id", input.id);
  if (error) throw new Error(`recordRssFeedHealth(fail): ${error.message}`);
}

