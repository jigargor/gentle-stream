import Link from "next/link";
import type { CSSProperties } from "react";
import type { StoredArticle } from "@/lib/types";
import {
  sourceLinkLabel,
  toClickableSourceUrl,
  uniqueSourceUrls,
} from "@/lib/source-links";

interface SavedArticleReaderProps {
  article: StoredArticle;
  /** URL stored when the user saved (external source), if any */
  savedOriginalUrl: string | null;
}

export function SavedArticleReader({
  article,
  savedOriginalUrl,
}: SavedArticleReaderProps) {
  const paragraphs = article.body?.split("\n\n").filter(Boolean) ?? [];
  const sourceUrls = uniqueSourceUrls(article.sourceUrls);

  const wrap: CSSProperties = {
    maxWidth: "42rem",
    margin: "0 auto",
    padding: "0 0 2rem",
  };

  return (
    <article style={wrap}>
      <header style={{ marginBottom: "1.5rem" }}>
        <h1
          style={{
            fontFamily: "'Playfair Display', Georgia, serif",
            fontSize: "clamp(1.45rem, 3.5vw, 2.1rem)",
            fontWeight: 700,
            lineHeight: 1.15,
            color: "#0d0d0d",
            margin: "0 0 0.65rem",
          }}
        >
          {article.headline}
        </h1>
        {article.subheadline?.trim() ? (
          <p
            style={{
              fontFamily: "'IM Fell English', Georgia, serif",
              fontStyle: "italic",
              fontSize: "1.05rem",
              color: "#444",
              margin: "0 0 0.75rem",
              lineHeight: 1.45,
            }}
          >
            {article.subheadline}
          </p>
        ) : null}
        <div
          style={{
            fontSize: "0.78rem",
            fontFamily: "Georgia, serif",
            color: "#666",
            letterSpacing: "0.04em",
          }}
        >
          <span style={{ fontWeight: 600, color: "#444" }}>{article.byline}</span>
          {article.location ? <span> · {article.location}</span> : null}
        </div>
      </header>

      <div
        style={{
          fontFamily: "'IM Fell English', Georgia, serif",
          fontSize: "1.02rem",
          lineHeight: 1.65,
          color: "#1a1a1a",
          textAlign: "justify",
        }}
      >
        {paragraphs.map((p, i) => (
          <p key={i} style={{ margin: "0 0 1rem" }}>
            {p}
          </p>
        ))}
      </div>

      {article.pullQuote?.trim() ? (
        <blockquote
          style={{
            margin: "1.75rem 0",
            padding: "0.75rem 0 0.75rem 1rem",
            borderLeft: "3px solid #1a472a",
            fontFamily: "'Playfair Display', Georgia, serif",
            fontSize: "1.15rem",
            fontStyle: "italic",
            color: "#333",
          }}
        >
          {article.pullQuote}
        </blockquote>
      ) : null}

      {(savedOriginalUrl || sourceUrls.length > 0) && (
        <footer
          style={{
            marginTop: "2rem",
            paddingTop: "1rem",
            borderTop: "1px solid #d4cfc4",
            fontFamily: "'IM Fell English', Georgia, serif",
            fontSize: "0.82rem",
            color: "#555",
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: "0.35rem", color: "#333" }}>
            Sources
          </div>
          <ul style={{ margin: 0, paddingLeft: "1.1rem", lineHeight: 1.6 }}>
            {savedOriginalUrl ? (
              <li>
                <a
                  href={savedOriginalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: "#1a472a" }}
                >
                  {(() => {
                    try {
                      return new URL(savedOriginalUrl).hostname;
                    } catch {
                      return "Original link";
                    }
                  })()}
                </a>
                <span style={{ color: "#999" }}> (saved link)</span>
              </li>
            ) : null}
            {sourceUrls.map((u, i) => {
              const href = toClickableSourceUrl(u);
              return (
                <li key={`${href}-${i}`}>
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: "#1a472a" }}
                  >
                    {sourceLinkLabel(u)}
                  </a>
                </li>
              );
            })}
          </ul>
        </footer>
      )}
    </article>
  );
}

export function MePageNavLinks() {
  return (
    <nav
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: "0.75rem 1.25rem",
        marginBottom: "1.25rem",
      }}
    >
      <Link
        href="/"
        style={{
          fontFamily: "'IM Fell English', Georgia, serif",
          fontSize: "0.88rem",
          color: "#1a472a",
          textDecoration: "underline",
          textUnderlineOffset: "3px",
        }}
      >
        ← Home
      </Link>
      <Link
        href="/me/saved"
        style={{
          fontFamily: "'IM Fell English', Georgia, serif",
          fontSize: "0.88rem",
          color: "#1a472a",
          textDecoration: "underline",
          textUnderlineOffset: "3px",
        }}
      >
        Saved library
      </Link>
    </nav>
  );
}
