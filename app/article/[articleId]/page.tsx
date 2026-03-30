import Link from "next/link";
import { notFound } from "next/navigation";
import { SavedArticleReader } from "@/components/me/SavedArticleReader";
import { getArticleById } from "@/lib/db/articles";

export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function PublicCreatorArticlePage({
  params,
}: {
  params: Promise<{ articleId: string }>;
}) {
  const { articleId } = await params;
  if (!UUID_RE.test(articleId)) notFound();

  const article = await getArticleById(articleId);
  if (!article) notFound();

  return (
    <div style={{ minHeight: "100vh", background: "#faf8f3", padding: "1.5rem 1rem 3rem" }}>
      <div style={{ maxWidth: "880px", margin: "0 auto" }}>
        <nav style={{ marginBottom: "1.25rem" }}>
          <Link
            href="/"
            style={{
              fontFamily: "'IM Fell English', Georgia, serif",
              fontSize: "0.88rem",
              color: "#1a472a",
              textDecoration: "underline",
              textUnderlineOffset: "3px",
              marginRight: "1rem",
            }}
          >
            ← Home
          </Link>
          {article.authorUserId ? (
            <Link
              href={`/creator/${article.authorUserId}`}
              style={{
                fontFamily: "'IM Fell English', Georgia, serif",
                fontSize: "0.88rem",
                color: "#1a472a",
                textDecoration: "underline",
                textUnderlineOffset: "3px",
              }}
            >
              Author profile
            </Link>
          ) : null}
        </nav>
        <SavedArticleReader article={article} savedOriginalUrl={null} />
      </div>
    </div>
  );
}
