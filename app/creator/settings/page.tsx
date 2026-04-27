import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CreatorSettingsConsole } from "@/components/creator/CreatorSettingsConsole";
import { getEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

export default async function CreatorSettingsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/creator/settings");
  if (!user.email_confirmed_at) redirect("/account/settings?reason=creator_email_verification_required");

  const env = getEnv();
  if (!env.AUTH_DISABLED) {
    const { data: factorData, error: factorsError } = await supabase.auth.mfa.listFactors();
    if (!factorsError && factorData) {
      const factors = [...(factorData.totp ?? []), ...(factorData.phone ?? [])];
      const hasVerifiedMfa = factors.some((f) => f.status === "verified");
      if (!hasVerifiedMfa) {
        redirect("/account/settings?reason=creator_mfa_enrollment_required");
      }
    }

    const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    const needsMfa =
      (aalData?.nextLevel ?? null) === "aal2" &&
      (aalData?.currentLevel ?? null) !== "aal2";
    if (needsMfa) redirect("/account/settings?reason=creator_mfa_required");
  }

  return <CreatorSettingsConsole />;
}
