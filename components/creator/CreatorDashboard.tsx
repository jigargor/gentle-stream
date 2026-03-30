"use client";

import { useEffect, useMemo, useState } from "react";
import { CATEGORIES } from "@/lib/constants";
import type { ArticleSubmission } from "@/lib/types";

interface FormState {
  headline: string;
  subheadline: string;
  body: string;
  pullQuote: string;
  category: string;
  locale: string;
  explicitHashtags: string;
}

const EMPTY_FORM: FormState = {
  headline: "",
  subheadline: "",
  body: "",
  pullQuote: "",
  category: CATEGORIES[0],
  locale: "global",
  explicitHashtags: "",
};

export function CreatorDashboard() {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [submissions, setSubmissions] = useState<ArticleSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const canSubmit = useMemo(
    () => form.headline.trim().length > 0 && form.body.trim().length > 0,
    [form.body, form.headline]
  );

  async function loadSubmissions() {
    setLoading(true);
    try {
      const response = await fetch("/api/creator/submissions");
      const payload = (await response.json()) as {
        submissions?: ArticleSubmission[];
        error?: string;
      };
      if (!response.ok) {
        setMessage(payload.error ?? "Failed to load submissions");
        return;
      }
      setSubmissions(payload.submissions ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadSubmissions();
  }, []);

  async function submitForm() {
    if (!canSubmit) return;
    setBusy(true);
    setMessage(null);
    try {
      const explicitHashtags = form.explicitHashtags
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean);
      const isEdit = editingId != null;
      const response = await fetch(
        isEdit ? `/api/creator/submissions/${editingId}` : "/api/creator/submissions",
        {
          method: isEdit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            headline: form.headline,
            subheadline: form.subheadline,
            body: form.body,
            pullQuote: form.pullQuote,
            category: form.category,
            locale: form.locale,
            explicitHashtags,
          }),
        }
      );
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) {
        setMessage(payload.error ?? "Save failed");
        return;
      }
      setForm(EMPTY_FORM);
      setEditingId(null);
      await loadSubmissions();
      setMessage(isEdit ? "Submission updated." : "Submission sent for review.");
    } finally {
      setBusy(false);
    }
  }

  function beginEdit(submission: ArticleSubmission) {
    setEditingId(submission.id);
    setForm({
      headline: submission.headline,
      subheadline: submission.subheadline,
      body: submission.body,
      pullQuote: submission.pullQuote,
      category: submission.category,
      locale: submission.locale,
      explicitHashtags: submission.explicitHashtags.join(", "),
    });
  }

  async function withdrawSubmission(id: string) {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/creator/submissions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ withdraw: true }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) {
        setMessage(payload.error ?? "Could not withdraw.");
        return;
      }
      await loadSubmissions();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "#ede9e1", padding: "1rem" }}>
      <div style={{ maxWidth: "980px", margin: "0 auto", display: "grid", gap: "1rem" }}>
        <div style={{ background: "#faf8f3", border: "1px solid #d8d2c7", padding: "1rem" }}>
          <h1 style={{ margin: 0, fontFamily: "'Playfair Display', Georgia, serif", fontSize: "1.5rem" }}>
            Creator studio
          </h1>
          <p style={{ margin: "0.35rem 0 0", color: "#666", fontFamily: "'IM Fell English', Georgia, serif" }}>
            Draft and submit stories. Pending stories can still be edited or withdrawn.
          </p>
        </div>

        <div style={{ background: "#faf8f3", border: "1px solid #d8d2c7", padding: "1rem" }}>
          <h2 style={{ marginTop: 0, fontFamily: "'Playfair Display', Georgia, serif", fontSize: "1.1rem" }}>
            {editingId ? "Edit pending submission" : "New submission"}
          </h2>
          <div style={{ display: "grid", gap: "0.55rem" }}>
            <input value={form.headline} onChange={(e) => setForm((f) => ({ ...f, headline: e.target.value }))} placeholder="Headline" style={{ padding: "0.45rem", border: "1px solid #bbb" }} />
            <input value={form.subheadline} onChange={(e) => setForm((f) => ({ ...f, subheadline: e.target.value }))} placeholder="Subheadline (optional)" style={{ padding: "0.45rem", border: "1px solid #bbb" }} />
            <select value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} style={{ padding: "0.45rem", border: "1px solid #bbb" }}>
              {CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
            <textarea value={form.body} onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))} placeholder="Article body" style={{ minHeight: "180px", padding: "0.45rem", border: "1px solid #bbb" }} />
            <input value={form.pullQuote} onChange={(e) => setForm((f) => ({ ...f, pullQuote: e.target.value }))} placeholder="Pull quote (optional)" style={{ padding: "0.45rem", border: "1px solid #bbb" }} />
            <input value={form.locale} onChange={(e) => setForm((f) => ({ ...f, locale: e.target.value }))} placeholder="Locale (default global)" style={{ padding: "0.45rem", border: "1px solid #bbb" }} />
            <input value={form.explicitHashtags} onChange={(e) => setForm((f) => ({ ...f, explicitHashtags: e.target.value }))} placeholder="Explicit hashtags, comma separated" style={{ padding: "0.45rem", border: "1px solid #bbb" }} />
          </div>

          {message ? <p style={{ color: "#7b2d00", margin: "0.7rem 0 0" }}>{message}</p> : null}

          <div style={{ display: "flex", gap: "0.55rem", marginTop: "0.75rem", flexWrap: "wrap" }}>
            <button onClick={submitForm} disabled={!canSubmit || busy} style={{ padding: "0.45rem 0.7rem", border: "1px solid #1a472a", background: "#fff", cursor: "pointer" }}>
              {busy ? "Saving..." : editingId ? "Save pending draft" : "Submit for approval"}
            </button>
            {editingId ? (
              <button onClick={() => { setEditingId(null); setForm(EMPTY_FORM); }} style={{ padding: "0.45rem 0.7rem", border: "1px solid #888", background: "#fff", cursor: "pointer" }}>
                Cancel edit
              </button>
            ) : null}
          </div>
        </div>

        <div style={{ background: "#faf8f3", border: "1px solid #d8d2c7", padding: "1rem" }}>
          <h2 style={{ marginTop: 0, fontFamily: "'Playfair Display', Georgia, serif", fontSize: "1.1rem" }}>
            Your submissions
          </h2>
          {loading ? (
            <p style={{ color: "#666" }}>Loading...</p>
          ) : submissions.length === 0 ? (
            <p style={{ color: "#666" }}>No submissions yet.</p>
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: "0.65rem" }}>
              {submissions.map((submission) => (
                <li key={submission.id} style={{ border: "1px solid #ddd", padding: "0.7rem", background: "#fff" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem", alignItems: "center" }}>
                    <strong style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>{submission.headline}</strong>
                    <span style={{ fontSize: "0.75rem", textTransform: "uppercase", color: "#555" }}>{submission.status}</span>
                  </div>
                  <p style={{ margin: "0.35rem 0 0", color: "#666", fontSize: "0.86rem" }}>
                    {submission.category} • {new Date(submission.createdAt).toLocaleString()}
                  </p>
                  {submission.rejectionReason ? (
                    <p style={{ margin: "0.35rem 0 0", color: "#8b4513", fontSize: "0.84rem" }}>
                      Rejection reason: {submission.rejectionReason}
                    </p>
                  ) : null}
                  {submission.status === "pending" ? (
                    <div style={{ marginTop: "0.45rem", display: "flex", gap: "0.45rem", flexWrap: "wrap" }}>
                      <button onClick={() => beginEdit(submission)} style={{ padding: "0.35rem 0.6rem", border: "1px solid #999", background: "#fff", cursor: "pointer" }}>
                        Edit
                      </button>
                      <button onClick={() => withdrawSubmission(submission.id)} style={{ padding: "0.35rem 0.6rem", border: "1px solid #b05", background: "#fff", cursor: "pointer" }}>
                        Withdraw
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
