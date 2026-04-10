import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/auth/admin";
import { listSiteFeedbackForAdmin } from "@/lib/db/siteFeedback";

export const dynamic = "force-dynamic";

export default async function AdminFeedbackPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/admin/feedback");
  if (!isAdmin({ userId: user.id, email: user.email ?? null })) redirect("/");

  const items = await listSiteFeedbackForAdmin(200);

  return (
    <div
      style={{
        maxWidth: "56rem",
        margin: "0 auto",
        padding: "1.5rem 1rem 3rem",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <p style={{ marginBottom: "0.75rem" }}>
        <Link href="/" style={{ color: "#1a472a", fontSize: "0.85rem" }}>
          ← Home
        </Link>
      </p>
      <h1
        style={{
          fontFamily: "'Playfair Display', Georgia, serif",
          fontSize: "1.5rem",
          marginBottom: "0.5rem",
          color: "#1a1a1a",
        }}
      >
        Site feedback
      </h1>
      <p style={{ fontSize: "0.85rem", color: "#555", marginBottom: "1.25rem" }}>
        Submissions from the in-app widget. Stored in <code>site_feedback</code>; optional{" "}
        <code>user_id</code> when the sender was signed in.
      </p>
      {items.length === 0 ? (
        <p style={{ color: "#666" }}>No feedback yet.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {items.map((row) => (
            <li
              key={row.id}
              style={{
                borderBottom: "1px solid #e0e8e0",
                padding: "1rem 0",
              }}
            >
              <div style={{ fontSize: "0.72rem", color: "#777", marginBottom: "0.35rem" }}>
                {new Date(row.createdAt).toISOString()}
                {row.status !== "new" ? ` · ${row.status}` : ""}
                {row.userId ? ` · user ${row.userId.slice(0, 8)}…` : " · anonymous"}
              </div>
              <p
                style={{
                  whiteSpace: "pre-wrap",
                  margin: "0 0 0.5rem",
                  fontSize: "0.9rem",
                  lineHeight: 1.45,
                }}
              >
                {row.message}
              </p>
              {row.contactEmail ? (
                <p style={{ fontSize: "0.8rem", margin: "0.25rem 0" }}>
                  <a href={`mailto:${row.contactEmail}`}>{row.contactEmail}</a>
                </p>
              ) : null}
              {row.pageUrl ? (
                <p style={{ fontSize: "0.75rem", margin: 0, wordBreak: "break-all" }}>
                  <a href={row.pageUrl} target="_blank" rel="noreferrer">
                    {row.pageUrl}
                  </a>
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
