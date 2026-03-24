import { db } from "@/lib/db/client";

export interface UserAffinityRow {
  category: string;
  locale: string;
  affinity_score: number;
}

export async function getUserAffinityRows(
  userId: string
): Promise<UserAffinityRow[]> {
  const { data, error } = await db
    .from("user_article_affinity")
    .select("category,locale,affinity_score")
    .eq("user_id", userId)
    .order("affinity_score", { ascending: false })
    .limit(200);

  if (error) throw new Error(`getUserAffinityRows: ${error.message}`);
  return (data ?? []) as UserAffinityRow[];
}

