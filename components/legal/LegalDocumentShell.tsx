import type { ReactNode } from "react";
import { BackButton } from "@/components/legal/BackButton";

const appLinks = [
  { href: "/about", label: "About" },
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
  { href: "/data-deletion", label: "Data deletion" },
  { href: "/login", label: "Sign in" },
];

export interface LegalDocumentShellProps {
  title: string;
  description: string;
  lastUpdated?: string;
  children: ReactNode;
}

export function LegalDocumentShell({
  title,
  description,
  lastUpdated,
  children,
}: LegalDocumentShellProps) {
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
      <div style={{ maxWidth: "42rem", margin: "0 auto" }}>
        <div style={{ marginBottom: "0.85rem" }}>
          <BackButton />
        </div>
        <h1
          style={{
            fontFamily: "'Playfair Display', Georgia, serif",
            fontSize: "1.75rem",
            marginBottom: "0.45rem",
          }}
        >
          {title}
        </h1>
        <p style={{ margin: 0, fontSize: "0.9rem", color: "#555" }}>{description}</p>
        {lastUpdated ? (
          <p style={{ margin: "0.55rem 0 1.5rem", fontSize: "0.82rem", color: "#777" }}>
            Last updated: {lastUpdated}
          </p>
        ) : (
          <div style={{ marginBottom: "1.5rem" }} />
        )}
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
          {children}
        </div>
        <p style={{ marginTop: "1.35rem", fontSize: "0.85rem" }}>
          {appLinks.map((link, index) => (
            <span key={link.href}>
              {index > 0 ? " · " : ""}
              <a href={link.href} style={{ color: "#5c4a32" }}>
                {link.label}
              </a>
            </span>
          ))}
        </p>
      </div>
    </div>
  );
}
