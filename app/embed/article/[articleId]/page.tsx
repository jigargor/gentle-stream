import Link from "next/link";
import { notFound } from "next/navigation";
import { getArticleById } from "@/lib/db/articles";

export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function excerptFromBody(text: string): string {
  const oneLine = text
    .replace(/\s+/g, " ")
    .trim();
  if (oneLine.length <= 360) return oneLine;
  return `${oneLine.slice(0, 360).trim()}...`;
}

export default async function EmbedArticlePage({
  params,
}: {
  params: Promise<{ articleId: string }>;
}) {
  const { articleId } = await params;
  if (!UUID_RE.test(articleId)) notFound();

  const article = await getArticleById(articleId);
  if (!article) notFound();

  const excerpt = excerptFromBody(article.body ?? "");

  return (
    <main
      style={{
        margin: 0,
        padding: "0.75rem",
        background: "#f8f6f0",
        color: "#1a1a1a",
        fontFamily: "Georgia, serif",
      }}
    >
      <article
        style={{
          maxWidth: "780px",
          margin: "0 auto",
          background: "#fff",
          border: "1px solid #ddd8cd",
          borderRadius: "8px",
          overflow: "hidden",
        }}
      >
        {"recipeImages" in article && (article.recipeImages?.[0] ?? "").trim() ? (
          <img
            src={article.recipeImages?.[0]}
            alt={article.headline}
            width={780}
            height={360}
            style={{
              width: "100%",
              aspectRatio: "13 / 6",
              objectFit: "cover",
              display: "block",
              borderBottom: "1px solid #ddd8cd",
            }}
          />
        ) : null}
        <div style={{ padding: "0.85rem 0.95rem" }}>
          <div
            style={{
              fontSize: "0.69rem",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "#666",
              marginBottom: "0.38rem",
            }}
          >
            {article.category}
          </div>
          <h1
            style={{
              fontFamily: "'Playfair Display', Georgia, serif",
              fontSize: "1.25rem",
              lineHeight: 1.2,
              margin: 0,
              color: "#111",
            }}
          >
            {article.headline}
          </h1>
          <p style={{ margin: "0.38rem 0 0", color: "#5a5a5a", fontSize: "0.78rem" }}>
            {article.byline}
            {article.location ? ` · ${article.location}` : ""}
          </p>
          {excerpt ? (
            <p style={{ margin: "0.7rem 0 0", color: "#2b2b2b", lineHeight: 1.45, fontSize: "0.9rem" }}>
              {excerpt}
            </p>
          ) : null}
          <div style={{ marginTop: "0.8rem" }}>
            <Link
              href={`/article/${article.id}`}
              style={{
                color: "#1a472a",
                fontSize: "0.82rem",
                textDecoration: "underline",
                textUnderlineOffset: "2px",
              }}
            >
              Read full article
            </Link>
          </div>
        </div>
      </article>
    </main>
  );
}

