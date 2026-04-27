import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CreatorUsageConsole } from "@/components/creator/CreatorUsageConsole";

export const dynamic = "force-dynamic";

export default async function CreatorUsagePage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/creator/usage");
  if (!user.email_confirmed_at) redirect("/account/settings?reason=creator_email_verification_required");

  return <CreatorUsageConsole />;
}
