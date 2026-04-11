import { db } from "./client";
import { getCreatorPenNamesByUserIds } from "./creator";
import { getAuthorDisplayByUserIds } from "./users";
import type { ArticleContentKind, ArticleModerationStatus, StoredArticle } from "../types";
import { RECIPE_CATEGORY, type ArticleStorageCategory, type Category } from "../constants";
import { v4 as uuidv4 } from "uuid";
import { getEnv } from "@/lib/env";

const NON_EXPIRING_EXPIRES_AT = "2100-01-01T00:00:00.000Z";
const env = getEnv();
const isSeenTableReadsEnabled =
  env.FEED_SEEN_TABLE_READS_ENABLED == null
    ? true
    : env.FEED_SEEN_TABLE_READS_ENABLED;
const isUserSubmittedEnabled = env.FEED_INCLUDE_USER_SUBMITTED ?? true;
let isFeedSeenRpcAvailable = true;
let isModerationColumnsAvailable = true;

function normalizeFeedContentKinds(
  contentKinds?: ArticleContentKind[]
): ArticleContentKind[] | undefined {
  const base = contentKinds ? Array.from(new Set(contentKinds)) : undefined;
  if (isUserSubmittedEnabled) return base;
  if (!base || base.length === 0) return ["news", "recipe"];
  const filtered = base.filter((kind) => kind !== "user_article");
  return filtered.length > 0 ? filtered : ["news", "recipe"];
}

function isMissingFeedSeenRpc(errorMessage: string): boolean {
  return (
    errorMessage.includes("Could not find the function public.get_feed_articles_for_user") ||
    errorMessage.includes("schema cache")
  );
}

function isMissingModerationColumn(errorMessage: string): boolean {
  return (
    errorMessage.includes("moderation_status") ||
    errorMessage.includes("moderation_reason") ||
    errorMessage.includes("moderated_at") ||
    errorMessage.includes("moderation_labels")
  );
}

interface FeedRpcInput {
  category: Category | typeof RECIPE_CATEGORY;
  limit: number;
  userId: string;
  tagged: boolean;
  excludeIds: string[];
  contentKinds?: ArticleContentKind[];
}

async function callFeedRpc(input: FeedRpcInput): Promise<{
  data: ArticleRow[] | null;
  errorMessage: string | null;
}> {
  const effectiveContentKinds = normalizeFeedContentKinds(input.contentKinds);
  const fullArgs = {
    p_category: input.category,
    p_limit: input.limit,
    p_user_id: input.userId,
    p_tagged: input.tagged,
    p_content_kinds:
      effectiveContentKinds && effectiveContentKinds.length > 0
        ? effectiveContentKinds
        : null,
    p_exclude_ids: input.excludeIds,
  };
  const { data, error } = await db.rpc("get_feed_articles_for_user", fullArgs);
  if (!error) return { data: data as ArticleRow[], errorMessage: null };

  // Backward compatibility: older DBs can still have the pre-contentKinds/excludeIds signature.
  const legacyArgs = {
    p_category: input.category,
    p_limit: input.limit,
    p_user_id: input.userId,
    p_tagged: input.tagged,
  };
  const { data: legacyData, error: legacyError } = await db.rpc(
    "get_feed_articles_for_user",
    legacyArgs
  );
  if (!legacyError) return { data: legacyData as ArticleRow[], errorMessage: null };

  return { data: null, errorMessage: legacyError.message || error.message };
}

// ─── Row shape as it comes back from Supabase ─────────────────────────────────
interface ArticleRow {
  id: string;
  headline: string;
  subheadline: string;
  byline: string;
  location: string;
  category: string;
  body: string;
  pull_quote: string;
  image_prompt: string;
  fetched_at: string;
  source_published_at?: string | null;
  expires_at: string;
  tags: string[];
  sentiment: string;
  emotions: string[];
  locale: string;
  reading_time_secs: number;
  quality_score: number;
  used_count: number;
  tagged: boolean;
  moderation_status?: string | null;
  moderation_reason?: string | null;
  moderation_confidence?: number | null;
  moderation_labels?: Record<string, unknown> | null;
  moderated_at?: string | null;
  moderated_by_user_id?: string | null;
  fingerprint: string;
  source_urls: string[];
  source?: string;
  content_kind?: string | null;
  author_user_id?: string | null;
  submission_id?: string | null;
  creator_explicit_tags?: string[];

  recipe_servings?: number | null;
  recipe_ingredients?: string[] | null;
  recipe_instructions?: string[] | null;
  recipe_prep_time_minutes?: number | null;
  recipe_cook_time_minutes?: number | null;
  recipe_images?: string[] | null;
}

function isLikelyTestFixtureRow(row: ArticleRow): boolean {
  const headline = (row.headline ?? "").toLowerCase();
  const byline = (row.byline ?? "").toLowerCase();
  const location = (row.location ?? "").toLowerCase();
  const subheadline = (row.subheadline ?? "").toLowerCase();

  if (
    headline.includes("test_dedup") ||
    headline.includes("test_url_dedup") ||
    headline.includes("test_eng_db") ||
    headline.includes("test_reco_e2e")
  ) {
    return true;
  }

  return (
    byline.includes("test runner") &&
    location.includes("testland") &&
    subheadline.includes("test subheadline")
  );
}

function filterTestFixtureRows(rows: ArticleRow[]): ArticleRow[] {
  return rows.filter((row) => !isLikelyTestFixtureRow(row));
}

function filterDisabledFeedContentKinds(rows: ArticleRow[]): ArticleRow[] {
  if (isUserSubmittedEnabled) return rows;
  return rows.filter((row) => (row.content_kind ?? "news") !== "user_article");
}

function filterApprovedModerationRows(rows: ArticleRow[]): ArticleRow[] {
  return rows.filter((row) => toModerationStatus(row.moderation_status) === "approved");
}

function isGenericCreatorByline(byline: string): boolean {
  const b = byline.trim().toLowerCase();
  return b === "" || b === "by creator" || b === "creator";
}

function needsCreatorBylineHydration(article: StoredArticle): boolean {
  if (article.source !== "creator" || !article.authorUserId) return false;
  return isGenericCreatorByline(article.byline ?? "");
}

function penNameFromByline(byline: string): string {
  const t = byline.trim();
  const m = /^by\s+(.+)$/i.exec(t);
  return (m ? m[1] : t).trim();
}

async function hydrateCreatorAuthorDisplay(
  articles: StoredArticle[]
): Promise<StoredArticle[]> {
  const creatorIds = [
    ...new Set(
      articles
        .filter((a) => a.source === "creator" && a.authorUserId)
        .map((a) => a.authorUserId as string)
    ),
  ];
  if (creatorIds.length === 0) return articles;

  const [penNames, displayByUser] = await Promise.all([
    getCreatorPenNamesByUserIds(creatorIds),
    getAuthorDisplayByUserIds(creatorIds),
  ]);

  return articles.map((article) => {
    if (article.source !== "creator" || !article.authorUserId) return article;

    const uid = article.authorUserId;
    const penFromProfile = penNames.get(uid)?.trim() ?? "";
    const penFromLine = penNameFromByline(article.byline ?? "");
    const pen = penFromProfile || penFromLine;
    const display = displayByUser.get(uid);

    let next: StoredArticle = {
      ...article,
      authorPenName: pen || null,
      authorAvatarUrl: display?.avatarUrl ?? null,
      authorUsername: display?.username ?? null,
    };

    if (needsCreatorBylineHydration(article)) {
      if (penFromProfile) next = { ...next, byline: `By ${penFromProfile}` };
      else if (pen) next = { ...next, byline: `By ${pen}` };
    }

    return next;
  });
}

export function rowToArticle(row: ArticleRow): StoredArticle {
  const contentKind: ArticleContentKind =
    row.content_kind === "recipe" || row.content_kind === "user_article"
      ? row.content_kind
      : row.source === "creator"
        ? "user_article"
        : "news";

  return {
    id: row.id,
    headline: row.headline,
    subheadline: row.subheadline,
    byline: row.byline,
    location: row.location,
    category: row.category as Category,
    body: row.body,
    pullQuote: row.pull_quote,
    imagePrompt: row.image_prompt,
    fetchedAt: row.fetched_at,
    ingestedAt: row.fetched_at,
    sourcePublishedAt: row.source_published_at ?? null,
    expiresAt: row.expires_at,
    tags: row.tags ?? [],
    sentiment: (row.sentiment ?? "uplifting") as StoredArticle["sentiment"],
    emotions: row.emotions ?? [],
    locale: row.locale ?? "global",
    readingTimeSecs: row.reading_time_secs ?? 120,
    qualityScore: row.quality_score ?? 0.5,
    usedCount: row.used_count ?? 0,
    tagged: row.tagged ?? false,
    moderationStatus: toModerationStatus(row.moderation_status),
    moderationReason: row.moderation_reason ?? null,
    moderationConfidence: row.moderation_confidence ?? null,
    moderationLabels: row.moderation_labels ?? {},
    moderatedAt: row.moderated_at ?? null,
    moderatedByUserId: row.moderated_by_user_id ?? null,
    sourceUrls: row.source_urls ?? [],
    source: row.source === "creator" ? "creator" : "ingest",
    contentKind,
    authorUserId: row.author_user_id ?? null,
    submissionId: row.submission_id ?? null,
    creatorExplicitTags: row.creator_explicit_tags ?? [],

    recipeServings: row.recipe_servings ?? null,
    recipeIngredients: row.recipe_ingredients ?? [],
    recipeInstructions: row.recipe_instructions ?? [],
    recipePrepTimeMinutes: row.recipe_prep_time_minutes ?? null,
    recipeCookTimeMinutes: row.recipe_cook_time_minutes ?? null,
    recipeImages: row.recipe_images ?? [],
  };
}

function toModerationStatus(raw: string | null | undefined): ArticleModerationStatus {
  if (raw === "pending" || raw === "flagged" || raw === "rejected") return raw;
  return "approved";
}

function normaliseTag(input: string): string {
  return input.trim().replace(/^#/, "").toLowerCase();
}

function mergeTags(explicitTags: string[], inferredTags: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const tag of [...explicitTags, ...inferredTags]) {
    const normalised = normaliseTag(tag);
    if (!normalised || seen.has(normalised)) continue;
    seen.add(normalised);
    out.push(normalised);
    if (out.length >= 12) break;
  }
  return out;
}

// ─── Deduplication helpers ────────────────────────────────────────────────────

/**
 * Compute a headline fingerprint: lowercase, whitespace-collapsed,
 * with punctuation stripped so "Bull Sharks' Social Lives" and
 * "Bull Sharks Social Lives" hash identically.
 */
export function buildHeadlineFingerprint(headline: string, category: string): string {
  const normalised = headline
    .toLowerCase()
    .replace(/['''"",.:;!?()[\]]/g, "")  // strip punctuation
    .replace(/\s+/g, " ")
    .trim();
  return `${normalised}|${category.toLowerCase()}`;
}

export interface IngestConflictRecord {
  id: string;
  headline: string;
  category: string;
  fetchedAt: string;
  matchedUrl?: string;
}

export interface IngestPrecheckResult {
  isDuplicate: boolean;
  reason: "fingerprint" | "url_overlap" | null;
  fingerprint: string;
  normalizedUrls: string[];
  conflict: IngestConflictRecord | null;
}

/**
 * Normalise a URL so that http/https, www, trailing slashes, and common
 * tracking query params don't create false negatives.
 *
 * Examples that resolve to the same key:
 *   https://www.bbc.com/news/article-123?source=rss   →  bbc.com/news/article-123
 *   http://bbc.com/news/article-123/                  →  bbc.com/news/article-123
 */
export function normaliseUrl(url: string): string {
  try {
    const u = new URL(url);
    // Strip scheme, www., query string, and hash
    const host = u.hostname.replace(/^www\./, "");
    // Keep only the path, removing trailing slash
    const path = u.pathname.replace(/\/$/, "");
    return `${host}${path}`.toLowerCase();
  } catch {
    // If URL parsing fails, fall back to simple lowercasing
    return url
      .replace(/^https?:\/\/(www\.)?/, "")
      .replace(/[?#].*$/, "")
      .replace(/\/$/, "")
      .toLowerCase();
  }
}

/**
 * Check whether any incoming URL overlaps with URLs already stored.
 * Returns the headline of the first conflicting article if found.
 */
async function findUrlConflict(
  normalisedUrls: string[]
): Promise<IngestConflictRecord | null> {
  if (normalisedUrls.length === 0) return null;

  // Postgres GIN array overlap: source_urls && ARRAY[...]
  const { data, error } = await db
    .from("articles")
    .select("id, headline, category, fetched_at, source_urls")
    .overlaps("source_urls", normalisedUrls)
    .order("fetched_at", { ascending: false })
    .limit(20);

  if (error) {
    // Don't hard-fail — URL check is best-effort
    console.warn("[insertArticles] URL overlap check failed:", error.message);
    return null;
  }

  if (!data || data.length === 0) return null;

  const ordered = [...(data as {
    id: string;
    headline: string;
    category: string;
    fetched_at: string;
    source_urls: string[] | null;
  }[])].sort((a, b) => {
    const timeDelta = Date.parse(b.fetched_at) - Date.parse(a.fetched_at);
    if (timeDelta !== 0) return timeDelta;
    return a.id.localeCompare(b.id);
  });

  const top = ordered[0];
  if (!top) return null;
  const rowUrls = (top.source_urls ?? []).map(normaliseUrl);
  const matchedUrl = rowUrls.find((u) => normalisedUrls.includes(u));

  return {
    id: top.id,
    headline: top.headline,
    category: top.category,
    fetchedAt: top.fetched_at,
    matchedUrl,
  };
}

/**
 * Which of the given fingerprints already exist in `articles`.
 * Uses one `.eq()` per distinct value instead of `.in()` so characters such as `&`
 * in category names (e.g. "Science & Discovery") are not mis-parsed in PostgREST
 * filter URLs.
 */
async function fetchExistingFingerprints(fps: string[]): Promise<Set<string>> {
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const fp of fps) {
    if (seen.has(fp)) continue;
    seen.add(fp);
    unique.push(fp);
  }
  if (unique.length === 0) return new Set();

  const rows = await Promise.all(
    unique.map(async (fp) => {
      const { data, error } = await db
        .from("articles")
        .select("fingerprint")
        .eq("fingerprint", fp)
        .limit(1);

      if (error) {
        throw new Error(`insertArticles: fingerprint lookup: ${error.message}`);
      }
      const row = data?.[0] as { fingerprint: string } | undefined;
      return row?.fingerprint;
    })
  );

  return new Set(rows.filter((fp): fp is string => fp != null));
}

// ─── Public DB helpers ────────────────────────────────────────────────────────

/**
 * Insert articles with three dedup layers:
 *   1. Headline fingerprint pre-flight (catches exact + casing/punctuation variants)
 *   2. Source URL overlap check (catches same article with different Claude-title)
 *   3. Upsert with ignoreDuplicates (DB constraint — last line of defence)
 *
 * Returns only the articles actually inserted.
 */
export async function insertArticles(
  articles: Omit<
    StoredArticle,
    "id" | "fetchedAt" | "expiresAt" | "usedCount" | "tagged" | "source" | "authorUserId" | "submissionId" | "creatorExplicitTags"
  >[]
): Promise<StoredArticle[]> {
  if (articles.length === 0) return [];

  const now = new Date();

  // ── Layer 1: fingerprint pre-flight ───────────────────────────────────────
  const candidates = articles.map((a) => ({
    article: a,
    fp: buildHeadlineFingerprint(a.headline, a.category),
    normUrls: (a.sourceUrls ?? []).map(normaliseUrl),
  }));

  const fps = candidates.map((c) => c.fp);
  const existingFps = await fetchExistingFingerprints(fps);

  // ── Layer 2: URL overlap check (per-candidate) ────────────────────────────
  const novel: typeof candidates = [];
  /** Fingerprints already queued in this `insertArticles` call (dedupe batch internals). */
  const seenFpInBatch = new Set<string>();

  for (const candidate of candidates) {
    if (existingFps.has(candidate.fp)) {
      console.log(
        `[insertArticles] Headline fingerprint match — skipping: "${candidate.article.headline}"`
      );
      continue;
    }

    if (seenFpInBatch.has(candidate.fp)) {
      console.log(
        `[insertArticles] Batch duplicate fingerprint — skipping: "${candidate.article.headline}"`
      );
      continue;
    }

    const conflict = await findUrlConflict(candidate.normUrls);
    if (conflict) {
      console.log(
        `[insertArticles] URL overlap with "${conflict.headline}" (${conflict.id}) — skipping: "${candidate.article.headline}"`
      );
      continue;
    }

    seenFpInBatch.add(candidate.fp);
    novel.push(candidate);
  }

  if (novel.length === 0) {
    console.log("[insertArticles] All articles already exist — nothing inserted");
    return [];
  }

  if (novel.length < candidates.length) {
    console.log(
      `[insertArticles] ${candidates.length - novel.length} duplicate(s) blocked, inserting ${novel.length}`
    );
  }

  // ── Layer 3: upsert with ignoreDuplicates ─────────────────────────────────
  const rows = novel.map(({ article: a, fp, normUrls }) => ({
    id: uuidv4(),
    headline: a.headline,
    subheadline: a.subheadline,
    byline: a.byline,
    location: a.location,
    category: a.category,
    body: a.body,
    pull_quote: a.pullQuote,
    image_prompt: a.imagePrompt,
    fetched_at: now.toISOString(),
    source_published_at: a.sourcePublishedAt ?? null,
    // Keep a far-future expiry so legacy schema constraints remain valid while
    // article TTL cleanup is disabled.
    expires_at: NON_EXPIRING_EXPIRES_AT,
    tags: a.tags ?? [],
    sentiment: a.sentiment ?? "uplifting",
    emotions: a.emotions ?? [],
    locale: a.locale ?? "global",
    reading_time_secs: a.readingTimeSecs ?? 120,
    quality_score: a.qualityScore ?? 0.5,
    used_count: 0,
    tagged: false,
    ...(isModerationColumnsAvailable
      ? {
          moderation_status: "pending",
          moderation_reason: null,
          moderation_confidence: null,
          moderation_labels: {},
          moderated_at: null,
          moderated_by_user_id: null,
        }
      : {}),
    fingerprint: fp,
    source_urls: normUrls,
    source: "ingest",
    content_kind: "news",
    author_user_id: null,
    submission_id: null,
    creator_explicit_tags: [],
  }));

  let upsert = await db
    .from("articles")
    .upsert(rows, { onConflict: "fingerprint", ignoreDuplicates: true })
    .select();

  if (upsert.error && isModerationColumnsAvailable && isMissingModerationColumn(upsert.error.message)) {
    isModerationColumnsAvailable = false;
    const legacyRows = rows.map((row) => {
      const {
        moderation_status,
        moderation_reason,
        moderation_confidence,
        moderation_labels,
        moderated_at,
        moderated_by_user_id,
        ...legacy
      } = row as Record<string, unknown>;
      return legacy;
    });
    upsert = await db
      .from("articles")
      .upsert(legacyRows, { onConflict: "fingerprint", ignoreDuplicates: true })
      .select();
  }

  if (upsert.error) throw new Error(`insertArticles: ${upsert.error.message}`);
  return (upsert.data as ArticleRow[]).map(rowToArticle);
}

export async function precheckIngestCandidate(input: {
  headline: string;
  category: string;
  sourceUrls: string[];
}): Promise<IngestPrecheckResult> {
  const fingerprint = buildHeadlineFingerprint(input.headline, input.category);
  const normalizedUrls = Array.from(new Set((input.sourceUrls ?? []).map(normaliseUrl)));

  const { data: fpRows, error: fpError } = await db
    .from("articles")
    .select("id,headline,category,fetched_at")
    .eq("fingerprint", fingerprint)
    .order("fetched_at", { ascending: false })
    .limit(1);
  if (fpError) throw new Error(`precheckIngestCandidate fingerprint lookup: ${fpError.message}`);

  const fpRow = (fpRows?.[0] as {
    id: string;
    headline: string;
    category: string;
    fetched_at: string;
  } | undefined);
  if (fpRow) {
    return {
      isDuplicate: true,
      reason: "fingerprint",
      fingerprint,
      normalizedUrls,
      conflict: {
        id: fpRow.id,
        headline: fpRow.headline,
        category: fpRow.category,
        fetchedAt: fpRow.fetched_at,
      },
    };
  }

  const urlConflict = await findUrlConflict(normalizedUrls);
  if (urlConflict) {
    return {
      isDuplicate: true,
      reason: "url_overlap",
      fingerprint,
      normalizedUrls,
      conflict: urlConflict,
    };
  }

  return {
    isDuplicate: false,
    reason: null,
    fingerprint,
    normalizedUrls,
    conflict: null,
  };
}

/**
 * Fetch the most recent N headlines for a category from the DB.
 * Used by the ingest agent as a prompt avoid-list.
 */
export async function getRecentHeadlines(
  category: Category,
  limit = 20
): Promise<string[]> {
  const { data, error } = await db
    .from("articles")
    .select("headline")
    .eq("category", category)
    .order("fetched_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`getRecentHeadlines: ${error.message}`);
  return (data ?? []).map((r: { headline: string }) => r.headline);
}

/**
 * Fetch the most recent N sets of source URLs for a category.
 * Used by the ingest agent to build a URL blocklist before each API call.
 */
export async function getRecentSourceUrls(
  category: Category,
  limit = 30
): Promise<string[]> {
  const { data, error } = await db
    .from("articles")
    .select("source_urls")
    .eq("category", category)
    .order("fetched_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`getRecentSourceUrls: ${error.message}`);
  // Flatten all URL arrays into a single deduplicated list
  const all = (data ?? []).flatMap((r: { source_urls: string[] }) => r.source_urls ?? []);
  return Array.from(new Set(all));
}

/**
 * Fetch N articles for a category that:
 *  - are fully tagged
 *  - are available in the pool (no TTL expiry filtering)
 *  - are not in the excludeIds list (already seen by this user)
 * Ordered by quality_score desc.
 */
export async function getArticlesForFeed(
  category: Category | typeof RECIPE_CATEGORY,
  limit: number,
  excludeIds: string[] = [],
  contentKinds?: ArticleContentKind[],
  userId?: string
): Promise<StoredArticle[]> {
  const effectiveContentKinds = normalizeFeedContentKinds(contentKinds);
  if (userId && isSeenTableReadsEnabled && isFeedSeenRpcAvailable) {
    const { data, errorMessage } = await callFeedRpc({
      category,
      limit,
      userId,
      tagged: true,
      contentKinds: effectiveContentKinds,
      excludeIds,
    });
    if (errorMessage) {
      if (isMissingFeedSeenRpc(errorMessage)) {
        isFeedSeenRpcAvailable = false;
        console.warn(
          "[getArticlesForFeed] RPC unavailable; falling back to query path: %s",
          errorMessage
        );
      } else {
        throw new Error(`getArticlesForFeed rpc: ${errorMessage}`);
      }
    } else {
      const safeRows = filterApprovedModerationRows(
        filterDisabledFeedContentKinds(filterTestFixtureRows(data as ArticleRow[]))
      );
      return hydrateCreatorAuthorDisplay(safeRows.map(rowToArticle));
    }
  }

  let query = db
    .from("articles")
    .select("*")
    .eq("category", category)
    .eq("tagged", true)
    .is("deleted_at", null)
    .order("quality_score", { ascending: false })
    .limit(limit);
  if (isModerationColumnsAvailable) {
    query = query.eq("moderation_status", "approved");
  }

  if (category === RECIPE_CATEGORY) {
    query = query.eq("content_kind", "recipe");
  }

  if (excludeIds.length > 0) {
    query = query.notIn("id", excludeIds);
  }
  if (!isUserSubmittedEnabled) {
    query = query.neq("content_kind", "user_article");
  }
  if (effectiveContentKinds && effectiveContentKinds.length > 0) {
    query = query.in("content_kind", effectiveContentKinds);
  }

  let result = await query;
  if (
    result.error &&
    isModerationColumnsAvailable &&
    isMissingModerationColumn(result.error.message)
  ) {
    isModerationColumnsAvailable = false;
    let fallbackQuery = db
      .from("articles")
      .select("*")
      .eq("category", category)
      .eq("tagged", true)
      .is("deleted_at", null)
      .order("quality_score", { ascending: false })
      .limit(limit);
    if (category === RECIPE_CATEGORY) fallbackQuery = fallbackQuery.eq("content_kind", "recipe");
    if (excludeIds.length > 0) fallbackQuery = fallbackQuery.notIn("id", excludeIds);
    if (!isUserSubmittedEnabled) fallbackQuery = fallbackQuery.neq("content_kind", "user_article");
    if (effectiveContentKinds && effectiveContentKinds.length > 0) {
      fallbackQuery = fallbackQuery.in("content_kind", effectiveContentKinds);
    }
    result = await fallbackQuery;
  }
  if (result.error) throw new Error(`getArticlesForFeed: ${result.error.message}`);
  const safeRows = filterApprovedModerationRows(filterTestFixtureRows(result.data as ArticleRow[]));
  return hydrateCreatorAuthorDisplay(safeRows.map(rowToArticle));
}

/**
 * Same as getArticlesForFeed but for rows not yet processed by the tagger.
 * Used when the feed would otherwise be empty (e.g. tagger rate-limited / backlog).
 */
export async function getUntaggedArticlesForFeed(
  category: Category | typeof RECIPE_CATEGORY,
  limit: number,
  excludeIds: string[] = [],
  contentKinds?: ArticleContentKind[],
  userId?: string
): Promise<StoredArticle[]> {
  const effectiveContentKinds = normalizeFeedContentKinds(contentKinds);
  if (userId && isSeenTableReadsEnabled && isFeedSeenRpcAvailable) {
    const { data, errorMessage } = await callFeedRpc({
      category,
      limit,
      userId,
      tagged: false,
      contentKinds: effectiveContentKinds,
      excludeIds,
    });
    if (errorMessage) {
      if (isMissingFeedSeenRpc(errorMessage)) {
        isFeedSeenRpcAvailable = false;
        console.warn(
          "[getUntaggedArticlesForFeed] RPC unavailable; falling back to query path: %s",
          errorMessage
        );
      } else {
        throw new Error(`getUntaggedArticlesForFeed rpc: ${errorMessage}`);
      }
    } else {
      const safeRows = filterApprovedModerationRows(
        filterDisabledFeedContentKinds(filterTestFixtureRows(data as ArticleRow[]))
      );
      return hydrateCreatorAuthorDisplay(safeRows.map(rowToArticle));
    }
  }

  let query = db
    .from("articles")
    .select("*")
    .eq("category", category)
    .eq("tagged", false)
    .is("deleted_at", null)
    .order("fetched_at", { ascending: false })
    .limit(limit);
  if (isModerationColumnsAvailable) {
    query = query.eq("moderation_status", "approved");
  }

  if (category === RECIPE_CATEGORY) {
    query = query.eq("content_kind", "recipe");
  }

  if (excludeIds.length > 0) {
    query = query.notIn("id", excludeIds);
  }
  if (!isUserSubmittedEnabled) {
    query = query.neq("content_kind", "user_article");
  }
  if (effectiveContentKinds && effectiveContentKinds.length > 0) {
    query = query.in("content_kind", effectiveContentKinds);
  }

  let result = await query;
  if (
    result.error &&
    isModerationColumnsAvailable &&
    isMissingModerationColumn(result.error.message)
  ) {
    isModerationColumnsAvailable = false;
    let fallbackQuery = db
      .from("articles")
      .select("*")
      .eq("category", category)
      .eq("tagged", false)
      .is("deleted_at", null)
      .order("fetched_at", { ascending: false })
      .limit(limit);
    if (category === RECIPE_CATEGORY) fallbackQuery = fallbackQuery.eq("content_kind", "recipe");
    if (excludeIds.length > 0) fallbackQuery = fallbackQuery.notIn("id", excludeIds);
    if (!isUserSubmittedEnabled) fallbackQuery = fallbackQuery.neq("content_kind", "user_article");
    if (effectiveContentKinds && effectiveContentKinds.length > 0) {
      fallbackQuery = fallbackQuery.in("content_kind", effectiveContentKinds);
    }
    result = await fallbackQuery;
  }
  if (result.error) throw new Error(`getUntaggedArticlesForFeed: ${result.error.message}`);
  const safeRows = filterApprovedModerationRows(filterTestFixtureRows(result.data as ArticleRow[]));
  return hydrateCreatorAuthorDisplay(safeRows.map(rowToArticle));
}

/**
 * Recent tagged articles in the same storage category (excludes one id). For reading-rail "related" links.
 */
export async function listRecentTaggedInCategory(params: {
  category: string;
  excludeArticleId: string;
  limit: number;
}): Promise<{ id: string; headline: string; category: string }[]> {
  const cap = Math.min(10, Math.max(1, Math.trunc(params.limit)));
  let query = db
    .from("articles")
    .select("id, headline, category")
    .eq("category", params.category)
    .eq("tagged", true)
    .is("deleted_at", null)
    .neq("id", params.excludeArticleId)
    .order("fetched_at", { ascending: false })
    .limit(cap);
  if (isModerationColumnsAvailable) {
    query = query.eq("moderation_status", "approved");
  }

  if (params.category === RECIPE_CATEGORY) {
    query = query.eq("content_kind", "recipe");
  } else if (!isUserSubmittedEnabled) {
    query = query.neq("content_kind", "user_article");
  }

  let result = await query;
  if (
    result.error &&
    isModerationColumnsAvailable &&
    isMissingModerationColumn(result.error.message)
  ) {
    isModerationColumnsAvailable = false;
    let fallbackQuery = db
      .from("articles")
      .select("id, headline, category")
      .eq("category", params.category)
      .eq("tagged", true)
      .is("deleted_at", null)
      .neq("id", params.excludeArticleId)
      .order("fetched_at", { ascending: false })
      .limit(cap);
    if (params.category === RECIPE_CATEGORY) {
      fallbackQuery = fallbackQuery.eq("content_kind", "recipe");
    } else if (!isUserSubmittedEnabled) {
      fallbackQuery = fallbackQuery.neq("content_kind", "user_article");
    }
    result = await fallbackQuery;
  }
  if (result.error) throw new Error(`listRecentTaggedInCategory: ${result.error.message}`);
  const safeRows = filterApprovedModerationRows(
    filterTestFixtureRows(((result.data ?? []) as ArticleRow[]))
  );
  return safeRows.map((row) => {
    const r = row as { id: string; headline: string; category: string };
    return {
      id: r.id,
      headline: r.headline,
      category: r.category,
    };
  });
}

function shuffleInPlace<T>(items: T[]): void {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = items[i];
    items[i] = items[j]!;
    items[j] = t!;
  }
}

/**
 * Random unexpired articles from any category (tagged or untagged).
 * Used when profile-weighted / category picks yield no candidates (e.g. dev-light, sparse stock).
 */
export async function getRandomAvailableArticles(
  limit: number,
  excludeIds: string[] = [],
  contentKinds?: ArticleContentKind[]
): Promise<StoredArticle[]> {
  const effectiveContentKinds = normalizeFeedContentKinds(contentKinds);
  const cap = Math.min(400, Math.max(40, limit * 12));
  let query = db
    .from("articles")
    .select("*")
    .is("deleted_at", null)
    // DESC would otherwise put NULL fetched_at first and crowd out real rows (CI flakes).
    .not("fetched_at", "is", null)
    // Prefer recent ingests, then shuffle client-side.
    .order("fetched_at", { ascending: false })
    .limit(cap);
  if (isModerationColumnsAvailable) {
    query = query.eq("moderation_status", "approved");
  }

  if (excludeIds.length > 0) {
    query = query.notIn("id", excludeIds);
  }
  if (!isUserSubmittedEnabled) {
    query = query.neq("content_kind", "user_article");
  }
  if (effectiveContentKinds && effectiveContentKinds.length > 0) {
    query = query.in("content_kind", effectiveContentKinds);
  }

  let result = await query;
  if (
    result.error &&
    isModerationColumnsAvailable &&
    isMissingModerationColumn(result.error.message)
  ) {
    isModerationColumnsAvailable = false;
    let fallbackQuery = db
      .from("articles")
      .select("*")
      .is("deleted_at", null)
      .not("fetched_at", "is", null)
      .order("fetched_at", { ascending: false })
      .limit(cap);
    if (excludeIds.length > 0) fallbackQuery = fallbackQuery.notIn("id", excludeIds);
    if (!isUserSubmittedEnabled) fallbackQuery = fallbackQuery.neq("content_kind", "user_article");
    if (effectiveContentKinds && effectiveContentKinds.length > 0) {
      fallbackQuery = fallbackQuery.in("content_kind", effectiveContentKinds);
    }
    result = await fallbackQuery;
  }
  if (result.error) throw new Error(`getRandomAvailableArticles: ${result.error.message}`);
  const safeRows = filterApprovedModerationRows(filterTestFixtureRows(result.data as ArticleRow[]));
  const rows = await hydrateCreatorAuthorDisplay(safeRows.map(rowToArticle));
  shuffleInPlace(rows);
  return rows.slice(0, limit);
}

/**
 * Random unexpired articles ignoring seen-list — last resort so the feed can still render.
 */
export async function getRandomArticlesResurfacing(
  limit: number,
  contentKinds?: ArticleContentKind[]
): Promise<StoredArticle[]> {
  const effectiveContentKinds = normalizeFeedContentKinds(contentKinds);
  const cap = Math.min(400, Math.max(40, limit * 12));
  let query = db
    .from("articles")
    .select("*")
    .is("deleted_at", null)
    .not("fetched_at", "is", null)
    .order("fetched_at", { ascending: false })
    .limit(cap);
  if (isModerationColumnsAvailable) {
    query = query.eq("moderation_status", "approved");
  }
  if (!isUserSubmittedEnabled) {
    query = query.neq("content_kind", "user_article");
  }
  if (effectiveContentKinds && effectiveContentKinds.length > 0) {
    query = query.in("content_kind", effectiveContentKinds);
  }
  let result = await query;
  if (
    result.error &&
    isModerationColumnsAvailable &&
    isMissingModerationColumn(result.error.message)
  ) {
    isModerationColumnsAvailable = false;
    let fallbackQuery = db
      .from("articles")
      .select("*")
      .is("deleted_at", null)
      .not("fetched_at", "is", null)
      .order("fetched_at", { ascending: false })
      .limit(cap);
    if (!isUserSubmittedEnabled) fallbackQuery = fallbackQuery.neq("content_kind", "user_article");
    if (effectiveContentKinds && effectiveContentKinds.length > 0) {
      fallbackQuery = fallbackQuery.in("content_kind", effectiveContentKinds);
    }
    result = await fallbackQuery;
  }

  if (result.error) throw new Error(`getRandomArticlesResurfacing: ${result.error.message}`);
  const safeRows = filterApprovedModerationRows(filterTestFixtureRows(result.data as ArticleRow[]));
  const rows = await hydrateCreatorAuthorDisplay(safeRows.map(rowToArticle));
  shuffleInPlace(rows);
  return rows.slice(0, limit);
}

/**
 * Count available (tagged) articles per category.
 * Used by the scheduler to decide whether to trigger ingest.
 */
export async function countAvailableByCategory(): Promise<
  Record<string, number>
> {
  let countQuery = db
    .from("articles")
    .select("category")
    .eq("tagged", true)
    .is("deleted_at", null);
  if (isModerationColumnsAvailable) {
    countQuery = countQuery.eq("moderation_status", "approved");
  }
  const { data, error } = await countQuery;
  let rowsData = data;
  let rowsError = error;
  if (
    rowsError &&
    isModerationColumnsAvailable &&
    isMissingModerationColumn(rowsError.message)
  ) {
    isModerationColumnsAvailable = false;
    const fallback = await db
      .from("articles")
      .select("category")
      .eq("tagged", true)
      .is("deleted_at", null);
    rowsData = fallback.data;
    rowsError = fallback.error;
  }

  if (rowsError) throw new Error(`countAvailableByCategory: ${rowsError.message}`);

  const counts: Record<string, number> = {};
  for (const row of rowsData ?? []) {
    counts[row.category] = (counts[row.category] ?? 0) + 1;
  }
  return counts;
}

/**
 * For each category, return:
 * - available tagged count
 * - newest fetched_at timestamp among tagged rows
 */
export async function getAvailableStockSnapshotByCategory(): Promise<
  Record<string, { count: number; newestFetchedAt: string | null }>
> {
  let snapshotQuery = db
    .from("articles")
    .select("category,fetched_at")
    .eq("tagged", true)
    .is("deleted_at", null);
  if (isModerationColumnsAvailable) {
    snapshotQuery = snapshotQuery.eq("moderation_status", "approved");
  }
  const { data, error } = await snapshotQuery;
  let rowsData = data;
  let rowsError = error;
  if (
    rowsError &&
    isModerationColumnsAvailable &&
    isMissingModerationColumn(rowsError.message)
  ) {
    isModerationColumnsAvailable = false;
    const fallback = await db
      .from("articles")
      .select("category,fetched_at")
      .eq("tagged", true)
      .is("deleted_at", null);
    rowsData = fallback.data;
    rowsError = fallback.error;
  }

  if (rowsError) {
    throw new Error(`getAvailableStockSnapshotByCategory: ${rowsError.message}`);
  }

  const out: Record<string, { count: number; newestFetchedAt: string | null }> =
    {};
  for (const row of rowsData ?? []) {
    const category = row.category as string;
    const fetchedAt = row.fetched_at as string;
    const prev = out[category];
    if (!prev) {
      out[category] = { count: 1, newestFetchedAt: fetchedAt };
      continue;
    }
    prev.count += 1;
    if (!prev.newestFetchedAt || fetchedAt > prev.newestFetchedAt) {
      prev.newestFetchedAt = fetchedAt;
    }
  }
  return out;
}

/**
 * Mark articles as used (increment used_count).
 */
export async function markArticlesUsed(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await db.rpc("increment_used_count", { article_ids: ids });
  // Fallback if the RPC doesn't exist yet — bump used_count per row
  if (!error) return;

  for (const id of ids) {
    const { data: row, error: fetchError } = await db
      .from("articles")
      .select("used_count")
      .eq("id", id)
      .single();
    if (fetchError || !row) continue;
    const next = (row.used_count ?? 0) + 1;
    await db.from("articles").update({ used_count: next }).eq("id", id);
  }
}

/**
 * Update a single article with tagger enrichment data.
 */
export async function updateArticleTags(
  id: string,
  enrichment: {
    tags: string[];
    sentiment: StoredArticle["sentiment"];
    emotions: string[];
    locale: string;
    readingTimeSecs: number;
    qualityScore: number;
    moderation?: {
      status: Exclude<ArticleModerationStatus, "pending">;
      reason: string | null;
      confidence: number | null;
      labels: Record<string, unknown>;
      moderatedByUserId?: string | null;
    };
  }
): Promise<void> {
  const { data: existing, error: fetchError } = await db
    .from("articles")
    .select("creator_explicit_tags")
    .eq("id", id)
    .single();

  if (fetchError) throw new Error(`updateArticleTags fetch existing: ${fetchError.message}`);
  const explicit = ((existing as { creator_explicit_tags?: string[] } | null)?.creator_explicit_tags ?? [])
    .map(normaliseTag)
    .filter(Boolean);
  const mergedTags = mergeTags(explicit, enrichment.tags ?? []);

  const moderation = enrichment.moderation ?? {
    status: "approved" as const,
    reason: null,
    confidence: null,
    labels: {},
    moderatedByUserId: null,
  };
  const nowIso = new Date().toISOString();
  const isRejected = moderation.status === "rejected";

  const baseUpdate = {
    tags: mergedTags,
    sentiment: enrichment.sentiment,
    emotions: enrichment.emotions,
    locale: enrichment.locale,
    reading_time_secs: enrichment.readingTimeSecs,
    quality_score: enrichment.qualityScore,
    tagged: true,
  };
  const fullUpdate = {
    ...baseUpdate,
    moderation_status: moderation.status,
    moderation_reason: moderation.reason,
    moderation_confidence: moderation.confidence,
    moderation_labels: moderation.labels ?? {},
    moderated_at: nowIso,
    moderated_by_user_id:
      moderation.moderatedByUserId ?? (isRejected ? "agent:tagger" : null),
    deleted_at: isRejected ? nowIso : null,
    deleted_by_user_id:
      isRejected ? moderation.moderatedByUserId ?? "agent:tagger" : null,
    delete_reason: isRejected ? moderation.reason ?? "policy_rejected" : null,
  };

  let updateResult = await db.from("articles").update(fullUpdate).eq("id", id);
  if (
    updateResult.error &&
    isModerationColumnsAvailable &&
    isMissingModerationColumn(updateResult.error.message)
  ) {
    isModerationColumnsAvailable = false;
    updateResult = await db.from("articles").update(baseUpdate).eq("id", id);
  }

  if (updateResult.error) throw new Error(`updateArticleTags: ${updateResult.error.message}`);
}

/**
 * Fetch a single article by ID (used by tagger agent).
 */
export async function getArticleById(
  id: string
): Promise<StoredArticle | null> {
  const { data, error } = await db
    .from("articles")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .single();

  if (error || !data) return null;
  const article = rowToArticle(data as ArticleRow);
  const [hydrated] = await hydrateCreatorAuthorDisplay([article]);
  return hydrated ?? article;
}

export interface CreatorPublishedArticleListItem {
  id: string;
  headline: string;
  category: string;
  contentKind: ArticleContentKind;
  fetchedAt: string;
}

export async function listCreatorPublishedArticles(
  authorUserId: string
): Promise<CreatorPublishedArticleListItem[]> {
  const { data, error } = await db
    .from("articles")
    .select("id, headline, category, content_kind, fetched_at")
    .eq("author_user_id", authorUserId)
    .eq("source", "creator")
    .is("deleted_at", null)
    .order("fetched_at", { ascending: false });
  if (error) throw new Error(`listCreatorPublishedArticles: ${error.message}`);
  return (data as {
    id: string;
    headline: string;
    category: string;
    content_kind: string | null;
    fetched_at: string;
  }[]).map(
    (row) => ({
      id: row.id,
      headline: row.headline,
      category: row.category,
      contentKind: row.content_kind === "recipe" ? "recipe" : "user_article",
      fetchedAt: row.fetched_at,
    })
  );
}

export async function getCreatorArticleEngagementTotals(authorUserId: string): Promise<{
  totalLikes: number;
  totalSaves: number;
}> {
  const { data: rows, error } = await db
    .from("articles")
    .select("id")
    .eq("author_user_id", authorUserId)
    .eq("source", "creator")
    .is("deleted_at", null);
  if (error) throw new Error(`getCreatorArticleEngagementTotals articles: ${error.message}`);
  const ids = (rows as { id: string }[] | null)?.map((r) => r.id) ?? [];
  if (ids.length === 0) return { totalLikes: 0, totalSaves: 0 };

  const { count: likeCount, error: likeErr } = await db
    .from("article_likes")
    .select("*", { count: "exact", head: true })
    .in("article_id", ids);
  if (likeErr) throw new Error(`getCreatorArticleEngagementTotals likes: ${likeErr.message}`);

  const { count: saveCount, error: saveErr } = await db
    .from("article_saves")
    .select("*", { count: "exact", head: true })
    .in("article_id", ids);
  if (saveErr) throw new Error(`getCreatorArticleEngagementTotals saves: ${saveErr.message}`);

  return { totalLikes: likeCount ?? 0, totalSaves: saveCount ?? 0 };
}

/**
 * Fetch untagged articles (for the tagger agent to process).
 */
export async function getUntaggedArticles(
  limit = 20
): Promise<StoredArticle[]> {
  const { data, error } = await db
    .from("articles")
    .select("*")
    .eq("tagged", false)
    .is("deleted_at", null)
    .limit(limit);

  if (error) throw new Error(`getUntaggedArticles: ${error.message}`);
  return (data as ArticleRow[]).map(rowToArticle);
}

/**
 * Cleanup is disabled now that article TTL expiry is retired.
 */
export async function deleteExpiredArticles(): Promise<number> {
  return 0;
}
