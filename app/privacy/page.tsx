import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy policy | Gentle Stream",
  description: "How Gentle Stream handles your data.",
};

/**
 * Public URL for OAuth consoles (Google, Meta, etc.): https://&lt;your-domain&gt;/privacy
 * Replace the placeholder copy with your own policy or host a doc elsewhere and redirect.
 */
export default function PrivacyPage() {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#ede9e1",
        padding: "2rem 1.25rem 3rem",
        fontFamily: "Georgia, serif",
        color: "#1a1a1a",
      }}
    >
      <div style={{ maxWidth: "40rem", margin: "0 auto" }}>
        <h1
          style={{
            fontFamily: "'Playfair Display', Georgia, serif",
            fontSize: "1.75rem",
            marginBottom: "0.5rem",
          }}
        >
          Privacy policy
        </h1>
        <p style={{ fontSize: "0.9rem", color: "#555", marginBottom: "1.5rem" }}>
          Last updated: replace this date when you publish real terms.
        </p>
        <div
          style={{
            fontSize: "0.95rem",
            lineHeight: 1.65,
            background: "#faf8f3",
            borderTop: "2px solid #1a1a1a",
            padding: "1.5rem 1.25rem",
            boxShadow: "0 0 24px rgba(0,0,0,0.06)",
          }}
        >
          <p style={{ marginTop: 0 }}>
            This is placeholder text. Replace it with your actual privacy policy, or link
            here from your marketing site. Cover: what you collect (e.g. account email via
            Supabase Auth), cookies, analytics, third parties, retention, and contact for
            privacy requests.
          </p>
          <p style={{ marginBottom: 0 }}>
            Authentication is provided by Supabase; see also{" "}
            <a
              href="https://supabase.com/privacy"
              style={{ color: "#5c4a32" }}
              target="_blank"
              rel="noopener noreferrer"
            >
              Supabase&apos;s privacy policy
            </a>
            .
          </p>
        </div>
        <p style={{ marginTop: "1.5rem", fontSize: "0.85rem" }}>
          <a href="/login" style={{ color: "#5c4a32" }}>
            ← Back to sign in
          </a>
        </p>
      </div>
    </div>
  );
}
