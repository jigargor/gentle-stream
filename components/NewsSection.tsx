"use client";

import ArticleCard from "./ArticleCard";
import type { Article } from "@/lib/types";

interface NewsSectionProps {
  articles: Article[];
  sectionIndex: number;
}

const borderStyles = {
  borderTop: "3px double #1a1a1a",
  borderBottom: "2px solid #1a1a1a",
};

export default function NewsSection({
  articles,
  sectionIndex,
}: NewsSectionProps) {
  if (!articles || articles.length === 0) return null;

  // Fewer than 3: still render so infinite scroll can show partial pages
  if (articles.length === 1) {
    return (
      <div
        className="news-grid"
        style={{
          display: "grid",
          gridTemplateColumns: "1fr",
          ...borderStyles,
        }}
      >
        <ArticleCard article={articles[0]} layout="hero" index={0} />
      </div>
    );
  }

  if (articles.length === 2) {
    return (
      <div
        className="news-grid"
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          ...borderStyles,
        }}
      >
        <ArticleCard article={articles[0]} layout="standard" index={0} />
        <ArticleCard article={articles[1]} layout="standard" index={1} />
      </div>
    );
  }

  const layout = sectionIndex % 3;

  // Layout 0: Hero left (1.6fr) + two stacked right columns
  if (layout === 0) {
    return (
      <div
        className="news-grid"
        style={{
          display: "grid",
          gridTemplateColumns: "1.6fr 1fr 1fr",
          ...borderStyles,
        }}
      >
        <ArticleCard article={articles[0]} layout="hero" index={0} />
        <ArticleCard article={articles[1]} layout="standard" index={1} />
        <ArticleCard article={articles[2]} layout="standard" index={2} />
      </div>
    );
  }

  // Layout 1: Three equal columns, middle slightly wider
  if (layout === 1) {
    return (
      <div
        className="news-grid"
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1.2fr 1fr",
          ...borderStyles,
        }}
      >
        <ArticleCard article={articles[0]} layout="standard" index={0} />
        <ArticleCard article={articles[1]} layout="wide" index={1} />
        <ArticleCard article={articles[2]} layout="standard" index={2} />
      </div>
    );
  }

  // Layout 2: Wide hero (2fr) + narrow right sidebar with two stories
  return (
    <div
      className="news-grid"
      style={{
        display: "grid",
        gridTemplateColumns: "2fr 1fr",
        ...borderStyles,
      }}
    >
      <ArticleCard article={articles[0]} layout="hero" index={0} />
      <div style={{ display: "flex", flexDirection: "column" }}>
        <ArticleCard article={articles[1]} layout="standard" index={1} />
        <div style={{ borderTop: "1px solid #d4cfc4" }} />
        <ArticleCard article={articles[2]} layout="standard" index={2} />
      </div>
    </div>
  );
}
