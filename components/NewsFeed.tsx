"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Masthead from "./Masthead";
import { UserAccountMenu } from "./user/UserAccountMenu";
import CategoryBar from "./CategoryBar";
import NewsSection from "./NewsSection";
import GameSlot from "./games/GameSlot";
import LoadingSection from "./LoadingSection";
import ErrorBanner from "./ErrorBanner";
import type { Category } from "@/lib/constants";
import type { Article, FeedSection, ArticleFeedSection, GameFeedSection } from "@/lib/types";
import { DEFAULT_GAME_RATIO } from "@/lib/constants";
import { randomFeedGamePick } from "@/lib/games/feedPick";

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

export interface NewsFeedProps {
  /** Stable id from Supabase `auth.users` — used for ranking, seen state, future metrics. */
  userId: string;
  userEmail?: string | null;
}

export default function NewsFeed({ userId, userEmail }: NewsFeedProps) {
  const [sections, setSections] = useState<FeedSection[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<Category | null>(null);
  const [liveGenerating, setLiveGenerating] = useState(false);

  // Use refs for values that loadMore closes over — avoids stale closure bugs
  const loadingRef = useRef(false);
  const sectionCountRef = useRef(0);
  const activeCategoryRef = useRef<Category | null>(null);
  const userIdRef = useRef<string>("anonymous");
  const isFirstLoad = useRef(true);
  const gameRatioRef = useRef(DEFAULT_GAME_RATIO);
  // Track the last article category so game slots can use a matching word bank
  const lastArticleCategoryRef = useRef<string | undefined>(undefined);

  // Sentinel ref — plain IntersectionObserver (no library dependency on stale state)
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    userIdRef.current = userId;

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/user/preferences", {
          credentials: "include",
        });
        if (res.ok) {
          const profile = await res.json();
          if (cancelled) return;
          if (
            typeof profile.gameRatio === "number" &&
            !Number.isNaN(profile.gameRatio)
          ) {
            const r = Math.min(1, Math.max(0, profile.gameRatio));
            gameRatioRef.current = r;
            localStorage.setItem("gentle_stream_game_ratio", String(r));
          }
          return;
        }
      } catch {
        /* offline or unauthenticated preview */
      }
      if (cancelled) return;
      const storedRatio = localStorage.getItem("gentle_stream_game_ratio");
      if (storedRatio !== null) {
        const ratio = parseFloat(storedRatio);
        if (!isNaN(ratio)) gameRatioRef.current = ratio;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  const loadMore = useCallback(async (overrideCategory?: Category | null) => {
    if (loadingRef.current) return;

    loadingRef.current = true;
    setLoading(true);
    setError(null);

    const category =
      overrideCategory !== undefined
        ? overrideCategory
        : activeCategoryRef.current;

    const currentIndex = sectionCountRef.current;

    // ── Decide: game slot or article section? ────────────────────────────────
    if (shouldBeGame(currentIndex, gameRatioRef.current)) {
      const { gameType, difficulty } = randomFeedGamePick();
      const gameSection: GameFeedSection = {
        sectionType: "game",
        gameType,
        difficulty,
        index: currentIndex,
        // Pass the last seen article category for word bank theming
        category: lastArticleCategoryRef.current,
      };
      setSections((prev) => [...prev, gameSection]);
      sectionCountRef.current += 1;
      loadingRef.current = false;
      setLoading(false);
      return;
    }

    // ── Article section ──────────────────────────────────────────────────────
    try {
      const params = new URLSearchParams();
      params.set("userId", userIdRef.current);
      params.set("sectionIndex", String(currentIndex));
      if (category) params.set("category", category);

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

      if (cleaned.length === 0) {
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
        articles: cleaned,
        index: currentIndex,
      };

      setSections((prev) => [...prev, section]);
      sectionCountRef.current += 1;

      // IntersectionObserver only fires on visibility *changes*. If the sentinel
      // stayed in the viewport while we loaded, it won't fire again — queue another
      // fetch when there's still room below (infinite scroll).
      if (cleaned.length > 0) {
        requestAnimationFrame(() => {
          const el = sentinelRef.current;
          if (!el || loadingRef.current) return;
          const margin = 280;
          const rect = el.getBoundingClientRect();
          const vh = window.innerHeight;
          const isNearViewport =
            rect.top < vh + margin && rect.bottom > -margin;
          if (isNearViewport) void loadMore();
        });
      }
    } catch (e: unknown) {
      const aborted =
        e instanceof Error && e.name === "AbortError";
      const msg = aborted
        ? "Request timed out — the server may still be sourcing stories. Scroll or retry in a moment."
        : e instanceof Error
          ? e.message
          : "Something went wrong.";
      setError(`Could not load stories — ${msg}`);
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, []); // stable — reads everything from refs

  // Initial load
  useEffect(() => {
    if (isFirstLoad.current) {
      isFirstLoad.current = false;
      loadMore();
    }
  }, [loadMore]);

  // Keep activeCategoryRef in sync
  useEffect(() => {
    activeCategoryRef.current = activeCategory;
  }, [activeCategory]);

  // Re-attach when sections change so layout updates don't leave the sentinel unobserved
  useEffect(() => {
    const el = sentinelRef.current;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !loadingRef.current) {
          void loadMore();
        }
      },
      { threshold: 0, rootMargin: "280px" }
    );
    observerRef.current = io;
    if (el) io.observe(el);
    return () => io.disconnect();
  }, [sections.length, loadMore]);

  const handleCategorySelect = (cat: Category) => {
    const next = activeCategory === cat ? null : cat;
    setActiveCategory(next);
    activeCategoryRef.current = next;
    setSections([]);
    sectionCountRef.current = 0;
    loadingRef.current = false;
    setLoading(false);
    lastArticleCategoryRef.current = undefined;
    loadMore(next);
  };

  const handleGameRatioSaved = useCallback(
    (ratio: number) => {
      gameRatioRef.current = ratio;
      localStorage.setItem("gentle_stream_game_ratio", String(ratio));
      setSections([]);
      sectionCountRef.current = 0;
      loadingRef.current = false;
      setError(null);
      void loadMore();
    },
    [loadMore]
  );

  return (
    <div style={{ background: "#ede9e1", minHeight: "100vh" }}>
      <Masthead
        accountSlot={
          userEmail ? (
            <UserAccountMenu
              userEmail={userEmail}
              onGameRatioSaved={handleGameRatioSaved}
            />
          ) : undefined
        }
      />
      <CategoryBar selected={activeCategory} onSelect={handleCategorySelect} />

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
                category={section.category}
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

        {error && <ErrorBanner message={error} onRetry={() => loadMore()} />}
        {loading && <LoadingSection />}

        {/* Sentinel — observed directly, not via library */}
        <div ref={sentinelRef} style={{ height: "1px" }} />

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
