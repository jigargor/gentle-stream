"use client";

import type { CSSProperties } from "react";
import dynamic from "next/dynamic";
import ArticleCard from "./ArticleCard";
import type { Article, ArticleFeedSection } from "@/lib/types";
import { chooseNewspaperLayout } from "@/lib/feed/newspaperLayout";
import InlineModuleCard from "./feed/InlineModuleCard";

const ReadingRail = dynamic(() => import("./feed/ReadingRail"), {
  loading: () => (
    <aside
      style={{ minHeight: 72 }}
      aria-label="Alongside this story"
      aria-busy="true"
    />
  ),
  ssr: false,
});

type SectionLayoutPlan = NonNullable<ArticleFeedSection["newspaperLayout"]>;

interface NewsSectionProps {
  articles: Article[];
  sectionIndex: number;
  layoutPlan?: SectionLayoutPlan;
}

const borderStyles = {
  borderTop: "3px double var(--gs-ink-strong)",
  borderBottom: "2px solid var(--gs-ink-strong)",
  borderLeft: "1px solid var(--gs-border)",
  borderRight: "1px solid var(--gs-border)",
  borderRadius: "var(--gs-radius-sm)",
  overflow: "hidden",
  background: "var(--gs-surface)",
};

/** Hairline gutters between cells (background shows through as rules). */
const hairlineGrid: CSSProperties = {
  gap: "1px",
  background: "var(--gs-border)",
};

const columnShell: CSSProperties = {
  background: "var(--gs-surface)",
  minWidth: 0,
};

export default function NewsSection({
  articles,
  sectionIndex,
  layoutPlan,
}: NewsSectionProps) {
  if (!articles || articles.length === 0) return null;
  const computedPlan = chooseNewspaperLayout(articles, sectionIndex);
  const plan: SectionLayoutPlan = {
    ...computedPlan,
    ...(layoutPlan ?? {}),
    inlineModule: layoutPlan?.inlineModule ?? null,
  };
  const inlineModule = plan.inlineModule ?? null;

  // Fewer than 3: still render so infinite scroll can show partial pages
  if (plan.templateId === "single-hero") {
    const rail = plan.readingRail;
    const showRail =
      Boolean(rail?.enabled) &&
      Boolean(rail?.primary || rail?.secondary || (rail?.relatedHeadlines?.length ?? 0) > 0);
    return (
      <div
        className={`news-section-pro news-grid news-section--single-hero${showRail ? " news-section--with-rail" : ""}`}
        style={borderStyles}
      >
        <div style={{ minWidth: 0 }}>
          <ArticleCard article={articles[0]} layout={plan.layouts[0] ?? "hero"} index={0} sectionIndex={sectionIndex} />
        </div>
        {showRail && rail ? <ReadingRail rail={rail} /> : null}
      </div>
    );
  }

  if (plan.templateId === "two-columns") {
    return (
      <div className="news-section-pro" style={{ ...borderStyles, padding: 0 }}>
        <div
          className="news-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            ...hairlineGrid,
          }}
        >
          <div style={{ ...columnShell, display: "flex", flexDirection: "column" }}>
            <ArticleCard article={articles[0]} layout={plan.layouts[0] ?? "standard"} index={0} sectionIndex={sectionIndex} />
            {inlineModule && inlineModule.targetColumn === 0 ? (
              <InlineModuleCard moduleType={inlineModule.moduleType} data={inlineModule.data} />
            ) : null}
          </div>
          <div style={{ ...columnShell, display: "flex", flexDirection: "column" }}>
            <ArticleCard article={articles[1]} layout={plan.layouts[1] ?? "standard"} index={1} sectionIndex={sectionIndex} />
            {inlineModule && inlineModule.targetColumn === 1 ? (
              <InlineModuleCard moduleType={inlineModule.moduleType} data={inlineModule.data} />
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  if (plan.templateId === "hero-left") {
    return (
      <div className="news-section-pro" style={{ ...borderStyles, padding: 0 }}>
        <div
          className="news-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "1.6fr 1fr 1fr",
            ...hairlineGrid,
          }}
        >
          <div style={{ ...columnShell, display: "flex", flexDirection: "column" }}>
            <ArticleCard article={articles[0]} layout={plan.layouts[0] ?? "hero"} index={0} sectionIndex={sectionIndex} />
            {inlineModule && inlineModule.targetColumn === 0 ? (
              <InlineModuleCard moduleType={inlineModule.moduleType} data={inlineModule.data} />
            ) : null}
          </div>
          <div style={{ ...columnShell, display: "flex", flexDirection: "column" }}>
            <ArticleCard article={articles[1]} layout={plan.layouts[1] ?? "standard"} index={1} sectionIndex={sectionIndex} />
            {inlineModule && inlineModule.targetColumn === 1 ? (
              <InlineModuleCard moduleType={inlineModule.moduleType} data={inlineModule.data} />
            ) : null}
          </div>
          <div style={{ ...columnShell, display: "flex", flexDirection: "column" }}>
            <ArticleCard article={articles[2]} layout={plan.layouts[2] ?? "standard"} index={2} sectionIndex={sectionIndex} />
            {inlineModule && inlineModule.targetColumn === 2 ? (
              <InlineModuleCard moduleType={inlineModule.moduleType} data={inlineModule.data} />
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  if (plan.templateId === "middle-wide") {
    return (
      <div className="news-section-pro" style={{ ...borderStyles, padding: 0 }}>
        <div
          className="news-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1.2fr 1fr",
            ...hairlineGrid,
          }}
        >
          <div style={{ ...columnShell, display: "flex", flexDirection: "column" }}>
            <ArticleCard article={articles[0]} layout={plan.layouts[0] ?? "standard"} index={0} sectionIndex={sectionIndex} />
            {inlineModule && inlineModule.targetColumn === 0 ? (
              <InlineModuleCard moduleType={inlineModule.moduleType} data={inlineModule.data} />
            ) : null}
          </div>
          <div style={{ ...columnShell, display: "flex", flexDirection: "column" }}>
            <ArticleCard article={articles[1]} layout={plan.layouts[1] ?? "wide"} index={1} sectionIndex={sectionIndex} />
            {inlineModule && inlineModule.targetColumn === 1 ? (
              <InlineModuleCard moduleType={inlineModule.moduleType} data={inlineModule.data} />
            ) : null}
          </div>
          <div style={{ ...columnShell, display: "flex", flexDirection: "column" }}>
            <ArticleCard article={articles[2]} layout={plan.layouts[2] ?? "standard"} index={2} sectionIndex={sectionIndex} />
            {inlineModule && inlineModule.targetColumn === 2 ? (
              <InlineModuleCard moduleType={inlineModule.moduleType} data={inlineModule.data} />
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  // Hero + sidebar stack
  return (
    <div className="news-section-pro" style={{ ...borderStyles, padding: 0 }}>
      <div
        className="news-grid"
        style={{
          display: "grid",
          gridTemplateColumns: "2fr 1fr",
          ...hairlineGrid,
        }}
      >
        <div style={{ ...columnShell, display: "flex", flexDirection: "column" }}>
          <ArticleCard article={articles[0]} layout={plan.layouts[0] ?? "hero"} index={0} sectionIndex={sectionIndex} />
          {inlineModule && inlineModule.targetColumn === 0 ? (
            <InlineModuleCard moduleType={inlineModule.moduleType} data={inlineModule.data} />
          ) : null}
        </div>
        <div style={{ ...columnShell, display: "flex", flexDirection: "column" }}>
          <ArticleCard article={articles[1]} layout={plan.layouts[1] ?? "standard"} index={1} sectionIndex={sectionIndex} />
          <div style={{ height: "1px", background: "var(--gs-border)", flexShrink: 0 }} />
          <ArticleCard article={articles[2]} layout={plan.layouts[2] ?? "standard"} index={2} sectionIndex={sectionIndex} />
          {inlineModule && inlineModule.targetColumn === 1 ? (
            <InlineModuleCard moduleType={inlineModule.moduleType} data={inlineModule.data} />
          ) : null}
        </div>
      </div>
    </div>
  );
}
