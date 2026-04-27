import type { Metadata } from "next";
import Link from "next/link";
import { LegalDocumentShell } from "@/components/legal/LegalDocumentShell";
import { MfaSettings } from "@/components/auth/mfa/MfaSettings";

export const metadata: Metadata = {
  title: "Account settings | Gentle Stream",
  description: "Account preferences, privacy, and data choices.",
};

const legalLinks: { href: string; label: string; description: string }[] = [
  {
    href: "/about",
    label: "About",
    description: "Project background, motivation, and open-source repository.",
  },
  {
    href: "/privacy",
    label: "Privacy policy",
    description: "How we collect, use, and protect your data.",
  },
  {
    href: "/terms",
    label: "Terms of service",
    description: "Rules for using Gentle Stream.",
  },
  {
    href: "/data-deletion",
    label: "Data deletion",
    description: "How to request deletion of your account and associated data.",
  },
  {
    href: "/sms-consent",
    label: "SMS consent",
    description: "Information about text messages and how to opt in or out.",
  },
];

function accountSettingsBannerCopy(reason: string | undefined): string | null {
  switch (reason) {
    case "creator_mfa_enrollment_required":
      return "Set up multi-factor authentication (MFA) below before saving provider API keys or other sensitive Creator settings. After MFA is active, return to Creator settings.";
    case "creator_mfa_required":
      return "Verify with your MFA factor (step-up) using the options below, then open Creator Studio or Creator settings again.";
    case "creator_email_verification_required":
      return "Confirm your email address before using Creator Studio. Check your inbox or resend verification from your auth provider.";
    default:
      return null;
  }
}

export default async function AccountSettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolved = await searchParams;
  const reasonRaw = resolved.reason;
  const reason = typeof reasonRaw === "string" ? reasonRaw : undefined;
  const banner = accountSettingsBannerCopy(reason);

  return (
    <LegalDocumentShell
      title="Account settings"
      description="Update your profile, saved library, and feed preferences from the profile menu on the home page. Legal and data resources are linked below."
    >
      <div style={{ marginTop: "-0.2rem", marginBottom: "0.85rem" }}>
        <Link
          href="/"
          style={{
            display: "inline-flex",
            alignItems: "center",
            border: "1px solid #d8d2c7",
            background: "#fff",
            color: "#1a1a1a",
            textDecoration: "none",
            fontFamily: "'Playfair Display', Georgia, serif",
            fontSize: "0.82rem",
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            padding: "0.35rem 0.55rem",
          }}
        >
          Back
        </Link>
      </div>

      {banner ? (
        <aside
          role="status"
          style={{
            border: "1px solid #c4a574",
            background: "#fdf8ee",
            color: "#4a3720",
            padding: "0.75rem 0.85rem",
            marginBottom: "1rem",
            lineHeight: 1.55,
            fontSize: "0.9rem",
          }}
        >
          {banner}
        </aside>
      ) : null}

      <MfaSettings />

      <section style={{ marginTop: 0 }}>
        <h2 style={{ marginTop: 0, fontSize: "1.15rem" }}>Legal and data</h2>
        <ul
          style={{
            margin: "0.75rem 0 0",
            paddingLeft: "1.15rem",
            display: "flex",
            flexDirection: "column",
            gap: "0.85rem",
          }}
        >
          {legalLinks.map((item) => (
            <li key={item.href} style={{ lineHeight: 1.5 }}>
              <Link
                href={item.href}
                style={{
                  fontFamily: "'Playfair Display', Georgia, serif",
                  fontWeight: 700,
                  color: "#1a472a",
                  textDecoration: "underline",
                  textUnderlineOffset: "3px",
                }}
              >
                {item.label}
              </Link>
              <span style={{ display: "block", fontSize: "0.88rem", color: "#555", marginTop: "0.2rem" }}>
                {item.description}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </LegalDocumentShell>
  );
}
