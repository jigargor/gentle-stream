import type { Metadata } from "next";
import { LegalDocumentShell } from "@/components/legal/LegalDocumentShell";
import { LEGAL_LAST_UPDATED } from "@/lib/legal/legal-meta";

export const metadata: Metadata = {
  title: "User data deletion | Gentle Stream",
  description: "How to request deletion of your Gentle Stream account and data.",
};

/**
 * Public URL for Meta “User data deletion” / similar: https://&lt;your-domain&gt;/data-deletion
 * Set NEXT_PUBLIC_SUPPORT_EMAIL in env for a mailto link; edit copy to match your data practices.
 */
export default function DataDeletionPage() {
  const supportEmail = process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim();

  return (
    <LegalDocumentShell
      title="User data deletion"
      description="How to request deletion of data associated with your Gentle Stream account."
      lastUpdated={LEGAL_LAST_UPDATED}
    >
      <section>
        <h2 style={{ marginTop: 0, fontSize: "1.15rem" }}>How to request deletion</h2>
          <p style={{ marginTop: 0 }}>
            If you signed in to Gentle Stream (including with Google or other providers), you
            can request deletion of your account and associated data we store (for example:
            profile preferences, saved articles, and game progress tied to your user id).
          </p>
          <p>
            <strong>To request deletion:</strong>
          </p>
          <ol style={{ paddingLeft: "1.25rem", margin: "0 0 1rem" }}>
            <li style={{ marginBottom: "0.35rem" }}>
              Send an email from the address you use with your account so we can verify
              ownership.
            </li>
            <li style={{ marginBottom: "0.35rem" }}>
              Use the subject line:{" "}
              <strong style={{ fontFamily: "monospace", fontSize: "0.88em" }}>
                Data deletion request
              </strong>
              .
            </li>
            <li>We will confirm and process your request within a reasonable time (e.g. 30 days).</li>
          </ol>
          {supportEmail ? (
            <p style={{ marginBottom: 0 }}>
              Contact:{" "}
              <a href={`mailto:${supportEmail}?subject=Data%20deletion%20request`} style={{ color: "#5c4a32" }}>
                {supportEmail}
              </a>
            </p>
          ) : (
            <p style={{ marginBottom: 0, color: "#666" }}>
              Add <code style={{ fontSize: "0.85em" }}>NEXT_PUBLIC_SUPPORT_EMAIL</code> to your
              deployment environment so a contact link appears here. Until then, use the
              contact method you publish on your site or app store listing.
            </p>
          )}
      </section>

      <section>
        <h2 style={{ fontSize: "1.15rem" }}>Third-party sign-in</h2>
          <p style={{ marginTop: 0, marginBottom: "0.75rem" }}>
            <strong>Third-party sign-in (e.g. Google, Facebook)</strong>
          </p>
          <p style={{ marginBottom: 0 }}>
            Removing our copy of your data does not delete your Google or Meta account. You can
            manage those accounts in their respective settings. Authentication is processed by{" "}
            <a
              href="https://supabase.com/privacy"
              style={{ color: "#5c4a32" }}
              target="_blank"
              rel="noopener noreferrer"
            >
              Supabase
            </a>
            ; you may also review their policies for data they process as a processor.
          </p>
      </section>
    </LegalDocumentShell>
  );
}
