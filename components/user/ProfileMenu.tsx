"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { FEED_GAME_TYPES } from "@/lib/games/feedPick";
import type { GameType } from "@/lib/games/types";
import { isCreator } from "@/lib/user/creator";
import {
  isUsernameChangeLocked,
  usernameChangeUnlocksAtIso,
  USERNAME_CHANGE_COOLDOWN_HOURS,
} from "@/lib/user/username-policy";
import type {
  UserProfile,
  UserGameStats,
  WeatherModuleData,
  SpotifyMoodTileData,
  NasaModuleData,
} from "@/lib/types";
import WeatherCard from "@/components/feed/WeatherCard";
import SpotifyMoodTile from "@/components/feed/SpotifyMoodTile";
import NasaApodCard from "@/components/feed/NasaApodCard";
import PlaceAutocompleteInput from "@/components/location/PlaceAutocompleteInput";
import { AvatarInput } from "./AvatarInput";

interface ProfileMenuProps {
  userEmail: string;
  onGameRatioSaved: (ratio: number) => void;
  themePreference: "light" | "dark";
  onThemePreferenceToggle: () => Promise<void>;
  isAdmin?: boolean;
}

function initials(email: string, displayName: string | null): string {
  if (displayName?.trim()) {
    const parts = displayName.trim().split(/\s+/);
    const a = parts[0]?.[0] ?? "?";
    const b = parts[1]?.[0] ?? "";
    return (a + b).toUpperCase();
  }
  const local = email.split("@")[0] ?? email;
  return local.slice(0, 2).toUpperCase() || "?";
}

function formatDuration(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    return `${h}h ${m % 60}m`;
  }
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function readTruthyFlag(input: string | undefined, defaultValue: boolean): boolean {
  if (typeof input !== "string") return defaultValue;
  const normalized = input.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return defaultValue;
}

export function ProfileMenu({
  userEmail,
  onGameRatioSaved,
  themePreference,
  onThemePreferenceToggle,
  isAdmin = false,
}: ProfileMenuProps) {
  const googlePlacesApiKey = process.env.NEXT_PUBLIC_GOOGLE_PLACES_API_KEY?.trim() ?? "";
  const placesAutofillFlag = readTruthyFlag(
    process.env.NEXT_PUBLIC_GOOGLE_PLACES_AUTOFILL_ENABLED,
    false
  );
  const isPlacesAutofillEnabled =
    placesAutofillFlag && googlePlacesApiKey.length > 0;
  const [open, setOpen] = useState(false);
  const [gameSettingsOpen, setGameSettingsOpen] = useState(false);
  const [feedModuleModal, setFeedModuleModal] = useState<
    null | "weather" | "spotify" | "apod"
  >(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [stats, setStats] = useState<UserGameStats | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [themeSaving, setThemeSaving] = useState(false);
  const [weatherUnitSaving, setWeatherUnitSaving] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);
  const [ratioDraft, setRatioDraft] = useState(0.2);
  const [profileForm, setProfileForm] = useState({
    displayName: "",
    username: "",
    weatherLocation: "",
  });
  /** Masthead avatar/name: false until initial GET /api/user/profile finishes */
  const [headerLoading, setHeaderLoading] = useState(true);
  /** After profile loads, hide shimmer once the image has painted (or failed). */
  const [avatarPainted, setAvatarPainted] = useState(false);
  const [avatarBust, setAvatarBust] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [enabledGameTypes, setEnabledGameTypes] = useState<GameType[] | null>(null);
  const [moduleLoading, setModuleLoading] = useState(false);
  const [spotifyLoading, setSpotifyLoading] = useState(false);
  const [moduleError, setModuleError] = useState<string | null>(null);
  const [weatherModuleData, setWeatherModuleData] = useState<WeatherModuleData | null>(null);
  const [spotifyModuleData, setSpotifyModuleData] = useState<SpotifyMoodTileData | null>(null);
  const [apodModuleData, setApodModuleData] = useState<NasaModuleData | null>(null);
  const [apodLoading, setApodLoading] = useState(false);
  const browserGeoRef = useRef<{ lat: number; lon: number } | null>(null);

  useEffect(() => {
    if (!profile?.avatarUrl) {
      setAvatarPainted(true);
      return;
    }
    setAvatarPainted(false);
    setAvatarBust(Date.now());
  }, [profile?.avatarUrl]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/user/profile", { credentials: "include" });
        if (cancelled) return;
        if (res.ok) {
          const data = (await res.json()) as UserProfile;
          setProfile(data);
          setProfileForm({
            displayName: data.displayName ?? "",
            username: data.username ?? "",
            weatherLocation: data.weatherLocation ?? "",
          });
        }
      } finally {
        if (!cancelled) setHeaderLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadAll = useCallback(async () => {
    setLoadError(null);
    try {
      const [pr, st] = await Promise.all([
        fetch("/api/user/profile", { credentials: "include" }),
        fetch("/api/user/game-stats", { credentials: "include" }),
      ]);

      if (pr.ok) {
        const data = (await pr.json()) as UserProfile;
        setProfile(data);
        setProfileForm({
          displayName: data.displayName ?? "",
          username: data.username ?? "",
          weatherLocation: data.weatherLocation ?? "",
        });
      } else {
        setLoadError("Could not load profile.");
      }

      if (st.ok) {
        setStats((await st.json()) as UserGameStats);
      }
    } catch {
      setLoadError("Could not load profile.");
    }
  }, []);

  useEffect(() => {
    if (open) void loadAll();
  }, [open, loadAll]);

  useEffect(() => {
    if (open) return;
    setGameSettingsOpen(false);
    setEditingProfile(false);
  }, [open]);

  useEffect(() => {
    setRatioDraft(profile?.gameRatio ?? 0.2);
  }, [profile?.gameRatio]);

  useEffect(() => {
    if (!profile) return;
    if (enabledGameTypes != null) return;
    if (Array.isArray((profile as unknown as { enabledGameTypes?: unknown }).enabledGameTypes)) {
      setEnabledGameTypes((profile as unknown as { enabledGameTypes: GameType[] }).enabledGameTypes);
    }
  }, [profile, enabledGameTypes]);

  useEffect(() => {
    if (!open) return;
    function onDocMouseDown(e: MouseEvent) {
      const el = wrapRef.current;
      const target = e.target;
      if (target instanceof Element && target.closest('[data-place-autocomplete="true"]')) {
        return;
      }
      if (el && !el.contains(target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function saveGameRatio(value: number) {
    setSaveError(null);
    setSaving(true);
    try {
      const res = await fetch("/api/user/preferences", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameRatio: value }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSaveError(
          typeof data.error === "string" ? data.error : "Could not save."
        );
        return;
      }
      setProfile(data as UserProfile);
      onGameRatioSaved(value);
    } catch {
      setSaveError("Could not save.");
    } finally {
      setSaving(false);
    }
  }

  async function saveThemePreference() {
    setSaveError(null);
    setThemeSaving(true);
    try {
      await onThemePreferenceToggle();
    } catch {
      setSaveError("Could not update theme preference.");
    } finally {
      setThemeSaving(false);
    }
  }

  async function saveWeatherUnitSystem(next: "metric" | "imperial") {
    setSaveError(null);
    setWeatherUnitSaving(true);
    try {
      const res = await fetch("/api/user/preferences", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weatherUnitSystem: next }),
      });
      const data = (await res.json().catch(() => ({}))) as UserProfile & { error?: string };
      if (!res.ok) {
        setSaveError(typeof data.error === "string" ? data.error : "Could not save units preference.");
        return;
      }
      setProfile(data as UserProfile);
      try {
        localStorage.setItem("gentle_stream_weather_unit_system", next);
      } catch {
        /* ignore */
      }
      window.dispatchEvent(
        new CustomEvent("gentle-stream-weather-unit-system", {
          detail: { weatherUnitSystem: next },
        })
      );
    } catch {
      setSaveError("Could not save units preference.");
    } finally {
      setWeatherUnitSaving(false);
    }
  }

  function commitRatioDraft() {
    const rounded = Math.round(ratioDraft * 100) / 100;
    if (Math.abs((profile?.gameRatio ?? 0.2) - rounded) < 0.005) return;
    void saveGameRatio(rounded);
  }

  async function saveEnabledGameTypes(next: GameType[]) {
    setSaveError(null);
    setSaving(true);
    try {
      const res = await fetch("/api/user/preferences", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabledGameTypes: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSaveError(typeof data.error === "string" ? data.error : "Could not save.");
        return;
      }
      setProfile(data as UserProfile);
      setEnabledGameTypes(next);
      window.dispatchEvent(
        new CustomEvent("gentle-stream-enabled-game-types", {
          detail: { enabledGameTypes: next },
        })
      );
    } catch {
      setSaveError("Could not save.");
    } finally {
      setSaving(false);
    }
  }

  function toggleGameType(gameType: GameType) {
    const current = enabledGameTypes ?? (["connections", ...FEED_GAME_TYPES] as GameType[]);
    const has = current.includes(gameType);
    const next = has ? current.filter((t) => t !== gameType) : [...current, gameType];
    if (next.length === 0) return; // keep at least one enabled
    setEnabledGameTypes(next);
    void saveEnabledGameTypes(next);
  }

  async function getBrowserCoordinates(): Promise<{ lat: number; lon: number } | null> {
    if (browserGeoRef.current) return browserGeoRef.current;

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
  }

  async function fetchAdditionalWeatherModule() {
    setModuleError(null);
    setModuleLoading(true);
    try {
      const params = new URLSearchParams();
      const preferredLocation = profileForm.weatherLocation.trim();
      if (preferredLocation) {
        params.set("location", preferredLocation);
      } else {
        const coords = await getBrowserCoordinates();
        if (coords) {
          params.set("lat", String(coords.lat));
          params.set("lon", String(coords.lon));
        }
      }
      const res = await fetch(`/api/feed/modules/weather?${params.toString()}`, {
        cache: "no-store",
        credentials: "include",
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        data?: WeatherModuleData;
      };
      if (!res.ok || !body.data) {
        setModuleError(body.error ?? "Could not fetch weather module data.");
        return;
      }
      setWeatherModuleData(body.data);
    } catch {
      setModuleError("Could not fetch weather module data.");
    } finally {
      setModuleLoading(false);
    }
  }

  async function fetchAdditionalSpotifyModule() {
    setModuleError(null);
    setSpotifyLoading(true);
    try {
      const params = new URLSearchParams();
      const res = await fetch(`/api/feed/modules/spotify?${params.toString()}`, {
        cache: "no-store",
        credentials: "include",
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        data?: SpotifyMoodTileData;
      };
      if (!res.ok || !body.data) {
        setModuleError(body.error ?? "Could not fetch Spotify mood tile.");
        return;
      }
      setSpotifyModuleData(body.data);
    } catch {
      setModuleError("Could not fetch Spotify mood tile.");
    } finally {
      setSpotifyLoading(false);
    }
  }

  async function fetchApodModule() {
    setModuleError(null);
    setApodLoading(true);
    try {
      const res = await fetch("/api/feed/modules/apod", { cache: "no-store" });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        data?: NasaModuleData;
      };
      if (!res.ok || !body.data) {
        setModuleError(body.error ?? "Could not fetch NASA APOD.");
        return;
      }
      setApodModuleData(body.data);
    } catch {
      setModuleError("Could not fetch NASA APOD.");
    } finally {
      setApodLoading(false);
    }
  }

  const displayGameTypes: Array<{ value: GameType; label: string; description: string }> = [
    { value: "connections", label: "Connections (daily)", description: "One daily puzzle per session." },
    { value: "crossword", label: "Crossword", description: "Mini word-square crossword." },
    { value: "rabbit_hole", label: "Wiki rabbit hole", description: "Flashy link-chasing trivia journey." },
    { value: "sudoku", label: "Sudoku", description: "Classic 9×9 logic grid." },
    { value: "killer_sudoku", label: "Killer Sudoku", description: "Cage-sum variant." },
    { value: "word_search", label: "Word search", description: "Find themed words in a grid." },
    { value: "nonogram", label: "Nonogram", description: "Picross-style picture logic." },
  ];

  function SwitchRow({
    label,
    description,
    checked,
    disabled,
    onToggle,
  }: {
    label: string;
    description: string;
    checked: boolean;
    disabled: boolean;
    onToggle: () => void;
  }) {
    const trackOn = "#0ea5a4";
    const trackOff = "#d1d5db";
    const track = checked ? trackOn : trackOff;
    return (
      <button
        type="button"
        onClick={() => (!disabled ? onToggle() : null)}
        disabled={disabled}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "0.75rem",
          width: "100%",
          textAlign: "left",
          padding: "0.75rem 0.85rem",
          border: "1px solid #e3dfd5",
          background: "#fff",
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.7 : 1,
        }}
      >
        <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
          <span
            style={{
              fontFamily: "'Playfair Display', Georgia, serif",
              fontSize: "0.82rem",
              fontWeight: 700,
              color: "#1a1a1a",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {label}
          </span>
          <span
            style={{
              fontFamily: "'IM Fell English', Georgia, serif",
              fontStyle: "italic",
              fontSize: "0.72rem",
              color: "#7b7b7b",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {description}
          </span>
        </span>

        <span
          aria-hidden
          style={{
            position: "relative",
            width: 56,
            height: 32,
            background: track,
            borderRadius: 999,
            transition: "background 180ms ease",
            flexShrink: 0,
          }}
        >
          <span
            style={{
              position: "absolute",
              top: 3,
              left: checked ? 28 : 3,
              width: 26,
              height: 26,
              borderRadius: "50%",
              background: "#fff",
              boxShadow: "0 2px 8px rgba(0,0,0,0.18)",
              transition: "left 180ms ease",
            }}
          />
        </span>
      </button>
    );
  }

  async function saveProfileFields(): Promise<boolean> {
    setSaveError(null);
    setSaving(true);
    try {
      const usernameLocked =
        profile != null &&
        isUsernameChangeLocked(profile.username, profile.usernameSetAt);

      const res = await fetch("/api/user/profile", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: profileForm.displayName.trim() || null,
          weatherLocation: profileForm.weatherLocation.trim() || null,
          ...(usernameLocked
            ? {}
            : { username: profileForm.username.trim().toLowerCase() || null }),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        unlockAt?: string;
      };
      if (!res.ok) {
        if (
          res.status === 429 &&
          typeof data.unlockAt === "string" &&
          typeof data.error === "string"
        ) {
          const when = new Date(data.unlockAt).toLocaleString(undefined, {
            dateStyle: "medium",
            timeStyle: "short",
          });
          setSaveError(`${data.error} (${when})`);
        } else {
          setSaveError(
            typeof data.error === "string" ? data.error : "Could not save profile."
          );
        }
        return false;
      }
      setProfile(data as UserProfile);
      try {
        const nextLocation = (data as UserProfile).weatherLocation;
        if (typeof nextLocation === "string" && nextLocation.trim()) {
          localStorage.setItem("gentle_stream_weather_location", nextLocation.trim());
        } else {
          localStorage.removeItem("gentle_stream_weather_location");
        }
      } catch {
        /* ignore */
      }
    } catch {
      setSaveError("Could not save profile.");
      return false;
    } finally {
      setSaving(false);
    }
    return true;
  }

  const creator = profile ? isCreator(profile) : false;

  const label =
    profile?.displayName?.trim() ||
    (profile?.username ? `@${profile.username}` : null) ||
    userEmail.split("@")[0];

  const sublabel =
    profile?.username && profile?.displayName
      ? `@${profile.username}`
      : userEmail;

  const usernameLocked =
    profile != null &&
    isUsernameChangeLocked(profile.username, profile.usernameSetAt);

  const headerAvatarSrc = profile?.avatarUrl
    ? `${profile.avatarUrl.split("?")[0]}?t=${avatarBust}`
    : null;

  return (
    <div
      ref={wrapRef}
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        gap: "0.5rem",
        flexShrink: 0,
        maxWidth: "min(90vw, 420px)",
      }}
    >
      <button
        className="gs-interactive gs-focus-ring"
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-busy={headerLoading}
        aria-label={headerLoading ? "Profile, loading" : "Open profile menu"}
        onClick={() => setOpen((o) => !o)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.45rem",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          padding: "0.15rem 0.25rem",
          textAlign: "left",
        }}
      >
        {headerLoading ? (
          <div
            className="profile-header-shimmer profile-header-skeleton-avatar"
            aria-hidden
          />
        ) : headerAvatarSrc ? (
          <div
            style={{
              position: "relative",
              width: 36,
              height: 36,
              flexShrink: 0,
            }}
          >
            {!avatarPainted && (
              <div
                className="profile-header-shimmer profile-header-skeleton-avatar"
                style={{ position: "absolute", inset: 0 }}
                aria-hidden
              />
            )}
            <img
              src={headerAvatarSrc}
              alt=""
              width={36}
              height={36}
              onLoad={() => setAvatarPainted(true)}
              onError={() => setAvatarPainted(true)}
              style={{
                position: "relative",
                display: "block",
                borderRadius: "50%",
                objectFit: "cover",
                border: "1px solid #ccc",
                opacity: avatarPainted ? 1 : 0,
                transition: "opacity 0.28s ease",
              }}
            />
          </div>
        ) : (
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: "50%",
              background: "linear-gradient(135deg, #4a6741, #2c3d28)",
              color: "#faf8f3",
              fontFamily: "'Playfair Display', Georgia, serif",
              fontSize: "0.72rem",
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {initials(userEmail, profile?.displayName ?? null)}
          </div>
        )}
        <span
          style={{
            display: "flex",
            flexDirection: "column",
            minWidth: 0,
            lineHeight: 1.2,
          }}
        >
          {headerLoading ? (
            <>
              <span
                className="profile-header-shimmer profile-header-skeleton-line profile-header-skeleton-line--primary"
                aria-hidden
              />
              <span
                className="profile-header-shimmer profile-header-skeleton-line profile-header-skeleton-line--secondary"
                aria-hidden
              />
            </>
          ) : (
            <>
              <span
                style={{
                  fontFamily: "'Playfair Display', Georgia, serif",
                  fontSize: "0.72rem",
                  fontWeight: 700,
                  color: "#1a1a1a",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  maxWidth: "min(36vw, 160px)",
                }}
              >
                {label}
              </span>
              <span
                style={{
                  fontFamily: "'IM Fell English', Georgia, serif",
                  fontSize: "0.62rem",
                  color: "#888",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  maxWidth: "min(36vw, 160px)",
                }}
              >
                {sublabel}
              </span>
            </>
          )}
        </span>
        <span style={{ color: "#999", fontSize: "0.55rem" }} aria-hidden>
          ▾
        </span>
      </button>

      <SignOutButton />

      {open && (
        <div
          role="dialog"
          aria-label="Profile and library"
          className="gs-card-lift"
          style={{
            position: "absolute",
            right: 0,
            top: "calc(100% + 8px)",
            width: "min(340px, 94vw)",
            maxHeight: "min(78vh, 640px)",
            overflowY: "auto",
            background: "var(--gs-surface-elevated)",
            border: "1px solid var(--gs-border-strong)",
            borderRadius: "var(--gs-radius-lg)",
            boxShadow: "var(--gs-shadow-popover)",
            padding: "1rem 1rem 0.9rem",
            zIndex: 200,
            textAlign: "left",
          }}
        >
          {loadError && (
            <p style={{ color: "#8b4513", fontSize: "0.78rem" }}>{loadError}</p>
          )}

          {creator && (
            <div
              style={{
                fontSize: "0.72rem",
                color: "#1a472a",
                background: "#e8f2ec",
                padding: "0.45rem 0.55rem",
                marginBottom: "0.75rem",
                border: "1px solid #b8d4c8",
                fontFamily: "'IM Fell English', Georgia, serif",
              }}
            >
              <strong style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
                Creator
              </strong>
              — your submissions are routed through approval before publishing.
            </div>
          )}

          <section style={{ marginBottom: "1rem" }}>
            <h3
              style={{
                fontFamily: "'Playfair Display', Georgia, serif",
                fontSize: "0.78rem",
                margin: "0 0 0.45rem",
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                color: "#555",
              }}
            >
              Account
            </h3>
            <Link
              href="/account/settings"
              onClick={() => setOpen(false)}
              style={{
                display: "inline-block",
                fontFamily: "'Playfair Display', Georgia, serif",
                fontSize: "0.8rem",
                fontWeight: 700,
                color: "#1a472a",
                textDecoration: "underline",
                textUnderlineOffset: "3px",
                marginBottom: "0.55rem",
              }}
            >
              Account settings
            </Link>
            <ul
              style={{
                margin: 0,
                paddingLeft: "1.1rem",
                display: "flex",
                flexDirection: "column",
                gap: "0.35rem",
                fontFamily: "'IM Fell English', Georgia, serif",
                fontSize: "0.72rem",
                color: "#555",
                lineHeight: 1.45,
              }}
            >
              <li>
                <Link
                  href="/privacy"
                  onClick={() => setOpen(false)}
                  style={{ color: "#1a472a", fontWeight: 600, textDecoration: "underline", textUnderlineOffset: "2px" }}
                >
                  Privacy
                </Link>
              </li>
              <li>
                <Link
                  href="/terms"
                  onClick={() => setOpen(false)}
                  style={{ color: "#1a472a", fontWeight: 600, textDecoration: "underline", textUnderlineOffset: "2px" }}
                >
                  Terms
                </Link>
              </li>
              <li>
                <Link
                  href="/data-deletion"
                  onClick={() => setOpen(false)}
                  style={{ color: "#1a472a", fontWeight: 600, textDecoration: "underline", textUnderlineOffset: "2px" }}
                >
                  Data deletion
                </Link>
              </li>
              <li>
                <Link
                  href="/sms-consent"
                  onClick={() => setOpen(false)}
                  style={{ color: "#1a472a", fontWeight: 600, textDecoration: "underline", textUnderlineOffset: "2px" }}
                >
                  SMS consent
                </Link>
              </li>
            </ul>
          </section>

          <div style={{ margin: "0.2rem 0 1rem" }}>
            <button
              className="gs-interactive gs-focus-ring"
              type="button"
              onClick={() => setGameSettingsOpen(true)}
              style={{
                display: "inline-block",
                fontFamily: "'Playfair Display', Georgia, serif",
                fontSize: "0.8rem",
                fontWeight: 700,
                color: "#1a472a",
                textDecoration: "underline",
                textUnderlineOffset: "3px",
                background: "transparent",
                border: "none",
                padding: 0,
                cursor: "pointer",
              }}
            >
              Game settings
            </button>
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "0.4rem",
              marginBottom: "1rem",
            }}
          >
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setFeedModuleModal("weather");
                setModuleError(null);
                void fetchAdditionalWeatherModule();
              }}
              style={{
                background: "none",
                border: "none",
                padding: 0,
                cursor: "pointer",
                color: "#1a472a",
                fontWeight: 600,
                textDecoration: "underline",
                textUnderlineOffset: "2px",
                fontFamily: "'IM Fell English', Georgia, serif",
                fontSize: "0.74rem",
                textAlign: "left",
              }}
            >
              Weather
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setFeedModuleModal("spotify");
                setModuleError(null);
                void fetchAdditionalSpotifyModule();
              }}
              style={{
                background: "none",
                border: "none",
                padding: 0,
                cursor: "pointer",
                color: "#1a472a",
                fontWeight: 600,
                textDecoration: "underline",
                textUnderlineOffset: "2px",
                fontFamily: "'IM Fell English', Georgia, serif",
                fontSize: "0.74rem",
                textAlign: "left",
              }}
            >
              Spotify mood
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setFeedModuleModal("apod");
                setModuleError(null);
                void fetchApodModule();
              }}
              style={{
                background: "none",
                border: "none",
                padding: 0,
                cursor: "pointer",
                color: "#1a472a",
                fontWeight: 600,
                textDecoration: "underline",
                textUnderlineOffset: "2px",
                fontFamily: "'IM Fell English', Georgia, serif",
                fontSize: "0.74rem",
                textAlign: "left",
              }}
            >
              NASA APOD
            </button>
          </div>

          <section style={{ marginBottom: "1rem" }}>
            <h3
              style={{
                fontFamily: "'Playfair Display', Georgia, serif",
                fontSize: "0.78rem",
                margin: "0 0 0.45rem",
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                color: "#555",
              }}
            >
              Creator tools
            </h3>
            <Link
              href={creator ? "/creator" : "/creator/onboarding"}
              onClick={() => setOpen(false)}
              style={{
                display: "inline-block",
                fontFamily: "'Playfair Display', Georgia, serif",
                fontSize: "0.8rem",
                fontWeight: 700,
                color: "#1a472a",
                textDecoration: "underline",
                textUnderlineOffset: "3px",
              }}
            >
              {creator ? "Open creator studio" : "Apply as a creator"}
            </Link>
          </section>

          <section style={{ marginBottom: "1rem" }}>
            <h3
              style={{
                fontFamily: "'Playfair Display', Georgia, serif",
                fontSize: "0.78rem",
                margin: "0 0 0.45rem",
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                color: "#555",
              }}
            >
              Profile
            </h3>
            {!editingProfile ? (
              <>
                <div
                  style={{
                    display: "grid",
                    gap: "0.28rem",
                    fontFamily: "'IM Fell English', Georgia, serif",
                    fontSize: "0.78rem",
                    color: "#4d4d4d",
                    marginBottom: "0.55rem",
                  }}
                >
                  <div>
                    <strong style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
                      Name:
                    </strong>{" "}
                    {profile?.displayName?.trim() || "Not set"}
                  </div>
                  <div>
                    <strong style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
                      Username:
                    </strong>{" "}
                    {profile?.username ? `@${profile.username}` : "Not set"}
                  </div>
                  <div>
                    <strong style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
                      Weather:
                    </strong>{" "}
                    {profile?.weatherLocation?.trim() || "Automatic"}
                  </div>
                </div>
                <button
                  type="button"
                  aria-label="Edit profile"
                  title="Edit profile"
                  onClick={() => setEditingProfile(true)}
                  style={{
                    border: "1px solid #1a1a1a",
                    background: "#fff",
                    width: "2rem",
                    height: "2rem",
                    borderRadius: "999px",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                  }}
                >
                  <svg
                    width="13"
                    height="13"
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    aria-hidden
                  >
                    <path
                      d="M4 20H8L19 9L15 5L4 16V20Z"
                      stroke="#1a1a1a"
                      strokeWidth="1.8"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M13.5 6.5L17.5 10.5"
                      stroke="#1a1a1a"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
              </>
            ) : (
              <>
                <label
                  style={{
                    fontSize: "0.65rem",
                    color: "#888",
                    display: "block",
                    marginBottom: "0.2rem",
                  }}
                >
                  Display name
                </label>
                <input
                  value={profileForm.displayName}
                  onChange={(e) =>
                    setProfileForm((f) => ({ ...f, displayName: e.target.value }))
                  }
                  placeholder="Your name"
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    marginBottom: "0.45rem",
                    padding: "0.35rem 0.45rem",
                    border: "1px solid #ccc",
                    fontSize: "0.85rem",
                  }}
                />
                <label
                  style={{
                    fontSize: "0.65rem",
                    color: "#888",
                    display: "block",
                    marginBottom: "0.2rem",
                  }}
                >
                  Username
                </label>
                {usernameLocked && profile?.usernameSetAt ? (
                  <p
                    style={{
                      fontSize: "0.65rem",
                      color: "#777",
                      margin: "0 0 0.35rem",
                      lineHeight: 1.35,
                      fontFamily: "'IM Fell English', Georgia, serif",
                    }}
                  >
                    You can change this again after{" "}
                    {new Date(
                      usernameChangeUnlocksAtIso(profile.usernameSetAt)
                    ).toLocaleString(undefined, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}{" "}
                    ({USERNAME_CHANGE_COOLDOWN_HOURS}-hour lock after each change).
                  </p>
                ) : (
                  <p
                    style={{
                      fontSize: "0.62rem",
                      color: "#aaa",
                      margin: "0 0 0.35rem",
                      lineHeight: 1.35,
                    }}
                  >
                    Unique on the site; lowercase letters, numbers, underscore (3–30).
                  </p>
                )}
                <input
                  value={profileForm.username}
                  onChange={(e) =>
                    setProfileForm((f) => ({
                      ...f,
                      username: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""),
                    }))
                  }
                  placeholder="letters_numbers_underscore"
                  disabled={usernameLocked}
                  aria-readonly={usernameLocked}
                  title={
                    usernameLocked
                      ? "Username is locked for 24 hours after the last change"
                      : undefined
                  }
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    marginBottom: "0.45rem",
                    padding: "0.35rem 0.45rem",
                    border: "1px solid #ccc",
                    fontSize: "0.85rem",
                    background: usernameLocked ? "#f0ede6" : undefined,
                    cursor: usernameLocked ? "not-allowed" : undefined,
                  }}
                />
                <label
                  style={{
                    fontSize: "0.65rem",
                    color: "#888",
                    display: "block",
                    marginBottom: "0.2rem",
                  }}
                >
                  Weather location
                </label>
                {isPlacesAutofillEnabled ? (
                  <PlaceAutocompleteInput
                    value={profileForm.weatherLocation}
                    onChange={(nextValue) =>
                      setProfileForm((f) => ({ ...f, weatherLocation: nextValue }))
                    }
                    onSelect={(selection) =>
                      setProfileForm((f) => ({
                        ...f,
                        weatherLocation: selection.label,
                      }))
                    }
                    ariaLabel="Weather location"
                    placeholder="Search location (e.g. New York, NY, USA)"
                    inputStyle={{
                      width: "100%",
                      boxSizing: "border-box",
                      marginBottom: "0.45rem",
                      padding: "0.35rem 0.45rem",
                      border: "1px solid #ccc",
                      fontSize: "0.85rem",
                    }}
                  />
                ) : (
                  <input
                    value={profileForm.weatherLocation}
                    onChange={(e) =>
                      setProfileForm((f) => ({ ...f, weatherLocation: e.target.value }))
                    }
                    placeholder="City or region (e.g. New York)"
                    style={{
                      width: "100%",
                      boxSizing: "border-box",
                      marginBottom: "0.45rem",
                      padding: "0.35rem 0.45rem",
                      border: "1px solid #ccc",
                      fontSize: "0.85rem",
                    }}
                  />
                )}
                {profile && (
                  <AvatarInput
                    userEmail={userEmail}
                    displayName={profile.displayName}
                    currentAvatarUrl={profile.avatarUrl}
                    onProfileUpdate={(p) => setProfile(p)}
                    onError={(msg) => setSaveError(msg)}
                  />
                )}
                <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.45rem" }}>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={async () => {
                      const ok = await saveProfileFields();
                      if (ok) setEditingProfile(false);
                    }}
                    style={{
                      background: "#1a1a1a",
                      color: "#faf8f3",
                      border: "none",
                      padding: "0.35rem 0.75rem",
                      fontFamily: "'Playfair Display', Georgia, serif",
                      fontSize: "0.68rem",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      cursor: saving ? "wait" : "pointer",
                    }}
                  >
                    Save profile
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => {
                      setEditingProfile(false);
                      setProfileForm({
                        displayName: profile?.displayName ?? "",
                        username: profile?.username ?? "",
                        weatherLocation: profile?.weatherLocation ?? "",
                      });
                    }}
                    style={{
                      border: "1px solid #777",
                      background: "#fff",
                      padding: "0.35rem 0.65rem",
                      fontFamily: "'Playfair Display', Georgia, serif",
                      fontSize: "0.68rem",
                      cursor: saving ? "wait" : "pointer",
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </>
            )}
          </section>

          <section style={{ marginBottom: "1rem" }}>
            <h3
              style={{
                fontFamily: "'Playfair Display', Georgia, serif",
                fontSize: "0.78rem",
                margin: "0 0 0.45rem",
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                color: "#555",
              }}
            >
              Appearance
            </h3>
            <button
              type="button"
              role="switch"
              aria-checked={themePreference === "dark"}
              aria-label="Toggle dark mode"
              disabled={themeSaving}
              onClick={() => void saveThemePreference()}
              style={{
                border: "1px solid #1a1a1a",
                background: themePreference === "dark" ? "#161a21" : "#f6f4ee",
                width: "3.2rem",
                height: "1.85rem",
                borderRadius: "999px",
                position: "relative",
                padding: 0,
                cursor: themeSaving ? "wait" : "pointer",
              }}
            >
              <span
                aria-hidden
                style={{
                  position: "absolute",
                  top: "0.12rem",
                  left: themePreference === "dark" ? "1.45rem" : "0.12rem",
                  width: "1.48rem",
                  height: "1.48rem",
                  borderRadius: "999px",
                  background: themePreference === "dark" ? "#0d1117" : "#ffffff",
                  border: "1px solid #bdb8ad",
                  boxShadow: "0 2px 7px rgba(0,0,0,0.22)",
                  transition: "left 180ms ease",
                }}
              />
            </button>
            <span
              style={{
                marginLeft: "0.55rem",
                fontFamily: "'IM Fell English', Georgia, serif",
                fontSize: "0.72rem",
                color: "#666",
              }}
            >
              {themePreference === "dark" ? "Dark mode" : "Light mode"}
            </span>
            <div style={{ marginTop: "0.65rem" }}>
              <div
                style={{
                  fontFamily: "'IM Fell English', Georgia, serif",
                  fontSize: "0.72rem",
                  color: "#666",
                  marginBottom: "0.3rem",
                }}
              >
                Units
              </div>
              <div
                style={{
                  display: "inline-flex",
                  border: "1px solid #c8bea9",
                  borderRadius: "999px",
                  overflow: "hidden",
                }}
              >
                {([
                  { id: "metric", label: "Metric" },
                  { id: "imperial", label: "Imperial" },
                ] as const).map((unit) => {
                  const active = (profile?.weatherUnitSystem ?? "metric") === unit.id;
                  return (
                    <button
                      key={unit.id}
                      type="button"
                      disabled={weatherUnitSaving}
                      onClick={() => void saveWeatherUnitSystem(unit.id)}
                      style={{
                        border: "none",
                        background: active ? "#1a1a1a" : "#f5f1e8",
                        color: active ? "#fff" : "#5d5445",
                        fontSize: "0.66rem",
                        padding: "0.22rem 0.5rem",
                        cursor: weatherUnitSaving ? "wait" : "pointer",
                        lineHeight: 1.35,
                      }}
                    >
                      {unit.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </section>

          <section style={{ marginBottom: "1rem" }}>
            <h3
              style={{
                fontFamily: "'Playfair Display', Georgia, serif",
                fontSize: "0.78rem",
                margin: "0 0 0.45rem",
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                color: "#555",
              }}
            >
              Game stats
            </h3>
            <Link
              href="/me/game-stats"
              onClick={() => setOpen(false)}
              style={{
                display: "inline-block",
                fontFamily: "'Playfair Display', Georgia, serif",
                fontSize: "0.8rem",
                fontWeight: 700,
                color: "#1a472a",
                textDecoration: "underline",
                textUnderlineOffset: "3px",
              }}
            >
              View game statistics
            </Link>
            {stats && stats.totalCompletions > 0 ? (
              <p
                style={{
                  fontFamily: "'IM Fell English', Georgia, serif",
                  fontSize: "0.72rem",
                  color: "#888",
                  margin: "0.35rem 0 0",
                  lineHeight: 1.4,
                }}
              >
                <strong>{stats.totalCompletions}</strong> puzzles ·{" "}
                {formatDuration(stats.totalSecondsPlayed)} total
              </p>
            ) : (
              <p
                style={{
                  fontStyle: "italic",
                  color: "#aaa",
                  fontSize: "0.72rem",
                  margin: "0.35rem 0 0",
                }}
              >
                Finish a puzzle to start your history (by difficulty).
              </p>
            )}
          </section>

          <section style={{ marginBottom: "1rem" }}>
            <h3
              style={{
                fontFamily: "'Playfair Display', Georgia, serif",
                fontSize: "0.78rem",
                margin: "0 0 0.45rem",
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                color: "#555",
              }}
            >
              Saved articles
            </h3>
            <Link
              href="/me/saved"
              onClick={() => setOpen(false)}
              style={{
                display: "inline-block",
                fontFamily: "'Playfair Display', Georgia, serif",
                fontSize: "0.8rem",
                fontWeight: 700,
                color: "#1a472a",
                textDecoration: "underline",
                textUnderlineOffset: "3px",
              }}
            >
              Open saved library
            </Link>
            <p
              style={{
                fontFamily: "'IM Fell English', Georgia, serif",
                fontSize: "0.72rem",
                color: "#888",
                margin: "0.35rem 0 0",
                lineHeight: 1.4,
              }}
            >
              Use <strong>Save</strong> on an article card; manage the full list here.
            </p>
          </section>

          {isAdmin ? (
            <section style={{ marginBottom: "1rem" }}>
              <h3
                style={{
                  fontFamily: "'Playfair Display', Georgia, serif",
                  fontSize: "0.78rem",
                  margin: "0 0 0.45rem",
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  color: "#555",
                }}
              >
                Admin
              </h3>
              <Link
                href="/admin/submissions"
                onClick={() => setOpen(false)}
                style={{
                  display: "inline-block",
                  fontFamily: "'Playfair Display', Georgia, serif",
                  fontSize: "0.8rem",
                  fontWeight: 700,
                  color: "#1a472a",
                  textDecoration: "underline",
                  textUnderlineOffset: "3px",
                }}
              >
                Open moderation queue
              </Link>
            </section>
          ) : null}

          <section style={{ marginBottom: "0.75rem" }}>
            <h3
              style={{
                fontFamily: "'Playfair Display', Georgia, serif",
                fontSize: "0.78rem",
                margin: "0 0 0.45rem",
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                color: "#555",
              }}
            >
              Games in feed
            </h3>
            <p
              style={{
                fontSize: "0.72rem",
                color: "#777",
                margin: "0 0 0.5rem",
                lineHeight: 1.4,
              }}
            >
              Changing this refreshes your stream from the top.
            </p>
            <div style={{ padding: "0.25rem 0.05rem 0.1rem" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontFamily: "'IM Fell English', Georgia, serif",
                  fontSize: "0.68rem",
                  color: "#6f6758",
                  marginBottom: "0.35rem",
                }}
              >
                <span>All articles</span>
                <span>All games</span>
              </div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={ratioDraft}
                disabled={saving}
                onChange={(event) => {
                  setRatioDraft(Number(event.target.value));
                }}
                onMouseUp={commitRatioDraft}
                onTouchEnd={commitRatioDraft}
                onBlur={commitRatioDraft}
                style={{
                  width: "100%",
                  accentColor: "#6419db",
                  cursor: saving ? "wait" : "pointer",
                }}
              />
              <div
                aria-hidden
                style={{
                  marginTop: "0.2rem",
                  display: "grid",
                  gridTemplateColumns: "auto 1fr auto 1fr auto",
                  alignItems: "center",
                  gap: "0.25rem",
                  color: "#6419db",
                }}
              >
                <span style={{ width: 9, height: 9, borderRadius: "50%", background: "currentColor" }} />
                <span style={{ height: 2, background: "currentColor", opacity: 0.3 }} />
                <span style={{ width: 9, height: 9, borderRadius: "50%", background: "currentColor" }} />
                <span style={{ height: 2, background: "currentColor", opacity: 0.3 }} />
                <span style={{ width: 9, height: 9, borderRadius: "50%", background: "currentColor" }} />
              </div>
              <div
                style={{
                  marginTop: "0.35rem",
                  fontFamily: "'Playfair Display', Georgia, serif",
                  fontSize: "0.72rem",
                  color: "#1a1a1a",
                }}
              >
                Games: {(ratioDraft * 100).toFixed(0)}% · Articles:{" "}
                {(100 - ratioDraft * 100).toFixed(0)}%
              </div>
            </div>
          </section>

          {saveError && (
            <p style={{ color: "#8b4513", fontSize: "0.75rem" }}>{saveError}</p>
          )}
        </div>
      )}

      {open && gameSettingsOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Game settings"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setGameSettingsOpen(false);
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
            style={{
              width: "min(520px, 96vw)",
              background: "var(--gs-surface-elevated)",
              border: "1px solid var(--gs-border-strong)",
              borderRadius: "var(--gs-radius-lg)",
              boxShadow: "var(--gs-shadow-overlay)",
              padding: "1rem 1rem 0.9rem",
              maxHeight: "min(82vh, 720px)",
              overflowY: "auto",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "0.75rem",
                marginBottom: "0.75rem",
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontFamily: "'Playfair Display', Georgia, serif",
                    fontSize: "1rem",
                    fontWeight: 800,
                    letterSpacing: "0.02em",
                    color: "#1a1a1a",
                  }}
                >
                  Game settings
                </div>
                <div
                  style={{
                    marginTop: "0.1rem",
                    fontFamily: "'IM Fell English', Georgia, serif",
                    fontStyle: "italic",
                    fontSize: "0.78rem",
                    color: "#777",
                  }}
                >
                  Toggle which puzzle types can appear in your stream.
                </div>
              </div>
              <button
                className="gs-interactive gs-focus-ring"
                type="button"
                onClick={() => setGameSettingsOpen(false)}
                style={{
                  border: "1px solid var(--gs-border-strong)",
                  background: "var(--gs-surface-soft)",
                  borderRadius: "var(--gs-radius-pill)",
                  padding: "0.35rem 0.7rem",
                  fontFamily: "'Playfair Display', Georgia, serif",
                  fontSize: "0.72rem",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  cursor: "pointer",
                }}
              >
                Close
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.55rem" }}>
              {displayGameTypes.map((g) => {
                const current = enabledGameTypes ?? (["connections", ...FEED_GAME_TYPES] as GameType[]);
                const checked = current.includes(g.value);
                const disableUncheck = checked && current.length <= 1;
                return (
                  <SwitchRow
                    key={g.value}
                    label={g.label}
                    description={g.description}
                    checked={checked}
                    disabled={saving || disableUncheck}
                    onToggle={() => toggleGameType(g.value)}
                  />
                );
              })}
            </div>
          </div>
        </div>
      )}

      {feedModuleModal !== null && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Feed module"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setFeedModuleModal(null);
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
            style={{
              width: "min(620px, 96vw)",
              background: "var(--gs-surface-elevated)",
              border: "1px solid var(--gs-border-strong)",
              borderRadius: "var(--gs-radius-lg)",
              boxShadow: "var(--gs-shadow-overlay)",
              padding: "1rem 1rem 0.9rem",
              maxHeight: "min(86vh, 760px)",
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
                onClick={() => setFeedModuleModal(null)}
                style={{
                  border: "1px solid var(--gs-border-strong)",
                  background: "var(--gs-surface-soft)",
                  borderRadius: "var(--gs-radius-pill)",
                  padding: "0.35rem 0.7rem",
                  fontFamily: "'Playfair Display', Georgia, serif",
                  fontSize: "0.72rem",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  cursor: "pointer",
                }}
              >
                Close
              </button>
            </div>

            {moduleError ? (
              <p
                style={{
                  margin: "0.25rem 0 0.75rem",
                  color: "#8b4513",
                  fontSize: "0.74rem",
                }}
              >
                {moduleError}
              </p>
            ) : null}

            {feedModuleModal === "weather" ? (
              moduleLoading ? (
                <p
                  style={{
                    margin: "0.5rem 0 0",
                    fontFamily: "'IM Fell English', Georgia, serif",
                    fontStyle: "italic",
                    color: "#888",
                    fontSize: "0.8rem",
                  }}
                >
                  Loading weather&hellip;
                </p>
              ) : weatherModuleData ? (
                <WeatherCard
                  data={weatherModuleData}
                  reason="singleton"
                  weatherUnitSystem={profile?.weatherUnitSystem ?? "metric"}
                  embedded
                />
              ) : (
                <p
                  style={{
                    margin: "0.5rem 0 0",
                    fontFamily: "'IM Fell English', Georgia, serif",
                    color: "#888",
                    fontSize: "0.8rem",
                  }}
                >
                  No weather data yet.
                </p>
              )
            ) : null}

            {feedModuleModal === "spotify" ? (
              spotifyLoading ? (
                <p
                  style={{
                    margin: "0.5rem 0 0",
                    fontFamily: "'IM Fell English', Georgia, serif",
                    fontStyle: "italic",
                    color: "#888",
                    fontSize: "0.8rem",
                  }}
                >
                  Loading Spotify&hellip;
                </p>
              ) : spotifyModuleData ? (
                <SpotifyMoodTile data={spotifyModuleData} reason="singleton" />
              ) : (
                <p
                  style={{
                    margin: "0.5rem 0 0",
                    fontFamily: "'IM Fell English', Georgia, serif",
                    color: "#888",
                    fontSize: "0.8rem",
                  }}
                >
                  No Spotify data yet.
                </p>
              )
            ) : null}

            {feedModuleModal === "apod" ? (
              apodLoading ? (
                <p
                  style={{
                    margin: "0.5rem 0 0",
                    fontFamily: "'IM Fell English', Georgia, serif",
                    fontStyle: "italic",
                    color: "#888",
                    fontSize: "0.8rem",
                  }}
                >
                  Loading NASA APOD&hellip;
                </p>
              ) : apodModuleData ? (
                <NasaApodCard data={apodModuleData} reason="singleton" />
              ) : (
                <p
                  style={{
                    margin: "0.5rem 0 0",
                    fontFamily: "'IM Fell English', Georgia, serif",
                    color: "#888",
                    fontSize: "0.8rem",
                  }}
                >
                  No APOD data yet.
                </p>
              )
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
