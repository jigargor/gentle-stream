"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { CATEGORIES } from "@/lib/constants";
import type { ArticleSubmission } from "@/lib/types";
import { ArticleBodyMarkdown } from "@/components/articles/ArticleBodyMarkdown";

interface CreatorDashboardProps {
  /** Public creator profile URL (same for author byline links). */
  publicProfileHref?: string;
}

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

const MAX_SUBMISSION_BODY_CHARS = 15_000;

export function CreatorDashboard({ publicProfileHref }: CreatorDashboardProps = {}) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [submissions, setSubmissions] = useState<ArticleSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [bodyEditorTab, setBodyEditorTab] = useState<"write" | "preview">("write");
  const bodyTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const bodyCharacterCount = form.body.length;
  const isBodyTooLong = bodyCharacterCount > MAX_SUBMISSION_BODY_CHARS;

  const canSubmit = useMemo(
    () =>
      form.headline.trim().length > 0 &&
      form.body.trim().length > 0 &&
      !isBodyTooLong,
    [form.body, form.headline, isBodyTooLong]
  );

  function insertMarkdown(before: string, after = "", placeholder = "text") {
    const textarea = bodyTextareaRef.current;
    if (!textarea) {
      setForm((prev) => ({ ...prev, body: `${prev.body}${before}${placeholder}${after}` }));
      return;
    }

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = form.body.slice(start, end);
    const insertion = `${before}${selectedText || placeholder}${after}`;
    const nextBody = `${form.body.slice(0, start)}${insertion}${form.body.slice(end)}`;

    setForm((prev) => ({ ...prev, body: nextBody }));
    const cursorStart = start + before.length;
    const cursorEnd = cursorStart + (selectedText || placeholder).length;
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(cursorStart, cursorEnd);
    });
  }

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
    setBodyEditorTab("write");
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
              Creator studio
            </h1>
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
              {publicProfileHref ? (
                <Link
                  href={publicProfileHref}
                  style={{
                    padding: "0.36rem 0.62rem",
                    border: "1px solid #1a472a",
                    background: "#fff",
                    color: "#1a472a",
                    textDecoration: "none",
                    fontSize: "0.82rem",
                    fontFamily: "'IM Fell English', Georgia, serif",
                  }}
                >
                  Public profile
                </Link>
              ) : null}
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
          </div>
          <p style={{ margin: "0.35rem 0 0", color: "#666", fontFamily: "'IM Fell English', Georgia, serif" }}>
            Draft and submit stories. Pending or revision-requested stories can still be edited or withdrawn.
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
            <div style={{ border: "1px solid #d8d2c7", background: "#fff", padding: "0.6rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
                <label style={{ fontSize: "0.85rem", color: "#555", fontWeight: 600 }}>Article body (Markdown)</label>
                <span style={{ fontSize: "0.78rem", color: isBodyTooLong ? "#8b4513" : "#666" }}>
                  {bodyCharacterCount.toLocaleString()} / {MAX_SUBMISSION_BODY_CHARS.toLocaleString()}
                </span>
              </div>

              <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap", marginTop: "0.5rem" }}>
                <button type="button" onClick={() => insertMarkdown("**", "**", "bold")} style={{ padding: "0.25rem 0.5rem", border: "1px solid #bbb", background: "#faf8f3", cursor: "pointer", fontSize: "0.78rem" }}>
                  Bold
                </button>
                <button type="button" onClick={() => insertMarkdown("_", "_", "italic")} style={{ padding: "0.25rem 0.5rem", border: "1px solid #bbb", background: "#faf8f3", cursor: "pointer", fontSize: "0.78rem" }}>
                  Italic
                </button>
                <button type="button" onClick={() => insertMarkdown("## ", "", "Section title")} style={{ padding: "0.25rem 0.5rem", border: "1px solid #bbb", background: "#faf8f3", cursor: "pointer", fontSize: "0.78rem" }}>
                  Heading
                </button>
                <button type="button" onClick={() => insertMarkdown("> ", "", "Quote")} style={{ padding: "0.25rem 0.5rem", border: "1px solid #bbb", background: "#faf8f3", cursor: "pointer", fontSize: "0.78rem" }}>
                  Quote
                </button>
                <button type="button" onClick={() => insertMarkdown("- ", "", "List item")} style={{ padding: "0.25rem 0.5rem", border: "1px solid #bbb", background: "#faf8f3", cursor: "pointer", fontSize: "0.78rem" }}>
                  Bullet list
                </button>
                <button type="button" onClick={() => insertMarkdown("[", "](https://example.com)", "Link text")} style={{ padding: "0.25rem 0.5rem", border: "1px solid #bbb", background: "#faf8f3", cursor: "pointer", fontSize: "0.78rem" }}>
                  Link
                </button>
                <button type="button" onClick={() => insertMarkdown("\n\n---\n\n", "", "")} style={{ padding: "0.25rem 0.5rem", border: "1px solid #bbb", background: "#faf8f3", cursor: "pointer", fontSize: "0.78rem" }}>
                  Section break
                </button>
              </div>

              <div style={{ display: "flex", gap: "0.35rem", marginTop: "0.5rem", marginBottom: "0.5rem" }}>
                <button
                  type="button"
                  onClick={() => setBodyEditorTab("write")}
                  style={{
                    padding: "0.25rem 0.55rem",
                    border: bodyEditorTab === "write" ? "1px solid #1a472a" : "1px solid #bbb",
                    background: bodyEditorTab === "write" ? "#eaf4ed" : "#fff",
                    cursor: "pointer",
                    fontSize: "0.78rem",
                  }}
                >
                  Write
                </button>
                <button
                  type="button"
                  onClick={() => setBodyEditorTab("preview")}
                  style={{
                    padding: "0.25rem 0.55rem",
                    border: bodyEditorTab === "preview" ? "1px solid #1a472a" : "1px solid #bbb",
                    background: bodyEditorTab === "preview" ? "#eaf4ed" : "#fff",
                    cursor: "pointer",
                    fontSize: "0.78rem",
                  }}
                >
                  Preview
                </button>
              </div>

              {bodyEditorTab === "write" ? (
                <textarea
                  ref={bodyTextareaRef}
                  value={form.body}
                  onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
                  placeholder={"Write in Markdown...\n\n## Section heading\n\nParagraph text with **bold** and _italic_.\n\n> Pull quote or emphasis.\n\n---\n\nNext section..."}
                  style={{ minHeight: "220px", width: "100%", padding: "0.55rem", border: "1px solid #bbb", resize: "vertical" }}
                />
              ) : (
                <div style={{ minHeight: "220px", border: "1px solid #bbb", padding: "0.6rem", background: "#faf8f3" }}>
                  <ArticleBodyMarkdown
                    markdown={form.body.trim() ? form.body : "*Preview appears here as you write.*"}
                    variant="reader"
                    fontPreset="literary"
                  />
                </div>
              )}

              <details style={{ marginTop: "0.55rem" }}>
                <summary style={{ cursor: "pointer", color: "#555", fontSize: "0.8rem" }}>
                  Markdown quick guide
                </summary>
                <div style={{ fontSize: "0.78rem", color: "#666", lineHeight: 1.55, marginTop: "0.4rem" }}>
                  <div><strong>Bold:</strong> <code>**text**</code> &nbsp; <strong>Italic:</strong> <code>_text_</code></div>
                  <div><strong>Heading:</strong> <code>## Title</code> &nbsp; <strong>Quote:</strong> <code>&gt; line</code></div>
                  <div><strong>List:</strong> <code>- item</code> &nbsp; <strong>Link:</strong> <code>[label](https://...)</code></div>
                  <div><strong>Section/Page break:</strong> <code>---</code> on its own line</div>
                </div>
              </details>
              <p style={{ margin: "0.45rem 0 0", fontSize: "0.76rem", color: "#666" }}>
                Typography is handled with curated reading presets in the app for consistency and safety.
              </p>
            </div>
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
                  {submission.adminNote ? (
                    <p style={{ margin: "0.35rem 0 0", color: "#8b6d2f", fontSize: "0.84rem" }}>
                      Moderator note: {submission.adminNote}
                    </p>
                  ) : null}
                  {submission.rejectionReason ? (
                    <p style={{ margin: "0.35rem 0 0", color: "#8b4513", fontSize: "0.84rem" }}>
                      Rejection reason: {submission.rejectionReason}
                    </p>
                  ) : null}
                  {submission.status === "pending" || submission.status === "changes_requested" ? (
                    <div style={{ marginTop: "0.45rem", display: "flex", gap: "0.45rem", flexWrap: "wrap" }}>
                      <button onClick={() => beginEdit(submission)} style={{ padding: "0.35rem 0.6rem", border: "1px solid #999", background: "#fff", cursor: "pointer" }}>
                        {submission.status === "changes_requested" ? "Revise" : "Edit"}
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
