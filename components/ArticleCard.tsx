"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { CSSProperties } from "react";
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
import { CreatorBylineLink } from "@/components/articles/CreatorBylineLink";
import { trackArticleEngagement } from "@/lib/engagement/client";
import { ArticleBodyMarkdown } from "@/components/articles/ArticleBodyMarkdown";

const HERO_IMG_W = 800;
const HERO_IMG_H = 450;

/** When the hero cell is taller than editorial content (grid stretch), offer Sudoku in the slack. */
const HERO_VERTICAL_GAP_PX = 280;
let userApiAllowed = true;

function BookmarkOutlineIcon() {
  return (
    <svg
      width={15}
      height={18}
      viewBox="0 0 15 18"
      aria-hidden
      style={{ flexShrink: 0 }}
    >
      <path
        d="M2.25 1.25h10.5v14.15L7.5 11.35 2.25 15.4V1.25z"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.2}
        strokeLinejoin="miter"
      />
    </svg>
  );
}

function BookmarkFilledIcon() {
  return (
    <svg
      width={15}
      height={18}
      viewBox="0 0 15 18"
      aria-hidden
      style={{ flexShrink: 0 }}
    >
      <path
        d="M2.25 1.25h10.5v14.15L7.5 11.35 2.25 15.4V1.25z"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth={0.85}
        strokeLinejoin="miter"
      />
    </svg>
  );
}

function HeartOutlineIcon() {
  return (
    <svg
      width={18}
      height={18}
      viewBox="0 0 24 24"
      aria-hidden
      style={{ flexShrink: 0 }}
    >
      <path
        d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.2}
        strokeLinejoin="round"
      />
    </svg>
  );
}

function HeartFilledIcon() {
  return (
    <svg
      width={18}
      height={18}
      viewBox="0 0 24 24"
      aria-hidden
      style={{ flexShrink: 0 }}
    >
      <path
        d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth={1}
        strokeLinejoin="round"
      />
    </svg>
  );
}

const iconActionStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minWidth: "2.35rem",
  minHeight: "2.35rem",
  padding: "0.25rem",
  background: "transparent",
  border: "none",
  color: "#1a1a1a",
  cursor: "pointer",
  borderRadius: "4px",
};

interface ArticleCardProps {
  article: Article;
  layout?: LayoutVariant;
  index?: number;
  sectionIndex?: number;
}

export default function ArticleCard({
  article,
  layout = "standard",
  index = 0,
  sectionIndex = 0,
}: ArticleCardProps) {
  const accentColor =
    CATEGORY_COLORS[article.category as keyof typeof CATEGORY_COLORS] ||
    "#1a1a1a";

  const isHero = layout === "hero";
  const isWide = layout === "wide";

  const articleSeed =
    "id" in article && article.id ? article.id : article.headline;

  const articleRef = useRef<HTMLElement>(null);
  const contentWrapRef = useRef<HTMLDivElement>(null);
  const [showHeroGapGame, setShowHeroGapGame] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saveRowId, setSaveRowId] = useState<string | null>(null);
  const [saveStatusLoaded, setSaveStatusLoaded] = useState(false);
  const [liked, setLiked] = useState(false);
  const [likeBusy, setLikeBusy] = useState(false);
  /** 401 → hide like (not signed in). */
  const [showLikeButton, setShowLikeButton] = useState(false);
  const [likeStatusLoaded, setLikeStatusLoaded] = useState(false);
  const impressionLoggedRef = useRef(false);
  const openLoggedRef = useRef(false);
  const read30LoggedRef = useRef(false);
  const read75LoggedRef = useRef(false);
  const visibleSinceRef = useRef<number | null>(null);
  const visibleAccumMsRef = useRef(0);

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
  const articleId = "id" in article && article.id ? article.id : null;
  const engagementContext = useMemo(
    () => ({
      source: "feed" as const,
      sectionIndex,
      cardIndex: index,
      locale: "locale" in article ? article.locale : null,
    }),
    [article, index, sectionIndex]
  );

  const emitEngagement = useCallback(
    (eventType: "impression" | "open" | "read_30s" | "read_75pct", eventValue?: number) => {
      if (!userApiAllowed) return;
      if (!articleId) return;
      trackArticleEngagement({
        articleId,
        eventType,
        eventValue: eventValue ?? null,
        context: engagementContext,
      });
    },
    [articleId, engagementContext]
  );

  const markOpen = useCallback(() => {
    if (openLoggedRef.current) return;
    openLoggedRef.current = true;
    emitEngagement("open");
  }, [emitEngagement]);

  useEffect(() => {
    impressionLoggedRef.current = false;
    openLoggedRef.current = false;
    read30LoggedRef.current = false;
    read75LoggedRef.current = false;
    visibleSinceRef.current = null;
    visibleAccumMsRef.current = 0;
  }, [articleId]);

  useEffect(() => {
    if (!userApiAllowed) {
      setShowLikeButton(false);
      setLikeStatusLoaded(true);
      setLiked(false);
      return;
    }
    if (!articleId) {
      setShowLikeButton(false);
      setLikeStatusLoaded(false);
      setLiked(false);
      return;
    }
    let cancelled = false;
    setLikeStatusLoaded(false);
    (async () => {
      try {
        const res = await fetch(
          `/api/user/article-likes?articleId=${encodeURIComponent(articleId)}`,
          { credentials: "include" }
        );
        if (cancelled) return;
        if (res.status === 401) {
          userApiAllowed = false;
          setShowLikeButton(false);
          setLikeStatusLoaded(true);
          setLiked(false);
          return;
        }
        setShowLikeButton(true);
        if (res.ok) {
          const j = (await res.json()) as { liked?: boolean };
          setLiked(Boolean(j.liked));
        } else {
          setLiked(false);
        }
      } catch {
        if (!cancelled) {
          setShowLikeButton(true);
          setLiked(false);
        }
      } finally {
        if (!cancelled) setLikeStatusLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [articleId]);

  useEffect(() => {
    if (!articleId) return;
    const el = articleRef.current;
    if (!el) return;

    function updateReadProgress() {
      if (read75LoggedRef.current) return;
      const node = articleRef.current;
      if (!node) return;
      const rect = node.getBoundingClientRect();
      const vh = window.innerHeight;
      if (rect.bottom <= 0 || rect.top >= vh) return;

      const viewedBottom = vh - rect.top;
      const ratio = Math.max(0, Math.min(1, viewedBottom / Math.max(rect.height, 1)));
      if (ratio >= 0.75) {
        read75LoggedRef.current = true;
        emitEngagement("read_75pct", ratio);
      }
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        const isVisible = entry.isIntersecting && entry.intersectionRatio >= 0.5;
        if (isVisible) {
          if (!impressionLoggedRef.current) {
            impressionLoggedRef.current = true;
            emitEngagement("impression", entry.intersectionRatio);
          }
          if (visibleSinceRef.current == null) visibleSinceRef.current = Date.now();
          updateReadProgress();
          return;
        }

        if (visibleSinceRef.current != null) {
          visibleAccumMsRef.current += Date.now() - visibleSinceRef.current;
          visibleSinceRef.current = null;
        }
      },
      { threshold: [0, 0.5, 0.75] }
    );
    observer.observe(el);

    const timer = window.setInterval(() => {
      const now = Date.now();
      const activeMs =
        visibleSinceRef.current == null ? 0 : now - visibleSinceRef.current;
      const totalVisibleMs = visibleAccumMsRef.current + activeMs;
      if (!read30LoggedRef.current && totalVisibleMs >= 30_000) {
        read30LoggedRef.current = true;
        emitEngagement("read_30s", totalVisibleMs / 1000);
      }
      updateReadProgress();
    }, 1000);

    const onScroll = () => updateReadProgress();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);

    return () => {
      observer.disconnect();
      window.clearInterval(timer);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (visibleSinceRef.current != null) {
        visibleAccumMsRef.current += Date.now() - visibleSinceRef.current;
        visibleSinceRef.current = null;
      }
    };
  }, [articleId, emitEngagement]);

  useEffect(() => {
    if (!userApiAllowed) {
      setSaved(false);
      setSaveRowId(null);
      setSaveStatusLoaded(true);
      return;
    }
    if (!articleId) {
      setSaved(false);
      setSaveRowId(null);
      setSaveStatusLoaded(false);
      return;
    }
    let cancelled = false;
    setSaveStatusLoaded(false);
    (async () => {
      try {
        const res = await fetch(
          `/api/user/article-saves?articleId=${encodeURIComponent(articleId)}`,
          { credentials: "include" }
        );
        if (cancelled) return;
        if (res.status === 401) {
          userApiAllowed = false;
          setSaved(false);
          setSaveRowId(null);
          setSaveStatusLoaded(true);
          return;
        }
        if (res.ok) {
          const j = (await res.json()) as {
            saved?: boolean;
            saveId?: string | null;
          };
          setSaved(Boolean(j.saved));
          setSaveRowId(typeof j.saveId === "string" ? j.saveId : null);
        } else {
          setSaved(false);
          setSaveRowId(null);
        }
      } catch {
        if (!cancelled) {
          setSaved(false);
          setSaveRowId(null);
        }
      } finally {
        if (!cancelled) setSaveStatusLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [articleId]);

  const toggleLike = useCallback(async () => {
    if (!userApiAllowed || !articleId || likeBusy || !likeStatusLoaded) return;
    setLikeBusy(true);
    try {
      if (liked) {
        const res = await fetch(
          `/api/user/article-likes?articleId=${encodeURIComponent(articleId)}`,
          { method: "DELETE", credentials: "include" }
        );
        if (res.status === 401) {
          userApiAllowed = false;
          setShowLikeButton(false);
          setLiked(false);
          return;
        }
        if (res.ok) setLiked(false);
      } else {
        const res = await fetch("/api/user/article-likes", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            articleId,
            articleTitle: article.headline,
          }),
        });
        if (res.status === 401) {
          userApiAllowed = false;
          setShowLikeButton(false);
          setLiked(false);
          return;
        }
        if (res.ok) setLiked(true);
      }
    } finally {
      setLikeBusy(false);
    }
  }, [articleId, article.headline, liked, likeBusy, likeStatusLoaded]);

  const toggleSave = useCallback(async () => {
    if (
      !userApiAllowed ||
      !canSave ||
      !("id" in article) ||
      !article.id ||
      saveBusy ||
      !saveStatusLoaded
    ) {
      return;
    }
    setSaveBusy(true);
    setSaveMsg(null);
    try {
      if (saved && saveRowId) {
        const res = await fetch(
          `/api/user/article-saves?id=${encodeURIComponent(saveRowId)}`,
          { method: "DELETE", credentials: "include" }
        );
        if (res.status === 401) {
          userApiAllowed = false;
          setSaved(false);
          setSaveRowId(null);
          setSaveMsg("Sign in to manage saved articles.");
          return;
        }
        if (!res.ok) {
          const j = (await res.json().catch(() => ({}))) as {
            error?: string;
            hint?: string;
          };
          const err =
            typeof j.error === "string" ? j.error : "Could not remove save.";
          const hint = typeof j.hint === "string" ? j.hint : "";
          setSaveMsg(hint ? `${err} — ${hint}` : err);
          return;
        }
        setSaved(false);
        setSaveRowId(null);
        setSaveMsg("Removed from your library.");
        return;
      }

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
      if (res.status === 401) {
        userApiAllowed = false;
        setSaved(false);
        setSaveRowId(null);
        setSaveMsg("Sign in to save articles.");
        return;
      }
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as {
          error?: string;
          hint?: string;
        };
        const err = typeof j.error === "string" ? j.error : "Could not save.";
        const hint = typeof j.hint === "string" ? j.hint : "";
        setSaveMsg(hint ? `${err} — ${hint}` : err);
        return;
      }
      const body = (await res.json().catch(() => ({}))) as { id?: string };
      if (typeof body.id === "string") setSaveRowId(body.id);
      setSaved(true);
      setSaveMsg("Saved to your library.");
    } catch {
      setSaveMsg("Could not update library.");
    } finally {
      setSaveBusy(false);
    }
  }, [
    article,
    canSave,
    saved,
    saveRowId,
    saveBusy,
    saveStatusLoaded,
    sourceUrls,
  ]);

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
            onClick={() => markOpen()}
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
        <CreatorBylineLink
          byline={article.byline}
          authorUserId={"authorUserId" in article ? article.authorUserId : null}
          authorPenName={
            "authorPenName" in article ? article.authorPenName : null
          }
          authorAvatarUrl={
            "authorAvatarUrl" in article ? article.authorAvatarUrl : null
          }
          authorUsername={
            "authorUsername" in article ? article.authorUsername : null
          }
          linkToProfile={
            "source" in article &&
            article.source === "creator" &&
            Boolean("authorUserId" in article && article.authorUserId)
          }
          accentColor={accentColor}
          variant="feed"
        />
        {article.location && <span>&middot; {article.location}</span>}
      </div>

      {canSave && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.1rem",
            flexWrap: "wrap",
          }}
        >
          <button
            type="button"
            disabled={saveBusy || !saveStatusLoaded}
            onClick={() => void toggleSave()}
            aria-label={
              saveBusy
                ? "Updating library"
                : saved
                  ? "Remove from library"
                  : "Save to library"
            }
            aria-pressed={saved}
            style={{
              ...iconActionStyle,
              opacity: saveBusy || !saveStatusLoaded ? 0.5 : 1,
              cursor:
                saveBusy || !saveStatusLoaded ? "wait" : "pointer",
              color: "#1a1a1a",
            }}
          >
            {saved ? <BookmarkFilledIcon /> : <BookmarkOutlineIcon />}
          </button>
          {showLikeButton && (
            <button
              type="button"
              disabled={likeBusy || !likeStatusLoaded}
              onClick={() => void toggleLike()}
              aria-label={liked ? "Remove like" : "Like article"}
              aria-pressed={liked}
              style={{
                ...iconActionStyle,
                opacity: likeBusy || !likeStatusLoaded ? 0.45 : 1,
                cursor:
                  likeBusy || !likeStatusLoaded ? "wait" : "pointer",
                color: liked ? "#8b2942" : "#1a1a1a",
              }}
            >
              {liked ? <HeartFilledIcon /> : <HeartOutlineIcon />}
            </button>
          )}
          {saveMsg && (
            <span
              style={{
                fontFamily: "'IM Fell English', Georgia, serif",
                fontStyle: "italic",
                fontSize: "0.68rem",
                color:
                  saveMsg.startsWith("Saved") ||
                  saveMsg.startsWith("Removed")
                    ? "#1a472a"
                    : "#8b4513",
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
        <ArticleBodyMarkdown markdown={article.body ?? ""} variant="feed" fontPreset="classic" />
      </div>

      {article.pullQuote?.trim() ? (
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
      ) : null}

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
                onClick={() => markOpen()}
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
            embedded
            persistCloud={false}
          />
        </div>
      )}
    </article>
  );
}
