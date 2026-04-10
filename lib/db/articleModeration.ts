import { db } from "@/lib/db/client";
import type { ArticleModerationStatus, ArticleSource } from "@/lib/types";

export interface ModerationQueueListItem {
  id: string;
  headline: string;
  category: string;
  contentKind: "news" | "user_article" | "recipe";
  source: ArticleSource;
  body: string;
  fetchedAt: string;
  tagged: boolean;
  qualityScore: number;
  moderationStatus: ArticleModerationStatus;
  moderationReason: string | null;
  moderationConfidence: number | null;
  moderationLabels: Record<string, unknown>;
  moderatedAt: string | null;
  moderatedByUserId: string | null;
  deletedAt: string | null;
  deletedByUserId: string | null;
  deleteReason: string | null;
}

export type ModerationQueueFilter = ArticleModerationStatus | "all";

function toModerationStatus(raw: string | null | undefined): ArticleModerationStatus {
  if (raw === "pending" || raw === "flagged" || raw === "rejected") return raw;
  return "approved";
}

export async function listArticlesForModeration(params: {
  filter: ModerationQueueFilter;
  limit: number;
}): Promise<ModerationQueueListItem[]> {
  const safeLimit = Math.min(250, Math.max(1, Math.trunc(params.limit)));
  let query = db
    .from("articles")
    .select(
      "id,headline,category,content_kind,source,body,fetched_at,tagged,quality_score,moderation_status,moderation_reason,moderation_confidence,moderation_labels,moderated_at,moderated_by_user_id,deleted_at,deleted_by_user_id,delete_reason"
    )
    .order("fetched_at", { ascending: false })
    .limit(safeLimit);

  if (params.filter !== "all") query = query.eq("moderation_status", params.filter);

  const { data, error } = await query;
  if (error) throw new Error(`listArticlesForModeration: ${error.message}`);
  const rows = (data ?? []) as Array<{
    id: string;
    headline: string;
    category: string;
    content_kind: string | null;
    source: string | null;
    body: string;
    fetched_at: string;
    tagged: boolean;
    quality_score: number;
    moderation_status: string | null;
    moderation_reason: string | null;
    moderation_confidence: number | null;
    moderation_labels: Record<string, unknown> | null;
    moderated_at: string | null;
    moderated_by_user_id: string | null;
    deleted_at: string | null;
    deleted_by_user_id: string | null;
    delete_reason: string | null;
  }>;

  return rows.map((row) => ({
    id: row.id,
    headline: row.headline,
    category: row.category,
    contentKind:
      row.content_kind === "recipe" || row.content_kind === "user_article"
        ? row.content_kind
        : "news",
    source: row.source === "creator" ? "creator" : "ingest",
    body: row.body,
    fetchedAt: row.fetched_at,
    tagged: row.tagged,
    qualityScore: row.quality_score ?? 0,
    moderationStatus: toModerationStatus(row.moderation_status),
    moderationReason: row.moderation_reason ?? null,
    moderationConfidence: row.moderation_confidence ?? null,
    moderationLabels: row.moderation_labels ?? {},
    moderatedAt: row.moderated_at ?? null,
    moderatedByUserId: row.moderated_by_user_id ?? null,
    deletedAt: row.deleted_at ?? null,
    deletedByUserId: row.deleted_by_user_id ?? null,
    deleteReason: row.delete_reason ?? null,
  }));
}

interface PersistModerationDecisionInput {
  articleId: string;
  reviewerUserId: string;
  status: Exclude<ArticleModerationStatus, "pending">;
  reason: string | null;
  note: string | null;
  action: string;
}

async function persistModerationDecision(
  input: PersistModerationDecisionInput
): Promise<{ id: string; moderationStatus: ArticleModerationStatus }> {
  const { data: existing, error: existingError } = await db
    .from("articles")
    .select("id, moderation_status, moderation_labels")
    .eq("id", input.articleId)
    .single();
  if (existingError || !existing) throw new Error("article not found");

  const nowIso = new Date().toISOString();
  const existingLabels =
    ((existing as { moderation_labels?: Record<string, unknown> | null }).moderation_labels ??
      {}) as Record<string, unknown>;
  const moderationLabels = {
    ...existingLabels,
    adminDecision: {
      action: input.action,
      status: input.status,
      reason: input.reason,
      note: input.note,
      at: nowIso,
      actor: input.reviewerUserId,
    },
  };

  const isRejected = input.status === "rejected";
  const { data: updated, error: updateError } = await db
    .from("articles")
    .update({
      moderation_status: input.status,
      moderation_reason: input.reason,
      moderated_at: nowIso,
      moderated_by_user_id: input.reviewerUserId,
      moderation_labels: moderationLabels,
      deleted_at: isRejected ? nowIso : null,
      deleted_by_user_id: isRejected ? input.reviewerUserId : null,
      delete_reason: isRejected ? input.reason ?? "rejected_by_admin" : null,
    })
    .eq("id", input.articleId)
    .select("id, moderation_status")
    .single();
  if (updateError || !updated) throw new Error(`persistModerationDecision: ${updateError?.message}`);

  const fromStatus = toModerationStatus(
    (existing as { moderation_status?: string | null }).moderation_status
  );
  await db.from("moderation_events").insert({
    article_id: input.articleId,
    actor_user_id: input.reviewerUserId,
    action: input.action,
    from_status: fromStatus,
    to_status: input.status,
    reason: input.reason,
    note: input.note,
    metadata: {
      scope: "article_moderation",
      articleId: input.articleId,
    },
  });

  return {
    id: (updated as { id: string }).id,
    moderationStatus: toModerationStatus(
      (updated as { moderation_status?: string | null }).moderation_status
    ),
  };
}

export async function approveModeratedArticle(input: {
  articleId: string;
  reviewerUserId: string;
  note: string | null;
}): Promise<{ id: string; moderationStatus: ArticleModerationStatus }> {
  return persistModerationDecision({
    articleId: input.articleId,
    reviewerUserId: input.reviewerUserId,
    status: "approved",
    reason: null,
    note: input.note,
    action: "article_approve",
  });
}

export async function rejectModeratedArticle(input: {
  articleId: string;
  reviewerUserId: string;
  reason: string | null;
  note: string | null;
}): Promise<{ id: string; moderationStatus: ArticleModerationStatus }> {
  return persistModerationDecision({
    articleId: input.articleId,
    reviewerUserId: input.reviewerUserId,
    status: "rejected",
    reason: input.reason ?? "Rejected by admin moderator",
    note: input.note,
    action: "article_reject",
  });
}

export async function restoreModeratedArticle(input: {
  articleId: string;
  reviewerUserId: string;
  note: string | null;
}): Promise<{ id: string; moderationStatus: ArticleModerationStatus }> {
  return persistModerationDecision({
    articleId: input.articleId,
    reviewerUserId: input.reviewerUserId,
    status: "approved",
    reason: null,
    note: input.note,
    action: "article_restore",
  });
}
