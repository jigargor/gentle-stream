"use client";

import { CATEGORY_COLORS } from "@/lib/constants";
import type { Article, LayoutVariant } from "@/lib/types";

interface ArticleCardProps {
  article: Article;
  layout?: LayoutVariant;
  index?: number;
}

export default function ArticleCard({
  article,
  layout = "standard",
  index = 0,
}: ArticleCardProps) {
  const accentColor =
    CATEGORY_COLORS[article.category as keyof typeof CATEGORY_COLORS] ||
    "#1a1a1a";
  const paragraphs = article.body?.split("\n\n").filter(Boolean) || [];

  const isHero = layout === "hero";
  const isWide = layout === "wide";

  const headlineSizePx = isHero
    ? "clamp(1.55rem, 2.8vw, 2.3rem)"
    : isWide
    ? "1.35rem"
    : "1.05rem";

  return (
    <article
      style={{
        borderRight: !isHero ? "1px solid #d4cfc4" : "none",
        padding: isHero ? "1.5rem 1.6rem 1.2rem" : "1rem 1.2rem 1rem",
        display: "flex",
        flexDirection: "column",
        gap: "0.45rem",
        animation: `fadeSlideIn 0.5s ease ${index * 0.08}s both`,
        background: "#faf8f3",
      }}
    >
      {/* Category tag */}
      <div
        style={{
          display: "inline-block",
          background: accentColor,
          color: "#fff",
          fontSize: "0.6rem",
          fontFamily: "'Playfair Display', Georgia, serif",
          letterSpacing: "0.13em",
          textTransform: "uppercase",
          padding: "0.18rem 0.5rem",
          marginBottom: "0.2rem",
          fontWeight: 700,
          alignSelf: "flex-start",
        }}
      >
        {article.category}
      </div>

      {/* Headline */}
      <h2
        style={{
          fontFamily: "'Playfair Display', Georgia, serif",
          fontSize: headlineSizePx,
          fontWeight: 700,
          lineHeight: 1.18,
          color: "#0d0d0d",
          margin: 0,
          letterSpacing: "-0.01em",
        }}
      >
        {article.headline}
      </h2>

      {/* Subheadline / deck */}
      {article.subheadline && (
        <p
          style={{
            fontFamily: "'IM Fell English', Georgia, serif",
            fontStyle: "italic",
            fontSize: isHero ? "1.0rem" : "0.86rem",
            color: "#444",
            margin: 0,
            lineHeight: 1.42,
            borderBottom: "1px solid #d4cfc4",
            paddingBottom: "0.45rem",
          }}
        >
          {article.subheadline}
        </p>
      )}

      {/* Byline + location */}
      <div
        style={{
          display: "flex",
          gap: "0.7rem",
          fontSize: "0.64rem",
          fontFamily: "Georgia, serif",
          color: "#888",
          letterSpacing: "0.04em",
        }}
      >
        <span style={{ fontWeight: 600, color: "#555" }}>{article.byline}</span>
        {article.location && <span>&middot; {article.location}</span>}
      </div>

      {/* Image placeholder (hero only) */}
      {isHero && article.imagePrompt && (
        <div
          style={{
            background: "linear-gradient(135deg, #e8e4da 0%, #d4cfc4 100%)",
            height: "190px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0.4rem 0",
            border: "1px solid #ccc",
            fontFamily: "Georgia, serif",
            color: "#999",
            fontSize: "0.73rem",
            fontStyle: "italic",
            textAlign: "center",
            padding: "1rem",
          }}
        >
          <span>[ {article.imagePrompt} ]</span>
        </div>
      )}

      {/* Body copy */}
      <div
        style={{
          columns: isHero ? 2 : 1,
          columnGap: "1.5rem",
          columnRule: "1px solid #d4cfc4",
        }}
      >
        {paragraphs.map((para, i) => (
          <div key={i}>
            {/* Pull quote between paragraphs 1 and 2 */}
            {article.pullQuote && i === 1 && (
              <blockquote
                style={{
                  fontFamily: "'Playfair Display', Georgia, serif",
                  fontStyle: "italic",
                  fontSize: "1.02rem",
                  fontWeight: 600,
                  color: accentColor,
                  borderTop: `2px solid ${accentColor}`,
                  borderBottom: `2px solid ${accentColor}`,
                  padding: "0.55rem 0.5rem",
                  margin: "0.6rem 0",
                  lineHeight: 1.42,
                  breakInside: "avoid",
                  columnSpan: isHero ? "all" : "none",
                }}
              >
                &ldquo;{article.pullQuote}&rdquo;
              </blockquote>
            )}
            <p
              className="newspaper-body"
              style={{
                fontFamily: "Georgia, 'Times New Roman', serif",
                fontSize: isHero ? "0.91rem" : "0.84rem",
                lineHeight: 1.66,
                color: "#222",
                margin: "0 0 0.55rem 0",
              }}
            >
              {/* Drop cap on first letter of first paragraph */}
              {i === 0 && (
                <span
                  style={{
                    float: "left",
                    fontSize: "3.3em",
                    lineHeight: 0.78,
                    fontFamily: "'Playfair Display', Georgia, serif",
                    fontWeight: 700,
                    marginRight: "0.08em",
                    marginTop: "0.08em",
                    color: accentColor,
                  }}
                >
                  {para[0]}
                </span>
              )}
              {i === 0 ? para.slice(1) : para}
            </p>
          </div>
        ))}
      </div>
    </article>
  );
}
