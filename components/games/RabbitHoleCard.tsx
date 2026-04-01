"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Difficulty, RabbitHolePuzzle } from "@/lib/games/types";
import {
  isAllowedEnglishWikipediaHost,
  parseEnglishWikipediaArticleTitle,
} from "@/lib/games/wikiReader";

interface RabbitHoleCardProps {
  puzzle: RabbitHolePuzzle;
  onNewPuzzle?: (difficulty: Difficulty) => void;
  metricsEnabled?: boolean;
  puzzleSignature?: string;
}

interface DesignModeOption {
  id: "neon-trail" | "archive-desk" | "signal-map";
  label: string;
  description: string;
}

const DESIGN_MODES: DesignModeOption[] = [
  {
    id: "neon-trail",
    label: "Neon Trail",
    description: "Arcade pulse links with glowing lure badges.",
  },
  {
    id: "archive-desk",
    label: "Archive Desk",
    description: "Editorial notes + stamps + dossier style.",
  },
  {
    id: "signal-map",
    label: "Signal Map",
    description: "Depth-linked mission map with branch paths.",
  },
];

function modeFromSeed(seed: string): DesignModeOption["id"] {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return DESIGN_MODES[hash % DESIGN_MODES.length]!.id;
}

interface ReaderFrame {
  title: string;
  html: string;
}

function wikipediaArticleUrl(title: string): string {
  const segment = title.trim().replace(/\s+/g, "_");
  return `https://en.wikipedia.org/wiki/${encodeURIComponent(segment)}`;
}

export default function RabbitHoleCard({
  puzzle,
  onNewPuzzle,
  metricsEnabled = true,
  puzzleSignature,
}: RabbitHoleCardProps) {
  const [designMode, setDesignMode] = useState<DesignModeOption["id"]>(
    modeFromSeed(puzzle.uniquenessSignature ?? puzzle.topic)
  );
  const [visitedLinks, setVisitedLinks] = useState<Record<string, boolean>>({});
  const [readerStack, setReaderStack] = useState<ReaderFrame[]>([]);
  const [readerLoading, setReaderLoading] = useState(false);
  const [readerError, setReaderError] = useState<string | null>(null);
  const completionLoggedRef = useRef(false);

  const visitedCount = useMemo(
    () => Object.values(visitedLinks).filter(Boolean).length,
    [visitedLinks]
  );

  useEffect(() => {
    setDesignMode(modeFromSeed(puzzle.uniquenessSignature ?? puzzle.topic));
    setVisitedLinks({});
    setReaderStack([]);
    setReaderError(null);
    setReaderLoading(false);
    completionLoggedRef.current = false;
  }, [puzzle.uniquenessSignature, puzzle.topic]);

  const currentReader = readerStack.length > 0 ? readerStack[readerStack.length - 1]! : null;

  const loadWikiFromUrl = useCallback(async (wikiUrl: string) => {
    const title = parseEnglishWikipediaArticleTitle(wikiUrl);
    if (!title) return;
    setReaderLoading(true);
    setReaderError(null);
    try {
      const params = new URLSearchParams({ url: wikiUrl });
      const res = await fetch(`/api/game/wiki-read?${params.toString()}`);
      const body = (await res.json()) as { error?: string; html?: string; title?: string };
      if (!res.ok) throw new Error(body.error ?? "Could not load article.");
      const html = body.html;
      if (!html) throw new Error("Empty article.");
      setReaderStack((prev) => [
        ...prev,
        { title: body.title ?? title, html },
      ]);
    } catch (e) {
      setReaderError(e instanceof Error ? e.message : "Could not load article.");
    } finally {
      setReaderLoading(false);
    }
  }, []);

  function handleReaderClick(e: React.MouseEvent<HTMLDivElement>) {
    const anchor = (e.target as HTMLElement | null)?.closest("a");
    if (!anchor) return;
    const hrefAttr = anchor.getAttribute("href") ?? "";
    if (hrefAttr.startsWith("#")) return;

    const nextTitle = parseEnglishWikipediaArticleTitle(anchor.href);
    if (nextTitle) {
      e.preventDefault();
      void loadWikiFromUrl(anchor.href);
      return;
    }

    try {
      const u = new URL(anchor.href);
      if (isAllowedEnglishWikipediaHost(u.hostname)) {
        e.preventDefault();
        window.open(anchor.href, "_blank", "noopener,noreferrer");
      }
    } catch {
      /* ignore */
    }
  }

  function handleReaderBack() {
    setReaderStack((prev) => (prev.length <= 1 ? [] : prev.slice(0, -1)));
    setReaderError(null);
  }

  useEffect(() => {
    if (!metricsEnabled) return;
    if (visitedCount < puzzle.links.length) return;
    if (completionLoggedRef.current) return;

    completionLoggedRef.current = true;
    const durationSeconds = Math.max(5, visitedCount * 8);
    void fetch("/api/user/game-completion", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        gameType: "rabbit_hole",
        difficulty: puzzle.difficulty,
        durationSeconds,
        metadata: {
          visitedCount,
          totalLinks: puzzle.links.length,
          puzzleSignature,
        },
      }),
    });
  }, [
    metricsEnabled,
    puzzle.difficulty,
    puzzle.links.length,
    puzzleSignature,
    visitedCount,
  ]);

  function markVisited(linkHref: string) {
    setVisitedLinks((prev) => ({ ...prev, [linkHref]: true }));
  }

  const wrapperStyle: React.CSSProperties = {
    borderTop: "3px double #1a1a1a",
    borderBottom: "2px solid #1a1a1a",
    background:
      designMode === "neon-trail"
        ? "linear-gradient(160deg, #090312 0%, #1f0938 52%, #0e1b34 100%)"
        : designMode === "archive-desk"
          ? "linear-gradient(180deg, #f8f2e6 0%, #efe3d0 100%)"
          : "linear-gradient(180deg, #f2f6ff 0%, #deebff 100%)",
    color: designMode === "neon-trail" ? "#f5f3ff" : "#1a1a1a",
    padding: "1.1rem 1.15rem 1rem",
    display: "flex",
    flexDirection: "column",
    gap: "0.8rem",
  };

  return (
    <section style={wrapperStyle}>
      <header style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "0.7rem", flexWrap: "wrap" }}>
          <span
            style={{
              fontFamily: "'Playfair Display', Georgia, serif",
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              fontSize: "0.68rem",
              opacity: 0.9,
            }}
          >
            Wiki Rabbit Hole
          </span>
          <span
            style={{
              fontFamily: "'IM Fell English', Georgia, serif",
              fontStyle: "italic",
              fontSize: "0.74rem",
              opacity: 0.85,
            }}
          >
            Difficulty: {puzzle.difficulty}
          </span>
        </div>
        <h3
          style={{
            margin: 0,
            fontFamily: "'Playfair Display', Georgia, serif",
            fontSize: "1.22rem",
            lineHeight: 1.2,
            color: designMode === "neon-trail" ? "#f5d6ff" : "#1a1a1a",
          }}
        >
          {puzzle.topic}
        </h3>
        <p
          style={{
            margin: 0,
            fontFamily: "'IM Fell English', Georgia, serif",
            fontSize: "0.83rem",
            fontStyle: "italic",
            opacity: 0.86,
          }}
        >
          {puzzle.mission}
        </p>
      </header>

      <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
        {DESIGN_MODES.map((mode) => {
          const active = mode.id === designMode;
          return (
            <button
              key={mode.id}
              type="button"
              onClick={() => setDesignMode(mode.id)}
              title={mode.description}
              style={{
                border: active
                  ? designMode === "neon-trail"
                    ? "1px solid #e879f9"
                    : "1px solid #1a1a1a"
                  : "1px solid rgba(130,130,130,0.55)",
                background: active
                  ? designMode === "neon-trail"
                    ? "rgba(232,121,249,0.18)"
                    : "rgba(26,26,26,0.08)"
                  : "transparent",
                color: designMode === "neon-trail" ? "#f5f3ff" : "#1a1a1a",
                padding: "0.24rem 0.52rem",
                fontFamily: "'Playfair Display', Georgia, serif",
                fontSize: "0.66rem",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                cursor: "pointer",
              }}
            >
              {mode.label}
            </button>
          );
        })}
      </div>

      <div
        style={{
          border:
            designMode === "neon-trail"
              ? "1px solid rgba(232,121,249,0.45)"
              : designMode === "archive-desk"
                ? "1px solid #cfb68c"
                : "1px solid #9cb8ea",
          background:
            designMode === "neon-trail"
              ? "rgba(14, 4, 31, 0.55)"
              : designMode === "archive-desk"
                ? "rgba(255,255,255,0.55)"
                : "rgba(255,255,255,0.72)",
          borderRadius: 8,
          display: "flex",
          flexDirection: "column",
          minHeight: 280,
          maxHeight: "min(52vh, 520px)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "0.5rem",
            flexWrap: "wrap",
            padding: "0.55rem 0.65rem",
            borderBottom:
              designMode === "neon-trail"
                ? "1px solid rgba(232,121,249,0.25)"
                : "1px solid rgba(40,40,40,0.12)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.45rem", flexWrap: "wrap" }}>
            <button
              type="button"
              disabled={readerStack.length === 0}
              onClick={handleReaderBack}
              style={{
                border: "1px solid currentColor",
                background: "transparent",
                color: "inherit",
                padding: "0.18rem 0.45rem",
                fontFamily: "'IBM Plex Sans', system-ui, sans-serif",
                fontSize: "0.65rem",
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                cursor: readerStack.length === 0 ? "not-allowed" : "pointer",
                opacity: readerStack.length === 0 ? 0.45 : 1,
              }}
            >
              Back
            </button>
            <span
              style={{
                fontFamily: "'Playfair Display', Georgia, serif",
                fontSize: "0.74rem",
                fontWeight: 700,
                maxWidth: "min(52vw, 280px)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
              title={currentReader?.title ?? ""}
            >
              {currentReader ? currentReader.title : "Reader"}
            </span>
          </div>
          {currentReader ? (
            <a
              href={wikipediaArticleUrl(currentReader.title)}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontFamily: "'IBM Plex Sans', system-ui, sans-serif",
                fontSize: "0.62rem",
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                color: designMode === "neon-trail" ? "#f9a8d4" : "#1a472a",
                textDecoration: "underline",
                textUnderlineOffset: "2px",
                whiteSpace: "nowrap",
              }}
            >
              Open on Wikipedia
            </a>
          ) : null}
        </div>

        <div
          style={{
            position: "relative",
            flex: 1,
            overflow: "auto",
            padding: "0.65rem 0.72rem",
            color: designMode === "neon-trail" ? "#f5f3ff" : "#1a1a1a",
          }}
        >
          {readerLoading && currentReader ? (
            <div
              aria-live="polite"
              style={{
                position: "absolute",
                inset: 0,
                zIndex: 2,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background:
                  designMode === "neon-trail"
                    ? "rgba(9, 3, 18, 0.72)"
                    : "rgba(255, 255, 255, 0.82)",
                fontFamily: "'IM Fell English', Georgia, serif",
                fontSize: "0.8rem",
                fontStyle: "italic",
              }}
            >
              Loading next article…
            </div>
          ) : null}
          {readerLoading && !currentReader ? (
            <p
              style={{
                margin: 0,
                fontFamily: "'IM Fell English', Georgia, serif",
                fontSize: "0.8rem",
                fontStyle: "italic",
                opacity: 0.85,
              }}
            >
              Pulling article from Wikipedia…
            </p>
          ) : null}
          {readerError ? (
            <p
              style={{
                margin: "0 0 0.5rem",
                fontFamily: "'IBM Plex Sans', system-ui, sans-serif",
                fontSize: "0.74rem",
                color: designMode === "neon-trail" ? "#fecaca" : "#9b2c2c",
              }}
            >
              {readerError}
            </p>
          ) : null}
          {!readerLoading && !currentReader ? (
            <p
              style={{
                margin: 0,
                fontFamily: "'IM Fell English', Georgia, serif",
                fontSize: "0.77rem",
                opacity: 0.88,
              }}
            >
              Wikipedia blocks embedding its site in a frame, so articles load here instead. Use{" "}
              <strong>Open gateway</strong> or a branch below to begin; tap article links to keep going
              down the hole.
            </p>
          ) : null}
          {currentReader ? (
            <div
              className="wiki-rabbit-hole-html"
              onClick={handleReaderClick}
              style={{
                fontSize: "0.78rem",
                lineHeight: 1.48,
                wordBreak: "break-word",
              }}
              // Wikipedia HTML is fetched server-side and stripped of scripts/styles; links stay in-app when possible.
              // eslint-disable-next-line react/no-danger
              dangerouslySetInnerHTML={{ __html: currentReader.html }}
            />
          ) : null}
        </div>
      </div>

      <div
        style={{
          border:
            designMode === "neon-trail"
              ? "1px solid rgba(232,121,249,0.45)"
              : designMode === "archive-desk"
                ? "1px solid #cfb68c"
                : "1px solid #9cb8ea",
          background:
            designMode === "neon-trail"
              ? "rgba(14, 4, 31, 0.55)"
              : designMode === "archive-desk"
                ? "rgba(255,255,255,0.55)"
                : "rgba(255,255,255,0.72)",
          borderRadius: 8,
          padding: "0.7rem 0.72rem",
          display: "grid",
          gap: "0.6rem",
        }}
      >
        <p
          style={{
            margin: 0,
            fontFamily: "'IM Fell English', Georgia, serif",
            fontSize: "0.77rem",
          }}
        >
          Start article:{" "}
          <a
            href={puzzle.starterArticle}
            onClick={(e) => {
              e.preventDefault();
              void loadWikiFromUrl(puzzle.starterArticle);
            }}
            style={{
              color: designMode === "neon-trail" ? "#f9a8d4" : "#1a472a",
              textDecoration: "underline",
              textUnderlineOffset: "2px",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Open gateway
          </a>
        </p>

        {puzzle.links.map((link, index) => {
          const isVisited = Boolean(visitedLinks[link.href]);
          return (
            <a
              key={link.href}
              href={link.href}
              onClick={(e) => {
                e.preventDefault();
                markVisited(link.href);
                void loadWikiFromUrl(link.href);
              }}
              style={{
                display: "block",
                border:
                  designMode === "signal-map"
                    ? `1px solid ${isVisited ? "#4f46e5" : "#8ba9e9"}`
                    : `1px solid ${isVisited ? "#2f855a" : "rgba(40,40,40,0.25)"}`,
                borderRadius: 8,
                padding: "0.55rem 0.62rem",
                background:
                  designMode === "neon-trail"
                    ? isVisited
                      ? "rgba(37, 99, 235, 0.26)"
                      : "rgba(168, 85, 247, 0.16)"
                    : isVisited
                      ? "rgba(209, 250, 229, 0.9)"
                      : "rgba(255,255,255,0.82)",
                color: designMode === "neon-trail" ? "#faf5ff" : "#1a1a1a",
                textDecoration: "none",
                cursor: "pointer",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "0.6rem",
                  marginBottom: "0.18rem",
                }}
              >
                <strong
                  style={{
                    fontFamily: "'Playfair Display', Georgia, serif",
                    fontSize: "0.82rem",
                  }}
                >
                  {index + 1}. {link.title}
                </strong>
                <span
                  style={{
                    fontFamily: "'Playfair Display', Georgia, serif",
                    fontSize: "0.59rem",
                    letterSpacing: "0.05em",
                    textTransform: "uppercase",
                    border: "1px solid currentColor",
                    padding: "0.1rem 0.35rem",
                    borderRadius: 999,
                    opacity: 0.88,
                    whiteSpace: "nowrap",
                  }}
                >
                  Depth {link.depth}
                </span>
              </div>
              <p
                style={{
                  margin: 0,
                  fontFamily: "'IM Fell English', Georgia, serif",
                  fontSize: "0.76rem",
                  opacity: 0.88,
                }}
              >
                {link.blurb}
              </p>
              <p
                style={{
                  margin: "0.3rem 0 0",
                  fontFamily: "'Playfair Display', Georgia, serif",
                  fontSize: "0.64rem",
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  opacity: 0.92,
                }}
              >
                Bait: {link.lure}
              </p>
            </a>
          );
        })}
      </div>

      <footer style={{ display: "flex", justifyContent: "space-between", gap: "0.7rem", flexWrap: "wrap" }}>
        <span
          style={{
            fontFamily: "'IM Fell English', Georgia, serif",
            fontSize: "0.76rem",
            fontStyle: "italic",
            opacity: 0.86,
          }}
        >
          Path progress: {visitedCount} / {puzzle.links.length} branches opened
        </span>
        {onNewPuzzle ? (
          <button
            type="button"
            onClick={() => onNewPuzzle(puzzle.difficulty)}
            style={{
              border: "1px solid currentColor",
              background: "transparent",
              color: "inherit",
              padding: "0.22rem 0.6rem",
              fontFamily: "'Playfair Display', Georgia, serif",
              fontSize: "0.66rem",
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              cursor: "pointer",
            }}
          >
            New hole
          </button>
        ) : null}
      </footer>
    </section>
  );
}
