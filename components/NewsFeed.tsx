"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useInView } from "react-intersection-observer";
import Masthead from "./Masthead";
import CategoryBar from "./CategoryBar";
import NewsSection from "./NewsSection";
import LoadingSection from "./LoadingSection";
import ErrorBanner from "./ErrorBanner";
import type { Category } from "@/lib/constants";
import type { Article, NewsSection as NewsSectionType } from "@/lib/types";

// ── Lightweight anonymous user ID persisted in localStorage ──────────────────
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

export default function NewsFeed() {
  const [sections, setSections] = useState<NewsSectionType[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<Category | null>(null);
  const [liveGenerating, setLiveGenerating] = useState(false);

  const sectionCount = useRef(0);
  const isFirstLoad = useRef(true);
  const userId = useRef<string>("anonymous");

  // Resolve userId on mount (client-side only)
  useEffect(() => {
    userId.current = getOrCreateUserId();
  }, []);

  // Sentinel element at the bottom of the feed
  const { ref: sentinelRef, inView } = useInView({
    threshold: 0.1,
    initialInView: false,
  });

  const loadMore = useCallback(
    async (overrideCategory?: Category | null) => {
      if (loading) return;
      setLoading(true);
      setError(null);

      const category =
        overrideCategory !== undefined ? overrideCategory : activeCategory;

      try {
        const params = new URLSearchParams();
        params.set("userId", userId.current);
        params.set("sectionIndex", String(sectionCount.current));
        if (category) params.set("category", category);

        const res = await fetch(`/api/feed?${params.toString()}`);
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `HTTP ${res.status}`);
        }

        const data: {
          articles: Article[];
          category: string;
          fromCache: boolean;
        } = await res.json();

        // Let the user know if we had to generate live (stock was empty)
        setLiveGenerating(!data.fromCache);

        setSections((prev) => [
          ...prev,
          { articles: data.articles, index: sectionCount.current },
        ]);
        sectionCount.current += 1;
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Something went wrong.";
        setError(`Could not load stories — ${msg}`);
      } finally {
        setLoading(false);
      }
    },
    [loading, activeCategory]
  );

  // Initial load
  useEffect(() => {
    if (isFirstLoad.current) {
      isFirstLoad.current = false;
      loadMore();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Infinite scroll
  useEffect(() => {
    if (inView && !loading && !error) {
      loadMore();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inView]);

  const handleCategorySelect = (cat: Category) => {
    const next = activeCategory === cat ? null : cat;
    setActiveCategory(next);
    setSections([]);
    sectionCount.current = 0;
    setLoading(false);
    setTimeout(() => loadMore(next), 0);
  };

  return (
    <div style={{ background: "#ede9e1", minHeight: "100vh" }}>
      <Masthead />
      <CategoryBar selected={activeCategory} onSelect={handleCategorySelect} />

      {/* Live-generation notice — shown when DB stock was empty */}
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
          Freshly sourced — our editors are searching the world for your stories&hellip;
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
        {/* Empty state */}
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
            Scroll down to load today&apos;s uplifting stories&hellip;
          </div>
        )}

        {/* Rendered sections */}
        {sections.map((section) => (
          <NewsSection
            key={section.index}
            articles={section.articles}
            sectionIndex={section.index}
          />
        ))}

        {/* Error state */}
        {error && <ErrorBanner message={error} onRetry={() => loadMore()} />}

        {/* Loading spinner */}
        {loading && <LoadingSection />}

        {/* Invisible sentinel for IntersectionObserver */}
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
