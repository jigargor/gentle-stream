import type { Metadata } from "next";
import { TermsAcceptGate } from "@/components/legal/TermsAcceptGate";

export const metadata: Metadata = {
  title: "Agree to Terms | Gentle Stream",
  description: "Scroll to the bottom of the Terms of service and agree to continue.",
};

export default function TermsAcceptPage({
  searchParams,
}: {
  searchParams?: { next?: string };
}) {
  const next = searchParams?.next ?? "/";
  return <TermsAcceptGate nextPath={next} />;
}

