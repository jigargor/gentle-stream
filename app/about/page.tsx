import type { Metadata } from "next";
import { LegalDocumentShell } from "@/components/legal/LegalDocumentShell";

export const metadata: Metadata = {
  title: "About | Gentle Stream",
  description:
    "What Gentle Stream is, why it exists, and where to find the open-source project.",
};

export default function AboutPage() {
  return (
    <LegalDocumentShell
      title="About Gentle Stream"
      description="A calmer, more transparent social feed built as a passion project."
    >
      <section>
        <h2 style={{ marginTop: 0, fontSize: "1.15rem" }}>Project motivation</h2>
        <p>
          Gentle Stream is built around no-nonsense scrolling: less doom loops, less political
          outrage farming, less echo-chamber reinforcement, and less manipulative engagement
          pressure.
        </p>
        <p>
          The goal is a less predatory social platform with respect to dopamine systems. Instead
          of optimizing for addiction patterns, the product focuses on readable, calm discovery.
        </p>
      </section>

      <section>
        <h2 style={{ fontSize: "1.15rem" }}>How it works</h2>
        <p>
          The feed emphasizes transparent feedback engagement and user-controlled preferences so
          interactions are understandable rather than opaque.
        </p>
        <p>
          It is also a hands-on way to explore and apply new technologies in a production-like
          product setting.
        </p>
      </section>

      <section>
        <h2 style={{ fontSize: "1.15rem" }}>Open source</h2>
        <p style={{ marginBottom: 0 }}>
          GitHub:{" "}
          <a
            href="https://github.com/jigargor/gentle-stream"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "#5c4a32" }}
          >
            github.com/jigargor/gentle-stream
          </a>
        </p>
      </section>

      <section>
        <h2 style={{ fontSize: "1.15rem" }}>Founder bio</h2>
        <p style={{ marginBottom: 0 }}>
          Work in progress. A dedicated bio section will be added here.
        </p>
      </section>
    </LegalDocumentShell>
  );
}

