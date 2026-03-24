import { notFound, redirect } from "next/navigation";
import { SavedArticleReader, MePageNavLinks } from "@/components/me/SavedArticleReader";
import { getArticleById } from "@/lib/db/articles";
import {
  getSavedArticleOriginalUrl,
  userHasArticleSave,
} from "@/lib/db/articleSaves";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function ReadSavedArticlePage({
  params,
}: {
  params: { articleId: string };
}) {
  const { articleId } = params;
  if (!UUID_RE.test(articleId)) notFound();

  let userId: string;
  if (process.env.AUTH_DISABLED === "1") {
    userId = process.env.DEV_USER_ID ?? "dev-local";
  } else {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect("/login");
    userId = user.id;
  }

  const allowed = await userHasArticleSave(userId, articleId);
  if (!allowed) notFound();

  const [article, savedOriginalUrl] = await Promise.all([
    getArticleById(articleId),
    getSavedArticleOriginalUrl(userId, articleId),
  ]);

  if (!article) notFound();

  return (
    <div style={{ minHeight: "100vh", background: "#faf8f3", padding: "1.5rem 1rem 3rem" }}>
      <div style={{ maxWidth: "880px", margin: "0 auto" }}>
        <MePageNavLinks />
        <SavedArticleReader article={article} savedOriginalUrl={savedOriginalUrl} />
      </div>
    </div>
  );
}
