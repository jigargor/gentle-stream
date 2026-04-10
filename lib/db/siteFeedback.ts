import { db } from "@/lib/db/client";

export interface SiteFeedbackRow {
  id: string;
  createdAt: string;
  message: string;
  pageUrl: string | null;
  contactEmail: string | null;
  userAgent: string | null;
  userId: string | null;
  status: "new" | "read" | "archived";
}

export async function insertSiteFeedback(input: {
  message: string;
  pageUrl: string | null;
  contactEmail: string | null;
  userAgent: string | null;
  userId: string | null;
}): Promise<{ id: string }> {
  const { data, error } = await db
    .from("site_feedback")
    .insert({
      message: input.message,
      page_url: input.pageUrl,
      contact_email: input.contactEmail,
      user_agent: input.userAgent,
      user_id: input.userId,
    })
    .select("id")
    .single();

  if (error) throw new Error(`insertSiteFeedback: ${error.message}`);
  return { id: (data as { id: string }).id };
}

export async function listSiteFeedbackForAdmin(limit: number): Promise<SiteFeedbackRow[]> {
  const safeLimit = Math.min(500, Math.max(1, limit));
  const { data, error } = await db
    .from("site_feedback")
    .select("id, created_at, message, page_url, contact_email, user_agent, user_id, status")
    .order("created_at", { ascending: false })
    .limit(safeLimit);

  if (error) throw new Error(`listSiteFeedbackForAdmin: ${error.message}`);
  const rows = (data ?? []) as Array<{
    id: string;
    created_at: string;
    message: string;
    page_url: string | null;
    contact_email: string | null;
    user_agent: string | null;
    user_id: string | null;
    status: string;
  }>;

  return rows.map((r) => ({
    id: r.id,
    createdAt: r.created_at,
    message: r.message,
    pageUrl: r.page_url,
    contactEmail: r.contact_email,
    userAgent: r.user_agent,
    userId: r.user_id,
    status: r.status === "read" || r.status === "archived" ? r.status : "new",
  }));
}
