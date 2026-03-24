import { db } from "./client";
import type { SavedArticleListItem } from "../types";

export async function listArticleSavesForUser(
  userId: string
): Promise<SavedArticleListItem[]> {
  const { data, error } = await db
    .from("article_saves")
    .select("id, article_id, article_title, article_url, summary, saved_at, is_read")
    .eq("user_id", userId)
    .order("saved_at", { ascending: false });

  if (error) throw new Error(error.message);

  return (data ?? []).map((r) => ({
    id: r.id as string,
    articleId: r.article_id as string,
    articleTitle: r.article_title as string,
    articleUrl: (r.article_url as string | null) ?? null,
    summary: (r.summary as string | null) ?? null,
    savedAt: r.saved_at as string,
    isRead: Boolean(r.is_read),
  }));
}

export async function userHasArticleSave(
  userId: string,
  articleId: string
): Promise<boolean> {
  const { data, error } = await db
    .from("article_saves")
    .select("id")
    .eq("user_id", userId)
    .eq("article_id", articleId)
    .maybeSingle();

  if (error) return false;
  return Boolean(data);
}

export async function getSavedArticleOriginalUrl(
  userId: string,
  articleId: string
): Promise<string | null> {
  const { data, error } = await db
    .from("article_saves")
    .select("article_url")
    .eq("user_id", userId)
    .eq("article_id", articleId)
    .maybeSingle();

  if (error || !data) return null;
  const u = data.article_url as string | null;
  return u?.trim() ? u.trim() : null;
}
