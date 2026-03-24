import Link from "next/link";
import { redirect } from "next/navigation";
import { listArticleSavesForUser } from "@/lib/db/articleSaves";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function readPath(articleId: string): string {
  return `/me/read/${articleId}`;
}

export default async function SavedLibraryPage() {
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

  let saves: Awaited<ReturnType<typeof listArticleSavesForUser>> = [];
  try {
    saves = await listArticleSavesForUser(userId);
  } catch {
    saves = [];
  }

  return (
    <div style={{ minHeight: "100vh", background: "#ede9e1", padding: "1.5rem 1rem 3rem" }}>
      <div style={{ maxWidth: "640px", margin: "0 auto" }}>
        <nav style={{ marginBottom: "1.25rem" }}>
          <Link
            href="/"
            style={{
              fontFamily: "'IM Fell English', Georgia, serif",
              fontSize: "0.88rem",
              color: "#1a472a",
              textDecoration: "underline",
              textUnderlineOffset: "3px",
            }}
          >
            ← Back to feed
          </Link>
        </nav>
        <header style={{ marginBottom: "1.5rem" }}>
          <h1
            style={{
              fontFamily: "'Playfair Display', Georgia, serif",
              fontSize: "clamp(1.4rem, 3vw, 1.85rem)",
              fontWeight: 700,
              color: "#1a1a1a",
              margin: 0,
            }}
          >
            Saved articles
          </h1>
          <p
            style={{
              fontFamily: "'IM Fell English', Georgia, serif",
              fontStyle: "italic",
              color: "#666",
              fontSize: "0.9rem",
              margin: "0.4rem 0 0",
            }}
          >
            Open a title to read the full story in Gentle Stream.
          </p>
        </header>

        {saves.length === 0 ? (
          <p
            style={{
              fontFamily: "'IM Fell English', Georgia, serif",
              color: "#999",
              fontSize: "0.95rem",
            }}
          >
            Nothing saved yet — use the bookmark on an article card.
          </p>
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {saves.map((s) => (
              <li
                key={s.id}
                style={{
                  borderBottom: "1px solid #d4cfc4",
                  padding: "0.65rem 0",
                }}
              >
                <Link
                  href={readPath(s.articleId)}
                  style={{
                    fontFamily: "'Playfair Display', Georgia, serif",
                    fontSize: "1rem",
                    fontWeight: 600,
                    color: "#1a472a",
                    textDecoration: "none",
                    lineHeight: 1.35,
                  }}
                >
                  {s.articleTitle}
                </Link>
                {s.summary?.trim() ? (
                  <p
                    style={{
                      fontFamily: "'IM Fell English', Georgia, serif",
                      fontSize: "0.78rem",
                      color: "#777",
                      margin: "0.35rem 0 0",
                      lineHeight: 1.4,
                    }}
                  >
                    {s.summary.trim()}
                  </p>
                ) : null}
                <div
                  style={{
                    marginTop: "0.35rem",
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "0.5rem",
                    alignItems: "center",
                  }}
                >
                  {s.articleUrl ? (
                    <a
                      href={s.articleUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        fontFamily: "'IM Fell English', Georgia, serif",
                        fontSize: "0.72rem",
                        color: "#888",
                        textDecoration: "underline",
                      }}
                    >
                      Original link
                    </a>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
