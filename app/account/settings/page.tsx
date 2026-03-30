import type { Metadata } from "next";
import Link from "next/link";
import { LegalDocumentShell } from "@/components/legal/LegalDocumentShell";

export const metadata: Metadata = {
  title: "Account settings | Gentle Stream",
  description: "Account preferences, privacy, and data choices.",
};

const legalLinks: { href: string; label: string; description: string }[] = [
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

export default function AccountSettingsPage() {
  return (
    <LegalDocumentShell
      title="Account settings"
      description="Update your profile, saved library, and feed preferences from the profile menu on the home page. Legal and data resources are linked below."
    >
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
