"use client";

import { useEffect, useMemo, useRef, useState } from "react";

interface AvatarCropModalProps {
  file: File;
  open: boolean;
  onClose: () => void;
  onConfirm: (result: { blob: Blob; mime: "image/png"; filename: string }) => void;
}

type Point = { x: number; y: number };

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

async function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    img.loading = "eager";
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Could not load image"));
      img.src = url;
    });
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function drawPreview(params: {
  ctx: CanvasRenderingContext2D;
  img: HTMLImageElement;
  size: number;
  zoom: number;
  offset: Point;
}) {
  const { ctx, img, size, zoom, offset } = params;
  ctx.clearRect(0, 0, size, size);

  const baseScale = Math.max(size / img.naturalWidth, size / img.naturalHeight);
  const scale = baseScale * zoom;
  const drawW = img.naturalWidth * scale;
  const drawH = img.naturalHeight * scale;

  const minX = size - drawW;
  const minY = size - drawH;
  const x = clamp(offset.x, minX, 0);
  const y = clamp(offset.y, minY, 0);

  ctx.fillStyle = "#faf8f3";
  ctx.fillRect(0, 0, size, size);

  ctx.drawImage(img, x, y, drawW, drawH);

  // Circle overlay mask + ring.
  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.beginPath();
  ctx.rect(0, 0, size, size);
  ctx.arc(size / 2, size / 2, size * 0.42, 0, Math.PI * 2);
  ctx.fill("evenodd");
  ctx.restore();

  ctx.strokeStyle = "rgba(255,255,255,0.9)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size * 0.42, 0, Math.PI * 2);
  ctx.stroke();
}

async function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), "image/png", 0.92)
  );
  if (!blob) throw new Error("Could not export image");
  return blob;
}

export function AvatarCropModal({ file, open, onClose, onConfirm }: AvatarCropModalProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [zoom, setZoom] = useState(1.15);
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragStartRef = useRef<{ origin: Point; pointer: Point } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const previewSize = 340;

  const filename = useMemo(() => {
    const base = (file.name || "avatar").replace(/\.[a-z0-9]+$/i, "");
    return `${base}-cropped.png`;
  }, [file.name]);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    setBusy(false);
    setZoom(1.15);
    setOffset({ x: 0, y: 0 });

    let cancelled = false;
    (async () => {
      try {
        const img = await loadImageFromFile(file);
        if (cancelled) return;
        imgRef.current = img;

        // Center the image initially.
        const baseScale = Math.max(previewSize / img.naturalWidth, previewSize / img.naturalHeight);
        const scale = baseScale * 1.15;
        const drawW = img.naturalWidth * scale;
        const drawH = img.naturalHeight * scale;
        setOffset({
          x: (previewSize - drawW) / 2,
          y: (previewSize - drawH) / 2,
        });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Could not load image";
        setError(msg);
      } finally {
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      imgRef.current = null;
    };
  }, [file, open, previewSize]);

  useEffect(() => {
    if (!open) return;
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    drawPreview({ ctx, img, size: previewSize, zoom, offset });
  }, [offset, open, previewSize, zoom]);

  function onPointerDown(e: React.PointerEvent) {
    if (busy) return;
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDragging(true);
    dragStartRef.current = {
      origin: { ...offset },
      pointer: { x: e.clientX, y: e.clientY },
    };
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!dragging) return;
    const img = imgRef.current;
    if (!img) return;
    const start = dragStartRef.current;
    if (!start) return;
    const dx = e.clientX - start.pointer.x;
    const dy = e.clientY - start.pointer.y;
    setOffset({ x: start.origin.x + dx, y: start.origin.y + dy });
  }

  function onPointerUp(e: React.PointerEvent) {
    if (!dragging) return;
    setDragging(false);
    dragStartRef.current = null;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  }

  async function confirmCrop() {
    const img = imgRef.current;
    if (!img) return;
    setBusy(true);
    setError(null);
    try {
      const outSize = 512;
      const out = document.createElement("canvas");
      out.width = outSize;
      out.height = outSize;
      const ctx = out.getContext("2d");
      if (!ctx) throw new Error("Could not create canvas");

      const baseScale = Math.max(previewSize / img.naturalWidth, previewSize / img.naturalHeight);
      const scale = baseScale * zoom;

      // Map preview offset into output coordinates.
      const ratio = outSize / previewSize;
      const x = offset.x * ratio;
      const y = offset.y * ratio;
      const drawW = img.naturalWidth * scale * ratio;
      const drawH = img.naturalHeight * scale * ratio;

      ctx.fillStyle = "#faf8f3";
      ctx.fillRect(0, 0, outSize, outSize);
      ctx.drawImage(img, x, y, drawW, drawH);

      const blob = await canvasToPngBlob(out);
      onConfirm({ blob, mime: "image/png", filename });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Could not crop image";
      setError(msg);
      setBusy(false);
      return;
    }
    setBusy(false);
    onClose();
  }

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-label="Crop profile picture"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 300,
        background: "rgba(9, 7, 4, 0.48)",
        display: "grid",
        placeItems: "center",
        padding: "1rem",
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: "min(92vw, 520px)",
          background: "var(--gs-surface-elevated)",
          border: "1px solid var(--gs-border-strong)",
          borderRadius: "var(--gs-radius-lg)",
          boxShadow: "var(--gs-shadow-overlay)",
          padding: "0.9rem",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem", alignItems: "baseline" }}>
          <div>
            <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: "1.05rem", fontWeight: 700 }}>
              Crop photo
            </div>
            <div style={{ fontFamily: "'IM Fell English', Georgia, serif", fontSize: "0.78rem", color: "#666" }}>
              Drag to reposition. Use the slider to zoom.
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            style={{
              border: "1px solid var(--gs-border)",
              background: "var(--gs-surface-soft)",
              borderRadius: "var(--gs-radius-pill)",
              cursor: busy ? "wait" : "pointer",
              color: "#666",
              fontFamily: "'IM Fell English', Georgia, serif",
              fontSize: "0.9rem",
              width: "1.9rem",
              height: "1.9rem",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 0,
            }}
            aria-label="Close"
            title="Close"
          >
            ✕
          </button>
        </div>

        <div style={{ marginTop: "0.75rem", display: "grid", gap: "0.65rem" }}>
          <div
            style={{
              border: "1px solid #d8d2c7",
              background: "#fff",
              padding: "0.55rem",
              display: "grid",
              placeItems: "center",
            }}
          >
            <canvas
              ref={canvasRef}
              width={previewSize}
              height={previewSize}
              style={{
                width: previewSize,
                height: previewSize,
                touchAction: "none",
                cursor: busy ? "wait" : dragging ? "grabbing" : "grab",
                borderRadius: "10px",
                display: "block",
              }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
            />
          </div>

          <label style={{ display: "grid", gap: "0.35rem" }}>
            <span style={{ fontSize: "0.72rem", color: "#555", fontFamily: "'IM Fell English', Georgia, serif" }}>
              Zoom
            </span>
            <input
              type="range"
              min={1}
              max={2.8}
              step={0.01}
              value={zoom}
              disabled={busy || loading}
              onChange={(e) => setZoom(Number(e.target.value))}
            />
          </label>

          {error ? (
            <div style={{ color: "#8b4513", fontSize: "0.8rem" }}>{error}</div>
          ) : null}

          <div style={{ display: "flex", gap: "0.55rem", justifyContent: "flex-end", marginTop: "0.25rem" }}>
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              style={{
                border: "1px solid #888",
                background: "transparent",
                padding: "0.38rem 0.65rem",
                cursor: busy ? "wait" : "pointer",
                fontFamily: "'IM Fell English', Georgia, serif",
                fontSize: "0.82rem",
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void confirmCrop()}
              disabled={busy || loading}
              style={{
                border: "none",
                background: "#1a1a1a",
                color: "#faf8f3",
                padding: "0.38rem 0.75rem",
                cursor: busy || loading ? "wait" : "pointer",
                fontFamily: "'Playfair Display', Georgia, serif",
                fontSize: "0.82rem",
                letterSpacing: "0.02em",
              }}
            >
              {busy ? "Saving…" : "Save photo"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

