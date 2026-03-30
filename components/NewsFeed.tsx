"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Masthead, { MASTHEAD_TOP_BAR_HEIGHT_PX } from "./Masthead";
import { ProfileMenu } from "./user/ProfileMenu";
import CategoryDrawer from "./CategoryDrawer";
import { MfaChallengeGate } from "./auth/mfa/MfaChallengeGate";
import NewsSection from "./NewsSection";
import GameSlot from "./games/GameSlot";
import WeatherFillerCard from "./feed/WeatherFillerCard";
import SpotifyMoodTile from "./feed/SpotifyMoodTile";
import TodoFillerCard from "./feed/TodoFillerCard";
import GeneratedArtModuleCard from "./feed/GeneratedArtModuleCard";
import NasaApodCard from "./feed/NasaApodCard";
import LoadingSection from "./LoadingSection";
import ErrorBanner from "./ErrorBanner";
import type { Category } from "@/lib/constants";
import type {
  Article,
  ArticleContentKind,
  FeedSection,
  ArticleFeedSection,
  GameFeedSection,
  ModuleFeedSection,
  FeedModuleData,
  GeneratedImageModuleData,
  NasaModuleData,
  WeatherModuleData,
  SpotifyMoodTileData,
  TodoModuleData,
} from "@/lib/types";
import { DEFAULT_GAME_RATIO } from "@/lib/constants";
import { feedGamePickForOrdinal } from "@/lib/games/feedPick";
import type { GameType } from "@/lib/games/types";
import { chooseNewspaperLayout } from "@/lib/feed/newspaperLayout";
import {
  buildGeneratedImageModuleData,
  chooseGapIntervalModuleType,
  chooseInlineModuleType,
} from "@/lib/feed/modules/policy";

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
const FEED_CACHE_TTL_MS = 35_000;
const FEED_STALE_TTL_MS = 120_000;
const DEFAULT_GAP_MIN_PX = 180;
const DEFAULT_INLINE_GAP_MIN_PX = 140;
const DEFAULT_FILLER_INTERVAL = 4;
const DEFAULT_TODO_WEIGHT = 2;
/** Article sections completed before we insert each cached singleton row (not at top of feed). */
const SINGLETON_AFTER_ARTICLE_COUNT_WEATHER = 2;
const SINGLETON_AFTER_ARTICLE_COUNT_SPOTIFY = 5;
const SINGLETON_AFTER_ARTICLE_COUNT_NASA = 8;
type FeedKindFilter = "all" | ArticleContentKind;

interface SingletonFeedCache {
  weather: WeatherModuleData | null;
  spotify: SpotifyMoodTileData | null;
  nasa: NasaModuleData | null;
}

interface FeedApiResponse {
  articles: Article[];
  category: string;
  fromCache: boolean;
  coldStartQueued?: boolean;
  coldStartCategory?: string;
}

interface FeedCacheEntry {
  data: FeedApiResponse;
  cachedAtMs: number;
}

function readTruthyFlag(input: string | undefined, defaultValue: boolean): boolean {
  if (input == null) return defaultValue;
  const value = input.trim().toLowerCase();
  if (value === "1" || value === "true" || value === "yes" || value === "on") return true;
  if (value === "0" || value === "false" || value === "no" || value === "off") return false;
  return defaultValue;
}

function readPositiveInt(input: string | undefined, defaultValue: number): number {
  if (!input) return defaultValue;
  const parsed = Number.parseInt(input, 10);
  if (Number.isNaN(parsed) || parsed <= 0) return defaultValue;
  return parsed;
}

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
  const [activeKindFilter, setActiveKindFilter] = useState<FeedKindFilter>("all");
  const [searchInput, setSearchInput] = useState("");
  const [activeSearchQuery, setActiveSearchQuery] = useState("");
  const [liveGenerating, setLiveGenerating] = useState(false);
  const [themePreference, setThemePreference] = useState<"light" | "dark">("light");
  /** True once game ratio is resolved for the current session/user bootstrap. */
  const [isFeedReady, setIsFeedReady] = useState(false);
  const [showScrollTopButton, setShowScrollTopButton] = useState(false);

  // Use refs for values that loadMore closes over — avoids stale closure bugs
  const loadingRef = useRef(false);
  const sectionCountRef = useRef(0);
  /** Counts game sections only — drives fair rotation in feedGamePickForOrdinal. */
  const gameSlotOrdinalRef = useRef(0);
  const activeCategoryRef = useRef<Category | null>(null);
  const activeKindFilterRef = useRef<FeedKindFilter>("all");
  const activeSearchQueryRef = useRef("");
  /** Bumps on each [userId] bootstrap so Strict Mode / fast remounts only run one initial loadMore. */
  const feedBootstrapGenRef = useRef(0);
  const gameRatioRef = useRef(DEFAULT_GAME_RATIO);
  const enabledGameTypesRef = useRef<GameType[] | null>(null);
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
  const minGapRetryTimeoutIdRef = useRef<number | null>(null);
  const articleSectionsRenderedRef = useRef(0);
  /** Weather / Spotify / NASA for scroll feed — fetched once per user session; placement resets on feed refresh. */
  const singletonFeedCacheRef = useRef<SingletonFeedCache>({
    weather: null,
    spotify: null,
    nasa: null,
  });
  const singletonPrefetchedRef = useRef(false);
  const singletonPrefetchPromiseRef = useRef<Promise<void> | null>(null);
  const singletonPlacedRef = useRef({
    weather: false,
    spotify: false,
    nasa: false,
  });
  const fillerMetricsRef = useRef({
    gapDetected: 0,
    moduleInserted: 0,
    todoInserted: 0,
    artInserted: 0,
  });
  const browserGeoRef = useRef<{ lat: number; lon: number } | null>(null);
  const browserGeoAttemptedRef = useRef(false);
  const preferredWeatherLocationRef = useRef<string | null>(null);
  const feedCacheRef = useRef<Map<string, FeedCacheEntry>>(new Map());
  const feedInFlightRef = useRef<Map<string, Promise<FeedApiResponse>>>(new Map());

  const fillerEnabled = readTruthyFlag(
    process.env.NEXT_PUBLIC_FEED_GAP_FILL_ENABLED,
    true
  );
  const betweenGapMinPx = readPositiveInt(
    process.env.NEXT_PUBLIC_FEED_BETWEEN_GAP_MIN_PX ??
      process.env.NEXT_PUBLIC_FEED_GAP_MIN_PX,
    DEFAULT_GAP_MIN_PX
  );
  const inlineGapMinPx = readPositiveInt(
    process.env.NEXT_PUBLIC_FEED_INLINE_GAP_MIN_PX,
    DEFAULT_INLINE_GAP_MIN_PX
  );
  const inlineModulesEnabled = readTruthyFlag(
    process.env.NEXT_PUBLIC_FEED_INLINE_MODULES_ENABLED,
    true
  );
  const fillerInterval = readPositiveInt(
    process.env.NEXT_PUBLIC_FEED_FILLER_INTERVAL,
    DEFAULT_FILLER_INTERVAL
  );
  const todoWeight = readPositiveInt(
    process.env.NEXT_PUBLIC_TODO_MODULE_WEIGHT,
    DEFAULT_TODO_WEIGHT
  );
  const todoModuleEnabled = readTruthyFlag(
    process.env.NEXT_PUBLIC_TODO_MODULE_ENABLED,
    true
  );

  // Sentinel ref — plain IntersectionObserver (no library dependency on stale state)
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  const resolveBrowserGeo = useCallback(async (): Promise<{ lat: number; lon: number } | null> => {
    if (browserGeoRef.current) return browserGeoRef.current;
    try {
      const stored = localStorage.getItem("gentle_stream_browser_geo");
      if (stored) {
        const parsed = JSON.parse(stored) as { lat?: unknown; lon?: unknown };
        if (typeof parsed.lat === "number" && typeof parsed.lon === "number") {
          browserGeoRef.current = { lat: parsed.lat, lon: parsed.lon };
          return browserGeoRef.current;
        }
      }
    } catch {
      /* ignore malformed cache */
    }

    if (browserGeoAttemptedRef.current) return null;
    browserGeoAttemptedRef.current = true;
    if (typeof navigator === "undefined" || !navigator.geolocation) return null;

    return await new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const coords = {
            lat: position.coords.latitude,
            lon: position.coords.longitude,
          };
          browserGeoRef.current = coords;
          try {
            localStorage.setItem("gentle_stream_browser_geo", JSON.stringify(coords));
          } catch {
            /* ignore storage write failures */
          }
          resolve(coords);
        },
        () => resolve(null),
        {
          enableHighAccuracy: false,
          timeout: 5_000,
          maximumAge: 15 * 60 * 1000,
        }
      );
    });
  }, []);

  const fetchModuleData = useCallback(
    async (input: {
      moduleType: "weather" | "spotify" | "generated_art" | "nasa" | "todo";
      category?: string;
      location?: string;
    }): Promise<FeedModuleData | null> => {
      if (input.moduleType === "nasa") {
        try {
          const res = await fetch("/api/feed/modules/apod", { cache: "no-store" });
          if (!res.ok) return null;
          const body = (await res.json()) as { data?: FeedModuleData };
          return body.data ?? null;
        } catch {
          return null;
        }
      }
      if (input.moduleType === "generated_art") {
        return buildGeneratedImageModuleData({
          category: input.category,
          location: input.location,
        });
      }
      if (input.moduleType === "todo") {
        try {
          const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
          const res = await fetch(
            `/api/feed/modules/todo?timezone=${encodeURIComponent(timezone)}`,
            {
              cache: "no-store",
              credentials: "include",
            }
          );
          if (!res.ok) return null;
          const body = (await res.json()) as { data?: TodoModuleData };
          return body.data ?? null;
        } catch {
          return null;
        }
      }
      try {
        const params = new URLSearchParams();
        if (input.category) params.set("category", input.category);
        const preferredLocation = preferredWeatherLocationRef.current?.trim();
        const effectiveLocation = preferredLocation || input.location;
        if (effectiveLocation) params.set("location", effectiveLocation);
        if (input.moduleType === "weather" && !effectiveLocation) {
          const browserCoords = await resolveBrowserGeo();
          if (browserCoords) {
            params.set("lat", String(browserCoords.lat));
            params.set("lon", String(browserCoords.lon));
          }
        }
        const path =
          input.moduleType === "spotify"
            ? "/api/feed/modules/spotify"
            : "/api/feed/modules/weather";
        const res = await fetch(`${path}?${params.toString()}`, {
          cache: "no-store",
        });
        if (!res.ok) return null;
        const body = (await res.json()) as { data?: FeedModuleData };
        if (!body.data) return null;
        // Avoid placing fallback-only spotify tiles in feed automatically.
        if (
          input.moduleType === "spotify" &&
          (body.data as SpotifyMoodTileData).mode === "fallback"
        ) {
          return null;
        }
        return body.data;
      } catch {
        return null;
      }
    },
    [resolveBrowserGeo]
  );

  const fetchModuleSection = useCallback(
    async (input: {
      index: number;
      reason: "gap" | "interval" | "singleton";
      category?: string;
      location?: string;
      moduleType: "weather" | "spotify" | "generated_art" | "nasa" | "todo";
    }): Promise<ModuleFeedSection | null> => {
      const data = await fetchModuleData({
        moduleType: input.moduleType,
        category: input.category,
        location: input.location,
      });
      if (!data) return null;
      return {
        sectionType: "module",
        moduleType: input.moduleType,
        fillerType: input.moduleType,
        reason: input.reason,
        index: input.index,
        data,
      };
    },
    [fetchModuleData]
  );

  /** One parallel fetch for weather, Spotify, NASA — runs once per session (see bootstrap); not repeated on category/filter resets. */
  const ensureSingletonFeedCached = useCallback(async () => {
    if (singletonPrefetchedRef.current) return;
    if (singletonPrefetchPromiseRef.current) {
      await singletonPrefetchPromiseRef.current;
      return;
    }
    const category = activeCategoryRef.current ?? undefined;
    const p = (async () => {
      const [w, s, n] = await Promise.all([
        fetchModuleData({ moduleType: "weather", category }),
        fetchModuleData({ moduleType: "spotify", category }),
        fetchModuleData({ moduleType: "nasa" }),
      ]);
      singletonFeedCacheRef.current = {
        weather: w as WeatherModuleData | null,
        spotify: s as SpotifyMoodTileData | null,
        nasa: n as NasaModuleData | null,
      };
      singletonPrefetchedRef.current = true;
    })();
    singletonPrefetchPromiseRef.current = p.then(() => {
      singletonPrefetchPromiseRef.current = null;
    });
    await p;
  }, [fetchModuleData]);

  const readCachedFeedResponse = useCallback((cacheKey: string): {
    data: FeedApiResponse;
    isFresh: boolean;
  } | null => {
    const entry = feedCacheRef.current.get(cacheKey);
    if (!entry) return null;
    const ageMs = Date.now() - entry.cachedAtMs;
    if (ageMs > FEED_STALE_TTL_MS) {
      feedCacheRef.current.delete(cacheKey);
      return null;
    }
    return {
      data: entry.data,
      isFresh: ageMs <= FEED_CACHE_TTL_MS,
    };
  }, []);

  const fetchFeedResponse = useCallback(
    async (params: URLSearchParams, signal: AbortSignal): Promise<FeedApiResponse> => {
      const query = params.toString();
      const url = `/api/feed?${query}`;
      const cacheKey = `feed:${query}`;
      const cached = readCachedFeedResponse(cacheKey);
      if (cached?.isFresh) return cached.data;
      if (cached && !cached.isFresh && !feedInFlightRef.current.has(cacheKey)) {
        // Stale-while-revalidate: serve stale immediately and refresh in the background.
        const revalidatePromise = fetch(url, { cache: "no-store" })
          .then(async (res) => {
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const next = (await res.json()) as FeedApiResponse;
            feedCacheRef.current.set(cacheKey, {
              data: next,
              cachedAtMs: Date.now(),
            });
            return next;
          })
          .catch(() => cached.data)
          .finally(() => {
            feedInFlightRef.current.delete(cacheKey);
          });
        feedInFlightRef.current.set(cacheKey, revalidatePromise);
        return cached.data;
      }

      const existing = feedInFlightRef.current.get(cacheKey);
      if (existing) return existing;

      const requestPromise = fetch(url, { signal, cache: "no-store" })
        .then(async (res) => {
          if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            throw new Error(body.error || `HTTP ${res.status}`);
          }
          const data = (await res.json()) as FeedApiResponse;
          feedCacheRef.current.set(cacheKey, {
            data,
            cachedAtMs: Date.now(),
          });
          return data;
        })
        .finally(() => {
          feedInFlightRef.current.delete(cacheKey);
        });
      feedInFlightRef.current.set(cacheKey, requestPromise);
      return requestPromise;
    },
    [readCachedFeedResponse]
  );

  const loadMore = useCallback(async (overrideCategory?: Category | null) => {
    if (!feedReadyRef.current) return;
    if (reachedEndRef.current) return;
    if (loadingRef.current) {
      pendingLoadRef.current = true;
      return;
    }

    const now = Date.now();
    const gapMs = now - lastLoadStartAtRef.current;
    if (gapMs < MIN_LOAD_GAP_MS) {
      pendingLoadRef.current = true;
      if (minGapRetryTimeoutIdRef.current != null) return;
      const waitMs = Math.max(MIN_LOAD_GAP_MS - gapMs + 25, 25);
      minGapRetryTimeoutIdRef.current = window.setTimeout(() => {
        minGapRetryTimeoutIdRef.current = null;
        if (loadingRef.current || reachedEndRef.current || !feedReadyRef.current) return;
        void loadMore(overrideCategory);
      }, waitMs);
      return;
    }
    lastLoadStartAtRef.current = now;

    loadingRef.current = true;
    setLoading(true);
    setError(null);

    const category =
      overrideCategory !== undefined
        ? overrideCategory
        : activeCategoryRef.current;
    const kindFilter = activeKindFilterRef.current;
    const searchQuery = activeSearchQueryRef.current.trim();

    const currentIndex = sectionCountRef.current;

    try {
      // ── Sprinkle cached singleton modules (one fetch per session; Profile menu can refetch separately) ──
      if (searchQuery.length < 2) {
        const ar = articleSectionsRenderedRef.current;
        const needPrefetch =
          !singletonPrefetchedRef.current &&
          ((ar === SINGLETON_AFTER_ARTICLE_COUNT_WEATHER &&
            !singletonPlacedRef.current.weather) ||
            (ar === SINGLETON_AFTER_ARTICLE_COUNT_SPOTIFY &&
              !singletonPlacedRef.current.spotify) ||
            (ar === SINGLETON_AFTER_ARTICLE_COUNT_NASA && !singletonPlacedRef.current.nasa));
        if (needPrefetch) await ensureSingletonFeedCached();
        const cache = singletonFeedCacheRef.current;
        if (ar === SINGLETON_AFTER_ARTICLE_COUNT_WEATHER && !singletonPlacedRef.current.weather) {
          singletonPlacedRef.current.weather = true;
          if (cache.weather) {
            const mod: ModuleFeedSection = {
              sectionType: "module",
              moduleType: "weather",
              fillerType: "weather",
              reason: "singleton",
              index: currentIndex,
              data: cache.weather,
            };
            setSections((prev) => [...prev, mod]);
            sectionCountRef.current += 1;
            return;
          }
        }
        if (ar === SINGLETON_AFTER_ARTICLE_COUNT_SPOTIFY && !singletonPlacedRef.current.spotify) {
          singletonPlacedRef.current.spotify = true;
          if (cache.spotify) {
            const mod: ModuleFeedSection = {
              sectionType: "module",
              moduleType: "spotify",
              fillerType: "spotify",
              reason: "singleton",
              index: currentIndex,
              data: cache.spotify,
            };
            setSections((prev) => [...prev, mod]);
            sectionCountRef.current += 1;
            return;
          }
        }
        if (ar === SINGLETON_AFTER_ARTICLE_COUNT_NASA && !singletonPlacedRef.current.nasa) {
          singletonPlacedRef.current.nasa = true;
          if (cache.nasa) {
            const mod: ModuleFeedSection = {
              sectionType: "module",
              moduleType: "nasa",
              fillerType: "nasa",
              reason: "singleton",
              index: currentIndex,
              data: cache.nasa,
            };
            setSections((prev) => [...prev, mod]);
            sectionCountRef.current += 1;
            return;
          }
        }
      }

      // ── Decide: game slot or article section? ────────────────────────────────
      if (shouldBeGame(currentIndex, gameRatioRef.current)) {
        let gameType: GameFeedSection["gameType"];
        let difficulty: GameFeedSection["difficulty"];
        const enabled = enabledGameTypesRef.current ?? [];
        const pick = feedGamePickForOrdinal(gameSlotOrdinalRef.current++, enabled);
        gameType = pick.gameType;
        difficulty = pick.difficulty;

        const gameSection: GameFeedSection = {
          sectionType: "game",
          gameType,
          difficulty,
          index: currentIndex,
        };
        setSections((prev) => [...prev, gameSection]);
        sectionCountRef.current += 1;
        return;
      }

      // ── Article section ──────────────────────────────────────────────────────
      const controller = new AbortController();
      const timeoutId = window.setTimeout(
        () => controller.abort(),
        FEED_FETCH_TIMEOUT_MS
      );

      let data: FeedApiResponse;
      try {
        if (searchQuery.length >= 2) {
          const params = new URLSearchParams();
          params.set("q", searchQuery);
          params.set("offset", String(currentIndex * 3));
          params.set("limit", "3");
          if (category) params.set("category", category);
          if (kindFilter !== "all") params.set("contentKinds", kindFilter);
          const res = await fetch(`/api/articles/search?${params.toString()}`, {
            signal: controller.signal,
            cache: "no-store",
          });
          if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            throw new Error(body.error || `HTTP ${res.status}`);
          }
          const searchBody = (await res.json()) as {
            articles?: Article[];
            hasMore?: boolean;
          };
          data = {
            articles: searchBody.articles ?? [],
            category: category ?? "Search",
            fromCache: true,
          };
          if (!searchBody.hasMore && (searchBody.articles?.length ?? 0) === 0) {
            reachedEndRef.current = currentIndex > 0;
          }
        } else {
          const params = new URLSearchParams();
          params.set("sectionIndex", String(currentIndex));
          if (category) params.set("category", category);
          if (kindFilter !== "all") params.set("contentKind", kindFilter);
          const excludeIds = Array.from(renderedDbArticleIdsRef.current).slice(-400);
          if (excludeIds.length > 0) params.set("excludeIds", excludeIds.join(","));
          data = await fetchFeedResponse(params, controller.signal);
        }
      } finally {
        window.clearTimeout(timeoutId);
      }

      setLiveGenerating(!data.fromCache);

      const cleaned = data.articles.map(cleanArticle);
      const uniqueForView = cleaned.filter((article) => {
        const key = articleUniqKey(article);
        if (renderedArticleKeysRef.current.has(key)) return false;
        return true;
      });

      if (uniqueForView.length === 0) {
        if (data.coldStartQueued) {
          reachedEndRef.current = false;
          pendingLoadRef.current = true;
          setError(
            `Warming up ${data.coldStartCategory ?? data.category} stories — retrying shortly.`
          );
          window.setTimeout(() => {
            if (loadingRef.current || reachedEndRef.current || !feedReadyRef.current) return;
            void loadMore();
          }, 2500);
          return;
        }
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

      const layoutPlan = chooseNewspaperLayout(uniqueForView, currentIndex);
      const orderedArticles =
        layoutPlan.orderedIndices.length === uniqueForView.length
          ? layoutPlan.orderedIndices.map((idx) => uniqueForView[idx]!).filter(Boolean)
          : uniqueForView;
      const section: ArticleFeedSection = {
        sectionType: "articles",
        articles: orderedArticles,
        index: currentIndex,
        newspaperLayout: layoutPlan,
      };

      const shouldInsertGapFiller =
        fillerEnabled && layoutPlan.residualGapPx >= betweenGapMinPx;
      const shouldInsertIntervalFiller =
        fillerEnabled &&
        !shouldInsertGapFiller &&
        articleSectionsRenderedRef.current > 0 &&
        articleSectionsRenderedRef.current % fillerInterval === 0;

      const inlineLocation =
        orderedArticles.find((entry) => entry.location?.trim())?.location ?? undefined;
      const shouldInsertInlineModule =
        inlineModulesEnabled &&
        layoutPlan.inlineTargetColumn !== null &&
        layoutPlan.inlineGapPx >= inlineGapMinPx;

      if (
        shouldInsertInlineModule &&
        layoutPlan.inlineTargetColumn !== null &&
        section.newspaperLayout
      ) {
        const layoutHint = layoutPlan.inlineSuggestedModuleType ?? "generated_art";
        const preferredType = chooseInlineModuleType({
          layoutHint,
          todoEnabled: todoModuleEnabled,
        });
        let inlineData = await fetchModuleData({
          moduleType: preferredType,
          category: data.category,
          location: inlineLocation,
        });
        if (!inlineData) {
          inlineData = buildGeneratedImageModuleData({
            category: data.category,
            location: inlineLocation,
          });
        }
        const resolvedType: "generated_art" | "todo" =
          inlineData.mode === "generated_art"
            ? "generated_art"
            : inlineData.mode === "todo"
              ? "todo"
              : "generated_art";
        section.newspaperLayout.inlineModule = {
          moduleType: resolvedType,
          reason: "inline",
          targetColumn: layoutPlan.inlineTargetColumn,
          data: inlineData,
        };
      }

      const nextSections: FeedSection[] = [section];
      if (shouldInsertGapFiller || shouldInsertIntervalFiller) {
        if (shouldInsertGapFiller) fillerMetricsRef.current.gapDetected += 1;
        const gapModuleType = chooseGapIntervalModuleType({
          seed: currentIndex,
          todoWeight,
          todoEnabled: todoModuleEnabled,
        });
        let moduleSection = await fetchModuleSection({
          index: currentIndex + 1,
          reason: shouldInsertGapFiller ? "gap" : "interval",
          category: data.category,
          location: inlineLocation,
          moduleType: gapModuleType,
        });
        if (!moduleSection && gapModuleType === "todo") {
          moduleSection = await fetchModuleSection({
            index: currentIndex + 1,
            reason: shouldInsertGapFiller ? "gap" : "interval",
            category: data.category,
            location: inlineLocation,
            moduleType: "generated_art",
          });
        }

        if (moduleSection) {
          nextSections.push(moduleSection);
          fillerMetricsRef.current.moduleInserted += 1;
          if (moduleSection.moduleType === "todo")
            fillerMetricsRef.current.todoInserted += 1;
          if (moduleSection.moduleType === "generated_art")
            fillerMetricsRef.current.artInserted += 1;
          console.info("[feed-singleton-gap]", {
            reason: moduleSection.reason,
            moduleType: moduleSection.moduleType,
            residualGapPx: layoutPlan.residualGapPx,
            gapThresholdPx: betweenGapMinPx,
            inlineGapPx: layoutPlan.inlineGapPx,
            metricSnapshot: fillerMetricsRef.current,
          });
        }
      }

      setSections((prev) => [...prev, ...nextSections]);
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
      articleSectionsRenderedRef.current += 1;
      sectionCountRef.current += nextSections.length;
      // Warm the next section request in cache to reduce visible wait.
      if (searchQuery.length < 2) {
        const prefetchParams = new URLSearchParams();
        prefetchParams.set("sectionIndex", String(sectionCountRef.current));
        if (category) prefetchParams.set("category", category);
        if (kindFilter !== "all") prefetchParams.set("contentKind", kindFilter);
        const prefetchExcludeIds = Array.from(renderedDbArticleIdsRef.current).slice(-400);
        if (prefetchExcludeIds.length > 0) {
          prefetchParams.set("excludeIds", prefetchExcludeIds.join(","));
        }
        void fetchFeedResponse(prefetchParams, new AbortController().signal).catch(() => {
          // Best-effort prefetch only.
        });
      }
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
  }, [
    fillerEnabled,
    betweenGapMinPx,
    inlineGapMinPx,
    inlineModulesEnabled,
    fillerInterval,
    fetchModuleSection,
    fetchModuleData,
    fetchFeedResponse,
    todoWeight,
    todoModuleEnabled,
    ensureSingletonFeedCached,
  ]); // stable refs + config

  const resetSectionsAndLoadMore = useCallback(
    (overrideCategory?: Category | null) => {
      setSections([]);
      sectionCountRef.current = 0;
      singletonPlacedRef.current = { weather: false, spotify: false, nasa: false };
      void loadMore(overrideCategory);
    },
    [loadMore]
  );

  // Resolve game ratio from server (or localStorage), then load — avoids first sections using DEFAULT_GAME_RATIO.
  useEffect(() => {
    if (!mfaPassed) {
      feedReadyRef.current = false;
      setIsFeedReady(false);
      return;
    }

    feedReadyRef.current = false;
    setIsFeedReady(false);

    // Fresh bootstrap for this user/session: reset feed cursors; singleton module data refetched once below.
    setSections([]);
    setError(null);
    setLoading(false);
    loadingRef.current = false;
    reachedEndRef.current = false;
    if (reachedEndTimeoutIdRef.current) {
      window.clearTimeout(reachedEndTimeoutIdRef.current);
      reachedEndTimeoutIdRef.current = null;
    }
    if (minGapRetryTimeoutIdRef.current) {
      window.clearTimeout(minGapRetryTimeoutIdRef.current);
      minGapRetryTimeoutIdRef.current = null;
    }
    pendingLoadRef.current = false;
    lastLoadStartAtRef.current = 0;
    sectionCountRef.current = 0;
    articleSectionsRenderedRef.current = 0;
    gameSlotOrdinalRef.current = 0;
    lastArticleCategoryRef.current = undefined;
    renderedArticleKeysRef.current = new Set();
    renderedDbArticleIdsRef.current = new Set();
    gameRatioRef.current = DEFAULT_GAME_RATIO;
    singletonFeedCacheRef.current = { weather: null, spotify: null, nasa: null };
    singletonPrefetchedRef.current = false;
    singletonPrefetchPromiseRef.current = null;
    singletonPlacedRef.current = { weather: false, spotify: false, nasa: false };

    const gen = ++feedBootstrapGenRef.current;
    let cancelled = false;

    (async () => {
      let usedServerRatio = false;
      let serverThemePreference: "light" | "dark" | null = null;

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

          if (Array.isArray(profile.enabledGameTypes)) {
            enabledGameTypesRef.current = profile.enabledGameTypes.filter(
              (v: unknown): v is GameType => typeof v === "string"
            );
            try {
              localStorage.setItem(
                "gentle_stream_enabled_game_types",
                JSON.stringify(enabledGameTypesRef.current)
              );
            } catch {
              /* ignore */
            }
          }

          if (typeof profile.weatherLocation === "string" && profile.weatherLocation.trim()) {
            const weatherLocation = profile.weatherLocation.trim();
            preferredWeatherLocationRef.current = weatherLocation;
            try {
              localStorage.setItem(
                "gentle_stream_weather_location",
                weatherLocation
              );
            } catch {
              /* ignore */
            }
          } else {
            preferredWeatherLocationRef.current = null;
          }
          if (profile.themePreference === "light" || profile.themePreference === "dark") {
            serverThemePreference = profile.themePreference;
            try {
              localStorage.setItem(
                "gentle_stream_theme_preference",
                profile.themePreference
              );
            } catch {
              /* ignore */
            }
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

      if (enabledGameTypesRef.current == null) {
        try {
          const storedEnabled = localStorage.getItem("gentle_stream_enabled_game_types");
          if (storedEnabled) {
            const parsed = JSON.parse(storedEnabled) as unknown;
            if (Array.isArray(parsed)) {
              enabledGameTypesRef.current = parsed.filter(
                (v): v is GameType => typeof v === "string"
              );
            }
          }
        } catch {
          /* ignore */
        }
      }

      if (preferredWeatherLocationRef.current == null) {
        try {
          const storedLocation = localStorage.getItem("gentle_stream_weather_location");
          if (storedLocation && storedLocation.trim()) {
            preferredWeatherLocationRef.current = storedLocation.trim();
          }
        } catch {
          /* ignore */
        }
      }

      if (cancelled || gen !== feedBootstrapGenRef.current) return;

      let profileTheme = serverThemePreference;
      if (!profileTheme) {
        try {
          const storedTheme = localStorage.getItem("gentle_stream_theme_preference");
          if (storedTheme === "light" || storedTheme === "dark") {
            profileTheme = storedTheme;
          }
        } catch {
          /* ignore */
        }
      }
      if (profileTheme === "light" || profileTheme === "dark") {
        setThemePreference(profileTheme);
        document.documentElement.setAttribute("data-theme", profileTheme);
      }

      if (cancelled || gen !== feedBootstrapGenRef.current) return;

      await ensureSingletonFeedCached();
      if (cancelled || gen !== feedBootstrapGenRef.current) return;

      feedReadyRef.current = true;
      setIsFeedReady(true);
      void loadMore();
    })();

    return () => {
      cancelled = true;
    };
  }, [userId, mfaPassed, loadMore, ensureSingletonFeedCached]);

  useEffect(() => {
    setMfaPassed(userId === "dev-local");
  }, [userId]);

  useEffect(() => {
    function onEnabledTypesUpdated(e: Event) {
      const ce = e as CustomEvent<{ enabledGameTypes?: unknown }>;
      const enabled = ce.detail?.enabledGameTypes;
      if (Array.isArray(enabled)) {
        enabledGameTypesRef.current = enabled.filter(
          (v): v is GameType => typeof v === "string"
        );
        try {
          localStorage.setItem(
            "gentle_stream_enabled_game_types",
            JSON.stringify(enabledGameTypesRef.current)
          );
        } catch {
          /* ignore */
        }
      }

      reachedEndRef.current = false;
      if (reachedEndTimeoutIdRef.current) {
        window.clearTimeout(reachedEndTimeoutIdRef.current);
        reachedEndTimeoutIdRef.current = null;
      }
      if (minGapRetryTimeoutIdRef.current) {
        window.clearTimeout(minGapRetryTimeoutIdRef.current);
        minGapRetryTimeoutIdRef.current = null;
      }
      pendingLoadRef.current = false;
      gameSlotOrdinalRef.current = 0;
      loadingRef.current = false;
      setLoading(false);
      setError(null);
      renderedArticleKeysRef.current = new Set();
      renderedDbArticleIdsRef.current = new Set();
      articleSectionsRenderedRef.current = 0;
      resetSectionsAndLoadMore();
    }

    window.addEventListener(
      "gentle-stream-enabled-game-types",
      onEnabledTypesUpdated as EventListener
    );
    return () =>
      window.removeEventListener(
        "gentle-stream-enabled-game-types",
        onEnabledTypesUpdated as EventListener
      );
  }, [resetSectionsAndLoadMore]);

  // Keep activeCategoryRef in sync
  useEffect(() => {
    activeCategoryRef.current = activeCategory;
  }, [activeCategory]);

  useEffect(() => {
    activeKindFilterRef.current = activeKindFilter;
  }, [activeKindFilter]);

  useEffect(() => {
    activeSearchQueryRef.current = activeSearchQuery;
  }, [activeSearchQuery]);

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
      if (minGapRetryTimeoutIdRef.current) {
        window.clearTimeout(minGapRetryTimeoutIdRef.current);
        minGapRetryTimeoutIdRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    function resolveStoredTheme(): "light" | "dark" {
      try {
        const stored = localStorage.getItem("gentle_stream_theme_preference");
        if (stored === "light" || stored === "dark") return stored;
      } catch {
        /* ignore */
      }
      return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    const nextTheme = resolveStoredTheme();
    setThemePreference(nextTheme);
    document.documentElement.setAttribute("data-theme", nextTheme);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", themePreference);
  }, [themePreference]);

  useEffect(() => {
    function updateScrollTopVisibility() {
      setShowScrollTopButton(window.scrollY > 480);
    }
    updateScrollTopVisibility();
    window.addEventListener("scroll", updateScrollTopVisibility, { passive: true });
    return () => window.removeEventListener("scroll", updateScrollTopVisibility);
  }, []);

  function scrollToTop() {
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: prefersReducedMotion ? "auto" : "smooth" });
  }

  async function toggleThemePreference() {
    const next = themePreference === "dark" ? "light" : "dark";
    setThemePreference(next);
    try {
      localStorage.setItem("gentle_stream_theme_preference", next);
    } catch {
      /* ignore */
    }
    try {
      await fetch("/api/user/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ themePreference: next }),
      });
    } catch {
      /* ignore */
    }
  }

  const handleCategorySelect = (cat: Category) => {
    const next = activeCategory === cat ? null : cat;
    setActiveCategory(next);
    activeCategoryRef.current = next;
    reachedEndRef.current = false;
    if (reachedEndTimeoutIdRef.current) {
      window.clearTimeout(reachedEndTimeoutIdRef.current);
      reachedEndTimeoutIdRef.current = null;
    }
    if (minGapRetryTimeoutIdRef.current) {
      window.clearTimeout(minGapRetryTimeoutIdRef.current);
      minGapRetryTimeoutIdRef.current = null;
    }
    pendingLoadRef.current = false;
    articleSectionsRenderedRef.current = 0;
    loadingRef.current = false;
    setLoading(false);
    lastArticleCategoryRef.current = undefined;
    renderedArticleKeysRef.current = new Set();
    renderedDbArticleIdsRef.current = new Set();
    resetSectionsAndLoadMore(next);
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
      if (minGapRetryTimeoutIdRef.current) {
        window.clearTimeout(minGapRetryTimeoutIdRef.current);
        minGapRetryTimeoutIdRef.current = null;
      }
      pendingLoadRef.current = false;
      articleSectionsRenderedRef.current = 0;
      gameSlotOrdinalRef.current = 0;
      loadingRef.current = false;
      setError(null);
      renderedArticleKeysRef.current = new Set();
      renderedDbArticleIdsRef.current = new Set();
      resetSectionsAndLoadMore();
    },
    [resetSectionsAndLoadMore]
  );

  const handleKindFilterSelect = useCallback(
    (next: FeedKindFilter) => {
      if (next === activeKindFilterRef.current) return;
      setActiveKindFilter(next);
      activeKindFilterRef.current = next;
      reachedEndRef.current = false;
      if (reachedEndTimeoutIdRef.current) {
        window.clearTimeout(reachedEndTimeoutIdRef.current);
        reachedEndTimeoutIdRef.current = null;
      }
      if (minGapRetryTimeoutIdRef.current) {
        window.clearTimeout(minGapRetryTimeoutIdRef.current);
        minGapRetryTimeoutIdRef.current = null;
      }
      pendingLoadRef.current = false;
      articleSectionsRenderedRef.current = 0;
      gameSlotOrdinalRef.current = 0;
      loadingRef.current = false;
      setLoading(false);
      setError(null);
      lastArticleCategoryRef.current = undefined;
      renderedArticleKeysRef.current = new Set();
      renderedDbArticleIdsRef.current = new Set();
      resetSectionsAndLoadMore();
    },
    [resetSectionsAndLoadMore]
  );

  const resetFeedAndLoad = useCallback(() => {
    reachedEndRef.current = false;
    if (reachedEndTimeoutIdRef.current) {
      window.clearTimeout(reachedEndTimeoutIdRef.current);
      reachedEndTimeoutIdRef.current = null;
    }
    if (minGapRetryTimeoutIdRef.current) {
      window.clearTimeout(minGapRetryTimeoutIdRef.current);
      minGapRetryTimeoutIdRef.current = null;
    }
    pendingLoadRef.current = false;
    articleSectionsRenderedRef.current = 0;
    gameSlotOrdinalRef.current = 0;
    loadingRef.current = false;
    setLoading(false);
    setError(null);
    lastArticleCategoryRef.current = undefined;
    renderedArticleKeysRef.current = new Set();
    renderedDbArticleIdsRef.current = new Set();
    resetSectionsAndLoadMore();
  }, [resetSectionsAndLoadMore]);

  const applySearch = useCallback(() => {
    const next = searchInput.trim();
    if (next === activeSearchQueryRef.current) return;
    setActiveSearchQuery(next);
    activeSearchQueryRef.current = next;
    resetFeedAndLoad();
  }, [searchInput, resetFeedAndLoad]);

  if (!mfaPassed) {
    return <MfaChallengeGate onPassed={() => setMfaPassed(true)} />;
  }

  return (
    <div style={{ background: "var(--gs-bg)", minHeight: "100vh", color: "var(--gs-text)" }}>
      <Masthead
        accountSlot={
          userEmail ? (
            <ProfileMenu
              userEmail={userEmail}
              onGameRatioSaved={handleGameRatioSaved}
              themePreference={themePreference}
              onThemePreferenceToggle={toggleThemePreference}
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

      <div
        style={{
          maxWidth: "1200px",
          margin: "0 auto",
          padding: "0.55rem 0.85rem 0",
          display: "flex",
          gap: "0.4rem",
          flexWrap: "wrap",
          alignItems: "center",
          background: "var(--gs-surface)",
        }}
      >
        {(
          [
            { value: "all", label: "All" },
            { value: "news", label: "News" },
            { value: "user_article", label: "User articles" },
            { value: "recipe", label: "Recipes" },
          ] as const
        ).map((option) => {
          const active = activeKindFilter === option.value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={active}
              onClick={() => handleKindFilterSelect(option.value)}
              style={{
                border: active ? "2px solid #1a1a1a" : "1px solid #d8d2c7",
                background: active ? "#c8a84b" : "#fff",
                color: "#1a1a1a",
                padding: "0.35rem 0.55rem",
                fontFamily: "'Playfair Display', Georgia, serif",
                fontSize: "0.7rem",
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                cursor: "pointer",
              }}
            >
              {option.label}
            </button>
          );
        })}
        <div style={{ marginLeft: "auto", display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
          <input
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                applySearch();
              }
            }}
            placeholder="Search stories or tags..."
            aria-label="Search stories"
            style={{
              border: "1px solid #d8d2c7",
              padding: "0.34rem 0.45rem",
              minWidth: "14rem",
              fontSize: "0.75rem",
            }}
          />
          <button
            type="button"
            onClick={applySearch}
            style={{
              border: "1px solid #1a1a1a",
              background: "#fff",
              color: "#1a1a1a",
              padding: "0.32rem 0.55rem",
              fontFamily: "'Playfair Display', Georgia, serif",
              fontSize: "0.7rem",
              cursor: "pointer",
            }}
          >
            Search
          </button>
          {activeSearchQuery ? (
            <button
              type="button"
              onClick={() => {
                setSearchInput("");
                setActiveSearchQuery("");
                activeSearchQueryRef.current = "";
                resetFeedAndLoad();
              }}
              style={{
                border: "1px solid #888",
                background: "#faf8f3",
                color: "#333",
                padding: "0.32rem 0.55rem",
                fontFamily: "'Playfair Display', Georgia, serif",
                fontSize: "0.7rem",
                cursor: "pointer",
              }}
            >
              Clear
            </button>
          ) : null}
        </div>
      </div>

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
            background: "var(--gs-surface)",
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
              />
            );
          }
          if (section.sectionType === "module" || section.sectionType === "filler") {
            if (section.moduleType === "spotify") {
              return (
                <SpotifyMoodTile
                  key={`module-${section.index}-spotify`}
                  data={section.data as SpotifyMoodTileData}
                  reason={section.reason}
                />
              );
            }
            if (section.moduleType === "todo") {
              return (
                <TodoFillerCard
                  key={`module-${section.index}-todo`}
                  data={section.data as TodoModuleData}
                  reason={section.reason}
                />
              );
            }
            if (section.moduleType === "generated_art") {
              return (
                <GeneratedArtModuleCard
                  key={`module-${section.index}-art`}
                  data={section.data as GeneratedImageModuleData}
                  reason={section.reason}
                />
              );
            }
            if (section.moduleType === "nasa") {
              return (
                <NasaApodCard
                  key={`module-${section.index}-nasa`}
                  data={section.data as NasaModuleData}
                  reason={section.reason}
                />
              );
            }
            return (
              <WeatherFillerCard
                key={`module-${section.index}-weather`}
                data={section.data as WeatherModuleData}
                reason={section.reason}
              />
            );
          }
          if (section.sectionType === "articles") {
            return (
              <NewsSection
                key={`news-${section.index}`}
                articles={section.articles}
                sectionIndex={section.index}
                layoutPlan={section.newspaperLayout}
              />
            );
          }
          return null;
        })}

        <div aria-live="polite" style={{ position: "absolute", left: "-9999px" }}>
          {loading ? "Loading more stories." : ""}
          {error ? `Error: ${error}` : ""}
        </div>
        {error && (
          <ErrorBanner
            message={error}
            onRetry={() => {
              reachedEndRef.current = false;
              if (reachedEndTimeoutIdRef.current) {
                window.clearTimeout(reachedEndTimeoutIdRef.current);
                reachedEndTimeoutIdRef.current = null;
              }
              if (minGapRetryTimeoutIdRef.current) {
                window.clearTimeout(minGapRetryTimeoutIdRef.current);
                minGapRetryTimeoutIdRef.current = null;
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
      {showScrollTopButton ? (
        <button
          type="button"
          onClick={scrollToTop}
          aria-label="Scroll to top"
          style={{
            position: "fixed",
            right: "1.1rem",
            bottom: "1.1rem",
            width: "2.45rem",
            height: "2.45rem",
            borderRadius: "999px",
            border: "1px solid #1a1a1a",
            background: "#faf8f3",
            color: "#1a1a1a",
            boxShadow: "0 8px 20px rgba(0,0,0,0.2)",
            cursor: "pointer",
            zIndex: 250,
            fontSize: "1.1rem",
            lineHeight: 1,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          ↑
        </button>
      ) : null}
    </div>
  );
}
