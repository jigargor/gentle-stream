"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Masthead, { MASTHEAD_TOP_BAR_HEIGHT_PX } from "./Masthead";
import { ProfileMenu } from "./user/ProfileMenu";
import { GuestProfileMenu } from "./user/GuestProfileMenu";
import CategoryDrawer from "./CategoryDrawer";
import { MfaChallengeGate } from "./auth/mfa/MfaChallengeGate";
import NewsSection from "./NewsSection";
import GameSlot from "./games/GameSlot";
import WeatherCard from "./feed/WeatherCard";
import SpotifyMoodTile from "./feed/SpotifyMoodTile";
import TodoCard from "./feed/TodoCard";
import GeneratedArtModuleCard from "./feed/GeneratedArtModuleCard";
import NasaApodCard from "./feed/NasaApodCard";
import IconFractalCard from "./feed/IconFractalCard";
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
  EditorialBreatherModuleData,
  GeneratedImageModuleData,
  IconFractalModuleData,
  NasaModuleData,
  WeatherModuleData,
  SpotifyMoodTileData,
  TodoModuleData,
  RelatedHeadlineItem,
  ReadingRailModule,
} from "@/lib/types";
import { DEFAULT_GAME_RATIO } from "@/lib/constants";
import { feedGamePickForOrdinal } from "@/lib/games/feedPick";
import type { GameType } from "@/lib/games/types";
import { chooseNewspaperLayout } from "@/lib/feed/newspaperLayout";
import {
  buildIconFractalModuleData,
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
/** Load the next section before the user reaches the bottom (viewport extension below fold). */
const SENTINEL_PREFETCH_PX = 1600;
/** Short gap between sequential /prefetch loads so the stream feels continuous. */
const MIN_LOAD_GAP_MS = 380;
const REACHED_END_COOLDOWN_MS = 10_000;
const FORCE_INGEST_RETRY_DELAY_MS = 1_200;
const FORCE_INGEST_CLIENT_COOLDOWN_MS = 8_000;
const FEED_CACHE_TTL_MS = 35_000;
const FEED_STALE_TTL_MS = 120_000;
const GUEST_USER_ID = "anonymous";
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

function spotifyContentSignature(data: SpotifyMoodTileData | null): string | null {
  if (!data) return null;
  const topTracks = data.tracks
    .slice(0, 8)
    .map((track) => `${track.id}|${track.name}|${track.artist}`)
    .join("||");
  return [
    data.mode,
    data.mood,
    data.title,
    data.subtitle,
    data.playlistUrl ?? "",
    topTracks,
  ].join("::");
}

function buildEditorialBreatherData(input: {
  sectionIndex: number;
  category?: string;
  motif?: EditorialBreatherModuleData["motif"];
  href?: string;
  hrefLabel?: string;
}): EditorialBreatherModuleData {
  const motifPool: EditorialBreatherModuleData["motif"][] = [
    "linework",
    "divider",
    "stamp",
  ];
  const motif = input.motif ?? motifPool[Math.abs(input.sectionIndex % motifPool.length)]!;
  const categoryLabel = input.category?.trim() || "Today";
  const lines = [
    "A short pause in the page rhythm, before the next column.",
    "A quiet interlude to keep the print flow breathable.",
    "An editorial breath between longer reads.",
    "A subtle spacer that preserves the broadsheet cadence.",
  ];
  return {
    mode: "editorial_breather",
    title: `${categoryLabel} desk note`,
    kicker: "Editorial pause",
    line: lines[Math.abs(input.sectionIndex % lines.length)]!,
    motif,
    href: input.href,
    hrefLabel: input.hrefLabel,
  };
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
  const isGuestUser = userId === GUEST_USER_ID;
  const [mfaPassed, setMfaPassed] = useState(userId === "dev-local" || isGuestUser);
  const [sections, setSections] = useState<FeedSection[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<Category | null>(null);
  const [activeKindFilter, setActiveKindFilter] = useState<FeedKindFilter>("all");
  const [searchInput, setSearchInput] = useState("");
  const [activeSearchQuery, setActiveSearchQuery] = useState("");
  const [liveGenerating, setLiveGenerating] = useState(false);
  const [themePreference, setThemePreference] = useState<"light" | "dark">("light");
  const [weatherUnitSystem, setWeatherUnitSystem] = useState<"metric" | "imperial">("metric");
  const [weatherModalOpen, setWeatherModalOpen] = useState(false);
  const [weatherModalLoading, setWeatherModalLoading] = useState(false);
  const [weatherModalError, setWeatherModalError] = useState<string | null>(null);
  const [weatherModalData, setWeatherModalData] = useState<WeatherModuleData | null>(null);
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
  /** Full-width NASA row or reading-rail NASA — at most one per feed view so APOD never stacks back-to-back. */
  const nasaSurfaceUsedRef = useRef(false);
  const weatherBriefLoadedRef = useRef(false);
  const seenSpotifySignaturesRef = useRef<Set<string>>(new Set());
  const recentBreatherMotifsRef = useRef<EditorialBreatherModuleData["motif"][]>([]);
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
  const forceIngestInFlightRef = useRef<Promise<void> | null>(null);
  const forceIngestLockUntilRef = useRef(0);

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

  const openWeatherModal = useCallback(() => {
    setWeatherModalOpen(true);
    setWeatherModalError(null);
    setWeatherModalLoading(true);
    void (async () => {
      try {
        const weatherData = await fetchModuleData({
          moduleType: "weather",
          category: activeCategoryRef.current ?? undefined,
        });
        if (!weatherData || weatherData.mode !== "weather") {
          setWeatherModalError("Could not load weather details right now.");
          setWeatherModalData(null);
          return;
        }
        setWeatherModalData(weatherData as WeatherModuleData);
      } catch {
        setWeatherModalError("Could not load weather details right now.");
        setWeatherModalData(null);
      } finally {
        setWeatherModalLoading(false);
      }
    })();
  }, [fetchModuleData]);

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
          if (cache.weather && !weatherBriefLoadedRef.current) {
            weatherBriefLoadedRef.current = true;
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
            const signature = spotifyContentSignature(cache.spotify);
            if (signature && seenSpotifySignaturesRef.current.has(signature)) return;
            if (signature) seenSpotifySignaturesRef.current.add(signature);
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
          if (cache.nasa && !nasaSurfaceUsedRef.current) {
            nasaSurfaceUsedRef.current = true;
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
          inlineGapPx: layoutPlan.inlineGapPx,
          residualGapPx: layoutPlan.residualGapPx,
        });
        const totalBodyChars = orderedArticles.reduce(
          (sum, article) =>
            sum +
            (typeof article.body === "string"
              ? article.body.length
              : 0),
          0
        );
        const hasEditorialDensity = orderedArticles.length >= 2 && totalBodyChars >= 1200;
        let inlineData: FeedModuleData | null = null;
        if (preferredType === "editorial_breather" && hasEditorialDensity) {
          const motifPool: EditorialBreatherModuleData["motif"][] = ["linework", "divider", "stamp"];
          const initialMotif =
            motifPool[Math.abs((currentIndex + orderedArticles.length) % motifPool.length)]!;
          const previousMotifs = recentBreatherMotifsRef.current.slice(-2);
          const motif =
            previousMotifs.includes(initialMotif)
              ? motifPool.find((entry) => !previousMotifs.includes(entry)) ?? initialMotif
              : initialMotif;
          const topArticle = orderedArticles[0];
          const topHref =
            topArticle &&
            "id" in topArticle &&
            typeof topArticle.id === "string" &&
            topArticle.id.length > 0
              ? `/article/${topArticle.id}`
              : undefined;
          inlineData = buildEditorialBreatherData({
            sectionIndex: currentIndex,
            category: data.category,
            motif,
            href: topHref,
            hrefLabel: topHref ? "Open lead story" : undefined,
          });
          recentBreatherMotifsRef.current = [...recentBreatherMotifsRef.current.slice(-2), motif];
        } else if (preferredType === "icon_fractal") {
          inlineData = buildIconFractalModuleData({
            seed: currentIndex * 97 + orderedArticles.length * 11,
          });
        } else {
          const fetchType: "generated_art" | "todo" =
            preferredType === "todo" ? "todo" : "generated_art";
          inlineData = await fetchModuleData({
            moduleType: fetchType,
            category: data.category,
            location: inlineLocation,
          });
        }
        if (!inlineData) {
          inlineData = buildGeneratedImageModuleData({
            category: data.category,
            location: inlineLocation,
          });
        }
        const resolvedType: "generated_art" | "todo" | "editorial_breather" | "icon_fractal" =
          inlineData.mode === "generated_art"
            ? "generated_art"
            : inlineData.mode === "todo"
              ? "todo"
              : inlineData.mode === "editorial_breather"
                ? "editorial_breather"
                : inlineData.mode === "icon_fractal"
                  ? "icon_fractal"
                  : "generated_art";
        section.newspaperLayout.inlineModule = {
          moduleType: resolvedType,
          reason: "inline",
          targetColumn: layoutPlan.inlineTargetColumn,
          data: inlineData,
        };
      }

      if (
        layoutPlan.templateId === "single-hero" &&
        searchQuery.length < 2 &&
        section.newspaperLayout
      ) {
        await ensureSingletonFeedCached();
        const cache = singletonFeedCacheRef.current;
        const hero = orderedArticles[0];

        let primary: ReadingRailModule | undefined;
        if (cache.weather && !weatherBriefLoadedRef.current) {
          primary = { kind: "weather", data: cache.weather };
          weatherBriefLoadedRef.current = true;
          singletonPlacedRef.current.weather = true;
        } else if (cache.nasa && !nasaSurfaceUsedRef.current) {
          primary = { kind: "nasa", data: cache.nasa };
          nasaSurfaceUsedRef.current = true;
        }

        let secondary: ReadingRailModule | undefined;
        const spotifySignature = spotifyContentSignature(cache.spotify);
        if (
          cache.spotify &&
          (!spotifySignature || !seenSpotifySignaturesRef.current.has(spotifySignature))
        ) {
          secondary = { kind: "spotify", data: cache.spotify };
          if (spotifySignature) seenSpotifySignaturesRef.current.add(spotifySignature);
          singletonPlacedRef.current.spotify = true;
        } else {
          const gen = await fetchModuleData({
            moduleType: "generated_art",
            category: data.category,
            location: inlineLocation,
          });
          if (gen?.mode === "generated_art")
            secondary = {
              kind: "generated_art",
              data: gen as GeneratedImageModuleData,
            };
        }

        let relatedHeadlines: RelatedHeadlineItem[] = [];
        if (
          hero &&
          "id" in hero &&
          typeof hero.id === "string" &&
          hero.id.length > 0 &&
          "category" in hero &&
          hero.category
        ) {
          try {
            const res = await fetch(
              `/api/feed/related?articleId=${encodeURIComponent(hero.id)}&category=${encodeURIComponent(String(hero.category))}&limit=3`,
              { cache: "no-store" }
            );
            if (res.ok) {
              const j = (await res.json()) as { headlines?: RelatedHeadlineItem[] };
              relatedHeadlines = j.headlines ?? [];
            }
          } catch {
            /* ignore */
          }
        }

        const enabled = Boolean(
          primary || secondary || relatedHeadlines.length > 0
        );
        section.newspaperLayout.readingRail = {
          enabled,
          primary,
          secondary,
          relatedHeadlines:
            relatedHeadlines.length > 0 ? relatedHeadlines : undefined,
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

  const triggerForceIngestOnRetry = useCallback(async () => {
    if (activeSearchQueryRef.current.trim().length >= 2) return;
    if (forceIngestInFlightRef.current) {
      await forceIngestInFlightRef.current;
      return;
    }
    if (Date.now() < forceIngestLockUntilRef.current) return;

    const category = activeCategoryRef.current;
    const sectionIndex = Math.max(sectionCountRef.current, 0);

    const requestPromise = (async () => {
      try {
        const response = await fetch("/api/feed/force-ingest", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            sectionIndex,
            ...(category ? { category } : {}),
          }),
        });

        let retryAfterSec = 0;
        const body = (await response.json().catch(() => null)) as
          | { retryAfterSec?: number; reason?: string }
          | null;
        if (typeof body?.retryAfterSec === "number" && Number.isFinite(body.retryAfterSec))
          retryAfterSec = Math.max(0, Math.floor(body.retryAfterSec));
        const retryAfterHeader = Number.parseInt(response.headers.get("Retry-After") || "", 10);
        if (Number.isFinite(retryAfterHeader))
          retryAfterSec = Math.max(retryAfterSec, Math.max(0, retryAfterHeader));

        if (response.status === 429 || retryAfterSec > 0) {
          const cooldownMs = Math.max(
            FORCE_INGEST_CLIENT_COOLDOWN_MS,
            retryAfterSec * 1000
          );
          forceIngestLockUntilRef.current = Date.now() + cooldownMs;
          return;
        }

        if (response.ok) {
          await new Promise<void>((resolve) => {
            window.setTimeout(() => resolve(), FORCE_INGEST_RETRY_DELAY_MS);
          });
          return;
        }

        if (body?.reason === "provider_not_rss_mode" || body?.reason === "dev_light_disabled") {
          forceIngestLockUntilRef.current = Date.now() + FORCE_INGEST_CLIENT_COOLDOWN_MS;
        }
      } catch {
        // Best-effort only; feed retry still proceeds through loadMore.
      }
    })();

    forceIngestInFlightRef.current = requestPromise.finally(() => {
      forceIngestInFlightRef.current = null;
    });
    await forceIngestInFlightRef.current;
  }, []);

  const resetSectionsAndLoadMore = useCallback(
    (overrideCategory?: Category | null) => {
      setSections([]);
      sectionCountRef.current = 0;
      singletonPlacedRef.current = { weather: false, spotify: false, nasa: false };
      nasaSurfaceUsedRef.current = false;
      weatherBriefLoadedRef.current = false;
      seenSpotifySignaturesRef.current = new Set();
      recentBreatherMotifsRef.current = [];
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
    nasaSurfaceUsedRef.current = false;
    weatherBriefLoadedRef.current = false;
    seenSpotifySignaturesRef.current = new Set();
    recentBreatherMotifsRef.current = [];

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
          if (
            profile.weatherUnitSystem === "metric" ||
            profile.weatherUnitSystem === "imperial"
          ) {
            setWeatherUnitSystem(profile.weatherUnitSystem);
            try {
              localStorage.setItem(
                "gentle_stream_weather_unit_system",
                profile.weatherUnitSystem
              );
            } catch {
              /* ignore */
            }
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
      try {
        const storedUnitSystem = localStorage.getItem("gentle_stream_weather_unit_system");
        if (storedUnitSystem === "metric" || storedUnitSystem === "imperial") {
          setWeatherUnitSystem(storedUnitSystem);
        }
      } catch {
        /* ignore */
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
    setMfaPassed(userId === "dev-local" || isGuestUser);
  }, [isGuestUser, userId]);

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
    function onWeatherUnitSystemUpdated(e: Event) {
      const ce = e as CustomEvent<{ weatherUnitSystem?: unknown }>;
      const next = ce.detail?.weatherUnitSystem;
      if (next === "metric" || next === "imperial") {
        setWeatherUnitSystem(next);
      }
    }
    window.addEventListener(
      "gentle-stream-weather-unit-system",
      onWeatherUnitSystemUpdated as EventListener
    );
    return () =>
      window.removeEventListener(
        "gentle-stream-weather-unit-system",
        onWeatherUnitSystemUpdated as EventListener
      );
  }, []);

  useEffect(() => {
    if (!weatherModalOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setWeatherModalOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [weatherModalOpen]);

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
          ) : (
            <GuestProfileMenu />
          )
        }
      />
      <CategoryDrawer
        selected={activeCategory}
        onSelect={handleCategorySelect}
        topOffsetPx={MASTHEAD_TOP_BAR_HEIGHT_PX}
      />

      <div
        className="gs-card-lift"
        style={{
          maxWidth: "1200px",
          margin: "0 auto",
          padding: "0.7rem 0.85rem 0.35rem",
          display: "flex",
          gap: "0.4rem",
          flexWrap: "wrap",
          alignItems: "center",
          background: "var(--gs-surface)",
          border: "1px solid var(--gs-border)",
          borderRadius: "0 0 var(--gs-radius-md) var(--gs-radius-md)",
          boxShadow: "0 8px 24px rgba(22, 15, 8, 0.06)",
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
              className="gs-chip-button gs-interactive gs-focus-ring"
              key={option.value}
              type="button"
              aria-pressed={active}
              onClick={() => handleKindFilterSelect(option.value)}
              style={{
                border: active ? "1.5px solid var(--gs-ink-strong)" : undefined,
                background: active ? "#d7bb66" : "var(--gs-surface-elevated)",
                color: "var(--gs-ink-strong)",
                padding: "0.35rem 0.55rem",
                fontFamily: "'Playfair Display', Georgia, serif",
                fontSize: "0.7rem",
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                cursor: "pointer",
                boxShadow: active ? "0 8px 18px rgba(40, 30, 18, 0.16)" : "none",
              }}
            >
              {option.label}
            </button>
          );
        })}
        <button
          className="gs-chip-button gs-interactive gs-focus-ring"
          type="button"
          onClick={openWeatherModal}
          style={{
            border: "1px solid #93b28a",
            background: "#e6f2e3",
            color: "#23402a",
            padding: "0.35rem 0.55rem",
            fontFamily: "'Playfair Display', Georgia, serif",
            fontSize: "0.7rem",
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            cursor: "pointer",
            boxShadow: "0 6px 14px rgba(25, 72, 38, 0.12)",
          }}
        >
          Weather
        </button>
        <div style={{ marginLeft: "auto", display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
          <input
            className="gs-focus-ring"
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
              border: "1px solid var(--gs-border)",
              background: "var(--gs-surface-elevated)",
              borderRadius: "var(--gs-radius-sm)",
              padding: "0.38rem 0.55rem",
              minWidth: "14rem",
              fontSize: "0.75rem",
            }}
          />
          <button
            className="gs-chip-button gs-interactive gs-focus-ring"
            type="button"
            onClick={applySearch}
            style={{
              background: "var(--gs-surface-elevated)",
              color: "var(--gs-ink-strong)",
              padding: "0.35rem 0.62rem",
              fontFamily: "'Playfair Display', Georgia, serif",
              fontSize: "0.7rem",
              cursor: "pointer",
            }}
          >
            Search
          </button>
          {activeSearchQuery ? (
            <button
              className="gs-chip-button gs-interactive gs-focus-ring"
              type="button"
              onClick={() => {
                setSearchInput("");
                setActiveSearchQuery("");
                activeSearchQueryRef.current = "";
                resetFeedAndLoad();
              }}
              style={{
                background: "var(--gs-surface-elevated)",
                color: "#333",
                padding: "0.35rem 0.62rem",
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
          boxShadow: "var(--gs-shadow-page)",
          borderRadius: "0 0 var(--gs-radius-md) var(--gs-radius-md)",
          overflow: "hidden",
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
                <TodoCard
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
            if (section.moduleType === "icon_fractal") {
              return (
                <IconFractalCard
                  key={`module-${section.index}-icon-fractal`}
                  data={section.data as IconFractalModuleData}
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
              <WeatherCard
                key={`module-${section.index}-weather`}
                data={section.data as WeatherModuleData}
                reason={section.reason}
                weatherUnitSystem={weatherUnitSystem}
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
              // Force a manual retry path regardless of recent timing guards.
              setError(null);
              reachedEndRef.current = false;
              if (reachedEndTimeoutIdRef.current) {
                window.clearTimeout(reachedEndTimeoutIdRef.current);
                reachedEndTimeoutIdRef.current = null;
              }
              if (minGapRetryTimeoutIdRef.current) {
                window.clearTimeout(minGapRetryTimeoutIdRef.current);
                minGapRetryTimeoutIdRef.current = null;
              }
              pendingLoadRef.current = true;
              lastLoadStartAtRef.current = 0;
              void (async () => {
                await triggerForceIngestOnRetry();
                requestAnimationFrame(() => {
                  if (loadingRef.current) return;
                  void loadMore();
                });
              })();
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
          className="gs-interactive gs-soft-pulse gs-focus-ring"
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
            border: "1px solid var(--gs-border-strong)",
            background: "var(--gs-surface-elevated)",
            color: "var(--gs-ink-strong)",
            boxShadow: "var(--gs-shadow-popover)",
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
      {weatherModalOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Comprehensive weather"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setWeatherModalOpen(false);
          }}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(9, 7, 4, 0.46)",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "1.2rem",
          }}
        >
          <div
            className="gs-card-lift"
            style={{
              width: "min(760px, 96vw)",
              background: "var(--gs-surface-elevated)",
              border: "1px solid var(--gs-border-strong)",
              borderRadius: "var(--gs-radius-lg)",
              boxShadow: "var(--gs-shadow-overlay)",
              padding: "1rem 1rem 0.9rem",
              maxHeight: "min(88vh, 820px)",
              overflowY: "auto",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                marginBottom: "0.75rem",
              }}
            >
              <button
                className="gs-interactive gs-focus-ring"
                type="button"
                onClick={() => setWeatherModalOpen(false)}
                style={{
                  border: "1px solid var(--gs-border-strong)",
                  background: "var(--gs-surface-soft)",
                  width: "1.85rem",
                  height: "1.85rem",
                  borderRadius: "var(--gs-radius-pill)",
                  fontFamily: "'Playfair Display', Georgia, serif",
                  color: "var(--gs-ink-strong)",
                  fontSize: "1.05rem",
                  lineHeight: 1,
                  cursor: "pointer",
                }}
                aria-label="Close weather modal"
                title="Close"
              >
                ×
              </button>
            </div>
            {weatherModalLoading ? (
              <p
                style={{
                  margin: "0.4rem 0 0",
                  fontFamily: "'IM Fell English', Georgia, serif",
                  fontStyle: "italic",
                  color: "#888",
                  fontSize: "0.82rem",
                }}
              >
                Loading weather...
              </p>
            ) : weatherModalError ? (
              <p style={{ color: "#8b4513", fontSize: "0.78rem", margin: 0 }}>
                {weatherModalError}
              </p>
            ) : weatherModalData ? (
              <WeatherCard
                data={weatherModalData}
                reason="singleton"
                weatherUnitSystem={weatherUnitSystem}
                embedded
              />
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
