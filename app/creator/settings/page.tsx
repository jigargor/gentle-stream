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

  // Check MFA enrollment status — not to gate access, but to show a gentle prompt
  // in the settings page encouraging users to protect their API keys with MFA.
  const env = getEnv();
  let hasMfa = false;
  if (!env.AUTH_DISABLED) {
    const { data: factorData } = await supabase.auth.mfa.listFactors();
    if (factorData) {
      hasMfa = [...(factorData.totp ?? []), ...(factorData.phone ?? [])].some(
        (f) => f.status === "verified"
      );
    }
  }

  return <CreatorSettingsConsole hasMfa={hasMfa} />;
}
