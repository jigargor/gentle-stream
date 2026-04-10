import NewsFeed from "@/components/NewsFeed";
import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/auth/admin";

/** Session depends on cookies — do not statically prerender at build time. */
export const dynamic = "force-dynamic";
const GUEST_USER_ID = "anonymous";

export default async function Home() {
  if (process.env.AUTH_DISABLED === "1") {
    return (
      <NewsFeed
        userId={process.env.DEV_USER_ID ?? "dev-local"}
        userEmail={null}
      />
    );
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return <NewsFeed userId={GUEST_USER_ID} userEmail={null} />;

  return (
    <NewsFeed
      userId={user.id}
      userEmail={user.email}
      isAdmin={isAdmin({ userId: user.id, email: user.email ?? null })}
    />
  );
}
