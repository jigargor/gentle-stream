"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { SignOutButton } from "@/components/auth/SignOutButton";
import {
  GAME_RATIO_PRESETS,
  nearestPresetValue,
} from "@/lib/user/feed-settings";
import { isCreator } from "@/lib/user/creator";
import type { UserProfile, SavedArticleListItem, UserGameStats } from "@/lib/types";
import { AvatarInput } from "./AvatarInput";

/** Max rows in the profile dropdown; full list lives at /me/saved */
const DROPDOWN_SAVED_LIMIT = 8;

interface ProfileMenuProps {
  userEmail: string;
  onGameRatioSaved: (ratio: number) => void;
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

export function ProfileMenu({ userEmail, onGameRatioSaved }: ProfileMenuProps) {
  const [open, setOpen] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [saves, setSaves] = useState<SavedArticleListItem[]>([]);
  const [stats, setStats] = useState<UserGameStats | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [profileForm, setProfileForm] = useState({
    displayName: "",
    username: "",
  });
  /** Masthead avatar/name: false until initial GET /api/user/profile finishes */
  const [headerLoading, setHeaderLoading] = useState(true);
  /** After profile loads, hide shimmer once the image has painted (or failed). */
  const [avatarPainted, setAvatarPainted] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!profile?.avatarUrl) setAvatarPainted(true);
    else setAvatarPainted(false);
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
      const [pr, sv, st] = await Promise.all([
        fetch("/api/user/profile", { credentials: "include" }),
        fetch("/api/user/article-saves", { credentials: "include" }),
        fetch("/api/user/game-stats", { credentials: "include" }),
      ]);

      if (pr.ok) {
        const data = (await pr.json()) as UserProfile;
        setProfile(data);
        setProfileForm({
          displayName: data.displayName ?? "",
          username: data.username ?? "",
        });
      } else {
        setLoadError("Could not load profile.");
      }

      if (sv.ok) {
        const j = (await sv.json()) as { items: SavedArticleListItem[] };
        setSaves(j.items ?? []);
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

  async function saveProfileFields() {
    setSaveError(null);
    setSaving(true);
    try {
      const res = await fetch("/api/user/profile", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: profileForm.displayName.trim() || null,
          username: profileForm.username.trim().toLowerCase() || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSaveError(
          typeof data.error === "string" ? data.error : "Could not save profile."
        );
        return;
      }
      setProfile(data as UserProfile);
    } catch {
      setSaveError("Could not save profile.");
    } finally {
      setSaving(false);
    }
  }

  async function removeSave(id: string) {
    await fetch(`/api/user/article-saves?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
      credentials: "include",
    });
    setSaves((prev) => prev.filter((s) => s.id !== id));
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
        ) : profile?.avatarUrl ? (
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
              src={profile.avatarUrl}
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
              — publishing tools will arrive in a future update.
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
            <input
              value={profileForm.username}
              onChange={(e) =>
                setProfileForm((f) => ({
                  ...f,
                  username: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""),
                }))
              }
              placeholder="letters_numbers_underscore"
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
            <Link
              href="/me/saved"
              onClick={() => setOpen(false)}
              style={{
                fontFamily: "'Playfair Display', Georgia, serif",
                fontSize: "0.78rem",
                margin: "0 0 0.45rem",
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                color: "#1a472a",
                textDecoration: "underline",
                textUnderlineOffset: "3px",
                display: "inline-block",
              }}
            >
              Saved articles
            </Link>
            {saves.length === 0 ? (
              <p
                style={{
                  fontStyle: "italic",
                  color: "#aaa",
                  fontSize: "0.78rem",
                  margin: "0.35rem 0 0",
                }}
              >
                Use <strong>Save</strong> on an article card.
              </p>
            ) : (
              <>
                <ul style={{ listStyle: "none", margin: "0.35rem 0 0", padding: 0 }}>
                  {saves.slice(0, DROPDOWN_SAVED_LIMIT).map((s) => (
                    <li
                      key={s.id}
                      style={{
                        borderBottom: "1px solid #e8e4dc",
                        padding: "0.4rem 0",
                        fontSize: "0.75rem",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: "0.35rem",
                          alignItems: "flex-start",
                        }}
                      >
                        <Link
                          href={`/me/read/${encodeURIComponent(s.articleId)}`}
                          onClick={() => setOpen(false)}
                          style={{
                            color: "#1a472a",
                            fontWeight: 600,
                            textDecoration: "none",
                            lineHeight: 1.35,
                          }}
                        >
                          {s.articleTitle}
                        </Link>
                        <button
                          type="button"
                          onClick={() => void removeSave(s.id)}
                          style={{
                            background: "none",
                            border: "none",
                            color: "#999",
                            cursor: "pointer",
                            fontSize: "0.65rem",
                            textTransform: "uppercase",
                            flexShrink: 0,
                          }}
                        >
                          Remove
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
                {saves.length > DROPDOWN_SAVED_LIMIT ? (
                  <Link
                    href="/me/saved"
                    onClick={() => setOpen(false)}
                    style={{
                      display: "inline-block",
                      marginTop: "0.45rem",
                      fontFamily: "'IM Fell English', Georgia, serif",
                      fontSize: "0.72rem",
                      color: "#666",
                      textDecoration: "underline",
                    }}
                  >
                    View all {saves.length} saved →
                  </Link>
                ) : null}
              </>
            )}
          </section>

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
    </div>
  );
}
