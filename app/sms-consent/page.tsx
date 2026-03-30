import type { Metadata } from "next";
import { LegalDocumentShell } from "@/components/legal/LegalDocumentShell";
import { LEGAL_LAST_UPDATED } from "@/lib/legal/legal-meta";
import {
  SMS_CONSENT_BULLETS,
  SMS_CONSENT_SUMMARY,
  SMS_CONSENT_TITLE,
} from "@/lib/legal/sms-consent-copy";

export const metadata: Metadata = {
  title: "SMS consent | Gentle Stream",
  description: "How creators opt into phone verification SMS messages.",
};

export default function SmsConsentPage() {
  return (
    <LegalDocumentShell
      title={SMS_CONSENT_TITLE}
      description={SMS_CONSENT_SUMMARY}
      lastUpdated={LEGAL_LAST_UPDATED}
    >
      <p>
        This disclosure describes SMS usage for creator phone verification in Gentle Stream.
        It is provided to support compliance reviews and public policy references.
      </p>
      <ul style={{ marginBottom: 0 }}>
        {SMS_CONSENT_BULLETS.map((bullet) => (
          <li key={bullet}>{bullet}</li>
        ))}
      </ul>
    </LegalDocumentShell>
  );
}
