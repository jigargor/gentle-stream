"use client";

import type { ArticleEngagementEventInput } from "@/lib/engagement/types";

const FLUSH_INTERVAL_MS = 4000;
const MAX_BATCH_SIZE = 50;

let queue: ArticleEngagementEventInput[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let sessionId: string | null = null;
let engagementDisabled = false;

function getSessionId(): string {
  if (sessionId) return sessionId;
  sessionId =
    (typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `session-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  return sessionId;
}

async function flushNow(): Promise<void> {
  if (engagementDisabled) {
    queue = [];
    return;
  }
  if (queue.length === 0) return;
  const batch = queue.slice(0, MAX_BATCH_SIZE);
  queue = queue.slice(MAX_BATCH_SIZE);

  try {
    const response = await fetch("/api/user/article-engagement", {
      method: "POST",
      credentials: "include",
      keepalive: true,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ events: batch }),
    });
    if (response.status === 401) {
      engagementDisabled = true;
      queue = [];
      return;
    }
  } catch {
    // Ignore failures; this is best-effort telemetry.
  }

  if (queue.length > 0) {
    void flushNow();
  }
}

function scheduleFlush(): void {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushNow();
  }, FLUSH_INTERVAL_MS);
}

export function trackArticleEngagement(
  event: Omit<ArticleEngagementEventInput, "sessionId" | "occurredAt">
): void {
  if (engagementDisabled) return;
  queue.push({
    ...event,
    sessionId: getSessionId(),
    occurredAt: new Date().toISOString(),
  });
  if (queue.length >= MAX_BATCH_SIZE) {
    void flushNow();
    return;
  }
  scheduleFlush();
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", () => {
    if (queue.length === 0) return;
    const payload = JSON.stringify({ events: queue.slice(0, MAX_BATCH_SIZE) });
    navigator.sendBeacon(
      "/api/user/article-engagement",
      new Blob([payload], { type: "application/json" })
    );
  });
}

