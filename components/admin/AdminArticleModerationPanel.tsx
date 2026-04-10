"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArticleBodyMarkdown } from "@/components/articles/ArticleBodyMarkdown";
import type { ArticleModerationStatus } from "@/lib/types";
import type { ModerationQueueListItem } from "@/lib/db/articleModeration";

type ModerationFilter = ArticleModerationStatus | "all";

export function AdminArticleModerationPanel() {
  const [filter, setFilter] = useState<ModerationFilter>("pending");
  const [items, setItems] = useState<ModerationQueueListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const query = filter === "all" ? "" : `?status=${encodeURIComponent(filter)}`;
    try {
      const response = await fetch(`/api/admin/articles/moderation${query}`);
      const payload = (await response.json().catch(() => ({}))) as {
        items?: ModerationQueueListItem[];
        error?: string;
      };
      if (!response.ok) {
        setMessage(payload.error ?? "Could not load moderation queue");
        return;
      }
      setItems(payload.items ?? []);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load]);

  async function moderateAction(
    articleId: string,
    action: "approve" | "reject" | "restore"
  ) {
    setBusyId(articleId);
    setMessage(null);
    try {
      const endpoint = `/api/admin/articles/moderation/${articleId}/${action}`;
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          note: note.trim() || null,
          reason: reason.trim() || null,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setMessage(payload.error ?? "Moderation action failed");
        return;
      }
      setReason("");
      setNote("");
      await load();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "#ede9e1", padding: "1rem" }}>
      <div style={{ maxWidth: "980px", margin: "0 auto", display: "grid", gap: "0.9rem" }}>
        <div style={{ background: "#faf8f3", border: "1px solid #d8d2c7", padding: "1rem" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: "0.75rem",
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <h1 style={{ margin: 0, fontFamily: "'Playfair Display', Georgia, serif", fontSize: "1.5rem" }}>
              Admin article moderation
            </h1>
            <Link
              href="/"
              style={{
                padding: "0.36rem 0.62rem",
                border: "1px solid #888",
                background: "#fff",
                color: "#1a1a1a",
                textDecoration: "none",
                fontSize: "0.82rem",
                fontFamily: "'IM Fell English', Georgia, serif",
              }}
            >
              Back to app
            </Link>
          </div>
          <p style={{ margin: "0.35rem 0 0", color: "#666", fontFamily: "'IM Fell English', Georgia, serif" }}>
            Review political or policy-heavy stories flagged by the tagger and decide what stays visible.
          </p>
        </div>

        <div style={{ background: "#faf8f3", border: "1px solid #d8d2c7", padding: "0.7rem 1rem" }}>
          <label style={{ fontSize: "0.8rem", color: "#555", marginRight: "0.5rem" }}>Filter</label>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as ModerationFilter)}
            style={{ padding: "0.35rem", border: "1px solid #bbb" }}
          >
            <option value="pending">Pending</option>
            <option value="flagged">Flagged</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="all">All</option>
          </select>
        </div>

        <div style={{ background: "#faf8f3", border: "1px solid #d8d2c7", padding: "1rem" }}>
          <h2 style={{ marginTop: 0, fontFamily: "'Playfair Display', Georgia, serif", fontSize: "1.1rem" }}>
            Moderator inputs
          </h2>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Admin note (optional)"
            style={{
              width: "100%",
              boxSizing: "border-box",
              padding: "0.4rem",
              border: "1px solid #bbb",
              marginBottom: "0.45rem",
            }}
          />
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reject reason (optional, defaults provided)"
            style={{ width: "100%", boxSizing: "border-box", padding: "0.4rem", border: "1px solid #bbb" }}
          />
        </div>

        {message ? <p style={{ margin: 0, color: "#7b2d00" }}>{message}</p> : null}

        <div style={{ background: "#faf8f3", border: "1px solid #d8d2c7", padding: "1rem" }}>
          {loading ? (
            <p style={{ margin: 0, color: "#666" }}>Loading moderation queue...</p>
          ) : items.length === 0 ? (
            <p style={{ margin: 0, color: "#666" }}>No articles for this filter.</p>
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: "0.75rem" }}>
              {items.map((item) => (
                <li
                  key={item.id}
                  style={{ border: "1px solid #ddd", padding: "0.7rem", background: "#fff" }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem", alignItems: "center" }}>
                    <strong style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>{item.headline}</strong>
                    <span style={{ textTransform: "uppercase", color: "#555", fontSize: "0.73rem" }}>
                      {item.moderationStatus}
                    </span>
                  </div>
                  <p style={{ margin: "0.35rem 0 0", color: "#666", fontSize: "0.84rem" }}>
                    {item.category} • {item.contentKind} • {item.source} • tagged={String(item.tagged)}
                  </p>
                  <p style={{ margin: "0.25rem 0 0", color: "#666", fontSize: "0.8rem" }}>
                    confidence={item.moderationConfidence ?? "n/a"} • quality={item.qualityScore.toFixed(2)}
                  </p>
                  {item.moderationReason ? (
                    <p style={{ margin: "0.25rem 0 0", color: "#8b6d2f", fontSize: "0.82rem" }}>
                      moderation reason: {item.moderationReason}
                    </p>
                  ) : null}
                  {item.deleteReason ? (
                    <p style={{ margin: "0.25rem 0 0", color: "#8b4513", fontSize: "0.82rem" }}>
                      delete reason: {item.deleteReason}
                    </p>
                  ) : null}
                  <div
                    style={{
                      marginTop: "0.55rem",
                      borderTop: "1px solid #ece7db",
                      paddingTop: "0.55rem",
                    }}
                  >
                    <ArticleBodyMarkdown markdown={item.body} variant="admin" fontPreset="classic" />
                  </div>
                  <div style={{ marginTop: "0.7rem", display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                    <button
                      onClick={() => moderateAction(item.id, "approve")}
                      disabled={busyId === item.id}
                      style={{
                        padding: "0.35rem 0.6rem",
                        border: "1px solid #1a472a",
                        background: "#fff",
                        cursor: "pointer",
                      }}
                    >
                      Approve visible
                    </button>
                    <button
                      onClick={() => moderateAction(item.id, "reject")}
                      disabled={busyId === item.id}
                      style={{
                        padding: "0.35rem 0.6rem",
                        border: "1px solid #8b4513",
                        background: "#fff",
                        cursor: "pointer",
                      }}
                    >
                      Reject + soft delete
                    </button>
                    <button
                      onClick={() => moderateAction(item.id, "restore")}
                      disabled={busyId === item.id}
                      style={{
                        padding: "0.35rem 0.6rem",
                        border: "1px solid #2d4f7b",
                        background: "#fff",
                        cursor: "pointer",
                      }}
                    >
                      Restore
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
