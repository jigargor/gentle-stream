import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/auth/admin";
import { AdminArticleModerationPanel } from "@/components/admin/AdminArticleModerationPanel";

export const dynamic = "force-dynamic";

export default async function AdminArticlesModerationPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/admin/articles");
  if (!isAdmin({ userId: user.id, email: user.email ?? null })) redirect("/");
  return <AdminArticleModerationPanel />;
}
