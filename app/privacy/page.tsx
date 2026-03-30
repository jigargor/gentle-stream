import type { Metadata } from "next";
import { LegalDocumentShell } from "@/components/legal/LegalDocumentShell";
import { LEGAL_LAST_UPDATED } from "@/lib/legal/legal-meta";

export const metadata: Metadata = {
  title: "Privacy policy | Gentle Stream",
  description: "How Gentle Stream handles your data.",
};

/**
 * Public URL for OAuth consoles (Google, Meta, etc.): https://&lt;your-domain&gt;/privacy
 * Replace the placeholder copy with your own policy or host a doc elsewhere and redirect.
 */
export default function PrivacyPage() {
  const supportEmail = process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim();

  return (
    <LegalDocumentShell
      title="Privacy policy"
      description="How Gentle Stream collects, uses, and safeguards account and usage data."
      lastUpdated={LEGAL_LAST_UPDATED}
    >
      <section>
        <h2 style={{ marginTop: 0, fontSize: "1.15rem" }}>Data we collect</h2>
        <p>
          Gentle Stream collects information you provide directly, including your account
          email, display information, and creator profile details. We also store product
          activity such as article engagement, saved content, and game progress tied to your
          authenticated account.
        </p>
      </section>

      <section>
        <h2 style={{ fontSize: "1.15rem" }}>How we use data</h2>
        <p>
          We use data to authenticate your account, personalize your feed, maintain account
          security, improve recommendation quality, and operate creator workflows such as
          profile onboarding and submission review.
        </p>
      </section>

      <section>
        <h2 style={{ fontSize: "1.15rem" }}>Cookies and session data</h2>
        <p>
          We use essential cookies and local session storage for login state, security, and
          anti-abuse controls. These cookies are required to sign in and use account-only
          features.
        </p>
      </section>

      <section>
        <h2 style={{ fontSize: "1.15rem" }}>Service providers and third parties</h2>
        <p>
          Authentication and database infrastructure are provided by{" "}
          <a
            href="https://supabase.com/privacy"
            style={{ color: "#5c4a32" }}
            target="_blank"
            rel="noopener noreferrer"
          >
            Supabase
          </a>
          . If you use social login, your provider (such as Google or Facebook) also
          processes sign-in data under its own privacy terms.
        </p>
      </section>

      <section>
        <h2 style={{ fontSize: "1.15rem" }}>Retention and deletion</h2>
        <p>
          We retain account and usage data for as long as needed to provide the service, meet
          legal obligations, and protect platform integrity. You can request account deletion
          at any time through the{" "}
          <a href="/data-deletion" style={{ color: "#5c4a32" }}>
            data deletion page
          </a>
          .
        </p>
      </section>

      <section>
        <h2 style={{ fontSize: "1.15rem" }}>Contact</h2>
        {supportEmail ? (
          <p style={{ marginBottom: 0 }}>
            For privacy requests, contact{" "}
            <a href={`mailto:${supportEmail}`} style={{ color: "#5c4a32" }}>
              {supportEmail}
            </a>
            .
          </p>
        ) : (
          <p style={{ marginBottom: 0 }}>
            Set <code>NEXT_PUBLIC_SUPPORT_EMAIL</code> in your environment so this page
            includes a direct privacy contact email.
          </p>
        )}
      </section>
    </LegalDocumentShell>
  );
}
