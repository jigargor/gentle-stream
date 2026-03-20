"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Masthead from "./Masthead";
import CategoryBar from "./CategoryBar";
import NewsSection from "./NewsSection";
import LoadingSection from "./LoadingSection";
import ErrorBanner from "./ErrorBanner";
import type { Category } from "@/lib/constants";
import type { Article, NewsSection as NewsSectionType } from "@/lib/types";

function getOrCreateUserId(): string {
  if (typeof window === "undefined") return "anonymous";
  const key = "gnd_user_id";
  let id = localStorage.getItem(key);
  if (!id) {
    id = `anon_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    localStorage.setItem(key, id);
  }
  return id;
}

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

const FEED_FETCH_TIMEOUT_MS = 90_000;

export default function NewsFeed() {
  const [sections, setSections] = useState<NewsSectionType[]>([]);
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

  // Sentinel ref — plain IntersectionObserver (no library dependency on stale state)
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    userIdRef.current = getOrCreateUserId();
  }, []);

  const loadMore = useCallback(async (overrideCategory?: Category | null) => {
    if (loadingRef.current) return;

    loadingRef.current = true;
    setLoading(true);
    setError(null);

    const category =
      overrideCategory !== undefined
        ? overrideCategory
        : activeCategoryRef.current;

    try {
      const params = new URLSearchParams();
      params.set("userId", userIdRef.current);
      params.set("sectionIndex", String(sectionCountRef.current));
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
          sectionCountRef.current > 0
            ? "No more stories right now."
            : "No stories available yet — try again in a moment."
        );
        return;
      }

      setSections((prev) => [
        ...prev,
        { articles: cleaned, index: sectionCountRef.current },
      ]);
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

  // Re-attach when sections change so layout updates don’t leave the sentinel unobserved
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
    loadMore(next);
  };

  return (
    <div style={{ background: "#ede9e1", minHeight: "100vh" }}>
      <Masthead />
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
            Loading today&apos;s uplifting stories&hellip;
          </div>
        )}

        {sections.map((section) => (
          <NewsSection
            key={section.index}
            articles={section.articles}
            sectionIndex={section.index}
          />
        ))}

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
          &copy; The Good News Daily &nbsp;&middot;&nbsp; Powered by AI
          &nbsp;&middot;&nbsp; Only the uplifting, only the inspiring
        </footer>
      </main>
    </div>
  );
}
