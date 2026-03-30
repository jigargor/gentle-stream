"use client";

import { useEffect, useState } from "react";
import type { ArticleSubmission } from "@/lib/types";
import { ArticleBodyMarkdown } from "@/components/articles/ArticleBodyMarkdown";

type AdminFilter = "pending" | "approved" | "rejected" | "withdrawn" | "all";

export function AdminSubmissionsPanel() {
  const [filter, setFilter] = useState<AdminFilter>("pending");
  const [submissions, setSubmissions] = useState<ArticleSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [adminNote, setAdminNote] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");

  async function load() {
    setLoading(true);
    const query = filter === "all" ? "" : `?status=${encodeURIComponent(filter)}`;
    try {
      const response = await fetch(`/api/admin/submissions${query}`);
      const payload = (await response.json().catch(() => ({}))) as {
        submissions?: ArticleSubmission[];
        error?: string;
      };
      if (!response.ok) {
        setMessage(payload.error ?? "Could not load queue");
        return;
      }
      setSubmissions(payload.submissions ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [filter]);

  async function review(id: string, action: "approve" | "reject") {
    setBusyId(id);
    setMessage(null);
    try {
      const response = await fetch(`/api/admin/submissions/${id}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          adminNote: adminNote.trim() || null,
          rejectionReason: rejectionReason.trim() || null,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) {
        setMessage(payload.error ?? "Review action failed");
        return;
      }
      setAdminNote("");
      setRejectionReason("");
      await load();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "#ede9e1", padding: "1rem" }}>
      <div style={{ maxWidth: "980px", margin: "0 auto", display: "grid", gap: "0.9rem" }}>
        <div style={{ background: "#faf8f3", border: "1px solid #d8d2c7", padding: "1rem" }}>
          <h1 style={{ margin: 0, fontFamily: "'Playfair Display', Georgia, serif", fontSize: "1.5rem" }}>
            Admin moderation queue
          </h1>
          <p style={{ margin: "0.35rem 0 0", color: "#666", fontFamily: "'IM Fell English', Georgia, serif" }}>
            Review creator submissions and decide what enters the feed pool.
          </p>
        </div>

        <div style={{ background: "#faf8f3", border: "1px solid #d8d2c7", padding: "0.7rem 1rem" }}>
          <label style={{ fontSize: "0.8rem", color: "#555", marginRight: "0.5rem" }}>Filter</label>
          <select value={filter} onChange={(e) => setFilter(e.target.value as AdminFilter)} style={{ padding: "0.35rem", border: "1px solid #bbb" }}>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="withdrawn">Withdrawn</option>
            <option value="all">All</option>
          </select>
        </div>

        <div style={{ background: "#faf8f3", border: "1px solid #d8d2c7", padding: "1rem" }}>
          <h2 style={{ marginTop: 0, fontFamily: "'Playfair Display', Georgia, serif", fontSize: "1.1rem" }}>
            Review notes
          </h2>
          <input value={adminNote} onChange={(e) => setAdminNote(e.target.value)} placeholder="Admin note (optional, for both approve/reject)" style={{ width: "100%", boxSizing: "border-box", padding: "0.4rem", border: "1px solid #bbb", marginBottom: "0.45rem" }} />
          <input value={rejectionReason} onChange={(e) => setRejectionReason(e.target.value)} placeholder="Rejection reason (used when rejecting)" style={{ width: "100%", boxSizing: "border-box", padding: "0.4rem", border: "1px solid #bbb" }} />
        </div>

        {message ? (
          <p style={{ margin: 0, color: "#7b2d00" }}>{message}</p>
        ) : null}

        <div style={{ background: "#faf8f3", border: "1px solid #d8d2c7", padding: "1rem" }}>
          {loading ? (
            <p style={{ margin: 0, color: "#666" }}>Loading submissions...</p>
          ) : submissions.length === 0 ? (
            <p style={{ margin: 0, color: "#666" }}>No submissions for this filter.</p>
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: "0.75rem" }}>
              {submissions.map((submission) => (
                <li key={submission.id} style={{ border: "1px solid #ddd", padding: "0.7rem", background: "#fff" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem", alignItems: "center" }}>
                    <strong style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>{submission.headline}</strong>
                    <span style={{ textTransform: "uppercase", color: "#555", fontSize: "0.73rem" }}>{submission.status}</span>
                  </div>
                  <p style={{ margin: "0.35rem 0 0", color: "#666", fontSize: "0.84rem" }}>
                    Author: {submission.authorUserId} • {submission.category}
                  </p>
                  {submission.explicitHashtags.length > 0 ? (
                    <p style={{ margin: "0.35rem 0 0", color: "#666", fontSize: "0.82rem" }}>
                      Explicit tags: {submission.explicitHashtags.join(", ")}
                    </p>
                  ) : null}
                  <div
                    style={{
                      marginTop: "0.55rem",
                      borderTop: "1px solid #ece7db",
                      paddingTop: "0.55rem",
                    }}
                  >
                    <ArticleBodyMarkdown
                      markdown={submission.body}
                      variant="admin"
                      fontPreset="classic"
                    />
                  </div>

                  {submission.status === "pending" ? (
                    <div style={{ marginTop: "0.7rem", display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                      <button
                        onClick={() => review(submission.id, "approve")}
                        disabled={busyId === submission.id}
                        style={{ padding: "0.35rem 0.6rem", border: "1px solid #1a472a", background: "#fff", cursor: "pointer" }}
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => review(submission.id, "reject")}
                        disabled={busyId === submission.id}
                        style={{ padding: "0.35rem 0.6rem", border: "1px solid #8b4513", background: "#fff", cursor: "pointer" }}
                      >
                        Reject
                      </button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
