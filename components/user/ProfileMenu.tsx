"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { SignOutButton } from "@/components/auth/SignOutButton";
import {
  GAME_RATIO_PRESETS,
  nearestPresetValue,
} from "@/lib/user/feed-settings";
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
} from "@/lib/types";
import WeatherFillerCard from "@/components/feed/WeatherFillerCard";
import SpotifyMoodTile from "@/components/feed/SpotifyMoodTile";
import { AvatarInput } from "./AvatarInput";

interface ProfileMenuProps {
  userEmail: string;
  onGameRatioSaved: (ratio: number) => void;
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

export function ProfileMenu({
  userEmail,
  onGameRatioSaved,
  isAdmin = false,
}: ProfileMenuProps) {
  const [open, setOpen] = useState(false);
  const [gameSettingsOpen, setGameSettingsOpen] = useState(false);
  const [additionalGoodiesOpen, setAdditionalGoodiesOpen] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [stats, setStats] = useState<UserGameStats | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
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
    setAdditionalGoodiesOpen(false);
  }, [open]);

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
      if (el && !el.contains(e.target as Node)) setOpen(false);
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
    try {
      const stored = localStorage.getItem("gentle_stream_browser_geo");
      if (stored) {
        const parsed = JSON.parse(stored) as { lat?: unknown; lon?: unknown };
        if (typeof parsed.lat === "number" && typeof parsed.lon === "number") {
          return { lat: parsed.lat, lon: parsed.lon };
        }
      }
    } catch {
      /* ignore malformed cache */
    }

    if (typeof navigator === "undefined" || !navigator.geolocation) return null;
    return await new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const coords = {
            lat: position.coords.latitude,
            lon: position.coords.longitude,
          };
          try {
            localStorage.setItem("gentle_stream_browser_geo", JSON.stringify(coords));
          } catch {
            /* ignore storage issues */
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

  const displayGameTypes: Array<{ value: GameType; label: string; description: string }> = [
    { value: "connections", label: "Connections (daily)", description: "One daily puzzle per session." },
    { value: "crossword", label: "Crossword", description: "Mini word-square crossword." },
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

  async function saveProfileFields() {
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
        return;
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
    } finally {
      setSaving(false);
    }
  }

  const currentRatio = profile?.gameRatio ?? 0.2;
  const highlightedPreset = nearestPresetValue(currentRatio);
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
          style={{
            position: "absolute",
            right: 0,
            top: "calc(100% + 8px)",
            width: "min(340px, 94vw)",
            maxHeight: "min(78vh, 640px)",
            overflowY: "auto",
            background: "#faf8f3",
            border: "1.5px solid #1a1a1a",
            boxShadow: "0 12px 40px rgba(0,0,0,0.15)",
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
          <div style={{ margin: "0.2rem 0 1rem" }}>
            <button
              type="button"
              onClick={() => setAdditionalGoodiesOpen(true)}
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
              Additional goodies
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
            {profile && (
              <AvatarInput
                userEmail={userEmail}
                displayName={profile.displayName}
                currentAvatarUrl={profile.avatarUrl}
                onProfileUpdate={(p) => setProfile(p)}
                onError={(msg) => setSaveError(msg)}
              />
            )}
            <button
              type="button"
              disabled={saving}
              onClick={() => void saveProfileFields()}
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
            <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
              {GAME_RATIO_PRESETS.map((preset) => {
                const selected = preset.value === highlightedPreset;
                return (
                  <button
                    key={preset.value}
                    type="button"
                    disabled={saving}
                    onClick={() => void saveGameRatio(preset.value)}
                    style={{
                      textAlign: "left",
                      padding: "0.4rem 0.5rem",
                      border: selected ? "2px solid #1a1a1a" : "1px solid #ddd",
                      background: selected ? "#ede9e1" : "#fff",
                      cursor: saving ? "wait" : "pointer",
                      fontFamily: "'Playfair Display', Georgia, serif",
                      fontSize: "0.7rem",
                    }}
                  >
                    <span style={{ fontWeight: 700 }}>{preset.label}</span>
                    <span
                      style={{
                        display: "block",
                        fontFamily: "'IM Fell English', Georgia, serif",
                        fontStyle: "italic",
                        fontSize: "0.65rem",
                        color: "#888",
                      }}
                    >
                      {preset.description}
                    </span>
                  </button>
                );
              })}
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
            background: "rgba(0,0,0,0.42)",
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
              background: "#faf8f3",
              border: "1.5px solid #1a1a1a",
              boxShadow: "0 18px 60px rgba(0,0,0,0.25)",
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
                type="button"
                onClick={() => setGameSettingsOpen(false)}
                style={{
                  border: "1px solid #1a1a1a",
                  background: "transparent",
                  padding: "0.35rem 0.6rem",
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

      {open && additionalGoodiesOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Additional goodies"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setAdditionalGoodiesOpen(false);
          }}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.42)",
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
              background: "#faf8f3",
              border: "1.5px solid #1a1a1a",
              boxShadow: "0 18px 60px rgba(0,0,0,0.25)",
              padding: "1rem 1rem 0.9rem",
              maxHeight: "min(86vh, 760px)",
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
                  Additional goodies
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
                  Manually summon little extras from live APIs.
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAdditionalGoodiesOpen(false)}
                style={{
                  border: "1px solid #1a1a1a",
                  background: "transparent",
                  padding: "0.35rem 0.6rem",
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

            <div style={{ display: "grid", gap: "0.6rem", marginBottom: "0.75rem" }}>
              <button
                type="button"
                onClick={() => void fetchAdditionalWeatherModule()}
                disabled={moduleLoading}
                style={{
                  textAlign: "left",
                  padding: "0.55rem 0.65rem",
                  border: "1px solid #d8d2c7",
                  background: "#fff",
                  cursor: moduleLoading ? "wait" : "pointer",
                  fontFamily: "'Playfair Display', Georgia, serif",
                  fontSize: "0.75rem",
                  fontWeight: 700,
                }}
              >
                {moduleLoading ? "Fetching weather..." : "Weather"}
              </button>
              <button
                type="button"
                onClick={() => void fetchAdditionalSpotifyModule()}
                disabled={spotifyLoading}
                style={{
                  textAlign: "left",
                  padding: "0.55rem 0.65rem",
                  border: "1px solid #d8d2c7",
                  background: "#fff",
                  cursor: spotifyLoading ? "wait" : "pointer",
                  fontFamily: "'Playfair Display', Georgia, serif",
                  fontSize: "0.75rem",
                  fontWeight: 700,
                }}
              >
                {spotifyLoading
                  ? "Fetching Spotify mood tile..."
                  : "Spotify Mood Tile"}
              </button>
              <div
                style={{
                  padding: "0.45rem 0.55rem",
                  border: "1px dashed #d6cfbf",
                  background: "#f8f4ea",
                  fontSize: "0.7rem",
                  color: "#5e5547",
                  fontFamily: "'IM Fell English', Georgia, serif",
                }}
              >
                Upcoming: Marvel comic summon, NASA highlights, Spotify mood tile.
              </div>
            </div>

            {moduleError && (
              <p
                style={{
                  margin: "0.25rem 0 0.6rem",
                  color: "#8b4513",
                  fontSize: "0.74rem",
                }}
              >
                {moduleError}
              </p>
            )}

            <div style={{ display: "grid", gap: "0.75rem" }}>
              {weatherModuleData ? (
                <WeatherFillerCard data={weatherModuleData} reason="interval" />
              ) : (
                <p
                  style={{
                    margin: "0.15rem 0 0",
                    fontFamily: "'IM Fell English', Georgia, serif",
                    fontStyle: "italic",
                    color: "#888",
                    fontSize: "0.75rem",
                  }}
                >
                  Fetch weather data to preview the module.
                </p>
              )}
              {spotifyModuleData ? (
                <SpotifyMoodTile data={spotifyModuleData} reason="interval" />
              ) : (
                <p
                  style={{
                    margin: "0.15rem 0 0",
                    fontFamily: "'IM Fell English', Georgia, serif",
                    fontStyle: "italic",
                    color: "#888",
                    fontSize: "0.75rem",
                  }}
                >
                  Fetch Spotify data to preview the mood tile.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
