import { createHash } from "node:crypto";
import { db } from "@/lib/db/client";
import { CATEGORIES, RECIPE_CATEGORY, type ArticleStorageCategory, type Category } from "@/lib/constants";
import type {
  CreatorDraft,
  CreatorDraftSummary,
  CreatorDraftVersion,
  CreatorDraftVersionReason,
  SubmissionContentKind,
} from "@/lib/types";
import { decryptSensitiveText, encryptSensitiveText } from "@/lib/security/key-vault";

interface CreatorDraftRow {
  id: string;
  user_id: string;
  title: string;
  body: string;
  content_kind: SubmissionContentKind;
  article_type: string | null;
  article_type_custom: string | null;
  category: string;
  locale: string;
  explicit_hashtags: string[] | null;
  pull_quote: string;
  private_notes_ciphertext: string | null;
  private_notes_iv: string | null;
  private_notes_auth_tag: string | null;
  never_send_to_ai: boolean;
  content_hash: string;
  word_count: number;
  revision: number;
  last_opened_at: string;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

interface CreatorDraftVersionRow {
  id: string;
  draft_id: string;
  user_id: string;
  revision: number;
  title: string;
  body: string;
  content_kind: SubmissionContentKind;
  article_type: string | null;
  article_type_custom: string | null;
  category: string;
  locale: string;
  explicit_hashtags: string[] | null;
  pull_quote: string;
  content_hash: string;
  word_count: number;
  version_reason: CreatorDraftVersionReason;
  created_at: string;
}

export class DraftConflictError extends Error {
  constructor() {
    super("Draft has changed in another tab. Refresh before saving.");
    this.name = "DraftConflictError";
  }
}

function safeCategory(value: string, kind: SubmissionContentKind): ArticleStorageCategory {
  if (kind === "recipe") return RECIPE_CATEGORY;
  if (CATEGORIES.includes(value as Category)) return value as Category;
  return CATEGORIES[0];
}

function rowToDraftSummary(row: CreatorDraftRow): CreatorDraftSummary {
  const kind = row.content_kind ?? "user_article";
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title ?? "",
    contentKind: kind,
    articleType: row.article_type ?? null,
    articleTypeCustom: row.article_type_custom ?? null,
    category: safeCategory(row.category, kind),
    locale: row.locale ?? "global",
    explicitHashtags: row.explicit_hashtags ?? [],
    pullQuote: row.pull_quote ?? "",
    wordCount: row.word_count ?? 0,
    revision: Math.max(1, Math.trunc(row.revision ?? 1)),
    lastOpenedAt: row.last_opened_at,
    neverSendToAi: row.never_send_to_ai === true,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToDraft(row: CreatorDraftRow): CreatorDraft {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title ?? "",
    body: row.body ?? "",
    contentKind: row.content_kind ?? "user_article",
    articleType: row.article_type ?? null,
    articleTypeCustom: row.article_type_custom ?? null,
    category: safeCategory(row.category, row.content_kind),
    locale: row.locale ?? "global",
    explicitHashtags: row.explicit_hashtags ?? [],
    pullQuote: row.pull_quote ?? "",
    privateNotes:
      row.private_notes_ciphertext && row.private_notes_iv && row.private_notes_auth_tag
        ? decryptSensitiveText({
            ciphertext: row.private_notes_ciphertext,
            iv: row.private_notes_iv,
            authTag: row.private_notes_auth_tag,
          })
        : null,
    contentHash: row.content_hash ?? "",
    wordCount: row.word_count ?? 0,
    revision: Math.max(1, Math.trunc(row.revision ?? 1)),
    lastOpenedAt: row.last_opened_at,
    neverSendToAi: row.never_send_to_ai === true,
    deletedAt: row.deleted_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToDraftVersion(row: CreatorDraftVersionRow): CreatorDraftVersion {
  return {
    id: row.id,
    draftId: row.draft_id,
    userId: row.user_id,
    revision: Math.max(1, Math.trunc(row.revision ?? 1)),
    title: row.title ?? "",
    body: row.body ?? "",
    contentKind: row.content_kind ?? "user_article",
    articleType: row.article_type ?? null,
    articleTypeCustom: row.article_type_custom ?? null,
    category: safeCategory(row.category, row.content_kind),
    locale: row.locale ?? "global",
    explicitHashtags: row.explicit_hashtags ?? [],
    pullQuote: row.pull_quote ?? "",
    contentHash: row.content_hash ?? "",
    wordCount: row.word_count ?? 0,
    versionReason: row.version_reason,
    createdAt: row.created_at,
  };
}

function normalizeHashtags(values: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const tag = String(value).trim().replace(/^#/, "").toLowerCase();
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag);
    if (out.length >= 16) break;
  }
  return out;
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function computeDraftContentHash(input: {
  title: string;
  body: string;
  contentKind: SubmissionContentKind;
  articleType: string | null;
  articleTypeCustom: string | null;
}): string {
  return createHash("sha256")
    .update(
      [
        input.title.trim(),
        input.body.trim(),
        input.contentKind,
        input.articleType ?? "",
        input.articleTypeCustom ?? "",
      ].join("\n||\n")
    )
    .digest("hex");
}

export async function countActiveDrafts(userId: string): Promise<number> {
  const { count, error } = await db
    .from("creator_drafts")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .is("deleted_at", null);
  if (error) throw new Error(`countActiveDrafts: ${error.message}`);
  return count ?? 0;
}

export async function listCreatorDrafts(input: {
  userId: string;
  limit?: number;
  cursorUpdatedAt?: string | null;
  includeDeleted?: boolean;
}): Promise<{ drafts: CreatorDraft[]; nextCursor: string | null }> {
  const limit = Math.max(1, Math.min(50, Math.trunc(input.limit ?? 12)));
  let query = db
    .from("creator_drafts")
    .select("*")
    .eq("user_id", input.userId)
    .order("updated_at", { ascending: false })
    .limit(limit + 1);
  if (!input.includeDeleted) query = query.is("deleted_at", null);
  if (input.cursorUpdatedAt) query = query.lt("updated_at", input.cursorUpdatedAt);
  const { data, error } = await query;
  if (error) throw new Error(`listCreatorDrafts: ${error.message}`);
  const rows = (data ?? []) as CreatorDraftRow[];
  const sliced = rows.slice(0, limit).map(rowToDraft);
  return {
    drafts: sliced,
    nextCursor: rows.length > limit ? sliced[sliced.length - 1]?.updatedAt ?? null : null,
  };
}

/**
 * Paginated draft list without body, private notes, or content hash payload (for dashboards and bootstrap).
 */
export async function listCreatorDraftSummaries(input: {
  userId: string;
  limit?: number;
  cursorUpdatedAt?: string | null;
  includeDeleted?: boolean;
}): Promise<{ summaries: CreatorDraftSummary[]; nextCursor: string | null }> {
  const limit = Math.max(1, Math.min(50, Math.trunc(input.limit ?? 12)));
  const columns = [
    "id",
    "user_id",
    "title",
    "content_kind",
    "article_type",
    "article_type_custom",
    "category",
    "locale",
    "explicit_hashtags",
    "pull_quote",
    "word_count",
    "revision",
    "never_send_to_ai",
    "last_opened_at",
    "created_at",
    "updated_at",
  ].join(",");
  let query = db
    .from("creator_drafts")
    .select(columns)
    .eq("user_id", input.userId)
    .order("updated_at", { ascending: false })
    .limit(limit + 1);
  if (!input.includeDeleted) query = query.is("deleted_at", null);
  if (input.cursorUpdatedAt) query = query.lt("updated_at", input.cursorUpdatedAt);
  const { data, error } = await query;
  if (error) throw new Error(`listCreatorDraftSummaries: ${error.message}`);
  const rows = (data ?? []) as unknown as CreatorDraftRow[];
  const sliced = rows.slice(0, limit);
  const summaries = sliced.map((r) =>
    rowToDraftSummary({
      ...r,
      body: "",
      private_notes_ciphertext: null,
      private_notes_iv: null,
      private_notes_auth_tag: null,
      content_hash: "",
      deleted_at: null,
    } as CreatorDraftRow)
  );
  return {
    summaries,
    nextCursor: rows.length > limit ? summaries[summaries.length - 1]?.updatedAt ?? null : null,
  };
}

export async function getCreatorDraftById(input: {
  userId: string;
  draftId: string;
}): Promise<CreatorDraft | null> {
  const { data, error } = await db
    .from("creator_drafts")
    .select("*")
    .eq("id", input.draftId)
    .eq("user_id", input.userId)
    .maybeSingle();
  if (error) throw new Error(`getCreatorDraftById: ${error.message}`);
  if (!data) return null;
  return rowToDraft(data as CreatorDraftRow);
}

export async function createCreatorDraft(input: {
  userId: string;
  title?: string;
  body?: string;
  contentKind?: SubmissionContentKind;
  articleType?: string | null;
  articleTypeCustom?: string | null;
  category?: ArticleStorageCategory;
  locale?: string;
  explicitHashtags?: string[];
  pullQuote?: string;
  privateNotes?: string | null;
  neverSendToAi?: boolean;
}): Promise<CreatorDraft> {
  const contentKind = input.contentKind ?? "user_article";
  const title = (input.title ?? "").trim().slice(0, 280);
  const body = (input.body ?? "").slice(0, 60_000);
  const hash = computeDraftContentHash({
    title,
    body,
    contentKind,
    articleType: input.articleType ?? null,
    articleTypeCustom: input.articleTypeCustom ?? null,
  });
  const encryptedNotes = (() => {
    const raw = (input.privateNotes ?? "").trim();
    if (!raw) return null;
    return encryptSensitiveText(raw.slice(0, 6_000));
  })();
  const row = {
    user_id: input.userId,
    title,
    body,
    content_kind: contentKind,
    article_type: input.articleType ?? null,
    article_type_custom: input.articleTypeCustom ?? null,
    category: input.category ?? CATEGORIES[0],
    locale: (input.locale ?? "global").slice(0, 64),
    explicit_hashtags: normalizeHashtags(input.explicitHashtags ?? []),
    pull_quote: (input.pullQuote ?? "").slice(0, 500),
    private_notes_ciphertext: encryptedNotes?.ciphertext ?? null,
    private_notes_iv: encryptedNotes?.iv ?? null,
    private_notes_auth_tag: encryptedNotes?.authTag ?? null,
    never_send_to_ai: input.neverSendToAi === true,
    content_hash: hash,
    word_count: wordCount(body),
    revision: 1,
    last_opened_at: new Date().toISOString(),
  };
  const { data, error } = await db.from("creator_drafts").insert(row).select("*").single();
  if (error) throw new Error(`createCreatorDraft: ${error.message}`);
  const draft = rowToDraft(data as CreatorDraftRow);
  await createCreatorDraftVersion({
    draft,
    reason: "manual_checkpoint",
  });
  return draft;
}

export async function updateCreatorDraft(input: {
  userId: string;
  draftId: string;
  expectedRevision: number;
  title?: string;
  body?: string;
  contentKind?: SubmissionContentKind;
  articleType?: string | null;
  articleTypeCustom?: string | null;
  category?: ArticleStorageCategory;
  locale?: string;
  explicitHashtags?: string[];
  pullQuote?: string;
  privateNotes?: string | null;
  neverSendToAi?: boolean;
  lastOpenedAt?: string;
}): Promise<CreatorDraft> {
  const current = await getCreatorDraftById({ userId: input.userId, draftId: input.draftId });
  if (!current) throw new Error("Draft not found");
  if (current.revision !== input.expectedRevision) throw new DraftConflictError();

  const title = input.title !== undefined ? input.title.trim().slice(0, 280) : current.title;
  const body = input.body !== undefined ? input.body.slice(0, 60_000) : current.body;
  const contentKind = input.contentKind ?? current.contentKind;
  const articleType = input.articleType !== undefined ? input.articleType : current.articleType;
  const articleTypeCustom =
    input.articleTypeCustom !== undefined ? input.articleTypeCustom : current.articleTypeCustom;
  const nextRevision = current.revision + 1;
  const hash = computeDraftContentHash({
    title,
    body,
    contentKind,
    articleType: articleType ?? null,
    articleTypeCustom: articleTypeCustom ?? null,
  });
  const encryptedNotes = (() => {
    if (input.privateNotes === undefined) return undefined;
    const raw = (input.privateNotes ?? "").trim();
    if (!raw) return null;
    return encryptSensitiveText(raw.slice(0, 6_000));
  })();
  const updates = {
    title,
    body,
    content_kind: contentKind,
    article_type: articleType ?? null,
    article_type_custom: articleTypeCustom ?? null,
    category: input.category ?? current.category,
    locale: input.locale ?? current.locale,
    explicit_hashtags:
      input.explicitHashtags !== undefined
        ? normalizeHashtags(input.explicitHashtags)
        : current.explicitHashtags,
    pull_quote: input.pullQuote ?? current.pullQuote,
    private_notes_ciphertext:
      encryptedNotes === undefined ? undefined : encryptedNotes?.ciphertext ?? null,
    private_notes_iv: encryptedNotes === undefined ? undefined : encryptedNotes?.iv ?? null,
    private_notes_auth_tag:
      encryptedNotes === undefined ? undefined : encryptedNotes?.authTag ?? null,
    never_send_to_ai: input.neverSendToAi ?? current.neverSendToAi,
    content_hash: hash,
    word_count: wordCount(body),
    revision: nextRevision,
    last_opened_at: input.lastOpenedAt ?? new Date().toISOString(),
  };
  const { data, error } = await db
    .from("creator_drafts")
    .update(updates)
    .eq("id", input.draftId)
    .eq("user_id", input.userId)
    .eq("revision", input.expectedRevision)
    .select("*")
    .maybeSingle();
  if (error) throw new Error(`updateCreatorDraft: ${error.message}`);
  if (!data) throw new DraftConflictError();
  return rowToDraft(data as CreatorDraftRow);
}

export async function createCreatorDraftVersion(input: {
  draft: CreatorDraft;
  reason: CreatorDraftVersionReason;
}): Promise<CreatorDraftVersion> {
  const row = {
    draft_id: input.draft.id,
    user_id: input.draft.userId,
    revision: input.draft.revision,
    title: input.draft.title,
    body: input.draft.body,
    content_kind: input.draft.contentKind,
    article_type: input.draft.articleType,
    article_type_custom: input.draft.articleTypeCustom,
    category: input.draft.category,
    locale: input.draft.locale,
    explicit_hashtags: input.draft.explicitHashtags,
    pull_quote: input.draft.pullQuote,
    content_hash: input.draft.contentHash,
    word_count: input.draft.wordCount,
    version_reason: input.reason,
  };
  const { data, error } = await db
    .from("creator_draft_versions")
    .insert(row)
    .select("*")
    .single();
  if (error) throw new Error(`createCreatorDraftVersion: ${error.message}`);
  return rowToDraftVersion(data as CreatorDraftVersionRow);
}

export async function listCreatorDraftVersions(input: {
  userId: string;
  draftId: string;
  limit?: number;
}): Promise<CreatorDraftVersion[]> {
  const limit = Math.max(1, Math.min(200, Math.trunc(input.limit ?? 60)));
  const { data, error } = await db
    .from("creator_draft_versions")
    .select("*")
    .eq("user_id", input.userId)
    .eq("draft_id", input.draftId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`listCreatorDraftVersions: ${error.message}`);
  return ((data ?? []) as CreatorDraftVersionRow[]).map(rowToDraftVersion);
}

export async function getCreatorDraftVersionById(input: {
  userId: string;
  draftId: string;
  versionId: string;
}): Promise<CreatorDraftVersion | null> {
  const { data, error } = await db
    .from("creator_draft_versions")
    .select("*")
    .eq("id", input.versionId)
    .eq("draft_id", input.draftId)
    .eq("user_id", input.userId)
    .maybeSingle();
  if (error) throw new Error(`getCreatorDraftVersionById: ${error.message}`);
  if (!data) return null;
  return rowToDraftVersion(data as CreatorDraftVersionRow);
}

export async function restoreCreatorDraftFromVersion(input: {
  userId: string;
  draftId: string;
  versionId: string;
  expectedRevision: number;
}): Promise<CreatorDraft> {
  const current = await getCreatorDraftById({
    userId: input.userId,
    draftId: input.draftId,
  });
  if (!current) throw new Error("Draft not found");
  if (current.revision !== input.expectedRevision) throw new DraftConflictError();
  const version = await getCreatorDraftVersionById({
    userId: input.userId,
    draftId: input.draftId,
    versionId: input.versionId,
  });
  if (!version) throw new Error("Draft version not found");
  const restored = await updateCreatorDraft({
    userId: input.userId,
    draftId: input.draftId,
    expectedRevision: input.expectedRevision,
    title: version.title,
    body: version.body,
    contentKind: version.contentKind,
    articleType: version.articleType,
    articleTypeCustom: version.articleTypeCustom,
    category: version.category,
    locale: version.locale,
    explicitHashtags: version.explicitHashtags,
    pullQuote: version.pullQuote,
  });
  await createCreatorDraftVersion({ draft: restored, reason: "restore" });
  return restored;
}

export async function markCreatorDraftOpened(input: {
  userId: string;
  draftId: string;
}): Promise<void> {
  const { error } = await db
    .from("creator_drafts")
    .update({ last_opened_at: new Date().toISOString() })
    .eq("id", input.draftId)
    .eq("user_id", input.userId);
  if (error) throw new Error(`markCreatorDraftOpened: ${error.message}`);
}

export async function softDeleteCreatorDraft(input: {
  userId: string;
  draftId: string;
  reason?: string | null;
}): Promise<void> {
  const { error } = await db
    .from("creator_drafts")
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by_user_id: input.userId,
      delete_reason: input.reason ?? null,
    })
    .eq("id", input.draftId)
    .eq("user_id", input.userId)
    .is("deleted_at", null);
  if (error) throw new Error(`softDeleteCreatorDraft: ${error.message}`);
}

export async function purgeCreatorDraft(input: {
  userId: string;
  draftId: string;
}): Promise<void> {
  const { error } = await db
    .from("creator_drafts")
    .delete()
    .eq("id", input.draftId)
    .eq("user_id", input.userId);
  if (error) throw new Error(`purgeCreatorDraft: ${error.message}`);
}
