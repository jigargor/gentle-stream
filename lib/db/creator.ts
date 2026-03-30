import type {
  ArticleSubmission,
  ArticleSubmissionStatus,
  CreatorProfile,
  SubmissionContentKind,
  StoredArticle,
} from "@/lib/types";
import type { Category } from "@/lib/constants";
import { CATEGORIES } from "@/lib/constants";
import { db } from "./client";

interface CreatorProfileRow {
  user_id: string;
  pen_name: string;
  bio: string;
  interest_categories: string[];
  website_url: string | null;
  locale: string | null;
  timezone: string | null;
  guidelines_acknowledged_at: string | null;
  consent_opt_in: boolean | null;
  consent_proof: string | null;
  consent_opt_in_at: string | null;
  onboarding_completed_at: string | null;
  created_at: string;
  updated_at: string;
}

interface ArticleSubmissionRow {
  id: string;
  author_user_id: string;
  headline: string;
  subheadline: string;
  body: string;
  pull_quote: string;
  category: string;
  content_kind: string | null;
  locale: string;
  explicit_hashtags: string[];
  status: string;
  admin_note: string | null;
  rejection_reason: string | null;
  reviewed_by_user_id: string | null;
  reviewed_at: string | null;
  published_article_id: string | null;
  created_at: string;
  updated_at: string;

  recipe_servings?: number | null;
  recipe_ingredients?: string[] | null;
  recipe_instructions?: string[] | null;
  recipe_prep_time_minutes?: number | null;
  recipe_cook_time_minutes?: number | null;
  recipe_images?: string[] | null;
}

function isCategory(value: string): value is Category {
  return CATEGORIES.includes(value as Category);
}

function toSubmissionStatus(value: string): ArticleSubmissionStatus {
  if (
    value === "pending" ||
    value === "changes_requested" ||
    value === "approved" ||
    value === "rejected" ||
    value === "withdrawn"
  ) {
    return value;
  }
  return "pending";
}

function toSubmissionContentKind(value: string | null | undefined): SubmissionContentKind {
  return value === "recipe" ? "recipe" : "user_article";
}

function rowToCreatorProfile(row: CreatorProfileRow): CreatorProfile {
  const safeCategories = (row.interest_categories ?? []).filter(isCategory);
  return {
    userId: row.user_id,
    penName: row.pen_name,
    bio: row.bio ?? "",
    interestCategories: safeCategories,
    websiteUrl: row.website_url,
    locale: row.locale,
    timezone: row.timezone,
    guidelinesAcknowledgedAt: row.guidelines_acknowledged_at,
    consentOptIn: row.consent_opt_in === true,
    consentProof: row.consent_proof,
    consentOptInAt: row.consent_opt_in_at,
    onboardingCompletedAt: row.onboarding_completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToSubmission(row: ArticleSubmissionRow): ArticleSubmission {
  return {
    id: row.id,
    authorUserId: row.author_user_id,
    headline: row.headline,
    subheadline: row.subheadline,
    body: row.body,
    pullQuote: row.pull_quote,
    category: isCategory(row.category) ? row.category : CATEGORIES[0],
    contentKind: toSubmissionContentKind(row.content_kind),
    locale: row.locale ?? "global",
    explicitHashtags: row.explicit_hashtags ?? [],
    status: toSubmissionStatus(row.status),
    adminNote: row.admin_note,
    rejectionReason: row.rejection_reason,
    reviewedByUserId: row.reviewed_by_user_id,
    reviewedAt: row.reviewed_at,
    publishedArticleId: row.published_article_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,

    recipeServings: row.recipe_servings ?? null,
    recipeIngredients: row.recipe_ingredients ?? [],
    recipeInstructions: row.recipe_instructions ?? [],
    recipePrepTimeMinutes: row.recipe_prep_time_minutes ?? null,
    recipeCookTimeMinutes: row.recipe_cook_time_minutes ?? null,
    recipeImages: row.recipe_images ?? [],
  };
}

export function normaliseHashtag(raw: string): string {
  return raw.trim().replace(/^#/, "").toLowerCase();
}

export function normaliseHashtags(values: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const tag = normaliseHashtag(value);
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag);
    if (out.length >= 12) break;
  }
  return out;
}

export function creatorSubmissionFingerprint(params: {
  authorUserId: string;
  submissionId: string;
}): string {
  return `creator:${params.authorUserId.toLowerCase()}:${params.submissionId.toLowerCase()}`;
}

export async function getCreatorProfile(userId: string): Promise<CreatorProfile | null> {
  const { data, error } = await db
    .from("creator_profiles")
    .select("*")
    .eq("user_id", userId)
    .single();
  if (error || !data) return null;
  return rowToCreatorProfile(data as CreatorProfileRow);
}

/** Map of user_id → trimmed pen_name (empty string if unset). */
export async function getCreatorPenNamesByUserIds(
  userIds: string[]
): Promise<Map<string, string>> {
  const unique = [...new Set(userIds.filter(Boolean))];
  if (unique.length === 0) return new Map();
  const { data, error } = await db
    .from("creator_profiles")
    .select("user_id, pen_name")
    .in("user_id", unique);
  if (error) throw new Error(`getCreatorPenNamesByUserIds: ${error.message}`);
  const map = new Map<string, string>();
  for (const row of data ?? []) {
    const r = row as { user_id: string; pen_name: string | null };
    map.set(r.user_id, (r.pen_name ?? "").trim());
  }
  return map;
}

export async function upsertCreatorProfile(input: {
  userId: string;
  penName: string;
  bio: string;
  interestCategories: Category[];
  websiteUrl: string | null;
  locale: string | null;
  timezone: string | null;
  guidelinesAcknowledgedAt: string | null;
  consentOptIn: boolean;
  consentProof: string | null;
  consentOptInAt: string | null;
  onboardingCompletedAt: string | null;
}): Promise<CreatorProfile> {
  const row = {
    user_id: input.userId,
    pen_name: input.penName,
    bio: input.bio,
    interest_categories: input.interestCategories,
    website_url: input.websiteUrl,
    locale: input.locale,
    timezone: input.timezone,
    guidelines_acknowledged_at: input.guidelinesAcknowledgedAt,
    consent_opt_in: input.consentOptIn,
    consent_proof: input.consentProof,
    consent_opt_in_at: input.consentOptInAt,
    onboarding_completed_at: input.onboardingCompletedAt,
  };
  const { data, error } = await db
    .from("creator_profiles")
    .upsert(row, { onConflict: "user_id" })
    .select("*")
    .single();
  if (error) throw new Error(`upsertCreatorProfile: ${error.message}`);
  return rowToCreatorProfile(data as CreatorProfileRow);
}

export async function promoteUserToCreator(userId: string): Promise<void> {
  const { error } = await db
    .from("user_profiles")
    .update({ user_role: "creator" })
    .eq("user_id", userId);
  if (error) throw new Error(`promoteUserToCreator: ${error.message}`);
}

export async function countSubmissionsSince(params: {
  authorUserId: string;
  createdAfterIso: string;
}): Promise<number> {
  const { count, error } = await db
    .from("article_submissions")
    .select("id", { count: "exact", head: true })
    .eq("author_user_id", params.authorUserId)
    .gte("created_at", params.createdAfterIso);
  if (error) throw new Error(`countSubmissionsSince: ${error.message}`);
  return count ?? 0;
}

export async function createSubmission(input: {
  authorUserId: string;
  headline: string;
  subheadline: string;
  body: string;
  pullQuote: string;
  category: Category;
  contentKind: SubmissionContentKind;
  locale: string;
  explicitHashtags: string[];
  recipeServings?: number | null;
  recipeIngredients?: string[];
  recipeInstructions?: string[];
  recipePrepTimeMinutes?: number | null;
  recipeCookTimeMinutes?: number | null;
  recipeImages?: string[];
}): Promise<ArticleSubmission> {
  const row = {
    author_user_id: input.authorUserId,
    headline: input.headline,
    subheadline: input.subheadline,
    body: input.body,
    pull_quote: input.pullQuote,
    category: input.category,
    content_kind: input.contentKind,
    locale: input.locale,
    explicit_hashtags: normaliseHashtags(input.explicitHashtags),
    status: "pending",

    recipe_servings:
      input.contentKind === "recipe" ? input.recipeServings ?? null : null,
    recipe_ingredients:
      input.contentKind === "recipe" ? input.recipeIngredients ?? [] : [],
    recipe_instructions:
      input.contentKind === "recipe" ? input.recipeInstructions ?? [] : [],
    recipe_prep_time_minutes:
      input.contentKind === "recipe" ? input.recipePrepTimeMinutes ?? null : null,
    recipe_cook_time_minutes:
      input.contentKind === "recipe" ? input.recipeCookTimeMinutes ?? null : null,
    recipe_images:
      input.contentKind === "recipe" ? input.recipeImages ?? [] : [],
  };
  const { data, error } = await db
    .from("article_submissions")
    .insert(row)
    .select("*")
    .single();
  if (error) throw new Error(`createSubmission: ${error.message}`);
  return rowToSubmission(data as ArticleSubmissionRow);
}

export async function listSubmissionsByAuthor(authorUserId: string): Promise<ArticleSubmission[]> {
  const { data, error } = await db
    .from("article_submissions")
    .select("*")
    .eq("author_user_id", authorUserId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`listSubmissionsByAuthor: ${error.message}`);
  return (data as ArticleSubmissionRow[]).map(rowToSubmission);
}

export async function updateSubmissionForAuthor(input: {
  id: string;
  authorUserId: string;
  headline?: string;
  subheadline?: string;
  body?: string;
  pullQuote?: string;
  category?: Category;
  contentKind?: SubmissionContentKind;
  locale?: string;
  explicitHashtags?: string[];
  withdraw?: boolean;

  recipeServings?: number | null;
  recipeIngredients?: string[];
  recipeInstructions?: string[];
  recipePrepTimeMinutes?: number | null;
  recipeCookTimeMinutes?: number | null;
  recipeImages?: string[];
}): Promise<ArticleSubmission> {
  const { data: existing, error: existingError } = await db
    .from("article_submissions")
    .select("*")
    .eq("id", input.id)
    .eq("author_user_id", input.authorUserId)
    .single();
  if (existingError || !existing) throw new Error("Submission not found");
  const row = existing as ArticleSubmissionRow;
  if (row.status !== "pending" && row.status !== "changes_requested") {
    throw new Error("Only pending or changes-requested submissions can be changed");
  }

  const updates: Record<string, unknown> = {};
  if (input.headline !== undefined) updates.headline = input.headline;
  if (input.subheadline !== undefined) updates.subheadline = input.subheadline;
  if (input.body !== undefined) updates.body = input.body;
  if (input.pullQuote !== undefined) updates.pull_quote = input.pullQuote;
  if (input.category !== undefined) updates.category = input.category;
  if (input.contentKind !== undefined) updates.content_kind = input.contentKind;
  if (input.locale !== undefined) updates.locale = input.locale;
  if (input.explicitHashtags !== undefined) {
    updates.explicit_hashtags = normaliseHashtags(input.explicitHashtags);
  }

  if (input.recipeServings !== undefined) {
    updates.recipe_servings = input.recipeServings;
  }
  if (input.recipeIngredients !== undefined) {
    updates.recipe_ingredients = input.recipeIngredients;
  }
  if (input.recipeInstructions !== undefined) {
    updates.recipe_instructions = input.recipeInstructions;
  }
  if (input.recipePrepTimeMinutes !== undefined) {
    updates.recipe_prep_time_minutes = input.recipePrepTimeMinutes;
  }
  if (input.recipeCookTimeMinutes !== undefined) {
    updates.recipe_cook_time_minutes = input.recipeCookTimeMinutes;
  }
  if (input.recipeImages !== undefined) {
    updates.recipe_images = input.recipeImages;
  }
  if (row.status === "changes_requested") {
    // Any creator edit after moderation feedback is treated as a resubmission.
    updates.status = "pending";
    updates.admin_note = null;
    updates.rejection_reason = null;
    updates.reviewed_by_user_id = null;
    updates.reviewed_at = null;
  }
  if (input.withdraw) {
    updates.status = "withdrawn";
  }

  const { data, error } = await db
    .from("article_submissions")
    .update(updates)
    .eq("id", input.id)
    .eq("author_user_id", input.authorUserId)
    .select("*")
    .single();
  if (error) throw new Error(`updateSubmissionForAuthor: ${error.message}`);
  return rowToSubmission(data as ArticleSubmissionRow);
}

export async function listSubmissionsForAdmin(status?: ArticleSubmissionStatus): Promise<ArticleSubmission[]> {
  let query = db
    .from("article_submissions")
    .select("*")
    .order("created_at", { ascending: false });
  if (status) query = query.eq("status", status);
  const { data, error } = await query;
  if (error) throw new Error(`listSubmissionsForAdmin: ${error.message}`);
  return (data as ArticleSubmissionRow[]).map(rowToSubmission);
}

export async function reviewSubmission(input: {
  submissionId: string;
  reviewerUserId: string;
  action: "approve" | "request_changes" | "reject";
  adminNote: string | null;
  rejectionReason: string | null;
}): Promise<{ submission: ArticleSubmission; publishedArticle: StoredArticle | null }> {
  const { data: row, error: fetchError } = await db
    .from("article_submissions")
    .select("*")
    .eq("id", input.submissionId)
    .single();
  if (fetchError || !row) throw new Error("Submission not found");
  const submission = row as ArticleSubmissionRow;
  if (submission.status !== "pending") {
    throw new Error("Submission is no longer pending");
  }

  if (input.action === "request_changes") {
    const { data: requested, error: requestError } = await db
      .from("article_submissions")
      .update({
        status: "changes_requested",
        admin_note:
          input.adminNote ??
          "Please revise this draft based on moderation guidance and resubmit.",
        rejection_reason: null,
        reviewed_by_user_id: input.reviewerUserId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", input.submissionId)
      .select("*")
      .single();
    if (requestError) throw new Error(`reviewSubmission request_changes: ${requestError.message}`);
    return { submission: rowToSubmission(requested as ArticleSubmissionRow), publishedArticle: null };
  }

  if (input.action === "reject") {
    const { data: rejected, error: rejectError } = await db
      .from("article_submissions")
      .update({
        status: "rejected",
        admin_note: input.adminNote,
        rejection_reason: input.rejectionReason,
        reviewed_by_user_id: input.reviewerUserId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", input.submissionId)
      .select("*")
      .single();
    if (rejectError) throw new Error(`reviewSubmission reject: ${rejectError.message}`);
    return { submission: rowToSubmission(rejected as ArticleSubmissionRow), publishedArticle: null };
  }

  const fingerprint = creatorSubmissionFingerprint({
    authorUserId: submission.author_user_id,
    submissionId: submission.id,
  });
  const explicitTags = normaliseHashtags(submission.explicit_hashtags ?? []);
  const authorProfile = await getCreatorProfile(submission.author_user_id);
  const penName = authorProfile?.penName?.trim() ?? "";
  const byline = penName ? `By ${penName}` : "By Creator";
  const location =
    authorProfile?.locale?.trim() &&
    authorProfile.locale.trim().toLowerCase() !== "global"
      ? authorProfile.locale.trim()
      : "";
  const { data: article, error: articleError } = await db
    .from("articles")
    .insert({
      headline: submission.headline,
      subheadline: submission.subheadline,
      byline,
      location,
      category: submission.category,
      content_kind: toSubmissionContentKind(submission.content_kind),
      body: submission.body,
      pull_quote: submission.pull_quote,
      image_prompt: "",
      tags: explicitTags,
      tagged: false,
      sentiment: "uplifting",
      emotions: [],
      locale: submission.locale || "global",
      reading_time_secs: 120,
      quality_score: 0.6,
      used_count: 0,
      fingerprint,
      source_urls: [],
      source: "creator",
      author_user_id: submission.author_user_id,
      submission_id: submission.id,
      creator_explicit_tags: explicitTags,

      recipe_servings:
        submission.content_kind === "recipe" ? submission.recipe_servings ?? null : null,
      recipe_ingredients:
        submission.content_kind === "recipe" ? submission.recipe_ingredients ?? [] : [],
      recipe_instructions:
        submission.content_kind === "recipe" ? submission.recipe_instructions ?? [] : [],
      recipe_prep_time_minutes:
        submission.content_kind === "recipe" ? submission.recipe_prep_time_minutes ?? null : null,
      recipe_cook_time_minutes:
        submission.content_kind === "recipe" ? submission.recipe_cook_time_minutes ?? null : null,
      recipe_images:
        submission.content_kind === "recipe" ? submission.recipe_images ?? [] : [],
    })
    .select("*")
    .single();
  if (articleError) throw new Error(`reviewSubmission publish insert: ${articleError.message}`);

  const { data: approved, error: approveError } = await db
    .from("article_submissions")
    .update({
      status: "approved",
      admin_note: input.adminNote,
      rejection_reason: null,
      reviewed_by_user_id: input.reviewerUserId,
      reviewed_at: new Date().toISOString(),
      published_article_id: (article as { id: string }).id,
    })
    .eq("id", input.submissionId)
    .select("*")
    .single();
  if (approveError) throw new Error(`reviewSubmission approve: ${approveError.message}`);

  return {
    submission: rowToSubmission(approved as ArticleSubmissionRow),
    publishedArticle: {
      id: (article as { id: string }).id,
      headline: submission.headline,
      subheadline: submission.subheadline,
      byline,
      location,
      category: isCategory(submission.category) ? submission.category : CATEGORIES[0],
      contentKind: toSubmissionContentKind(submission.content_kind),
      body: submission.body,
      pullQuote: submission.pull_quote,
      imagePrompt: "",
      sourceUrls: [],
      fetchedAt: (article as { fetched_at: string }).fetched_at,
      expiresAt: (article as { expires_at: string }).expires_at,
      tags: explicitTags,
      sentiment: "uplifting",
      emotions: [],
      locale: submission.locale || "global",
      readingTimeSecs: 120,
      qualityScore: 0.6,
      usedCount: 0,
      tagged: false,
      source: "creator",
      authorUserId: submission.author_user_id,
      submissionId: submission.id,
      creatorExplicitTags: explicitTags,
      recipeServings:
        submission.content_kind === "recipe"
          ? submission.recipe_servings ?? null
          : null,
      recipeIngredients:
        submission.content_kind === "recipe"
          ? submission.recipe_ingredients ?? []
          : [],
      recipeInstructions:
        submission.content_kind === "recipe"
          ? submission.recipe_instructions ?? []
          : [],
      recipePrepTimeMinutes:
        submission.content_kind === "recipe"
          ? submission.recipe_prep_time_minutes ?? null
          : null,
      recipeCookTimeMinutes:
        submission.content_kind === "recipe"
          ? submission.recipe_cook_time_minutes ?? null
          : null,
      recipeImages:
        submission.content_kind === "recipe"
          ? submission.recipe_images ?? []
          : [],
    },
  };
}
