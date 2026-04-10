import type { Metadata } from "next";
import { LegalDocumentShell } from "@/components/legal/LegalDocumentShell";

export const metadata: Metadata = {
  title: "About | Gentle Stream",
  description:
    "A gentler way to scroll: uplifting news, brainteaser games, music and recipe discovery, built with mindful media use in mind.",
};

export default function AboutPage() {
  return (
    <LegalDocumentShell
      title="About Gentle Stream"
      description="A calmer feed for uplifting stories, mindful breaks, and intentional media consumption."
    >
      <section>
        <h2 style={{ marginTop: 0, fontSize: "1.15rem" }}>A gentler way to scroll</h2>
        <p>
          Gentle Stream is designed to feel calmer than traditional feeds. The goal is simple:
          scroll without being pulled into outrage loops, and spend time on content that leaves
          you better than when you started.
        </p>
        <p>
          Instead of optimizing for compulsive engagement, the product focuses on readable
          uplifting news and meaningful breaks.
        </p>
      </section>

      <section>
        <h2 style={{ fontSize: "1.15rem" }}>What you will find here</h2>
        <p>
          The core feed surfaces uplifting stories intended to be informative and emotionally
          constructive.
        </p>
        <p>
          Between articles, Gentle Stream includes brainteaser games, music discovery, and recipe
          ideas so your scroll can include moments of rest, curiosity, and creativity.
        </p>
      </section>

      <section>
        <h2 style={{ fontSize: "1.15rem" }}>Why I built it</h2>
        <p>
          This project is an opportunity for me, Jigar Gor, to sharpen my engineering skills while
          building something I am personally passionate about: mindful use of time, healthier media
          consumption, and steady spiritual growth.
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
          Jigar Gor is the builder behind Gentle Stream, focused on creating software that supports
          calm attention, meaningful habits, and intentional digital life.
        </p>
      </section>
    </LegalDocumentShell>
  );
}

