"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";

interface GeneratedArtImageProps {
  primarySrc: string;
  fallbackSrc?: string | null;
  alt?: string;
  loading?: "eager" | "lazy";
  className?: string;
  style?: CSSProperties;
  placeholderMinHeight?: number;
  /** Called when the resolved image URL changes (null when showing placeholder). */
  onActiveSourceChange?: (url: string | null) => void;
}

type ImageStage = "primary" | "fallback" | "placeholder";

export default function GeneratedArtImage({
  primarySrc,
  fallbackSrc,
  alt = "",
  loading = "lazy",
  className,
  style,
  placeholderMinHeight = 96,
  onActiveSourceChange,
}: GeneratedArtImageProps) {
  const [stage, setStage] = useState<ImageStage>("primary");

  useEffect(() => {
    setStage("primary");
  }, [primarySrc, fallbackSrc]);

  const activeSrc = useMemo(() => {
    if (stage === "primary") return primarySrc;
    if (stage === "fallback") return fallbackSrc ?? "";
    return "";
  }, [fallbackSrc, primarySrc, stage]);

  const activeUrlForDownload =
    stage === "placeholder" || !activeSrc ? null : activeSrc;

  useEffect(() => {
    onActiveSourceChange?.(activeUrlForDownload);
  }, [activeUrlForDownload, onActiveSourceChange]);

  function handleError() {
    setStage((current) => {
      if (current === "primary" && fallbackSrc) return "fallback";
      return "placeholder";
    });
  }

  if (stage === "placeholder" || !activeSrc) {
    return (
      <div
        aria-hidden
        className={className}
        style={{
          minHeight: placeholderMinHeight,
          border: "1px solid var(--gs-border)",
          borderRadius: "var(--gs-radius-xs)",
          background:
            "linear-gradient(140deg, color-mix(in srgb, var(--gs-surface-soft) 88%, #d6cfbf), var(--gs-surface) 42%, color-mix(in srgb, var(--gs-surface-soft) 70%, #c4baa6))",
          ...style,
        }}
      />
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={activeSrc}
      alt={alt}
      loading={loading}
      onError={handleError}
      className={className}
      style={style}
    />
  );
}
