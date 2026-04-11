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
import type { GameType } from "@/lib/games/types";
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
import { ArticleReaderModal } from "@/components/articles/ArticleReaderModal";
import { ShareMenu } from "@/components/articles/ShareMenu";
import {
  buildRssFeedExcerpt,
  isRssNarrativeArticle,
  rssHasExtraContentBeyondExcerpt,
} from "@/lib/articles/rssFeedPreview";
import { looksLikelyNonEnglishText } from "@/lib/articles/languageHeuristics";
import { computeAdaptiveExcerptClamp } from "@/lib/articles/rssExcerptClamp";

interface ArticleTranslationPayload {
  available: boolean;
  translated: boolean;
  detectedSourceLanguage: string | null;
  headline: string;
  subheadline: string;
  body: string;
}

const HERO_IMG_W = 800;
const HERO_IMG_H = 450;
const isScrollDepthTelemetryEnabled =
  process.env.NEXT_PUBLIC_ENGAGEMENT_SCROLL_DEPTH_ENABLED == null
    ? true
    : process.env.NEXT_PUBLIC_ENGAGEMENT_SCROLL_DEPTH_ENABLED === "1" ||
      process.env.NEXT_PUBLIC_ENGAGEMENT_SCROLL_DEPTH_ENABLED.toLowerCase() ===
        "true";

/** When the hero cell is taller than editorial content (grid stretch), offer Sudoku in the slack. */
const HERO_VERTICAL_GAP_PX = 280;
/** Cap lines when row is very tall; keep feed cards scannable (hero rows were ~28 lines). */
const RSS_EXCERPT_MAX_LINES = 14;
const RSS_EXCERPT_RESERVED_PX = 18;
/** Gap between clamped excerpt and Read more (matches grid gap on preview wrap). */
const RSS_PREVIEW_STACK_GAP_PX = 10.4;
let userApiAllowed = true;

function formatDateLabel(value: string | null | undefined): string | null {
  if (!value) return null;
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatDateTimeDetail(value: string | null | undefined): string | null {
  if (!value) return null;
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function InfoCircleIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" aria-hidden style={{ flexShrink: 0 }}>
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M12 10.5v5M12 8.2v.05"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

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

function DownloadIcon() {
  return (
    <svg
      width={18}
      height={18}
      viewBox="0 0 24 24"
      aria-hidden
      style={{ flexShrink: 0 }}
    >
      <path
        d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <polyline
        points="7 10 12 15 17 10"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <line
        x1="12"
        y1="15"
        x2="12"
        y2="3"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinecap="round"
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
  color: "var(--gs-ink-strong)",
  cursor: "pointer",
  borderRadius: "var(--gs-radius-xs)",
};

/** Hover intent before showing date details (typical tooltip delay; ~1s if you prefer a longer linger, set 1000). */
const DATE_INFO_HOVER_MS = 500;

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
  const isRecipeCard =
    "contentKind" in article && article.contentKind === "recipe";
  const accentColor = isRecipeCard
    ? "#1a472a"
    : CATEGORY_COLORS[article.category as keyof typeof CATEGORY_COLORS] ||
      "#1a1a1a";

  const isHero = layout === "hero";
  const isWide = layout === "wide";

  const articleSeed =
    "id" in article && article.id ? article.id : article.headline;

  const articleRef = useRef<HTMLElement>(null);
  const contentWrapRef = useRef<HTMLDivElement>(null);
  const [showHeroGapGame, setShowHeroGapGame] = useState(false);
  const [enabledEmbeddedGameTypes, setEnabledEmbeddedGameTypes] = useState<
    GameType[] | null
  >(null);
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
  const [showRecipeRating, setShowRecipeRating] = useState(false);
  const [recipeRatingLoaded, setRecipeRatingLoaded] = useState(false);
  const [recipeRatingBusy, setRecipeRatingBusy] = useState(false);
  const [recipeRating, setRecipeRating] = useState<number | null>(null);
  const [readerOpen, setReaderOpen] = useState(false);
  const [adaptiveExcerptLineClamp, setAdaptiveExcerptLineClamp] = useState<number | null>(null);
  const [translatedArticle, setTranslatedArticle] =
    useState<ArticleTranslationPayload | null>(null);
  const [showOriginalLanguage, setShowOriginalLanguage] = useState(false);
  const [dateInfoOpen, setDateInfoOpen] = useState(false);
  const dateInfoWrapRef = useRef<HTMLDivElement>(null);
  const dateInfoHoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const impressionLoggedRef = useRef(false);
  const openLoggedRef = useRef(false);
  const read30LoggedRef = useRef(false);
  const read75LoggedRef = useRef(false);
  const dwellLoggedRef = useRef(false);
  const scrollMilestonesLoggedRef = useRef<Set<number>>(new Set());
  const visibleSinceRef = useRef<number | null>(null);
  const visibleAccumMsRef = useRef(0);
  const rssExcerptRef = useRef<HTMLParagraphElement>(null);
  const rssPreviewWrapRef = useRef<HTMLDivElement>(null);
  const rssReadMoreWrapRef = useRef<HTMLDivElement>(null);
  const sourceFooterRef = useRef<HTMLElement>(null);

  /** Try AI image from prompt first, then deterministic stock photo, then text fallback */
  const [imageStage, setImageStage] = useState<
    "pollinations" | "picsum" | "broken"
  >("pollinations");

  useEffect(() => {
    setImageStage("pollinations");
  }, [article.imagePrompt, articleSeed]);

  useEffect(() => {
    setReaderOpen(false);
  }, [articleSeed]);

  useEffect(() => {
    setTranslatedArticle(null);
    setShowOriginalLanguage(false);
  }, [articleSeed]);

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

  useEffect(() => {
    try {
      const stored = localStorage.getItem("gentle_stream_enabled_game_types");
      if (!stored) return;
      const parsed = JSON.parse(stored) as unknown;
      if (!Array.isArray(parsed)) return;
      const enabled = parsed.filter((entry): entry is GameType => typeof entry === "string");
      if (enabled.length > 0) setEnabledEmbeddedGameTypes(enabled);
    } catch {
      /* ignore malformed local cache */
    }
  }, []);

  const embeddedGame = useMemo(
    () => embeddedGamePickFromSeed(articleSeed, enabledEmbeddedGameTypes ?? undefined),
    [articleSeed, enabledEmbeddedGameTypes]
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
        HERO_IMG_H,
        {
          category: article.category,
          location: article.location,
        }
      ) ?? picsumFallbackUrl(articleSeed, HERO_IMG_W, HERO_IMG_H)
    );
  }, [article.category, article.imagePrompt, article.location, articleSeed, imageStage]);

  const headlineSizePx = isHero
    ? "clamp(1.55rem, 2.8vw, 2.3rem)"
    : isWide
    ? "1.35rem"
    : "1.05rem";

  const sourceUrls = uniqueSourceUrls(article.sourceUrls);
  const primarySourceHref =
    sourceUrls[0] ? toClickableSourceUrl(sourceUrls[0]) : "";
  const isRssNarrativeFeedCard = isRssNarrativeArticle(article);
  const translationProbeText = useMemo(
    () =>
      [article.headline, article.subheadline ?? "", article.body ?? ""]
        .join(" ")
        .slice(0, 2400),
    [article.body, article.headline, article.subheadline]
  );
  const shouldAttemptTranslation =
    isRssNarrativeFeedCard &&
    translatedArticle == null &&
    looksLikelyNonEnglishText(translationProbeText);
  const translationArticleId =
    "id" in article && article.id ? article.id : articleSeed;

  useEffect(() => {
    if (!shouldAttemptTranslation) return;
    const controller = new AbortController();

    (async () => {
      try {
        const response = await fetch("/api/articles/translate", {
          method: "POST",
          credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            articleId: translationArticleId,
            headline: article.headline,
            subheadline: article.subheadline ?? "",
            body: article.body ?? "",
          }),
          signal: controller.signal,
        });
        if (!response.ok) return;
        const payload = (await response.json()) as ArticleTranslationPayload;
        if (!payload.available || !payload.translated) return;
        setTranslatedArticle(payload);
      } catch {
        /* best-effort translation only */
      }
    })();

    return () => controller.abort();
  }, [
    article.body,
    article.headline,
    article.subheadline,
    shouldAttemptTranslation,
    translationArticleId,
  ]);

  const displayHeadline =
    translatedArticle && !showOriginalLanguage ? translatedArticle.headline : article.headline;
  const displaySubheadline =
    translatedArticle && !showOriginalLanguage
      ? translatedArticle.subheadline
      : article.subheadline ?? "";
  const displayBody =
    translatedArticle && !showOriginalLanguage ? translatedArticle.body : article.body ?? "";
  const translatedLanguageToggleVisible = translatedArticle != null;

  const previewArticle = useMemo(
    () => ({
      ...article,
      headline: displayHeadline,
      subheadline: displaySubheadline,
      body: displayBody,
    }),
    [article, displayBody, displayHeadline, displaySubheadline]
  );
  /** Excerpt length for feed preview + “read more”; keeps DOM smaller than full article bodies. */
  const rssExcerptMaxChars = isHero ? 1200 : 900;
  const rssFeedExcerpt = isRssNarrativeFeedCard
    ? buildRssFeedExcerpt(previewArticle, rssExcerptMaxChars)
    : "";
  const shouldUseReaderModal =
    isRssNarrativeFeedCard &&
    rssFeedExcerpt.length > 0 &&
    rssHasExtraContentBeyondExcerpt(previewArticle, rssExcerptMaxChars);
  const rssPreviewText =
    shouldUseReaderModal && !/[.…]\s*$/u.test(rssFeedExcerpt)
      ? `${rssFeedExcerpt}…`
      : rssFeedExcerpt;
  const excerptLineClampBaseline = isHero ? 6 : isWide ? 5 : 5;
  const excerptLineClamp = adaptiveExcerptLineClamp ?? excerptLineClampBaseline;
  const publishedLabel = formatDateLabel(
    "sourcePublishedAt" in article ? article.sourcePublishedAt ?? null : null
  );
  const ingestedLabel = formatDateLabel(
    "ingestedAt" in article
      ? article.ingestedAt ?? null
      : "fetchedAt" in article
        ? article.fetchedAt ?? null
        : null
  );

  const isCreator = "source" in article && article.source === "creator";
  const streamLabel = formatDateLabel(
    "fetchedAt" in article && article.fetchedAt ? article.fetchedAt : null
  );
  const visibleDateline =
    isCreator && streamLabel
      ? `Posted ${streamLabel}`
      : publishedLabel ?? streamLabel ?? null;
  const streamDetail = formatDateTimeDetail(
    "fetchedAt" in article && article.fetchedAt ? article.fetchedAt : null
  );
  const publishedDetail = formatDateTimeDetail(
    "sourcePublishedAt" in article ? article.sourcePublishedAt ?? null : null
  );

  useEffect(() => {
    setAdaptiveExcerptLineClamp(null);
  }, [articleSeed, isHero, isWide, shouldUseReaderModal, rssPreviewText, showOriginalLanguage]);

  useEffect(() => {
    if (!shouldUseReaderModal) return;
    const articleEl = articleRef.current;
    const previewWrapEl = rssPreviewWrapRef.current;
    const excerptEl = rssExcerptRef.current;
    if (!articleEl || !previewWrapEl || !excerptEl) return;

    function measureExcerptClamp() {
      const articleNode = articleRef.current;
      const previewNode = rssPreviewWrapRef.current;
      const excerptNode = rssExcerptRef.current;
      if (!articleNode || !previewNode || !excerptNode) return;

      const readMoreHeight = rssReadMoreWrapRef.current?.offsetHeight ?? 0;
      const sourceHeight = sourceFooterRef.current?.offsetHeight ?? 0;

      const wrapH = previewNode.clientHeight;
      const fromPreviewWrap = Math.max(
        0,
        wrapH -
          readMoreHeight -
          RSS_PREVIEW_STACK_GAP_PX -
          RSS_EXCERPT_RESERVED_PX
      );

      const articleRect = articleNode.getBoundingClientRect();
      const previewRect = previewNode.getBoundingClientRect();
      const previewTopOffset = Math.max(0, previewRect.top - articleRect.top);
      const fromArticleBounds = Math.max(
        0,
        articleNode.clientHeight -
          previewTopOffset -
          readMoreHeight -
          RSS_PREVIEW_STACK_GAP_PX -
          sourceHeight -
          RSS_EXCERPT_RESERVED_PX
      );

      const availableHeightPx = Math.max(fromPreviewWrap, fromArticleBounds);
      const computed = window.getComputedStyle(excerptNode);
      const lineHeightPx = Number.parseFloat(computed.lineHeight) || 22;
      const nextClamp = computeAdaptiveExcerptClamp({
        baselineLines: excerptLineClampBaseline,
        maxLines: RSS_EXCERPT_MAX_LINES,
        availableHeightPx,
        lineHeightPx,
      });
      setAdaptiveExcerptLineClamp((current) =>
        current === nextClamp ? current : nextClamp
      );
    }

    const ro = new ResizeObserver(() => {
      requestAnimationFrame(measureExcerptClamp);
    });
    ro.observe(articleEl);
    ro.observe(previewWrapEl);
    ro.observe(excerptEl);
    if (contentWrapRef.current) ro.observe(contentWrapRef.current);
    if (rssReadMoreWrapRef.current) ro.observe(rssReadMoreWrapRef.current);
    if (sourceFooterRef.current) ro.observe(sourceFooterRef.current);
    window.addEventListener("resize", measureExcerptClamp);
    const rafId = requestAnimationFrame(measureExcerptClamp);

    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
      window.removeEventListener("resize", measureExcerptClamp);
    };
  }, [excerptLineClampBaseline, shouldUseReaderModal]);

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
    (
      eventType:
        | "impression"
        | "open"
        | "click_through"
        | "scroll_depth"
        | "read_30s"
        | "read_75pct"
        | "read_dwell",
      eventValue?: number
    ) => {
      if (!userApiAllowed) return;
      if (!articleId) return;
      trackArticleEngagement({
        articleId,
        eventType,
        eventValue: eventValue ?? null,
        context:
          eventType === "scroll_depth"
            ? { ...engagementContext, scrollDepth: eventValue }
            : engagementContext,
      });
    },
    [articleId, engagementContext]
  );

  const markOpen = useCallback(() => {
    if (openLoggedRef.current) return;
    openLoggedRef.current = true;
    emitEngagement("open");
  }, [emitEngagement]);

  const markClickThrough = useCallback(() => {
    emitEngagement("click_through", 1);
  }, [emitEngagement]);

  const clearDateInfoHoverTimer = useCallback(() => {
    if (dateInfoHoverTimerRef.current != null) {
      clearTimeout(dateInfoHoverTimerRef.current);
      dateInfoHoverTimerRef.current = null;
    }
  }, []);

  const scheduleDateInfoOpen = useCallback(() => {
    clearDateInfoHoverTimer();
    const ms =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? 0
        : DATE_INFO_HOVER_MS;
    dateInfoHoverTimerRef.current = setTimeout(() => {
      dateInfoHoverTimerRef.current = null;
      setDateInfoOpen(true);
    }, ms);
  }, [clearDateInfoHoverTimer]);

  const closeDateInfo = useCallback(() => {
    clearDateInfoHoverTimer();
    setDateInfoOpen(false);
  }, [clearDateInfoHoverTimer]);

  useEffect(() => () => clearDateInfoHoverTimer(), [clearDateInfoHoverTimer]);

  useEffect(() => {
    impressionLoggedRef.current = false;
    openLoggedRef.current = false;
    read30LoggedRef.current = false;
    read75LoggedRef.current = false;
    dwellLoggedRef.current = false;
    scrollMilestonesLoggedRef.current = new Set();
    visibleSinceRef.current = null;
    visibleAccumMsRef.current = 0;
  }, [articleId]);

  useEffect(() => {
    if (!isRecipeCard) {
      setShowRecipeRating(false);
      setRecipeRating(null);
      setRecipeRatingLoaded(false);
      return;
    }
    if (!userApiAllowed) {
      setShowRecipeRating(false);
      setRecipeRating(null);
      setRecipeRatingLoaded(true);
      return;
    }
    if (!articleId) {
      setShowRecipeRating(false);
      setRecipeRating(null);
      setRecipeRatingLoaded(false);
      return;
    }

    let cancelled = false;
    setRecipeRatingLoaded(false);
    (async () => {
      try {
        const res = await fetch(
          `/api/user/recipe-ratings?articleId=${encodeURIComponent(articleId)}`,
          { credentials: "include" }
        );
        if (cancelled) return;
        if (res.status === 401) {
          userApiAllowed = false;
          setShowRecipeRating(false);
          setRecipeRating(null);
          setRecipeRatingLoaded(true);
          return;
        }
        if (!res.ok) {
          setShowRecipeRating(false);
          setRecipeRating(null);
          return;
        }
        const body = (await res.json().catch(() => ({}))) as {
          rating?: number | null;
        };
        setShowRecipeRating(true);
        setRecipeRating(
          typeof body.rating === "number" && body.rating >= 0 && body.rating <= 5
            ? Math.round(body.rating)
            : null
        );
      } catch {
        if (!cancelled) {
          setShowRecipeRating(false);
          setRecipeRating(null);
        }
      } finally {
        if (!cancelled) setRecipeRatingLoaded(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [articleId, isRecipeCard]);

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
      if (isScrollDepthTelemetryEnabled) {
        const milestones = [0.25, 0.5, 0.75, 1] as const;
        for (const milestone of milestones) {
          if (ratio < milestone) continue;
          if (scrollMilestonesLoggedRef.current.has(milestone)) continue;
          scrollMilestonesLoggedRef.current.add(milestone);
          emitEngagement("scroll_depth", milestone);
        }
      }
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
      const totalVisibleSec = Math.round(visibleAccumMsRef.current / 1000);
      if (!dwellLoggedRef.current && totalVisibleSec >= 5) {
        dwellLoggedRef.current = true;
        emitEngagement("read_dwell", totalVisibleSec);
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

  const rateRecipe = useCallback(
    async (nextRating: number) => {
      if (!userApiAllowed || !isRecipeCard || !articleId || recipeRatingBusy) return;
      setRecipeRatingBusy(true);
      const previousRating = recipeRating;
      setRecipeRating(nextRating);
      try {
        const res = await fetch("/api/user/recipe-ratings", {
          method: "PUT",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ articleId, rating: nextRating }),
        });
        if (res.status === 401) {
          userApiAllowed = false;
          setShowRecipeRating(false);
          setRecipeRating(null);
          return;
        }
        if (!res.ok) {
          setRecipeRating(previousRating);
        }
      } catch {
        setRecipeRating(previousRating);
      } finally {
        setRecipeRatingBusy(false);
      }
    },
    [articleId, isRecipeCard, recipeRating, recipeRatingBusy]
  );

  const downloadRecipe = useCallback(() => {
    if (!isRecipeCard) return;
    const ingredients =
      "recipeIngredients" in article && Array.isArray(article.recipeIngredients)
        ? article.recipeIngredients
        : [];
    const instructions =
      "recipeInstructions" in article && Array.isArray(article.recipeInstructions)
        ? article.recipeInstructions
        : [];
    const servings =
      "recipeServings" in article && article.recipeServings != null
        ? article.recipeServings
        : null;
    const prep =
      "recipePrepTimeMinutes" in article &&
      article.recipePrepTimeMinutes != null
        ? article.recipePrepTimeMinutes
        : null;
    const cook =
      "recipeCookTimeMinutes" in article &&
      article.recipeCookTimeMinutes != null
        ? article.recipeCookTimeMinutes
        : null;

    const metaParts = [
      servings != null ? `Serves ${servings}` : null,
      prep != null ? `Prep ${prep} min` : null,
      cook != null ? `Cook ${cook} min` : null,
    ].filter(Boolean);

    const markdown = [
      `# ${article.headline}`,
      article.subheadline?.trim() ? `\n_${article.subheadline.trim()}_` : "",
      metaParts.length > 0 ? `\n${metaParts.join(" · ")}` : "",
      ingredients.length > 0
        ? `\n\n## Ingredients\n${ingredients.map((ing) => `- ${ing}`).join("\n")}`
        : "",
      instructions.length > 0
        ? `\n\n## Instructions\n${instructions
            .map((step, idx) => `${idx + 1}. ${step}`)
            .join("\n")}`
        : "",
      primarySourceHref ? `\n\nSource: ${primarySourceHref}` : "",
    ].join("");

    const blob = new Blob([markdown], {
      type: "text/markdown;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const safeName = (article.headline || "recipe")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${safeName || "recipe"}.md`;
    anchor.rel = "noopener";
    anchor.click();
    URL.revokeObjectURL(url);
  }, [article, isRecipeCard, primarySourceHref]);

  const headlineStyle = {
    fontFamily: "'Playfair Display', Georgia, serif",
    fontSize: headlineSizePx,
    fontWeight: 700,
    lineHeight: 1.18,
    color: "var(--gs-text)",
    margin: 0,
    letterSpacing: "-0.01em",
  } as const;

  const sourceLinkStyle = {
    color: "var(--gs-ink-strong)",
    textDecoration: "underline",
    textDecorationColor: "var(--gs-accent)",
    textDecorationThickness: "0.08em",
    textUnderlineOffset: "0.12em",
    transition:
      "color var(--gs-motion-fast) var(--gs-ease-standard), text-decoration-color var(--gs-motion-fast) var(--gs-ease-standard)",
  } as const;

  const shouldRenderPullQuote =
    !shouldUseReaderModal && Boolean(article.pullQuote?.trim());

  return (
    <article
      ref={articleRef}
      className="gs-card-lift"
      style={{
        borderRight: "none",
        borderLeft: isWide
          ? `2px solid color-mix(in srgb, ${accentColor} 68%, var(--gs-border))`
          : undefined,
        padding: isHero
          ? "1.5rem 1.6rem 1.2rem"
          : isWide
            ? "1.1rem 1.35rem 1.05rem"
            : "1rem 1.2rem 1rem",
        display: "flex",
        flexDirection: "column",
        gap: "0.45rem",
        animation: `fadeSlideIn 0.5s ease ${index * 0.08}s both`,
        background: "var(--gs-surface)",
        flex: 1,
        minHeight: 0,
        boxSizing: "border-box",
      }}
    >
      <div
        ref={contentWrapRef}
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "0.45rem",
          flex: 1,
          minHeight: 0,
        }}
      >
      {articleId && visibleDateline ? (
        <div
          ref={dateInfoWrapRef}
          onPointerEnter={scheduleDateInfoOpen}
          onPointerLeave={closeDateInfo}
          style={{
            position: "relative",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "0.5rem",
            flexWrap: "wrap",
          }}
        >
          <span
            style={{
              fontFamily: "'IBM Plex Sans', system-ui, sans-serif",
              fontSize: "0.72rem",
              fontWeight: 600,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: "var(--gs-muted)",
            }}
          >
            {visibleDateline}
          </span>
          <button
            type="button"
            className="gs-interactive gs-focus-ring"
            aria-expanded={dateInfoOpen}
            aria-describedby={
              dateInfoOpen ? `article-date-info-${articleId}` : undefined
            }
            aria-label="Original publication and ingest details. Hover this row for a moment, or focus this button."
            onFocus={() => {
              clearDateInfoHoverTimer();
              setDateInfoOpen(true);
            }}
            onBlur={closeDateInfo}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: "1.65rem",
              height: "1.65rem",
              borderRadius: "var(--gs-radius-pill)",
              border: "1px solid var(--gs-border)",
              background: "var(--gs-surface-soft)",
              color: "var(--gs-muted)",
              cursor: "help",
            }}
          >
            <InfoCircleIcon />
          </button>
          {dateInfoOpen ? (
            <div
              id={`article-date-info-${articleId}`}
              role="tooltip"
              style={{
                position: "absolute",
                zIndex: 40,
                top: "100%",
                right: 0,
                marginTop: "0.35rem",
                width: "min(300px, calc(100vw - 2rem))",
                padding: "0.75rem 0.85rem",
                borderRadius: "var(--gs-radius-sm)",
                border: "1px solid var(--gs-border-strong)",
                background: "var(--gs-surface-elevated)",
                boxShadow: "var(--gs-shadow-popover)",
                fontFamily: "'IBM Plex Sans', system-ui, sans-serif",
                fontSize: "0.72rem",
                lineHeight: 1.45,
                color: "var(--gs-text)",
                textAlign: "left",
              }}
            >
              {isCreator ? (
                <>
                  <strong style={{ display: "block", marginBottom: "0.35rem" }}>
                    On Gentle Stream
                  </strong>
                  {streamDetail ?? visibleDateline}
                </>
              ) : isRecipeCard ? (
                <>
                  <strong style={{ display: "block", marginBottom: "0.35rem" }}>
                    Recipe timeline
                  </strong>
                  {publishedDetail ? (
                    <span style={{ display: "block", marginBottom: "0.35rem" }}>
                      Original date (when provided): {publishedDetail}
                    </span>
                  ) : null}
                  <span style={{ display: "block" }}>
                    Added to your stream: {streamDetail ?? "—"}
                  </span>
                </>
              ) : (
                <>
                  <strong style={{ display: "block", marginBottom: "0.35rem" }}>
                    Original publication
                  </strong>
                  <span style={{ display: "block", marginBottom: "0.45rem" }}>
                    {publishedDetail
                      ? publishedDetail
                      : "Not supplied by the source (common when dates are missing from RSS or search results)."}
                  </span>
                  <strong style={{ display: "block", marginBottom: "0.35rem" }}>
                    Added to Gentle Stream
                  </strong>
                  <span style={{ display: "block", marginBottom: "0.45rem" }}>
                    {streamDetail ?? "—"}
                  </span>
                  <span style={{ display: "block", color: "var(--gs-muted)", fontSize: "0.68rem" }}>
                    Stories are discovered from RSS feeds (when configured) and from web search, then
                    edited for reading here.
                  </span>
                </>
              )}
            </div>
          ) : null}
        </div>
      ) : null}
      {!isRecipeCard ? (
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
      ) : null}

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
              e.currentTarget.style.color = "var(--gs-text)";
            }}
            onClick={() => {
              markOpen();
              markClickThrough();
            }}
          >
            {displayHeadline}
          </a>
        ) : (
          displayHeadline
        )}
      </h2>

      {/* Subheadline / deck */}
      {displaySubheadline && (
        <p
          style={{
            fontFamily: "'IM Fell English', Georgia, serif",
            fontStyle: "italic",
            fontSize: isHero ? "1.0rem" : "0.86rem",
            color: "var(--gs-muted)",
            margin: 0,
            lineHeight: 1.42,
            borderBottom: "1px solid var(--gs-border)",
            paddingBottom: "0.45rem",
          }}
        >
          {displaySubheadline}
        </p>
      )}

      {/* Byline + location */}
      <div
        style={{
          display: "flex",
          gap: "0.7rem",
          fontSize: "0.64rem",
          fontFamily: "Georgia, serif",
          color: "var(--gs-muted)",
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
      {translatedLanguageToggleVisible ? (
        <button
          type="button"
          className="gs-interactive gs-focus-ring"
          onClick={() => setShowOriginalLanguage((value) => !value)}
          style={{
            alignSelf: "flex-start",
            border: "none",
            background: "transparent",
            padding: 0,
            marginTop: "-0.1rem",
            fontFamily: "'IBM Plex Sans', system-ui, sans-serif",
            fontSize: "0.68rem",
            color: "var(--gs-muted)",
            textDecoration: "underline",
            textUnderlineOffset: "0.16em",
            cursor: "pointer",
          }}
          aria-label={
            showOriginalLanguage
              ? "View this article in English"
              : "View this article in original language"
          }
        >
          {showOriginalLanguage ? "View in English" : "View in original language"}
        </button>
      ) : null}

      {(canSave || articleId) && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.1rem",
            flexWrap: "wrap",
          }}
        >
          {canSave ? (
            <button
              className="gs-interactive gs-focus-ring"
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
                color: "var(--gs-ink-strong)",
              }}
            >
              {saved ? <BookmarkFilledIcon /> : <BookmarkOutlineIcon />}
            </button>
          ) : null}
          {showLikeButton && canSave ? (
            <button
              className="gs-interactive gs-focus-ring"
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
                color: liked ? "#b85e76" : "var(--gs-ink-strong)",
              }}
            >
              {liked ? <HeartFilledIcon /> : <HeartOutlineIcon />}
            </button>
          ) : null}
          {articleId ? (
            <ShareMenu
              articleId={articleId}
              headline={article.headline}
              byline={article.byline}
              body={article.body ?? ""}
            />
          ) : null}
          {isRecipeCard ? (
            <button
              className="gs-interactive gs-focus-ring"
              type="button"
              onClick={downloadRecipe}
              aria-label="Download recipe"
              title="Download recipe"
              style={{
                ...iconActionStyle,
                  color: "var(--gs-accent)",
              }}
            >
              <DownloadIcon />
            </button>
          ) : null}
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
                    : "#b07833",
              }}
            >
              {saveMsg}
            </span>
          )}
        </div>
      )}

      {isRecipeCard && showRecipeRating && (
        <div
          style={{
            marginTop: "0.35rem",
            display: "flex",
            flexDirection: "column",
            gap: "0.35rem",
          }}
        >
          <span
            style={{
              fontFamily: "'IM Fell English', Georgia, serif",
              fontSize: "0.72rem",
              color: "var(--gs-muted)",
              letterSpacing: "0.02em",
            }}
          >
            Rate recipe
          </span>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              maxWidth: "100%",
              filter: "drop-shadow(0 2px 8px rgba(0, 0, 0, 0.07))",
            }}
          >
            <div
              aria-hidden
              style={{
                width: "2.35rem",
                height: "2.35rem",
                borderRadius: "50%",
                background: "linear-gradient(145deg, #6b4c9c 0%, #4a3270 100%)",
                color: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily:
                  "ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif",
                fontSize: "0.9rem",
                fontWeight: 700,
                flexShrink: 0,
                zIndex: 1,
                boxShadow: "0 1px 3px rgba(0, 0, 0, 0.12)",
              }}
              title={recipeRating == null ? "Not rated yet" : `Your rating: ${recipeRating} of 5`}
            >
              {recipeRating == null ? "—" : recipeRating}
            </div>
            <div
              role="group"
              aria-label="Recipe star rating"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.06rem",
                marginLeft: "-0.55rem",
                paddingLeft: "0.85rem",
                paddingRight: "0.7rem",
                paddingTop: "0.32rem",
                paddingBottom: "0.32rem",
                background: "var(--gs-surface)",
                borderRadius: "999px",
                border: "1px solid var(--gs-border)",
                boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.65)",
              }}
            >
              {[1, 2, 3, 4, 5].map((value) => {
                const filled =
                  recipeRating != null && recipeRating >= value;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => void rateRecipe(value)}
                    disabled={recipeRatingBusy || !recipeRatingLoaded}
                    style={{
                      border: "none",
                      background: "transparent",
                      padding: "0.12rem 0.14rem",
                      lineHeight: 1,
                      fontSize: "1.05rem",
                      cursor:
                        recipeRatingBusy || !recipeRatingLoaded
                          ? "wait"
                          : "pointer",
                      color: filled ? "#d4a012" : "var(--gs-border)",
                      opacity: filled ? 1 : 0.42,
                      textShadow: filled
                        ? "0 0.5px 0 rgba(0,0,0,0.06)"
                        : undefined,
                    }}
                    aria-label={`Rate ${value} out of 5 stars`}
                    aria-pressed={filled}
                  >
                    ★
                  </button>
                );
              })}
            </div>
          </div>
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
            border: "1px solid var(--gs-border)",
            borderRadius: "var(--gs-radius-sm)",
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
                aria-label={`Open source article: ${displayHeadline}`}
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
                color: "var(--gs-muted)",
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
          columns: isRecipeCard ? 1 : shouldUseReaderModal ? 1 : isHero ? 2 : 1,
          columnGap: "1.5rem",
          columnRule: "1px solid var(--gs-border)",
          ...(shouldUseReaderModal
            ? {
                flex: 1,
                minHeight: 0,
                display: "flex",
                flexDirection: "column",
              }
            : {}),
        }}
      >
        {isRecipeCard ? (
          <div style={{ display: "grid", gap: "0.65rem", breakInside: "avoid-column" }}>
            {("recipeImages" in article && (article.recipeImages?.length ?? 0) > 0) ? (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "0.35rem" }}>
                {(article.recipeImages ?? []).slice(0, 3).map((src, i) => (
                  <img
                    key={`${src}-${i}`}
                    src={src}
                    alt={`Recipe image ${i + 1}`}
                    loading="lazy"
                    decoding="async"
                    width={210}
                    height={140}
                    style={{
                      width: "100%",
                      aspectRatio: "3 / 2",
                      objectFit: "cover",
                      borderRadius: 6,
                      border: "1px solid var(--gs-border)",
                      background: "var(--gs-surface-elevated)",
                      display: "block",
                    }}
                    onError={(e) => {
                      // Best-effort: hide broken thumbnails.
                      const el = e.currentTarget;
                      el.style.display = "none";
                    }}
                  />
                ))}
              </div>
            ) : null}

            <div style={{ display: "flex", gap: "0.85rem", flexWrap: "wrap" }}>
              {("recipeServings" in article && article.recipeServings != null) ? (
                <span style={{ fontFamily: "'Playfair Display', Georgia, serif", color: "var(--gs-accent)", fontWeight: 700 }}>
                  Serves {article.recipeServings}
                </span>
              ) : null}
              {("recipePrepTimeMinutes" in article && article.recipePrepTimeMinutes != null) ? (
                <span style={{ color: "var(--gs-muted)" }}>Prep {article.recipePrepTimeMinutes} min</span>
              ) : null}
              {("recipeCookTimeMinutes" in article && article.recipeCookTimeMinutes != null) ? (
                <span style={{ color: "var(--gs-muted)" }}>Cook {article.recipeCookTimeMinutes} min</span>
              ) : null}
            </div>

            {("recipeIngredients" in article && (article.recipeIngredients?.length ?? 0) > 0) ? (
              <div style={{ breakInside: "avoid" }}>
                <div style={{ fontFamily: "'IM Fell English', Georgia, serif", fontWeight: 700, color: "var(--gs-ink-strong)", marginBottom: "0.25rem" }}>
                  Ingredients
                </div>
                <ul style={{ margin: 0, paddingLeft: "1.15rem", color: "var(--gs-text)", lineHeight: 1.6 }}>
                  {(article.recipeIngredients ?? []).map((ing, i) => (
                    <li key={`${ing}-${i}`}>{ing}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {("recipeInstructions" in article && (article.recipeInstructions?.length ?? 0) > 0) ? (
              <div style={{ breakInside: "avoid-column" }}>
                <div style={{ fontFamily: "'IM Fell English', Georgia, serif", fontWeight: 700, color: "var(--gs-ink-strong)", marginBottom: "0.25rem" }}>
                  Instructions
                </div>
                <ol style={{ margin: 0, paddingLeft: "1.15rem", color: "var(--gs-text)", lineHeight: 1.6 }}>
                  {(article.recipeInstructions ?? []).map((step, i) => (
                    <li key={`${step}-${i}`}>{step}</li>
                  ))}
                </ol>
              </div>
            ) : null}
          </div>
        ) : shouldUseReaderModal ? (
          <div
            ref={rssPreviewWrapRef}
            style={{
              breakInside: "avoid-column",
              display: "grid",
              gridTemplateColumns: "minmax(0, 1fr)",
              gap: "0.65rem",
              width: "100%",
              minWidth: 0,
              flex: 1,
              minHeight: 0,
            }}
          >
            <p
              ref={rssExcerptRef}
              className="article-font--classic gs-rss-reader-excerpt"
              style={{
                margin: 0,
                color: "var(--gs-text)",
                fontFamily: "Georgia, serif",
                overflow: "hidden",
                display: "-webkit-box",
                WebkitLineClamp: excerptLineClamp,
                WebkitBoxOrient: "vertical",
                width: "100%",
                minWidth: 0,
                WebkitMaskImage:
                  "linear-gradient(to bottom, rgba(0,0,0,1) 68%, rgba(0,0,0,0.16) 88%, rgba(0,0,0,0) 100%)",
                maskImage:
                  "linear-gradient(to bottom, rgba(0,0,0,1) 68%, rgba(0,0,0,0.16) 88%, rgba(0,0,0,0) 100%)",
              }}
            >
              {rssPreviewText}
            </p>
            <div ref={rssReadMoreWrapRef} style={{ breakInside: "avoid-column" }}>
              <button
                type="button"
                className="gs-interactive gs-focus-ring gs-read-more-btn"
                onClick={() => {
                  markOpen();
                  setReaderOpen(true);
                }}
                style={{
                  border: "1px solid var(--gs-border-strong)",
                  background: "var(--gs-surface-soft)",
                  color: "var(--gs-ink-strong)",
                  borderRadius: "var(--gs-radius-pill)",
                  padding: "0.3rem 0.72rem",
                  fontFamily: "'IM Fell English', Georgia, serif",
                  fontSize: "0.78rem",
                  cursor: "pointer",
                }}
                aria-label={`Read full article: ${displayHeadline}`}
              >
                Read more
              </button>
            </div>
          </div>
        ) : (
          <ArticleBodyMarkdown
            markdown={displayBody}
            variant="feed"
            fontPreset="classic"
            readingTimeSecs={
              "readingTimeSecs" in article ? article.readingTimeSecs : undefined
            }
          />
        )}
      </div>

      {shouldRenderPullQuote ? (
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
          ref={sourceFooterRef}
          style={{
            marginTop: shouldUseReaderModal ? "auto" : "0.65rem",
            paddingTop: "0.55rem",
            borderTop: "1px solid var(--gs-border)",
            fontFamily: "Georgia, serif",
            fontSize: isHero ? "0.72rem" : "0.66rem",
            color: "var(--gs-muted)",
            lineHeight: 1.5,
          }}
        >
          <span style={{ fontWeight: 600, color: "var(--gs-ink-strong)", marginRight: "0.35rem" }}>
            {sourceUrls.length === 1 ? "Source" : "Sources"}
          </span>
          {sourceUrls.map((u, i) => (
            <Fragment key={`${u}-${i}`}>
              {i > 0 && <span style={{ color: "var(--gs-border-strong)" }}> · </span>}
              <a
                className="gs-focus-ring gs-feed-source-link"
                href={toClickableSourceUrl(u)}
                target="_blank"
                rel="noopener noreferrer"
                style={sourceLinkStyle}
                onClick={() => {
                  markOpen();
                  markClickThrough();
                }}
              >
                {sourceLinkLabel(u)}
              </a>
            </Fragment>
          ))}
        </footer>
      )}
      </div>

      {shouldUseReaderModal ? (
        <ArticleReaderModal
          open={readerOpen}
          onClose={() => setReaderOpen(false)}
          headline={displayHeadline}
          byline={article.byline}
          body={displayBody}
          readingTimeSecs={
            "readingTimeSecs" in article ? article.readingTimeSecs : undefined
          }
        />
      ) : null}

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
              color: "var(--gs-muted)",
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
