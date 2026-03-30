import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/auth/admin";
import { AdminSubmissionsPanel } from "@/components/admin/AdminSubmissionsPanel";

export const dynamic = "force-dynamic";

export default async function AdminSubmissionsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/admin/submissions");

  if (!isAdmin({ userId: user.id, email: user.email ?? null })) {
    redirect("/");
  }

  return <AdminSubmissionsPanel />;
}
