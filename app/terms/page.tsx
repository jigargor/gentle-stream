import type { Metadata } from "next";
import { LegalDocumentShell } from "@/components/legal/LegalDocumentShell";
import { TermsOfServiceContent } from "@/components/legal/TermsOfServiceContent";
import { LEGAL_LAST_UPDATED } from "@/lib/legal/legal-meta";

export const metadata: Metadata = {
  title: "Terms of service | Gentle Stream",
  description: "Terms that govern use of Gentle Stream for readers and creators.",
};

export default function TermsPage() {
  return (
    <LegalDocumentShell
      title="Terms of service"
      description="These terms govern use of Gentle Stream by readers and creators."
      lastUpdated={LEGAL_LAST_UPDATED}
    >
      <TermsOfServiceContent />
    </LegalDocumentShell>
  );
}
