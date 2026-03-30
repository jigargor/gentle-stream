import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOrCreateUserProfile } from "@/lib/db/users";
import { getCreatorProfile } from "@/lib/db/creator";
import { CreatorDashboard } from "@/components/creator/CreatorDashboard";

export const dynamic = "force-dynamic";

export default async function CreatorPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/creator");

  const userProfile = await getOrCreateUserProfile(user.id);
  if (userProfile.userRole !== "creator") {
    redirect("/creator/onboarding");
  }

  const creatorProfile = await getCreatorProfile(user.id);
  if (!creatorProfile?.onboardingCompletedAt) {
    redirect("/creator/onboarding");
  }

  return <CreatorDashboard publicProfileHref={`/creator/${user.id}`} />;
}
