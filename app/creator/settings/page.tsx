import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOrCreateUserProfile } from "@/lib/db/users";
import { CreatorSettingsConsole } from "@/components/creator/CreatorSettingsConsole";

export const dynamic = "force-dynamic";

export default async function CreatorSettingsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/creator/settings");
  if (!user.email_confirmed_at) redirect("/account/settings?reason=creator_email_verification_required");

  const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  const needsMfa =
    (aalData?.nextLevel ?? null) === "aal2" &&
    (aalData?.currentLevel ?? null) !== "aal2";
  if (needsMfa) redirect("/account/settings?reason=creator_mfa_required");

  const profile = await getOrCreateUserProfile(user.id);
  if (profile.userRole !== "creator") redirect("/creator/onboarding");
  return <CreatorSettingsConsole />;
}
