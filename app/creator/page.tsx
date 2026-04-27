import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOrCreateUserProfile } from "@/lib/db/users";
import { getCreatorProfile } from "@/lib/db/creator";
import { CreatorDashboard } from "@/components/creator/CreatorDashboard";
import { getCreatorEditorBootstrap } from "@/lib/db/creatorBootstrap";

export const dynamic = "force-dynamic";

export default async function CreatorPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/creator");
  if (!user.email_confirmed_at) redirect("/account/settings?reason=creator_email_verification_required");

  const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  const requiresStepUp =
    (aalData?.nextLevel ?? null) === "aal2" &&
    (aalData?.currentLevel ?? null) !== "aal2";
  if (requiresStepUp) {
    redirect("/account/settings?reason=creator_mfa_required");
  }

  const userProfile = await getOrCreateUserProfile(user.id);
  if (userProfile.userRole !== "creator") {
    redirect("/creator/onboarding");
  }

  const creatorProfile = await getCreatorProfile(user.id);
  if (!creatorProfile?.onboardingCompletedAt) {
    redirect("/creator/onboarding");
  }

  const bootstrap = await getCreatorEditorBootstrap(user.id);

  return (
    <CreatorDashboard
      publicProfileHref={`/creator/${user.id}`}
      initialSubmissions={bootstrap.submissions}
      initialNextCursor={bootstrap.submissionsNextCursor}
      initialDraftSummaries={bootstrap.draftSummaries}
      initialDraftSummariesNextCursor={bootstrap.draftsNextCursor}
      initialAutocompleteEnabled={bootstrap.autocompleteEnabled}
      serverListBootstrap
    />
  );
}
