import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCreatorProfile } from "@/lib/db/creator";
import {
  getCreatorArticleEngagementTotals,
  listCreatorPublishedArticles,
} from "@/lib/db/articles";
import { getUserProfileById } from "@/lib/db/users";

export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function CreatorPublicProfilePage({
  params,
}: {
  params: { userId: string };
}) {
  const { userId } = params;
  if (!UUID_RE.test(userId)) notFound();

  const creatorProfile = await getCreatorProfile(userId);
  if (!creatorProfile) notFound();

  const supabase = createClient();
  const [userPublic, articles, engagement] = await Promise.all([
    getUserProfileById(userId),
    listCreatorPublishedArticles(userId),
    getCreatorArticleEngagementTotals(userId),
  ]);

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const isOwnProfile = user?.id === userId;

  return (
    <div style={{ minHeight: "100vh", background: "#ede9e1", padding: "1rem 1rem 2.5rem" }}>
      <div style={{ maxWidth: "720px", margin: "0 auto" }}>
        <nav style={{ marginBottom: "1rem" }}>
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
            ← Home
          </Link>
        </nav>

        <div
          style={{
            background: "#faf8f3",
            border: "1px solid #d8d2c7",
            padding: "1.25rem",
            marginBottom: "1rem",
          }}
        >
          <div style={{ display: "flex", gap: "1rem", alignItems: "flex-start", flexWrap: "wrap" }}>
            {userPublic?.avatarUrl ? (
              <img
                src={userPublic.avatarUrl}
                alt=""
                width={72}
                height={72}
                style={{
                  borderRadius: "50%",
                  objectFit: "cover",
                  border: "1px solid #ccc",
                  flexShrink: 0,
                }}
              />
            ) : (
              <div
                style={{
                  width: 72,
                  height: 72,
                  borderRadius: "50%",
                  background: "linear-gradient(135deg, #4a6741, #2c3d28)",
                  color: "#faf8f3",
                  fontFamily: "'Playfair Display', Georgia, serif",
                  fontSize: "1.35rem",
                  fontWeight: 700,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
                aria-hidden
              >
                {creatorProfile.penName.slice(0, 2).toUpperCase()}
              </div>
            )}
            <div style={{ flex: "1 1 200px", minWidth: 0 }}>
              <h1
                style={{
                  margin: 0,
                  fontFamily: "'Playfair Display', Georgia, serif",
                  fontSize: "1.65rem",
                  color: "#0d0d0d",
                }}
              >
                {creatorProfile.penName}
              </h1>
              {userPublic?.username ? (
                <p
                  style={{
                    margin: "0.25rem 0 0",
                    fontFamily: "'IM Fell English', Georgia, serif",
                    fontSize: "0.9rem",
                    color: "#666",
                  }}
                >
                  @{userPublic.username}
                </p>
              ) : null}
              {creatorProfile.bio?.trim() ? (
                <p
                  style={{
                    margin: "0.65rem 0 0",
                    fontFamily: "'IM Fell English', Georgia, serif",
                    fontSize: "0.95rem",
                    lineHeight: 1.55,
                    color: "#333",
                  }}
                >
                  {creatorProfile.bio}
                </p>
              ) : null}
              {creatorProfile.websiteUrl?.trim() ? (
                <p style={{ margin: "0.5rem 0 0" }}>
                  <a
                    href={creatorProfile.websiteUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: "#1a472a", fontSize: "0.88rem" }}
                  >
                    Website
                  </a>
                </p>
              ) : null}
            </div>
          </div>

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "0.75rem 1.25rem",
              marginTop: "1rem",
              paddingTop: "1rem",
              borderTop: "1px solid #d8d2c7",
              fontFamily: "'IM Fell English', Georgia, serif",
              fontSize: "0.85rem",
              color: "#555",
            }}
          >
            <span>
              <strong>{articles.length}</strong> published
            </span>
            <span>
              <strong>{engagement.totalLikes}</strong> likes
            </span>
            <span>
              <strong>{engagement.totalSaves}</strong> saves
            </span>
          </div>

          {isOwnProfile ? (
            <div style={{ marginTop: "1rem" }}>
              <Link
                href="/creator"
                style={{
                  display: "inline-block",
                  padding: "0.4rem 0.75rem",
                  border: "1px solid #1a472a",
                  background: "#fff",
                  color: "#1a1a1a",
                  fontFamily: "'Playfair Display', Georgia, serif",
                  fontSize: "0.82rem",
                  textDecoration: "none",
                }}
              >
                Creator studio
              </Link>
            </div>
          ) : null}
        </div>

        <div
          style={{
            background: "#faf8f3",
            border: "1px solid #d8d2c7",
            padding: "1rem",
          }}
        >
          <h2
            style={{
              marginTop: 0,
              fontFamily: "'Playfair Display', Georgia, serif",
              fontSize: "1.1rem",
            }}
          >
            Stories
          </h2>
          {articles.length === 0 ? (
            <p style={{ color: "#666", fontFamily: "'IM Fell English', Georgia, serif" }}>
              No published stories yet.
            </p>
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: "0.65rem" }}>
              {articles.map((a) => (
                <li
                  key={a.id}
                  style={{
                    border: "1px solid #e5e0d6",
                    padding: "0.65rem",
                    background: "#fff",
                  }}
                >
                  <Link
                    href={`/article/${a.id}`}
                    style={{
                      fontFamily: "'Playfair Display', Georgia, serif",
                      fontWeight: 700,
                      fontSize: "1rem",
                      color: "#1a1a1a",
                      textDecoration: "underline",
                      textUnderlineOffset: "3px",
                    }}
                  >
                    {a.headline}
                  </Link>
                  <p style={{ margin: "0.35rem 0 0", fontSize: "0.78rem", color: "#777" }}>
                    {a.category} · {new Date(a.fetchedAt).toLocaleDateString()}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
