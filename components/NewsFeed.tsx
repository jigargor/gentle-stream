"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Masthead, { MASTHEAD_TOP_BAR_HEIGHT_PX } from "./Masthead";
import { ProfileMenu } from "./user/ProfileMenu";
import CategoryDrawer from "./CategoryDrawer";
import { MfaChallengeGate } from "./auth/mfa/MfaChallengeGate";
import NewsSection from "./NewsSection";
import GameSlot from "./games/GameSlot";
import LoadingSection from "./LoadingSection";
import ErrorBanner from "./ErrorBanner";
import type { Category } from "@/lib/constants";
import type { Article, FeedSection, ArticleFeedSection, GameFeedSection } from "@/lib/types";
import { DEFAULT_GAME_RATIO } from "@/lib/constants";
import { feedGamePickForOrdinal } from "@/lib/games/feedPick";

// Strip any <cite ...>...</cite> or bare </cite> tags that leak from Claude
function stripCiteTags(text: string): string {
  return text
    .replace(/<cite[^>]*>/gi, "")
    .replace(/<\/cite>/gi, "")
    .trim();
}

function cleanArticle(article: Article): Article {
  return {
    ...article,
    body: stripCiteTags(article.body ?? ""),
    pullQuote: stripCiteTags(article.pullQuote ?? ""),
    subheadline: stripCiteTags(article.subheadline ?? ""),
    headline: stripCiteTags(article.headline ?? ""),
    sourceUrls: article.sourceUrls ?? [],
  };
}

function articleUniqKey(article: Article): string {
  if ("id" in article && typeof article.id === "string" && article.id.length > 0) {
    return `id:${article.id}`;
  }
  // Fallback for raw shapes: deterministic enough to avoid visible duplicates.
  return `raw:${article.category}|${article.headline}|${article.byline}|${article.location}`;
}

/**
 * Decide whether a given section index should be a game slot.
 * Deterministic: same sectionIndex always produces the same result for a given ratio.
 */
function shouldBeGame(sectionIndex: number, gameRatio: number): boolean {
  if (gameRatio <= 0) return false;
  if (gameRatio >= 1) return true;
  const period = Math.round(1 / gameRatio);
  return sectionIndex % period === period - 1;
}

const FEED_FETCH_TIMEOUT_MS = 90_000;
const SENTINEL_PREFETCH_PX = 900;
const MIN_LOAD_GAP_MS = 650;
const REACHED_END_COOLDOWN_MS = 20_000;

export interface NewsFeedProps {
  /** Stable id from Supabase `auth.users` — used for ranking, seen state, future metrics. */
  userId: string;
  userEmail?: string | null;
  isAdmin?: boolean;
}

export default function NewsFeed({ userId, userEmail, isAdmin = false }: NewsFeedProps) {
  const [mfaPassed, setMfaPassed] = useState(userId === "dev-local");
  const [sections, setSections] = useState<FeedSection[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<Category | null>(null);
  const [liveGenerating, setLiveGenerating] = useState(false);
  /** True once game ratio is resolved for the current session/user bootstrap. */
  const [isFeedReady, setIsFeedReady] = useState(false);

  // Use refs for values that loadMore closes over — avoids stale closure bugs
  const loadingRef = useRef(false);
  const sectionCountRef = useRef(0);
  /** Counts game sections only — drives fair rotation in feedGamePickForOrdinal. */
  const gameSlotOrdinalRef = useRef(0);
  /** NYT-style: at most one Connections slot per session; hide after completion today. */
  const connectionsCompletedTodayRef = useRef(false);
  const connectionsShownInSessionRef = useRef(false);
  const activeCategoryRef = useRef<Category | null>(null);
  /** Bumps on each [userId] bootstrap so Strict Mode / fast remounts only run one initial loadMore. */
  const feedBootstrapGenRef = useRef(0);
  const gameRatioRef = useRef(DEFAULT_GAME_RATIO);
  const feedReadyRef = useRef(false);
  const lastArticleCategoryRef = useRef<string | undefined>(undefined);
  // Hard de-dup across all rendered sections in this session/category view.
  const renderedArticleKeysRef = useRef<Set<string>>(new Set());
  // Plain UUID IDs only — sent to /api/feed excludeIds for DB-level exclusion.
  const renderedDbArticleIdsRef = useRef<Set<string>>(new Set());

  // Prevent repeated loads when we have reached the end for this session/view.
  const reachedEndRef = useRef(false);
  // If the sentinel comes into view while we're loading, remember that so we can
  // fetch again immediately after the current request finishes.
  const pendingLoadRef = useRef(false);
  const lastLoadStartAtRef = useRef(0);
  const reachedEndTimeoutIdRef = useRef<number | null>(null);

  // Sentinel ref — plain IntersectionObserver (no library dependency on stale state)
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  const loadMore = useCallback(async (overrideCategory?: Category | null) => {
    if (!feedReadyRef.current) return;
    if (reachedEndRef.current) return;
    if (loadingRef.current) {
      pendingLoadRef.current = true;
      return;
    }

    const now = Date.now();
    if (now - lastLoadStartAtRef.current < MIN_LOAD_GAP_MS) return;
    lastLoadStartAtRef.current = now;

    loadingRef.current = true;
    setLoading(true);
    setError(null);

    const category =
      overrideCategory !== undefined
        ? overrideCategory
        : activeCategoryRef.current;

    const currentIndex = sectionCountRef.current;

    try {
      // ── Decide: game slot or article section? ────────────────────────────────
      if (shouldBeGame(currentIndex, gameRatioRef.current)) {
        const offerDailyConnections =
          !connectionsCompletedTodayRef.current &&
          !connectionsShownInSessionRef.current;

        let gameType: GameFeedSection["gameType"];
        let difficulty: GameFeedSection["difficulty"];
        let connectionsDaily = false;

        if (offerDailyConnections) {
          connectionsShownInSessionRef.current = true;
          gameType = "connections";
          difficulty = "medium";
          connectionsDaily = true;
        } else {
          const pick = feedGamePickForOrdinal(gameSlotOrdinalRef.current++);
          gameType = pick.gameType;
          difficulty = pick.difficulty;
        }

        const gameSection: GameFeedSection = {
          sectionType: "game",
          gameType,
          difficulty,
          index: currentIndex,
          ...(connectionsDaily ? { connectionsDaily: true } : {}),
        };
        setSections((prev) => [...prev, gameSection]);
        sectionCountRef.current += 1;
        return;
      }

      // ── Article section ──────────────────────────────────────────────────────
      const params = new URLSearchParams();
      params.set("sectionIndex", String(currentIndex));
      if (category) params.set("category", category);
      const excludeIds = Array.from(renderedDbArticleIdsRef.current).slice(-400);
      if (excludeIds.length > 0) params.set("excludeIds", excludeIds.join(","));

      const controller = new AbortController();
      const timeoutId = window.setTimeout(
        () => controller.abort(),
        FEED_FETCH_TIMEOUT_MS
      );

      let res: Response;
      try {
        res = await fetch(`/api/feed?${params.toString()}`, {
          signal: controller.signal,
        });
      } finally {
        window.clearTimeout(timeoutId);
      }

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }

      const data: {
        articles: Article[];
        category: string;
        fromCache: boolean;
      } = await res.json();

      setLiveGenerating(!data.fromCache);

      const cleaned = data.articles.map(cleanArticle);
      const uniqueForView = cleaned.filter((article) => {
        const key = articleUniqKey(article);
        if (renderedArticleKeysRef.current.has(key)) return false;
        return true;
      });

      if (uniqueForView.length === 0) {
        reachedEndRef.current = currentIndex > 0;
        if (reachedEndRef.current) {
          if (reachedEndTimeoutIdRef.current) {
            window.clearTimeout(reachedEndTimeoutIdRef.current);
          }
          reachedEndTimeoutIdRef.current = window.setTimeout(() => {
            reachedEndRef.current = false;
            pendingLoadRef.current = false;

            const el = sentinelRef.current;
            if (!el || !feedReadyRef.current) return;

            const rect = el.getBoundingClientRect();
            const vh = window.innerHeight;
            const nearViewport =
              rect.top < vh + SENTINEL_PREFETCH_PX &&
              rect.bottom > -SENTINEL_PREFETCH_PX;

            if (nearViewport) void loadMore();
          }, REACHED_END_COOLDOWN_MS);
        }
        setError(
          currentIndex > 0
            ? "No more stories right now."
            : "No stories available yet — try again in a moment."
        );
        return;
      }

      // Remember the category for the next game slot's word bank
      if (data.category) lastArticleCategoryRef.current = data.category;

      const section: ArticleFeedSection = {
        sectionType: "articles",
        articles: uniqueForView,
        index: currentIndex,
      };

      setSections((prev) => [...prev, section]);
      for (const article of uniqueForView) {
        const key = articleUniqKey(article);
        renderedArticleKeysRef.current.add(key);
        if (
          "id" in article &&
          typeof article.id === "string" &&
          article.id.length > 0
        ) {
          renderedDbArticleIdsRef.current.add(article.id);
        }
      }
      sectionCountRef.current += 1;
    } catch (e: unknown) {
      const aborted = e instanceof Error && e.name === "AbortError";
      const msg = aborted
        ? "Request timed out — the server may still be sourcing stories. Scroll or retry in a moment."
        : e instanceof Error
          ? e.message
          : "Something went wrong.";
      setError(`Could not load stories — ${msg}`);
    } finally {
      loadingRef.current = false;
      setLoading(false);

      const el = sentinelRef.current;
      if (!el || reachedEndRef.current) return;

      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight;
      const nearViewport =
        rect.top < vh + SENTINEL_PREFETCH_PX &&
        rect.bottom > -SENTINEL_PREFETCH_PX;

      if (pendingLoadRef.current || nearViewport) {
        pendingLoadRef.current = false;
        requestAnimationFrame(() => {
          if (loadingRef.current || reachedEndRef.current) return;
          void loadMore();
        });
      } else {
        pendingLoadRef.current = false;
      }
    }
  }, []); // stable — reads everything from refs

  // Resolve game ratio from server (or localStorage), then load — avoids first sections using DEFAULT_GAME_RATIO.
  useEffect(() => {
    if (!mfaPassed) {
      feedReadyRef.current = false;
      setIsFeedReady(false);
      return;
    }

    feedReadyRef.current = false;
    setIsFeedReady(false);

    // Fresh bootstrap for this user/session: reset feed cursors and visible sections.
    setSections([]);
    setError(null);
    setLoading(false);
    loadingRef.current = false;
    reachedEndRef.current = false;
    if (reachedEndTimeoutIdRef.current) {
      window.clearTimeout(reachedEndTimeoutIdRef.current);
      reachedEndTimeoutIdRef.current = null;
    }
    pendingLoadRef.current = false;
    lastLoadStartAtRef.current = 0;
    sectionCountRef.current = 0;
    gameSlotOrdinalRef.current = 0;
    connectionsShownInSessionRef.current = false;
    lastArticleCategoryRef.current = undefined;
    renderedArticleKeysRef.current = new Set();
    renderedDbArticleIdsRef.current = new Set();
    gameRatioRef.current = DEFAULT_GAME_RATIO;

    const gen = ++feedBootstrapGenRef.current;
    let cancelled = false;

    (async () => {
      let usedServerRatio = false;

      try {
        const res = await fetch("/api/user/preferences", {
          credentials: "include",
        });
        if (cancelled || gen !== feedBootstrapGenRef.current) return;

        if (res.ok) {
          const profile = await res.json();
          if (cancelled || gen !== feedBootstrapGenRef.current) return;

          if (
            typeof profile.gameRatio === "number" &&
            !Number.isNaN(profile.gameRatio)
          ) {
            const r = Math.min(1, Math.max(0, profile.gameRatio));
            gameRatioRef.current = r;
            localStorage.setItem("gentle_stream_game_ratio", String(r));
            usedServerRatio = true;
          }
        }
      } catch {
        /* offline or unauthenticated preview */
      }

      if (cancelled || gen !== feedBootstrapGenRef.current) return;

      if (!usedServerRatio) {
        const storedRatio = localStorage.getItem("gentle_stream_game_ratio");
        if (storedRatio !== null) {
          const ratio = parseFloat(storedRatio);
          if (!Number.isNaN(ratio)) {
            gameRatioRef.current = Math.min(1, Math.max(0, ratio));
          }
        }
      }

      let completedConnectionsToday = false;
      try {
        const cdRes = await fetch("/api/user/connections-daily", {
          credentials: "include",
        });
        if (cdRes.ok) {
          const cd = (await cdRes.json()) as { completedToday?: boolean };
          if (cd.completedToday === true) completedConnectionsToday = true;
        }
      } catch {
        /* offline */
      }
      if (!completedConnectionsToday) {
        try {
          const dayKey = new Date().toISOString().slice(0, 10);
          if (
            localStorage.getItem(`gentle_stream_connections_done_${dayKey}`) ===
            "1"
          ) {
            completedConnectionsToday = true;
          }
        } catch {
          /* ignore */
        }
      }
      connectionsCompletedTodayRef.current = completedConnectionsToday;

      if (cancelled || gen !== feedBootstrapGenRef.current) return;

      feedReadyRef.current = true;
      setIsFeedReady(true);
      void loadMore();
    })();

    return () => {
      cancelled = true;
    };
  }, [userId, mfaPassed, loadMore]);

  useEffect(() => {
    setMfaPassed(userId === "dev-local");
  }, [userId]);

  useEffect(() => {
    function onConnectionsCompleted() {
      connectionsCompletedTodayRef.current = true;
    }
    window.addEventListener(
      "gentle-stream-connections-completed",
      onConnectionsCompleted
    );
    return () =>
      window.removeEventListener(
        "gentle-stream-connections-completed",
        onConnectionsCompleted
      );
  }, []);

  // Keep activeCategoryRef in sync
  useEffect(() => {
    activeCategoryRef.current = activeCategory;
  }, [activeCategory]);

  // Re-attach when sections change so layout updates don't leave the sentinel unobserved
  useEffect(() => {
    if (!isFeedReady) return;
    const el = sentinelRef.current;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        if (loadingRef.current) pendingLoadRef.current = true;
        else void loadMore();
      },
      { threshold: 0, rootMargin: `0px 0px ${SENTINEL_PREFETCH_PX}px 0px` }
    );
    observerRef.current = io;
    if (el) io.observe(el);
    return () => io.disconnect();
  }, [isFeedReady, loadMore]);

  useEffect(() => {
    return () => {
      if (reachedEndTimeoutIdRef.current) {
        window.clearTimeout(reachedEndTimeoutIdRef.current);
        reachedEndTimeoutIdRef.current = null;
      }
    };
  }, []);

  const handleCategorySelect = (cat: Category) => {
    const next = activeCategory === cat ? null : cat;
    setActiveCategory(next);
    activeCategoryRef.current = next;
    reachedEndRef.current = false;
    if (reachedEndTimeoutIdRef.current) {
      window.clearTimeout(reachedEndTimeoutIdRef.current);
      reachedEndTimeoutIdRef.current = null;
    }
    pendingLoadRef.current = false;
    setSections((prev) => {
      const hadConnections = prev.some(
        (s) =>
          s.sectionType === "game" &&
          s.gameType === "connections" &&
          s.connectionsDaily === true
      );
      if (!hadConnections) connectionsShownInSessionRef.current = false;
      return [];
    });
    sectionCountRef.current = 0;
    loadingRef.current = false;
    setLoading(false);
    lastArticleCategoryRef.current = undefined;
    renderedArticleKeysRef.current = new Set();
    renderedDbArticleIdsRef.current = new Set();
    loadMore(next);
  };

  const handleGameRatioSaved = useCallback(
    (ratio: number) => {
      gameRatioRef.current = ratio;
      localStorage.setItem("gentle_stream_game_ratio", String(ratio));
      reachedEndRef.current = false;
      if (reachedEndTimeoutIdRef.current) {
        window.clearTimeout(reachedEndTimeoutIdRef.current);
        reachedEndTimeoutIdRef.current = null;
      }
      pendingLoadRef.current = false;
      setSections([]);
      sectionCountRef.current = 0;
      gameSlotOrdinalRef.current = 0;
      connectionsShownInSessionRef.current = false;
      loadingRef.current = false;
      setError(null);
      renderedArticleKeysRef.current = new Set();
      renderedDbArticleIdsRef.current = new Set();
      void loadMore();
    },
    [loadMore]
  );

  if (!mfaPassed) {
    return <MfaChallengeGate onPassed={() => setMfaPassed(true)} />;
  }

  return (
    <div style={{ background: "#ede9e1", minHeight: "100vh" }}>
      <Masthead
        accountSlot={
          userEmail ? (
            <ProfileMenu
              userEmail={userEmail}
              onGameRatioSaved={handleGameRatioSaved}
              isAdmin={isAdmin}
            />
          ) : undefined
        }
      />
      <CategoryDrawer
        selected={activeCategory}
        onSelect={handleCategorySelect}
        topOffsetPx={MASTHEAD_TOP_BAR_HEIGHT_PX}
      />

      {liveGenerating && (
        <div
          style={{
            background: "#fdf6e3",
            borderBottom: "1px solid #e8d9a0",
            padding: "0.5rem 1.5rem",
            textAlign: "center",
            fontFamily: "'IM Fell English', Georgia, serif",
            fontStyle: "italic",
            fontSize: "0.78rem",
            color: "#7a6a30",
            maxWidth: "1200px",
            margin: "0 auto",
          }}
        >
          Freshly sourced — our editors are searching the world for your
          stories&hellip;
        </div>
      )}

      <main
        style={{
          maxWidth: "1200px",
          margin: "0 auto",
          background: "#faf8f3",
          boxShadow: "0 0 60px rgba(0,0,0,0.13)",
        }}
      >
        {sections.length === 0 && !loading && !error && (
          <div
            style={{
              padding: "6rem 2rem",
              textAlign: "center",
              fontFamily: "'IM Fell English', Georgia, serif",
              color: "#aaa",
              fontSize: "1.05rem",
              fontStyle: "italic",
            }}
          >
            Loading today&apos;s stream&hellip;
          </div>
        )}

        {sections.map((section) => {
          if (section.sectionType === "game") {
            return (
              <GameSlot
                key={`game-${section.index}`}
                gameType={section.gameType}
                difficulty={section.difficulty}
                connectionsDaily={section.connectionsDaily === true}
              />
            );
          }
          return (
            <NewsSection
              key={`news-${section.index}`}
              articles={section.articles}
              sectionIndex={section.index}
            />
          );
        })}

        {error && (
          <ErrorBanner
            message={error}
            onRetry={() => {
              reachedEndRef.current = false;
              if (reachedEndTimeoutIdRef.current) {
                window.clearTimeout(reachedEndTimeoutIdRef.current);
                reachedEndTimeoutIdRef.current = null;
              }
              pendingLoadRef.current = false;
              void loadMore();
            }}
          />
        )}

        {/* Sentinel — observed directly. Kept before the loading UI so it doesn't shift while loading. */}
        <div ref={sentinelRef} style={{ height: "1px" }} />
        {loading && <LoadingSection />}

        <footer
          style={{
            padding: "2rem",
            textAlign: "center",
            borderTop: "3px double #1a1a1a",
            fontFamily: "'IM Fell English', Georgia, serif",
            fontSize: "0.73rem",
            color: "#999",
            letterSpacing: "0.05em",
          }}
        >
          &copy; Gentle Stream &nbsp;&middot;&nbsp; Powered by AI
          &nbsp;&middot;&nbsp; Only the uplifting, only the inspiring
        </footer>
      </main>
    </div>
  );
}
