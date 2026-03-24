"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SignOutButton } from "@/components/auth/SignOutButton";
import {
  GAME_RATIO_PRESETS,
  nearestPresetValue,
} from "@/lib/user/feed-settings";
import { isCreator } from "@/lib/user/creator";
import type { UserProfile } from "@/lib/types";

interface UserAccountMenuProps {
  userEmail: string;
  onGameRatioSaved: (ratio: number) => void;
}

export function UserAccountMenu({
  userEmail,
  onGameRatioSaved,
}: UserAccountMenuProps) {
  const [open, setOpen] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const loadProfile = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await fetch("/api/user/preferences", { credentials: "include" });
      if (!res.ok) {
        setLoadError("Could not load settings.");
        return;
      }
      const data = (await res.json()) as UserProfile;
      setProfile(data);
    } catch {
      setLoadError("Could not load settings.");
    }
  }, []);

  useEffect(() => {
    if (open) void loadProfile();
  }, [open, loadProfile]);

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
      setOpen(false);
    } catch {
      setSaveError("Could not save.");
    } finally {
      setSaving(false);
    }
  }

  const currentRatio = profile?.gameRatio ?? 0.2;
  const highlightedPreset = nearestPresetValue(currentRatio);
  const creator = profile ? isCreator(profile) : false;

  return (
    <div
      ref={wrapRef}
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        gap: "0.35rem",
        flexShrink: 0,
      }}
    >
      <span
        title={userEmail}
        style={{
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          fontStyle: "normal",
          maxWidth: "min(28vw, 140px)",
        }}
      >
        {userEmail}
      </span>
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label="Account and feed settings"
        onClick={() => setOpen((o) => !o)}
        style={{
          background: open ? "#1a1a1a" : "transparent",
          color: open ? "#faf8f3" : "#555",
          border: "1px solid #999",
          fontFamily: "'Playfair Display', Georgia, serif",
          fontSize: "0.62rem",
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          padding: "0.2rem 0.45rem",
          cursor: "pointer",
        }}
      >
        Settings
      </button>
      <SignOutButton />

      {open && (
        <div
          role="dialog"
          aria-label="Feed settings"
          style={{
            position: "absolute",
            right: 0,
            top: "calc(100% + 6px)",
            width: "min(300px, 92vw)",
            background: "#faf8f3",
            border: "1.5px solid #1a1a1a",
            boxShadow: "0 12px 40px rgba(0,0,0,0.15)",
            padding: "1rem 1rem 0.85rem",
            zIndex: 200,
            textAlign: "left",
          }}
        >
          <div
            style={{
              fontFamily: "'Playfair Display', Georgia, serif",
              fontSize: "0.85rem",
              fontWeight: 700,
              marginBottom: "0.5rem",
              color: "#0d0d0d",
            }}
          >
            Feed settings
          </div>

          <p
            style={{
              fontFamily: "'IM Fell English', Georgia, serif",
              fontSize: "0.72rem",
              color: "#666",
              margin: "0 0 0.75rem",
              lineHeight: 1.45,
            }}
          >
            How often puzzles appear between article sections. Changing this
            refreshes your stream from the top.
          </p>

          {creator && (
            <div
              style={{
                fontFamily: "'IM Fell English', Georgia, serif",
                fontSize: "0.72rem",
                color: "#1a472a",
                background: "#e8f2ec",
                padding: "0.45rem 0.55rem",
                marginBottom: "0.75rem",
                border: "1px solid #b8d4c8",
              }}
            >
              <strong style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
                Creator account
              </strong>
              <span style={{ display: "block", marginTop: "0.2rem", color: "#555" }}>
                Publishing tools will appear here in a future update.
              </span>
            </div>
          )}

          {loadError && (
            <p style={{ color: "#8b4513", fontSize: "0.75rem", margin: "0 0 0.5rem" }}>
              {loadError}
            </p>
          )}

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "0.35rem",
              marginBottom: "0.5rem",
            }}
          >
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
                    padding: "0.45rem 0.55rem",
                    border: selected
                      ? "2px solid #1a1a1a"
                      : "1px solid #ddd",
                    background: selected ? "#ede9e1" : "#fff",
                    cursor: saving ? "wait" : "pointer",
                    fontFamily: "'Playfair Display', Georgia, serif",
                    fontSize: "0.72rem",
                  }}
                >
                  <span style={{ fontWeight: 700, color: "#1a1a1a" }}>
                    {preset.label}
                  </span>
                  <span
                    style={{
                      display: "block",
                      fontFamily: "'IM Fell English', Georgia, serif",
                      fontStyle: "italic",
                      fontSize: "0.68rem",
                      color: "#777",
                      marginTop: "0.15rem",
                    }}
                  >
                    {preset.description}
                  </span>
                </button>
              );
            })}
          </div>

          {saveError && (
            <p style={{ color: "#8b4513", fontSize: "0.72rem", margin: 0 }}>
              {saveError}
            </p>
          )}

          {saving && (
            <p
              style={{
                fontFamily: "'IM Fell English', Georgia, serif",
                fontStyle: "italic",
                fontSize: "0.7rem",
                color: "#999",
                margin: "0.35rem 0 0",
              }}
            >
              Saving&hellip;
            </p>
          )}
        </div>
      )}
    </div>
  );
}
