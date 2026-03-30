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
  body: string;
  pullQuote: string;
  category: string;
  contentKind: "user_article" | "recipe";
  locale: string;
  explicitHashtags: string;

  // Recipe fields (contentKind='recipe')
  recipeServings: string;
  recipeIngredientsText: string; // newline-separated
  recipeInstructionsText: string; // separated by blank lines (preferred)
  recipePrepTimeMinutes: string;
  recipeCookTimeMinutes: string;
  recipeImages: string[];
}

const EMPTY_FORM: FormState = {
  headline: "",
  body: "",
  pullQuote: "",
  category: CATEGORIES[0],
  contentKind: "user_article",
  locale: "global",
  explicitHashtags: "",
  recipeServings: "",
  recipeIngredientsText: "",
  recipeInstructionsText: "",
  recipePrepTimeMinutes: "",
  recipeCookTimeMinutes: "",
  recipeImages: [],
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
  const [recipeImagesBusy, setRecipeImagesBusy] = useState(false);
  const [recipeImagesError, setRecipeImagesError] = useState<string | null>(null);
  const [recipeImageInputKey, setRecipeImageInputKey] = useState(0);
  const [recipeImportUrl, setRecipeImportUrl] = useState("");
  const [recipeImportBusy, setRecipeImportBusy] = useState(false);
  const [recipeImportMessage, setRecipeImportMessage] = useState<string | null>(null);
  const [recipeImportIsError, setRecipeImportIsError] = useState(false);
  const bodyTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const bodyCharacterCount = form.body.length;
  const isBodyTooLong = bodyCharacterCount > MAX_SUBMISSION_BODY_CHARS;

  const canSubmit = useMemo(() => {
    if (form.contentKind === "recipe") {
      const servings = Math.trunc(Number(form.recipeServings));
      const servingsOk = Number.isFinite(servings) && servings > 0;
      const ingredients = form.recipeIngredientsText
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
      const instructions = form.recipeInstructionsText
        .split(/\n\s*\n/)
        .map((p) => p.trim())
        .filter(Boolean);

      const prep = Math.trunc(Number(form.recipePrepTimeMinutes));
      const cook = Math.trunc(Number(form.recipeCookTimeMinutes));
      const prepOk = Number.isFinite(prep) && prep >= 0;
      const cookOk = Number.isFinite(cook) && cook >= 0;

      return (
        form.headline.trim().length > 0 &&
        servingsOk &&
        ingredients.length > 0 &&
        instructions.length > 0 &&
        prepOk &&
        cookOk
      );
    }

    return form.headline.trim().length > 0 && form.body.trim().length > 0 && !isBodyTooLong;
  }, [
    form.contentKind,
    form.headline,
    form.body,
    isBodyTooLong,
    form.recipeServings,
    form.recipeIngredientsText,
    form.recipeInstructionsText,
    form.recipePrepTimeMinutes,
    form.recipeCookTimeMinutes,
  ]);

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
      const isRecipe = form.contentKind === "recipe";

      const recipeServings = isRecipe ? Math.trunc(Number(form.recipeServings)) : null;
      const recipeIngredients = isRecipe
        ? form.recipeIngredientsText
            .split("\n")
            .map((l) => l.trim())
            .filter(Boolean)
        : [];
      const recipeInstructions = isRecipe
        ? form.recipeInstructionsText
            .split(/\n\s*\n/)
            .map((p) => p.trim())
            .filter(Boolean)
        : [];
      const recipePrepTimeMinutes = isRecipe ? Math.trunc(Number(form.recipePrepTimeMinutes)) : null;
      const recipeCookTimeMinutes = isRecipe ? Math.trunc(Number(form.recipeCookTimeMinutes)) : null;
      const bodyToSend = isRecipe
        ? [
            recipeIngredients.length > 0
              ? `Ingredients:\n${recipeIngredients.map((i) => `- ${i}`).join("\n")}`
              : "",
            recipeInstructions.length > 0
              ? `Instructions:\n${recipeInstructions.join("\n\n")}`
              : "",
          ]
            .filter(Boolean)
            .join("\n\n")
        : form.body;

      const isEdit = editingId != null;
      const response = await fetch(
        isEdit ? `/api/creator/submissions/${editingId}` : "/api/creator/submissions",
        {
          method: isEdit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            headline: form.headline,
            body: bodyToSend,
            pullQuote: form.pullQuote,
            category: form.contentKind === "user_article" ? form.category : undefined,
            contentKind: form.contentKind,
            recipeServings: isRecipe ? recipeServings : undefined,
            recipeIngredients: isRecipe ? recipeIngredients : undefined,
            recipeInstructions: isRecipe ? recipeInstructions : undefined,
            recipePrepTimeMinutes: isRecipe ? recipePrepTimeMinutes : undefined,
            recipeCookTimeMinutes: isRecipe ? recipeCookTimeMinutes : undefined,
            recipeImages: isRecipe ? form.recipeImages : undefined,
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
      body: submission.body,
      pullQuote: submission.pullQuote,
      category: submission.category,
      contentKind: submission.contentKind,
      locale: submission.locale,
      explicitHashtags: submission.explicitHashtags.join(", "),
      recipeServings:
        submission.contentKind === "recipe"
          ? String(submission.recipeServings ?? "")
          : "",
      recipeIngredientsText:
        submission.contentKind === "recipe"
          ? (submission.recipeIngredients ?? []).join("\n")
          : "",
      recipeInstructionsText:
        submission.contentKind === "recipe"
          ? (submission.recipeInstructions ?? []).join("\n\n")
          : "",
      recipePrepTimeMinutes:
        submission.contentKind === "recipe"
          ? String(submission.recipePrepTimeMinutes ?? "")
          : "",
      recipeCookTimeMinutes:
        submission.contentKind === "recipe"
          ? String(submission.recipeCookTimeMinutes ?? "")
          : "",
      recipeImages: submission.contentKind === "recipe" ? submission.recipeImages ?? [] : [],
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

  async function importRecipeFromLink() {
    const url = recipeImportUrl.trim();
    if (!url) {
      setRecipeImportMessage("Paste a recipe URL first.");
      setRecipeImportIsError(true);
      return;
    }
    setRecipeImportBusy(true);
    setRecipeImportMessage(null);
    setRecipeImportIsError(false);
    try {
      const response = await fetch("/api/creator/recipe-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ url }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        recipe?: {
          headline?: string;
          recipeServings?: number | null;
          recipeIngredients?: string[];
          recipeInstructions?: string[];
          recipePrepTimeMinutes?: number | null;
          recipeCookTimeMinutes?: number | null;
          recipeImages?: string[];
          sourceStage?: string;
          warnings?: string[];
        };
      };
      if (!response.ok || !payload.recipe) {
        setRecipeImportMessage(
          `Import failed (${response.status}): ${payload.error ?? "Could not import this recipe link."}`
        );
        setRecipeImportIsError(true);
        return;
      }

      const recipe = payload.recipe;
      setForm((prev) => ({
        ...prev,
        contentKind: "recipe",
        headline: typeof recipe.headline === "string" && recipe.headline.trim().length > 0 ? recipe.headline : prev.headline,
        recipeServings:
          typeof recipe.recipeServings === "number" && Number.isFinite(recipe.recipeServings)
            ? String(Math.trunc(recipe.recipeServings))
            : prev.recipeServings,
        recipeIngredientsText:
          Array.isArray(recipe.recipeIngredients) && recipe.recipeIngredients.length > 0
            ? recipe.recipeIngredients.join("\n")
            : prev.recipeIngredientsText,
        recipeInstructionsText:
          Array.isArray(recipe.recipeInstructions) && recipe.recipeInstructions.length > 0
            ? recipe.recipeInstructions.join("\n\n")
            : prev.recipeInstructionsText,
        recipePrepTimeMinutes:
          typeof recipe.recipePrepTimeMinutes === "number" &&
          Number.isFinite(recipe.recipePrepTimeMinutes)
            ? String(Math.trunc(recipe.recipePrepTimeMinutes))
            : prev.recipePrepTimeMinutes,
        recipeCookTimeMinutes:
          typeof recipe.recipeCookTimeMinutes === "number" &&
          Number.isFinite(recipe.recipeCookTimeMinutes)
            ? String(Math.trunc(recipe.recipeCookTimeMinutes))
            : prev.recipeCookTimeMinutes,
        recipeImages:
          Array.isArray(recipe.recipeImages) && recipe.recipeImages.length > 0
            ? recipe.recipeImages.slice(0, 3)
            : prev.recipeImages,
      }));

      const stage = typeof recipe.sourceStage === "string" ? recipe.sourceStage : "extractor";
      const warningText =
        Array.isArray(recipe.warnings) && recipe.warnings.length > 0
          ? ` (${recipe.warnings[0]})`
          : "";
      setRecipeImportMessage(`Imported via ${stage}.${warningText}`);
      setRecipeImportIsError(false);
    } catch {
      setRecipeImportMessage("Could not import recipe right now.");
      setRecipeImportIsError(true);
    } finally {
      setRecipeImportBusy(false);
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
          <div style={{ display: "grid", gap: "0.75rem" }}>
            <div style={{ border: "1px solid #d8d2c7", background: "#fff", padding: "0.7rem" }}>
              <p
                style={{
                  margin: 0,
                  marginBottom: "0.5rem",
                  fontFamily: "'Playfair Display', Georgia, serif",
                  fontSize: "0.9rem",
                  color: "#222",
                }}
              >
                Compose type
              </p>
              <div style={{ display: "flex", gap: "0.85rem", flexWrap: "wrap" }}>
                <label style={{ display: "inline-flex", alignItems: "center", gap: "0.42rem", cursor: "pointer" }}>
                  <input
                    type="radio"
                    name="content-kind"
                    checked={form.contentKind === "user_article"}
                    onChange={() =>
                      setForm((f) => ({ ...f, contentKind: "user_article" }))
                    }
                  />
                  <span style={{ fontFamily: "'IM Fell English', Georgia, serif", fontSize: "0.9rem" }}>
                    Article
                  </span>
                </label>
                <label style={{ display: "inline-flex", alignItems: "center", gap: "0.42rem", cursor: "pointer" }}>
                  <input
                    type="radio"
                    name="content-kind"
                    checked={form.contentKind === "recipe"}
                    onChange={() =>
                      setForm((f) => ({ ...f, contentKind: "recipe" }))
                    }
                  />
                  <span style={{ fontFamily: "'IM Fell English', Georgia, serif", fontSize: "0.9rem" }}>
                    Recipe
                  </span>
                </label>
              </div>
            </div>

            <div style={{ border: "1px solid #d8d2c7", background: "#fff", padding: "0.7rem", display: "grid", gap: "0.55rem" }}>
              <input value={form.headline} onChange={(e) => setForm((f) => ({ ...f, headline: e.target.value }))} placeholder="Headline" style={{ padding: "0.45rem", border: "1px solid #bbb" }} />
              {form.contentKind === "user_article" ? (
                <select value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} style={{ padding: "0.45rem", border: "1px solid #bbb" }}>
                  {CATEGORIES.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              ) : null}
            </div>
            {form.contentKind === "user_article" ? (
              <div
                style={{
                  border: "1px solid #d8d2c7",
                  background: "#fff",
                  padding: "0.6rem",
                }}
              >
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
            ) : (
              <div
                style={{
                  border: "1px solid #d8d2c7",
                  background: "#fff",
                  padding: "0.75rem",
                }}
              >
                <h3
                  style={{
                    margin: 0,
                    fontFamily: "'Playfair Display', Georgia, serif",
                    fontSize: "1rem",
                    marginBottom: "0.75rem",
                  }}
                >
                  Recipe details
                </h3>

                <div style={{ display: "grid", gap: "0.55rem" }}>
                  <div style={{ display: "grid", gap: "0.35rem" }}>
                    <label style={{ fontSize: "0.85rem", color: "#555", fontWeight: 600 }}>
                      Import recipe from link
                    </label>
                    <div style={{ display: "flex", gap: "0.45rem", flexWrap: "wrap" }}>
                      <input
                        value={recipeImportUrl}
                        onChange={(e) => setRecipeImportUrl(e.target.value)}
                        placeholder="https://example.com/recipe"
                        style={{
                          flex: "1 1 280px",
                          padding: "0.45rem",
                          border: "1px solid #bbb",
                          minWidth: 0,
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => void importRecipeFromLink()}
                        disabled={recipeImportBusy}
                        style={{
                          padding: "0.45rem 0.65rem",
                          border: "1px solid #1a472a",
                          background: "#fff",
                          cursor: recipeImportBusy ? "wait" : "pointer",
                          fontFamily: "'Playfair Display', Georgia, serif",
                        }}
                      >
                        {recipeImportBusy ? "Importing..." : "Import"}
                      </button>
                    </div>
                    {recipeImportMessage ? (
                      <p
                        style={{
                          margin: 0,
                          fontSize: "0.8rem",
                          color: recipeImportIsError ? "#8b4513" : "#2f5f3a",
                          background: recipeImportIsError ? "#fff0e6" : "#edf7ef",
                          border: `1px solid ${recipeImportIsError ? "#e4bf9a" : "#b6d7bf"}`,
                          padding: "0.38rem 0.5rem",
                        }}
                      >
                        {recipeImportMessage}
                      </p>
                    ) : (
                      <p style={{ margin: 0, fontSize: "0.8rem", color: "#888" }}>
                        Imports are limited to allowlisted domains.
                      </p>
                    )}
                  </div>

                  <div style={{ display: "flex", gap: "0.55rem", flexWrap: "wrap" }}>
                    <div style={{ flex: "1 1 160px" }}>
                      <label style={{ fontSize: "0.85rem", color: "#555", fontWeight: 600 }}>
                        Servings
                      </label>
                      <input
                        type="number"
                        value={form.recipeServings}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, recipeServings: e.target.value }))
                        }
                        placeholder="e.g. 4"
                        style={{ width: "100%", padding: "0.45rem", border: "1px solid #bbb", boxSizing: "border-box" }}
                      />
                    </div>
                    <div style={{ flex: "1 1 160px" }}>
                      <label style={{ fontSize: "0.85rem", color: "#555", fontWeight: 600 }}>
                        Prep time (minutes)
                      </label>
                      <input
                        type="number"
                        value={form.recipePrepTimeMinutes}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, recipePrepTimeMinutes: e.target.value }))
                        }
                        placeholder="e.g. 15"
                        style={{ width: "100%", padding: "0.45rem", border: "1px solid #bbb", boxSizing: "border-box" }}
                      />
                    </div>
                    <div style={{ flex: "1 1 160px" }}>
                      <label style={{ fontSize: "0.85rem", color: "#555", fontWeight: 600 }}>
                        Cook time (minutes)
                      </label>
                      <input
                        type="number"
                        value={form.recipeCookTimeMinutes}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, recipeCookTimeMinutes: e.target.value }))
                        }
                        placeholder="e.g. 25"
                        style={{ width: "100%", padding: "0.45rem", border: "1px solid #bbb", boxSizing: "border-box" }}
                      />
                    </div>
                  </div>

                  <div style={{ display: "grid", gap: "0.35rem" }}>
                    <label style={{ fontSize: "0.85rem", color: "#555", fontWeight: 600 }}>
                      Ingredients (one per line)
                    </label>
                    <textarea
                      value={form.recipeIngredientsText}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, recipeIngredientsText: e.target.value }))
                      }
                      placeholder={"1 tbsp olive oil\n1 onion, diced\n2 cloves garlic"}
                      style={{
                        minHeight: "120px",
                        width: "100%",
                        padding: "0.55rem",
                        border: "1px solid #bbb",
                        resize: "vertical",
                      }}
                    />
                  </div>

                  <div style={{ display: "grid", gap: "0.35rem" }}>
                    <label style={{ fontSize: "0.85rem", color: "#555", fontWeight: 600 }}>
                      Instructions (separate steps with a blank line)
                    </label>
                    <textarea
                      value={form.recipeInstructionsText}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          recipeInstructionsText: e.target.value,
                        }))
                      }
                      placeholder={"Step one...\n\nStep two...\n\nStep three..."}
                      style={{
                        minHeight: "160px",
                        width: "100%",
                        padding: "0.55rem",
                        border: "1px solid #bbb",
                        resize: "vertical",
                      }}
                    />
                  </div>

                  <div style={{ display: "grid", gap: "0.35rem" }}>
                    <label style={{ fontSize: "0.85rem", color: "#555", fontWeight: 600 }}>
                      Recipe pictures (up to 3)
                    </label>
                    <input
                      key={recipeImageInputKey}
                      type="file"
                      accept="image/*"
                      multiple
                      disabled={recipeImagesBusy}
                      onChange={async (e) => {
                        const files = Array.from(e.target.files ?? []);
                        if (files.length === 0) return;
                        if (files.length > 3) {
                          setRecipeImagesError("Please select up to 3 images.");
                          return;
                        }
                        setRecipeImagesError(null);
                        setRecipeImagesBusy(true);
                        try {
                          const fd = new FormData();
                          for (const f of files) fd.append("files", f);
                          const res = await fetch(
                            "/api/user/recipe-images/upload",
                            {
                              method: "POST",
                              body: fd,
                              credentials: "include",
                            }
                          );
                          const payload = await res.json().catch(() => ({}));
                          if (!res.ok) {
                            throw new Error(
                              typeof payload.error === "string"
                                ? payload.error
                                : "Upload failed"
                            );
                          }
                          const urls = Array.isArray(payload.urls)
                            ? (payload.urls as string[])
                            : [];
                          setForm((f) => ({ ...f, recipeImages: urls }));
                        } catch (err: unknown) {
                          const msg =
                            err instanceof Error ? err.message : "Upload failed";
                          setRecipeImagesError(msg);
                        } finally {
                          setRecipeImagesBusy(false);
                        }
                      }}
                      style={{ padding: "0.4rem", border: "1px solid #bbb", background: "#fff" }}
                    />
                    {recipeImagesError ? (
                      <p style={{ margin: 0, color: "#8b4513", fontSize: "0.82rem" }}>
                        {recipeImagesError}
                      </p>
                    ) : null}
                    {form.recipeImages.length > 0 ? (
                      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                        {form.recipeImages.map((url, idx) => (
                          <div
                            key={`${url}-${idx}`}
                            style={{
                              border: "1px solid #d8d2c7",
                              background: "#faf8f3",
                              padding: "0.35rem",
                              borderRadius: "6px",
                            }}
                          >
                            <img
                              src={url}
                              alt={`Recipe image ${idx + 1}`}
                              width={90}
                              height={90}
                              style={{
                                width: 90,
                                height: 90,
                                objectFit: "cover",
                                display: "block",
                                borderRadius: "4px",
                              }}
                            />
                            <button
                              type="button"
                              style={{
                                marginTop: "0.35rem",
                                padding: "0.25rem 0.45rem",
                                border: "1px solid #888",
                                background: "#fff",
                                cursor: "pointer",
                                fontFamily: "'Playfair Display', Georgia, serif",
                                fontSize: "0.72rem",
                              }}
                              onClick={() => {
                                setForm((f) => ({
                                  ...f,
                                  recipeImages: f.recipeImages.filter((_, i) => i !== idx),
                                }));
                              }}
                            >
                              Remove
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p style={{ margin: 0, color: "#777", fontSize: "0.82rem" }}>
                        Optional.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}
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
                    {submission.category} • {submission.contentKind === "recipe" ? "Recipe" : "Article"} • {new Date(submission.createdAt).toLocaleString()}
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
