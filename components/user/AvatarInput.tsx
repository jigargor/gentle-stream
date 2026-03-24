"use client";

import { useRef, useState } from "react";
import { uploadAvatar } from "@/lib/avatar";

interface AvatarInputProps {
  userId: string;
  currentUrl?: string | null;
  /** Called with the new public URL after a successful save */
  onSaved: (url: string) => void;
}

type Mode = "url" | "upload";
type SaveState = "idle" | "saving" | "saved" | "error";

export function AvatarInput({ userId, currentUrl, onSaved }: AvatarInputProps) {
  const [mode, setMode] = useState<Mode>("url");
  const [urlValue, setUrlValue] = useState(currentUrl ?? "");
  const [preview, setPreview] = useState<string | null>(currentUrl ?? null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // ── Shared save: persist URL to DB ──────────────────────────────────────────

  async function saveUrl(url: string) {
    setSaveState("saving");
    setErrorMsg(null);
    try {
      const res = await fetch("/api/user/avatar", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avatarUrl: url }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      setSaveState("saved");
      setPreview(url);
      onSaved(url);
      setTimeout(() => setSaveState("idle"), 2000);
    } catch (e) {
      setSaveState("error");
      setErrorMsg(e instanceof Error ? e.message : "Save failed.");
    }
  }

  // ── URL mode ─────────────────────────────────────────────────────────────────

  async function handleUrlSave() {
    const trimmed = urlValue.trim();
    if (!trimmed) return;
    await saveUrl(trimmed);
  }

  // ── Upload mode ───────────────────────────────────────────────────────────────

  async function handleFile(file: File) {
    // Show local preview immediately
    const objectUrl = URL.createObjectURL(file);
    setPreview(objectUrl);
    setSaveState("saving");
    setErrorMsg(null);

    const result = await uploadAvatar(file, userId);
    if ("error" in result) {
      setSaveState("error");
      setErrorMsg(result.error);
      setPreview(currentUrl ?? null);
      URL.revokeObjectURL(objectUrl);
      return;
    }

    URL.revokeObjectURL(objectUrl);
    await saveUrl(result.url);
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) void handleFile(file);
    e.target.value = ""; // allow re-selecting same file
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) void handleFile(file);
  }

  // ── Styles ────────────────────────────────────────────────────────────────────

  const s = {
    root: {
      display: "flex",
      flexDirection: "column" as const,
      gap: "0.75rem",
    },
    label: {
      fontFamily: "'Playfair Display', Georgia, serif",
      fontSize: "0.72rem",
      letterSpacing: "0.1em",
      textTransform: "uppercase" as const,
      color: "#555",
    },
    previewRow: {
      display: "flex",
      alignItems: "center",
      gap: "1rem",
    },
    avatar: {
      width: 64,
      height: 64,
      borderRadius: "50%",
      objectFit: "cover" as const,
      border: "2px solid #1a1a1a",
      flexShrink: 0,
      background: "#ede9e1",
    },
    initials: {
      width: 64,
      height: 64,
      borderRadius: "50%",
      border: "2px solid #1a1a1a",
      background: "#1a472a",
      color: "#faf8f3",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontFamily: "'Playfair Display', Georgia, serif",
      fontSize: "1.4rem",
      fontWeight: 700,
      flexShrink: 0,
    },
    tabs: {
      display: "flex",
      gap: 0,
      border: "1px solid #1a1a1a",
      width: "fit-content",
    },
    tab: (active: boolean) => ({
      padding: "0.25rem 0.75rem",
      fontFamily: "'Playfair Display', Georgia, serif",
      fontSize: "0.68rem",
      letterSpacing: "0.06em",
      textTransform: "uppercase" as const,
      cursor: "pointer",
      border: "none",
      background: active ? "#1a1a1a" : "transparent",
      color: active ? "#faf8f3" : "#555",
      transition: "background 0.15s ease",
    }),
    urlRow: {
      display: "flex",
      gap: "0.5rem",
    },
    input: {
      flex: 1,
      fontFamily: "Georgia, serif",
      fontSize: "0.8rem",
      padding: "0.4rem 0.6rem",
      border: "1px solid #ccc",
      background: "#faf8f3",
      color: "#1a1a1a",
      outline: "none",
      minWidth: 0,
    },
    saveBtn: (state: SaveState) => ({
      padding: "0.4rem 0.9rem",
      fontFamily: "'Playfair Display', Georgia, serif",
      fontSize: "0.7rem",
      letterSpacing: "0.06em",
      textTransform: "uppercase" as const,
      border: "1px solid #1a1a1a",
      cursor: state === "saving" ? "wait" : "pointer",
      background: state === "saved" ? "#1a472a" : "#1a1a1a",
      color: "#faf8f3",
      flexShrink: 0,
      transition: "background 0.2s ease",
    }),
    dropZone: (over: boolean) => ({
      border: `1.5px dashed ${over ? "#1a472a" : "#aaa"}`,
      background: over ? "#f0f7f2" : "#faf8f3",
      padding: "1.25rem",
      textAlign: "center" as const,
      cursor: "pointer",
      transition: "all 0.15s ease",
      fontFamily: "'IM Fell English', Georgia, serif",
      fontStyle: "italic",
      color: over ? "#1a472a" : "#888",
      fontSize: "0.82rem",
    }),
    hint: {
      fontFamily: "'IM Fell English', Georgia, serif",
      fontStyle: "italic",
      fontSize: "0.7rem",
      color: "#aaa",
    },
    error: {
      fontFamily: "'IM Fell English', Georgia, serif",
      fontStyle: "italic",
      fontSize: "0.75rem",
      color: "#8b4513",
    },
  };

  const btnLabel =
    saveState === "saving" ? "Saving…" :
    saveState === "saved"  ? "Saved ✓" :
    "Save";

  return (
    <div style={s.root}>
      <span style={s.label}>Avatar</span>

      {/* Preview + tabs */}
      <div style={s.previewRow}>
        {preview ? (
          <img
            src={preview}
            alt="Avatar preview"
            style={s.avatar}
            onError={() => setPreview(null)}
          />
        ) : (
          <div style={s.initials}>
            {userId.slice(0, 2).toUpperCase()}
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", flex: 1, minWidth: 0 }}>
          {/* Mode tabs */}
          <div style={s.tabs}>
            <button
              type="button"
              style={s.tab(mode === "url")}
              onClick={() => setMode("url")}
            >
              Paste URL
            </button>
            <button
              type="button"
              style={s.tab(mode === "upload")}
              onClick={() => setMode("upload")}
            >
              Upload
            </button>
          </div>

          {/* URL mode */}
          {mode === "url" && (
            <div style={s.urlRow}>
              <input
                type="url"
                placeholder="https://example.com/photo.jpg"
                value={urlValue}
                onChange={(e) => setUrlValue(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") void handleUrlSave(); }}
                style={s.input}
                spellCheck={false}
              />
              <button
                type="button"
                style={s.saveBtn(saveState)}
                disabled={saveState === "saving" || !urlValue.trim()}
                onClick={() => void handleUrlSave()}
              >
                {btnLabel}
              </button>
            </div>
          )}

          {/* Upload mode */}
          {mode === "upload" && (
            <div
              style={s.dropZone(dragOver)}
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
            >
              {saveState === "saving"
                ? "Uploading…"
                : "Drop an image here, or click to choose"}
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                style={{ display: "none" }}
                onChange={handleFileInput}
              />
            </div>
          )}
        </div>
      </div>

      {/* Status messages */}
      {saveState === "error" && errorMsg && (
        <p style={s.error}>{errorMsg}</p>
      )}
      {mode === "upload" && saveState === "idle" && (
        <p style={s.hint}>JPEG, PNG, WebP or GIF · max 2 MB</p>
      )}
    </div>
  );
}
