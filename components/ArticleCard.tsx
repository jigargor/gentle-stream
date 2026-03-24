"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CATEGORY_COLORS } from "@/lib/constants";
import GameSlot from "./games/GameSlot";
import { embeddedGamePickFromSeed } from "@/lib/games/feedPick";
import type { Article, LayoutVariant } from "@/lib/types";
import {
  picsumFallbackUrl,
  pollinationsImageUrl,
} from "@/lib/article-image";
import {
  sourceLinkLabel,
  toClickableSourceUrl,
  uniqueSourceUrls,
} from "@/lib/source-links";

const HERO_IMG_W = 800;
const HERO_IMG_H = 450;

/** When the hero cell is taller than editorial content (grid stretch), offer Sudoku in the slack. */
const HERO_VERTICAL_GAP_PX = 280;

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

  const articleSeed =
    "id" in article && article.id ? article.id : article.headline;

  const articleRef = useRef<HTMLElement>(null);
  const contentWrapRef = useRef<HTMLDivElement>(null);
  const [showHeroGapGame, setShowHeroGapGame] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  /** Try AI image from prompt first, then deterministic stock photo, then text fallback */
  const [imageStage, setImageStage] = useState<
    "pollinations" | "picsum" | "broken"
  >("pollinations");

  useEffect(() => {
    setImageStage("pollinations");
  }, [article.imagePrompt, articleSeed]);

  useEffect(() => {
    if (!isHero) {
      setShowHeroGapGame(false);
      return;
    }

    const el = articleRef.current;
    const wrap = contentWrapRef.current;
    if (!el || !wrap) return;

    const mq = window.matchMedia("(max-width: 768px)");

    function measure() {
      const articleEl = articleRef.current;
      const wrapEl = contentWrapRef.current;
      if (!articleEl || !wrapEl) return;
      if (mq.matches) {
        setShowHeroGapGame(false);
        return;
      }
      const ar = articleEl.getBoundingClientRect();
      const wr = wrapEl.getBoundingClientRect();
      const usedFromTop = wr.bottom - ar.top;
      const slack = articleEl.clientHeight - usedFromTop;
      setShowHeroGapGame(slack >= HERO_VERTICAL_GAP_PX);
    }

    const ro = new ResizeObserver(measure);
    ro.observe(el);
    ro.observe(wrap);
    mq.addEventListener("change", measure);
    measure();

    return () => {
      ro.disconnect();
      mq.removeEventListener("change", measure);
    };
  }, [isHero, articleSeed]);

  const embeddedGame = useMemo(
    () => embeddedGamePickFromSeed(articleSeed),
    [articleSeed]
  );

  const heroImageSrc = useMemo(() => {
    if (!article.imagePrompt?.trim()) return null;
    if (imageStage === "broken") return null;
    if (imageStage === "picsum") {
      return picsumFallbackUrl(articleSeed, HERO_IMG_W, HERO_IMG_H);
    }
    return (
      pollinationsImageUrl(
        article.imagePrompt,
        HERO_IMG_W,
        HERO_IMG_H
      ) ?? picsumFallbackUrl(articleSeed, HERO_IMG_W, HERO_IMG_H)
    );
  }, [article.imagePrompt, articleSeed, imageStage]);

  const headlineSizePx = isHero
    ? "clamp(1.55rem, 2.8vw, 2.3rem)"
    : isWide
    ? "1.35rem"
    : "1.05rem";

  const sourceUrls = uniqueSourceUrls(article.sourceUrls);
  const primarySourceHref =
    sourceUrls[0] ? toClickableSourceUrl(sourceUrls[0]) : "";

  const canSave = "id" in article && Boolean(article.id);

  const saveArticle = useCallback(async () => {
    if (!canSave || !("id" in article) || !article.id) return;
    setSaveBusy(true);
    setSaveMsg(null);
    try {
      const primaryUrl = sourceUrls[0]
        ? toClickableSourceUrl(sourceUrls[0])
        : "";
      const res = await fetch("/api/user/article-saves", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          articleId: article.id,
          articleTitle: article.headline,
          articleUrl: primaryUrl || undefined,
          summary:
            article.subheadline?.trim() ||
            article.pullQuote?.trim() ||
            undefined,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setSaveMsg(typeof j.error === "string" ? j.error : "Could not save.");
        return;
      }
      setSaveMsg("Saved to your library.");
    } catch {
      setSaveMsg("Could not save.");
    } finally {
      setSaveBusy(false);
    }
  }, [article, canSave, sourceUrls]);

  const headlineStyle = {
    fontFamily: "'Playfair Display', Georgia, serif",
    fontSize: headlineSizePx,
    fontWeight: 700,
    lineHeight: 1.18,
    color: "#0d0d0d",
    margin: 0,
    letterSpacing: "-0.01em",
  } as const;

  const sourceLinkStyle = {
    color: accentColor,
    textDecoration: "underline",
    textDecorationColor: "rgba(0,0,0,0.25)",
    textUnderlineOffset: "0.12em",
  } as const;

  return (
    <article
      ref={articleRef}
      style={{
        borderRight: !isHero ? "1px solid #d4cfc4" : "none",
        padding: isHero ? "1.5rem 1.6rem 1.2rem" : "1rem 1.2rem 1rem",
        display: "flex",
        flexDirection: "column",
        gap: "0.45rem",
        animation: `fadeSlideIn 0.5s ease ${index * 0.08}s both`,
        background: "#faf8f3",
        minHeight: isHero ? "100%" : undefined,
        boxSizing: "border-box",
      }}
    >
      <div ref={contentWrapRef} style={{ display: "flex", flexDirection: "column", gap: "0.45rem" }}>
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

      {/* Headline — links to primary source when we have URLs from ingest */}
      <h2 style={headlineStyle}>
        {primarySourceHref ? (
          <a
            href={primarySourceHref}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              ...headlineStyle,
              color: "inherit",
              textDecoration: "none",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = accentColor;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "#0d0d0d";
            }}
          >
            {article.headline}
          </a>
        ) : (
          article.headline
        )}
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

      {canSave && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            flexWrap: "wrap",
          }}
        >
          <button
            type="button"
            disabled={saveBusy}
            onClick={() => void saveArticle()}
            style={{
              background: "transparent",
              border: "1px solid #bbb",
              color: "#555",
              fontFamily: "'Playfair Display', Georgia, serif",
              fontSize: "0.62rem",
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              padding: "0.25rem 0.55rem",
              cursor: saveBusy ? "wait" : "pointer",
            }}
          >
            {saveBusy ? "Saving…" : "Save story"}
          </button>
          {saveMsg && (
            <span
              style={{
                fontFamily: "'IM Fell English', Georgia, serif",
                fontStyle: "italic",
                fontSize: "0.68rem",
                color: saveMsg.startsWith("Saved") ? "#1a472a" : "#8b4513",
              }}
            >
              {saveMsg}
            </span>
          )}
        </div>
      )}

      {/* Hero image from imagePrompt (AI URL → stock photo fallback → caption only) */}
      {isHero && article.imagePrompt?.trim() && (
        <figure
          style={{
            margin: "0.4rem 0 0",
            position: "relative",
            width: "100%",
            height: "190px",
            overflow: "hidden",
            border: "1px solid #ccc",
            background: "linear-gradient(135deg, #e8e4da 0%, #d4cfc4 100%)",
          }}
        >
          {heroImageSrc ? (
            primarySourceHref ? (
              <a
                href={primarySourceHref}
                target="_blank"
                rel="noopener noreferrer"
                style={{ display: "block", width: "100%", height: "100%" }}
                aria-label={`Open source article: ${article.headline}`}
              >
                <img
                  src={heroImageSrc}
                  alt={article.imagePrompt}
                  width={HERO_IMG_W}
                  height={HERO_IMG_H}
                  loading="lazy"
                  decoding="async"
                  onError={() => {
                    setImageStage((s) =>
                      s === "pollinations" ? "picsum" : "broken"
                    );
                  }}
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    objectPosition: "center",
                    display: "block",
                  }}
                />
              </a>
            ) : (
              <img
                src={heroImageSrc}
                alt={article.imagePrompt}
                width={HERO_IMG_W}
                height={HERO_IMG_H}
                loading="lazy"
                decoding="async"
                onError={() => {
                  setImageStage((s) =>
                    s === "pollinations" ? "picsum" : "broken"
                  );
                }}
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  objectPosition: "center",
                  display: "block",
                }}
              />
            )
          ) : (
            <div
              style={{
                height: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
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
        </figure>
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

      {sourceUrls.length > 0 && (
        <footer
          style={{
            marginTop: "0.65rem",
            paddingTop: "0.55rem",
            borderTop: "1px solid #d4cfc4",
            fontFamily: "Georgia, serif",
            fontSize: isHero ? "0.72rem" : "0.66rem",
            color: "#666",
            lineHeight: 1.5,
          }}
        >
          <span style={{ fontWeight: 600, color: "#555", marginRight: "0.35rem" }}>
            {sourceUrls.length === 1 ? "Source" : "Sources"}
          </span>
          {sourceUrls.map((u, i) => (
            <Fragment key={`${u}-${i}`}>
              {i > 0 && <span style={{ color: "#bbb" }}> · </span>}
              <a
                href={toClickableSourceUrl(u)}
                target="_blank"
                rel="noopener noreferrer"
                style={sourceLinkStyle}
              >
                {sourceLinkLabel(u)}
              </a>
            </Fragment>
          ))}
        </footer>
      )}
      </div>

      {isHero && showHeroGapGame && (
        <div
          style={{
            marginTop: "auto",
            width: "100%",
            flexShrink: 0,
          }}
        >
          <p
            style={{
              fontFamily: "'IM Fell English', Georgia, serif",
              fontStyle: "italic",
              fontSize: "0.72rem",
              color: "#999",
              margin: "0 0 0.35rem",
              letterSpacing: "0.04em",
            }}
          >
            A puzzle for the space beside today&apos;s story
          </p>
          <GameSlot
            gameType={embeddedGame.gameType}
            difficulty={embeddedGame.difficulty}
            category={article.category}
            embedded
            persistCloud={false}
          />
        </div>
      )}
    </article>
  );
}
