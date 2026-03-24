"use client";

import { useCallback, useId, useRef, useState } from "react";
import {
  AVATAR_ALLOWED_MIME,
  AVATAR_MAX_BYTES,
  HOUSE_AVATAR_URLS,
} from "@/lib/avatar";
import type { UserProfile } from "@/lib/types";

interface AvatarInputProps {
  userEmail: string;
  displayName: string | null;
  currentAvatarUrl: string | null;
  /** Called with updated profile after server save */
  onProfileUpdate: (profile: UserProfile) => void;
  onError: (message: string) => void;
}

function initialsFrom(email: string, displayName: string | null): string {
  if (displayName?.trim()) {
    const parts = displayName.trim().split(/\s+/);
    const a = parts[0]?.[0] ?? "?";
    const b = parts[1]?.[0] ?? "";
    return (a + b).toUpperCase();
  }
  const local = email.split("@")[0] ?? email;
  return local.slice(0, 2).toUpperCase() || "?";
}

export function AvatarInput({
  userEmail,
  displayName,
  currentAvatarUrl,
  onProfileUpdate,
  onError,
}: AvatarInputProps) {
  const inputId = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [previewBust, setPreviewBust] = useState(0);

  const displaySrc = currentAvatarUrl
    ? `${currentAvatarUrl.split("?")[0]}?t=${previewBust}`
    : null;

  const pickFile = useCallback(() => fileRef.current?.click(), []);

  const onFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;

      if (!(AVATAR_ALLOWED_MIME as readonly string[]).includes(file.type)) {
        onError("Please choose a JPEG, PNG, WebP, or GIF.");
        return;
      }
      if (file.size > AVATAR_MAX_BYTES) {
        onError(`Image must be under ${Math.floor(AVATAR_MAX_BYTES / (1024 * 1024))} MB.`);
        return;
      }

      setBusy(true);
      onError("");
      try {
        const fd = new FormData();
        fd.set("file", file);
        const res = await fetch("/api/user/avatar", {
          method: "POST",
          body: fd,
          credentials: "include",
        });
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
          hint?: string;
          profile?: UserProfile;
        };
        if (!res.ok) {
          onError(
            [data.error, data.hint].filter(Boolean).join(" ") || "Upload failed."
          );
          return;
        }
        if (data.profile) {
          onProfileUpdate(data.profile);
          setPreviewBust(Date.now());
        }
      } catch {
        onError("Upload failed — check your connection.");
      } finally {
        setBusy(false);
      }
    },
    [onError, onProfileUpdate]
  );

  const selectHouseAvatar = useCallback(
    async (url: string) => {
      setBusy(true);
      onError("");
      try {
        const res = await fetch("/api/user/avatar", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ avatarUrl: url }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
          hint?: string;
          profile?: UserProfile;
        };
        if (!res.ok) {
          onError(
            [data.error, data.hint].filter(Boolean).join(" ") || "Could not save avatar."
          );
          return;
        }
        if (data.profile) {
          onProfileUpdate(data.profile);
          setPreviewBust(Date.now());
        }
      } catch {
        onError("Could not save avatar.");
      } finally {
        setBusy(false);
      }
    },
    [onError, onProfileUpdate]
  );

  const clearAvatar = useCallback(async () => {
    setBusy(true);
    onError("");
    try {
      const res = await fetch("/api/user/avatar", {
        method: "DELETE",
        credentials: "include",
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        profile?: UserProfile;
      };
      if (!res.ok) {
        onError(typeof data.error === "string" ? data.error : "Could not remove avatar.");
        return;
      }
      if (data.profile) {
        onProfileUpdate(data.profile);
        setPreviewBust(Date.now());
      }
    } catch {
      onError("Could not remove avatar.");
    } finally {
      setBusy(false);
    }
  }, [onError, onProfileUpdate]);

  return (
    <div style={{ marginBottom: "0.55rem" }}>
      <span
        style={{
          fontSize: "0.65rem",
          color: "#888",
          display: "block",
          marginBottom: "0.35rem",
        }}
      >
        Photo
      </span>
      <div style={{ display: "flex", alignItems: "center", gap: "0.65rem" }}>
        {displaySrc ? (
          // eslint-disable-next-line @next/next/no-img-element -- user-provided arbitrary URLs
          <img
            src={displaySrc}
            alt=""
            width={56}
            height={56}
            style={{
              borderRadius: "50%",
              objectFit: "cover",
              border: "1px solid #ccc",
            }}
          />
        ) : (
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: "50%",
              background: "linear-gradient(135deg, #4a6741, #2c3d28)",
              color: "#faf8f3",
              fontFamily: "'Playfair Display', Georgia, serif",
              fontSize: "0.85rem",
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {initialsFrom(userEmail, displayName)}
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
          <input
            ref={fileRef}
            id={inputId}
            type="file"
            accept={AVATAR_ALLOWED_MIME.join(",")}
            style={{ display: "none" }}
            onChange={(ev) => void onFileChange(ev)}
          />
          <button
            type="button"
            disabled={busy}
            onClick={pickFile}
            style={{
              background: "#1a1a1a",
              color: "#faf8f3",
              border: "none",
              padding: "0.3rem 0.65rem",
              fontFamily: "'Playfair Display', Georgia, serif",
              fontSize: "0.62rem",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              cursor: busy ? "wait" : "pointer",
              alignSelf: "flex-start",
            }}
          >
            {busy ? "Working…" : "Upload photo"}
          </button>
          {currentAvatarUrl ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void clearAvatar()}
              style={{
                background: "none",
                border: "none",
                color: "#999",
                fontSize: "0.62rem",
                textDecoration: "underline",
                cursor: busy ? "wait" : "pointer",
                padding: 0,
                textAlign: "left",
              }}
            >
              Remove photo
            </button>
          ) : null}
        </div>
      </div>

      <div style={{ marginTop: "0.65rem" }}>
        <span
          style={{
            fontSize: "0.6rem",
            color: "#aaa",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            display: "block",
            marginBottom: "0.35rem",
          }}
        >
          Preset avatars
        </span>
        {HOUSE_AVATAR_URLS.length === 0 ? (
          <p
            style={{
              margin: 0,
              fontSize: "0.68rem",
              color: "#aaa",
              fontStyle: "italic",
              lineHeight: 1.4,
            }}
          >
            More styles coming soon. Add URLs to{" "}
            <code style={{ fontSize: "0.62rem" }}>HOUSE_AVATAR_URLS</code> in{" "}
            <code style={{ fontSize: "0.62rem" }}>lib/avatar.ts</code>.
          </p>
        ) : (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "0.35rem",
            }}
          >
            {HOUSE_AVATAR_URLS.map((url) => (
              <button
                key={url}
                type="button"
                disabled={busy}
                onClick={() => void selectHouseAvatar(url)}
                style={{
                  padding: 0,
                  border: "2px solid transparent",
                  borderRadius: "50%",
                  cursor: busy ? "wait" : "pointer",
                  background: "none",
                }}
                title="Use this avatar"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={url}
                  alt=""
                  width={40}
                  height={40}
                  style={{ borderRadius: "50%", objectFit: "cover", display: "block" }}
                />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
