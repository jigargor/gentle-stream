import type { SpotifyMoodTileData, SpotifyMoodTrack } from "@/lib/types";

const SPOTIFY_ACCOUNTS_URL = "https://accounts.spotify.com/api/token";
const SPOTIFY_API_BASE = "https://api.spotify.com/v1";
const TOKEN_SKEW_MS = 30_000;
const TILE_CACHE_TTL_MS = 10 * 60 * 1000;

interface SpotifyTokenCache {
  accessToken: string;
  expiresAt: number;
}

interface TileCacheEntry {
  data: SpotifyMoodTileData;
  expiresAt: number;
}

interface SpotifyPlaylistCandidate {
  id: string;
  name: string;
  spotifyUrl: string;
}

let tokenCache: SpotifyTokenCache | null = null;
const tileCache = new Map<string, TileCacheEntry>();

const CATEGORY_MOOD_MAP: Record<string, string[]> = {
  world: ["cinematic", "uplifting"],
  science: ["focus", "ambient"],
  tech: ["synthwave", "focus"],
  health: ["calm", "peaceful"],
  travel: ["wanderlust", "chill"],
  culture: ["indie", "soulful"],
  sports: ["energetic", "hype"],
  games: ["electronic", "adventure"],
};

const MOOD_GENRE_MAP: Record<string, string[]> = {
  chill: ["lo-fi", "ambient", "indie"],
  focus: ["classical", "instrumental", "ambient"],
  uplifting: ["pop", "dance", "funk"],
  cinematic: ["soundtrack", "orchestral", "epic"],
  energetic: ["electronic", "rock", "hip-hop"],
  calm: ["acoustic", "ambient", "jazz"],
  peaceful: ["ambient", "new-age", "classical"],
  wanderlust: ["indie", "folk", "world-music"],
  soulful: ["soul", "r-n-b", "blues"],
  synthwave: ["synthwave", "electronic", "house"],
  adventure: ["rock", "electronic", "soundtrack"],
};

function randomFrom<T>(values: T[]): T {
  const idx = Math.floor(Math.random() * values.length);
  return values[idx]!;
}

function normalizeMoodList(value: string | undefined): string[] {
  if (!value) return ["chill", "focus", "uplifting"];
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function pickMood(input: { category?: string | null; mood?: string | null }): string {
  const explicitMood = (input.mood ?? "").trim();
  if (explicitMood.length > 0) return explicitMood;
  const categoryKey = (input.category ?? "").trim().toLowerCase();
  const categoryMoods = CATEGORY_MOOD_MAP[categoryKey];
  if (categoryMoods && categoryMoods.length > 0) return randomFrom(categoryMoods);
  const defaults = normalizeMoodList(process.env.SPOTIFY_MODULE_DEFAULT_MOODS);
  return randomFrom(defaults);
}

function normalizeMarket(input: string | null | undefined): string {
  const market = (input ?? process.env.SPOTIFY_MODULE_MARKET ?? "US").trim().toUpperCase();
  return market.length === 2 ? market : "US";
}

function pickGenreForMood(mood: string): string {
  const baseMood = mood.trim().toLowerCase();
  const genres = MOOD_GENRE_MAP[baseMood];
  if (genres && genres.length > 0) return randomFrom(genres);
  return randomFrom(["indie", "pop", "electronic", "rock", "jazz"]);
}

function getFallbackTile(input: {
  mood: string;
  market: string;
  reason?: string;
}): SpotifyMoodTileData {
  return {
    mode: "fallback",
    title: "Mood Tile",
    subtitle:
      input.reason ??
      "Spotify data is unavailable right now. Try again in a moment.",
    mood: input.mood,
    market: input.market,
    tracks: [],
  };
}

function toTrack(item: {
  id: string;
  name: string;
  preview_url?: string | null;
  external_urls?: { spotify?: string };
  artists?: Array<{ name?: string }>;
  album?: { name?: string; images?: Array<{ url?: string }> };
}): SpotifyMoodTrack | null {
  const url = item.external_urls?.spotify;
  if (!item.id || !item.name || !url) return null;
  const artist =
    item.artists?.map((entry) => entry.name?.trim()).filter(Boolean).join(", ") ||
    "Unknown artist";
  return {
    id: item.id,
    name: item.name,
    artist,
    albumName: item.album?.name?.trim() || undefined,
    spotifyUrl: url,
    previewUrl: item.preview_url ?? null,
    albumImageUrl: item.album?.images?.[0]?.url,
  };
}

async function fetchSpotifyToken(): Promise<string> {
  const now = Date.now();
  if (tokenCache && tokenCache.expiresAt > now + TOKEN_SKEW_MS) {
    return tokenCache.accessToken;
  }

  const clientId = process.env.SPOTIFY_CLIENT_ID?.trim();
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) throw new Error("Spotify credentials are not configured.");

  const creds = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const body = new URLSearchParams({ grant_type: "client_credentials" });
  const res = await fetch(SPOTIFY_ACCOUNTS_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${creds}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Spotify token request failed (${res.status}).`);

  const json = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
  };
  if (!json.access_token || !json.expires_in) {
    throw new Error("Spotify token response was invalid.");
  }

  tokenCache = {
    accessToken: json.access_token,
    expiresAt: now + json.expires_in * 1000,
  };
  return json.access_token;
}

async function fetchMoodTracks(input: {
  accessToken: string;
  mood: string;
  genre: string;
  market: string;
}): Promise<{ tracks: SpotifyMoodTrack[]; playlistUrl?: string }> {
  const primaryQuery = `genre:${input.genre}`;
  const fallbackQuery = `${input.genre} ${input.mood}`.trim();
  const buildParams = (query: string) =>
    new URLSearchParams({
      q: query,
      type: "track,playlist",
      market: input.market,
      // Spotify Search API currently caps per-type page size to 10.
      limit: "10",
      offset: "0",
    });

  let res = await fetch(`${SPOTIFY_API_BASE}/search?${buildParams(primaryQuery).toString()}`, {
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
    },
    cache: "no-store",
  });
  if (!res.ok) {
    res = await fetch(`${SPOTIFY_API_BASE}/search?${buildParams(fallbackQuery).toString()}`, {
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
      },
      cache: "no-store",
    });
  }
  if (!res.ok) throw new Error(`Spotify search failed (${res.status}).`);

  const json = (await res.json()) as {
    tracks?: {
      items?: Array<{
        id: string;
        name: string;
        preview_url?: string | null;
        external_urls?: { spotify?: string };
        artists?: Array<{ name?: string }>;
        album?: { name?: string; images?: Array<{ url?: string }> };
      }>;
    };
    playlists?: {
      items?: Array<{
        id: string;
        name: string;
        external_urls?: { spotify?: string };
      }>;
    };
  };

  const deduped = new Map<string, SpotifyMoodTrack>();
  for (const item of json.tracks?.items ?? []) {
    const mapped = toTrack(item);
    if (!mapped) continue;
    const key = `${mapped.name.toLowerCase()}|${mapped.artist.toLowerCase()}`;
    if (!deduped.has(key)) deduped.set(key, mapped);
  }

  const playlistCandidates: SpotifyPlaylistCandidate[] = (json.playlists?.items ?? [])
    .map((item) => {
      const spotifyUrl = item.external_urls?.spotify;
      if (!item.id || !item.name || !spotifyUrl) return null;
      return { id: item.id, name: item.name, spotifyUrl };
    })
    .filter((item): item is SpotifyPlaylistCandidate => item !== null);

  return {
    tracks: Array.from(deduped.values()),
    playlistUrl: playlistCandidates[0]?.spotifyUrl,
  };
}

function shuffleTracks<T>(items: T[]): T[] {
  const copy = [...items];
  for (let idx = copy.length - 1; idx > 0; idx -= 1) {
    const swapIdx = Math.floor(Math.random() * (idx + 1));
    const tmp = copy[idx]!;
    copy[idx] = copy[swapIdx]!;
    copy[swapIdx] = tmp;
  }
  return copy;
}

function trimNearDuplicateTitles(tracks: SpotifyMoodTrack[]): SpotifyMoodTrack[] {
  const seenTitleRoots = new Set<string>();
  const picked: SpotifyMoodTrack[] = [];

  for (const track of tracks) {
    const root = track.name
      .toLowerCase()
      .replace(/\(.*?\)|\[.*?\]/g, "")
      .replace(/- (radio edit|remaster(ed)?|live|acoustic|instrumental).*$/i, "")
      .trim();
    if (seenTitleRoots.has(root)) continue;
    seenTitleRoots.add(root);
    picked.push(track);
    if (picked.length >= 8) break;
  }

  return picked;
}

export async function getSpotifyMoodTileData(input: {
  category?: string | null;
  mood?: string | null;
  market?: string | null;
}): Promise<SpotifyMoodTileData> {
  const enabledRaw = process.env.SPOTIFY_MODULE_ENABLED?.trim().toLowerCase();
  const isEnabled =
    enabledRaw == null ||
    enabledRaw === "" ||
    enabledRaw === "1" ||
    enabledRaw === "true" ||
    enabledRaw === "yes";
  const mood = pickMood({ category: input.category, mood: input.mood });
  const genre = pickGenreForMood(mood);
  const market = normalizeMarket(input.market);
  const cacheKey = `${mood}|${genre}|${market}`;
  const now = Date.now();
  const cached = tileCache.get(cacheKey);
  if (cached && cached.expiresAt > now) return cached.data;

  if (!isEnabled) {
    return getFallbackTile({
      mood,
      market,
      reason: "Spotify module is disabled by configuration.",
    });
  }

  try {
    const accessToken = await fetchSpotifyToken();
    const moodSearch = await fetchMoodTracks({ accessToken, mood, genre, market });
    const rawTracks = moodSearch.tracks;
    const diversifiedTracks = trimNearDuplicateTitles(shuffleTracks(rawTracks));
    if (diversifiedTracks.length === 0) {
      return getFallbackTile({
        mood,
        market,
        reason: "No tracks available for this mood right now.",
      });
    }
    const tracks = diversifiedTracks;
    const tracksWithImages = tracks.filter((track) => Boolean(track.albumImageUrl));
    const randomImageTrack =
      tracksWithImages.length > 0
        ? tracksWithImages[Math.floor(Math.random() * tracksWithImages.length)]
        : undefined;
    const top = tracks[0];
    const data: SpotifyMoodTileData = {
      mode: "spotify",
      title: "Mood Tile",
      subtitle: `A ${mood} track pulse for your stream.`,
      mood,
      market,
      tracks,
      playlistUrl: moodSearch.playlistUrl ?? top?.spotifyUrl,
      imageUrl: randomImageTrack?.albumImageUrl,
    };
    tileCache.set(cacheKey, {
      data,
      expiresAt: now + TILE_CACHE_TTL_MS,
    });
    return data;
  } catch {
    const fallback = getFallbackTile({ mood, market });
    tileCache.set(cacheKey, {
      data: fallback,
      expiresAt: now + TILE_CACHE_TTL_MS,
    });
    return fallback;
  }
}
