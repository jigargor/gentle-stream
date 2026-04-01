"use client";

import { useEffect, useRef } from "react";
import type { IconFractalModuleData } from "@/lib/types";

interface IconFractalCardProps {
  data: IconFractalModuleData;
}

interface FractalNode {
  x: number;
  y: number;
  size: number;
  depth: number;
  angle: number;
}

function createSeededRandom(seed: number): () => number {
  let state = (seed >>> 0) || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}

export default function IconFractalCard({ data }: IconFractalCardProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext("2d");
    if (!context) return;

    const random = createSeededRandom(data.seed);
    const image = new Image();
    image.decoding = "async";
    image.src = "/logo.svg";

    image.onload = () => {
      const ratio = Math.max(1, window.devicePixelRatio || 1);
      const bounds = canvas.getBoundingClientRect();
      const width = Math.max(280, Math.floor(bounds.width || 280));
      const height = Math.max(140, Math.floor(bounds.height || 140));
      canvas.width = Math.floor(width * ratio);
      canvas.height = Math.floor(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);

      context.clearRect(0, 0, width, height);
      context.fillStyle = "rgba(245, 242, 235, 0.68)";
      context.fillRect(0, 0, width, height);

      const initialSize = Math.min(width, height) * 0.34;
      const maxDepth = 4;
      const stack: FractalNode[] = [
        {
          x: width / 2,
          y: height / 2,
          size: initialSize,
          depth: 0,
          angle: 0,
        },
      ];

      while (stack.length > 0) {
        const node = stack.pop()!;
        const alpha = Math.max(0.12, 0.78 - node.depth * 0.13);
        context.save();
        context.globalAlpha = alpha;
        context.translate(node.x, node.y);
        context.rotate(node.angle);
        context.drawImage(
          image,
          -node.size / 2,
          -node.size / 2,
          node.size,
          node.size
        );
        context.restore();

        if (node.depth >= maxDepth || node.size < 20) continue;

        const childCount = 2 + Math.floor(random() * 3);
        const baseRadius = node.size * (0.58 + random() * 0.24);

        for (let i = 0; i < childCount; i += 1) {
          const jitterAngle = (random() - 0.5) * 0.5;
          const theta = ((Math.PI * 2) / childCount) * i + jitterAngle;
          const drift = 0.84 + random() * 0.34;
          const childSize = node.size * (0.46 + random() * 0.16);
          stack.push({
            x: node.x + Math.cos(theta) * baseRadius * drift,
            y: node.y + Math.sin(theta) * baseRadius * drift,
            size: childSize,
            depth: node.depth + 1,
            angle: node.angle + (random() - 0.5) * 0.38,
          });
        }
      }
    };
  }, [data.seed]);

  return (
    <aside
      aria-label="Icon fractal filler"
      style={{
        borderTop: "1px solid var(--gs-border)",
        padding: "0.5rem 0.6rem",
        background: "var(--gs-surface-soft)",
        borderRadius: "0 0 var(--gs-radius-sm) var(--gs-radius-sm)",
      }}
    >
      <div
        style={{
          fontFamily: "'Playfair Display', Georgia, serif",
          fontSize: "0.78rem",
          fontWeight: 700,
          marginBottom: "0.28rem",
        }}
      >
        Fractal Pause
      </div>
      <canvas
        ref={canvasRef}
        width={320}
        height={160}
        style={{
          width: "100%",
          height: 160,
          border: "1px solid var(--gs-border)",
          borderRadius: "var(--gs-radius-xs)",
          background: "var(--gs-surface)",
          display: "block",
        }}
      />
    </aside>
  );
}
