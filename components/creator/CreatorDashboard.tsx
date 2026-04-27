"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { CATEGORIES } from "@/lib/constants";
import type {
  ArticleSubmission,
  CreatorDraft,
  CreatorDraftSummary,
  CreatorDraftVersion,
} from "@/lib/types";
import { ArticleBodyMarkdown } from "@/components/articles/ArticleBodyMarkdown";
import { BUILT_IN_ARTICLE_TYPES, articleTypeLabel } from "@/lib/creator/article-types";
import {
  formatApiClientError,
  parseApiClientError,
} from "@/lib/api/client-errors";

interface CreatorDashboardProps {
  /** Public creator profile URL (same for author byline links). */
  publicProfileHref?: string;
  initialSubmissions?: ArticleSubmission[];
  initialNextCursor?: string | null;
  /** Slim draft rows from server bootstrap (no body). */
  initialDraftSummaries?: CreatorDraftSummary[];
  initialDraftSummariesNextCursor?: string | null;
  initialAutocompleteEnabled?: boolean;
  /** When true, submissions list came from the server page; skip duplicate list fetch on mount. */
  serverListBootstrap?: boolean;
}

interface FormState {
  headline: string;
  body: string;
  pullQuote: string;
  category: string;
  articleType: string;
  articleTypeCustom: string;
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
  neverSendToAi: boolean;
}

interface AnalystCheckpoint {
  createdAt: string;
  metrics: {
    wordCount: number;
    sentenceCount: number;
    paragraphCount: number;
    avgSentenceWords: number;
    sectionPhase: "opening" | "middle" | "closing";
    repeatedTrigramCount: number;
  };
  notes: string[];
}

const EMPTY_FORM: FormState = {
  headline: "",
  body: "",
  pullQuote: "",
  category: CATEGORIES[0],
  articleType: BUILT_IN_ARTICLE_TYPES[0],
  articleTypeCustom: "",
  contentKind: "user_article",
  locale: "global",
  explicitHashtags: "",
  recipeServings: "",
  recipeIngredientsText: "",
  recipeInstructionsText: "",
  recipePrepTimeMinutes: "",
  recipeCookTimeMinutes: "",
  recipeImages: [],
  neverSendToAi: false,
};

const MAX_SUBMISSION_BODY_CHARS = 15_000;
const AUTOSAVE_DEBOUNCE_MS = 1200;

function assistActionTitles(params: {
  contentKind: FormState["contentKind"];
  hasOpeningAngles: boolean;
}) {
  const { contentKind, hasOpeningAngles } = params;
  const applyArticle = hasOpeningAngles
    ? "Uses only the suggested opening lines below—not the analysis paragraph above. If you highlighted text in the body, that selection is replaced with those lines. If nothing is highlighted, every opening line is inserted at the very start of your draft."
    : "Replaces your entire article body with the suggestion text. This overwrites the draft; use Copy first if you want to keep a backup.";
  return {
    apply:
      contentKind !== "user_article"
        ? "Replaces your headline with the suggestion. The article body is not changed."
        : applyArticle,
    insertBelow: hasOpeningAngles
      ? "Adds every suggested opening line after the end of your draft. The analysis paragraph above is not inserted."
      : "Adds the full suggestion after the end of your current draft.",
    replaceSelection: hasOpeningAngles
      ? "First highlight text in the body, then click: your highlight is replaced by all suggested opening lines only (not the analysis)."
      : "First highlight text in the body, then click: your highlight is replaced by the full suggestion.",
    copy: hasOpeningAngles
      ? "Copies the explanation paragraph above to the clipboard. To put a single hook in your draft, click that line under “Suggested openings” instead."
      : "Copies the suggestion text to the clipboard.",
    dismiss: "Closes this assist panel. Your draft is not changed.",
    openingLine:
      "Adds only this one line to the end of your draft. The long explanation above is not added.",
  };
}

export function CreatorDashboard({
  publicProfileHref,
  initialSubmissions = [],
  initialNextCursor = null,
  initialDraftSummaries = [],
  initialDraftSummariesNextCursor: _initialDraftSummariesNextCursor = null,
  initialAutocompleteEnabled = false,
  serverListBootstrap = false,
}: CreatorDashboardProps = {}) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [submissions, setSubmissions] = useState<ArticleSubmission[]>(initialSubmissions);
  const [loading, setLoading] = useState(() => !serverListBootstrap);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(initialNextCursor);
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
  const [assistBusy, setAssistBusy] = useState(false);
  const [assistError, setAssistError] = useState<string | null>(null);
  const [assistSuggestion, setAssistSuggestion] = useState<string | null>(null);
  const [assistOpeningAngles, setAssistOpeningAngles] = useState<string[]>([]);
  const [assistCostEstimate, setAssistCostEstimate] = useState<number | null>(null);
  const [assistEscalation, setAssistEscalation] = useState(false);
  const [helpMenuOpen, setHelpMenuOpen] = useState(false);
  const [helpContext, setHelpContext] = useState("");
  const [idlePromptVisible, setIdlePromptVisible] = useState(false);
  const [autocompleteEnabled, setAutocompleteEnabled] = useState(
    initialAutocompleteEnabled
  );
  const [autocompleteSuggestion, setAutocompleteSuggestion] = useState<string | null>(null);
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null);
  const [activeDraftRevision, setActiveDraftRevision] = useState<number | null>(null);
  const [autosaveStatus, setAutosaveStatus] = useState<"idle" | "saving" | "saved" | "error">(
    "idle"
  );
  const [autosaveError, setAutosaveError] = useState<string | null>(null);
  const [autosaveConflict, setAutosaveConflict] = useState(false);
  const [draftVersions, setDraftVersions] = useState<CreatorDraftVersion[]>([]);
  const [revisionsOpen, setRevisionsOpen] = useState(false);
  const revisionsOpenRef = useRef(false);
  const [draftContentLoading, setDraftContentLoading] = useState(false);
  const [analystEnabled, setAnalystEnabled] = useState(true);
  const [analystQuietMode, setAnalystQuietMode] = useState(true);
  const [analystCheckpoints, setAnalystCheckpoints] = useState<AnalystCheckpoint[]>([]);
  const [latestAnalyst, setLatestAnalyst] = useState<AnalystCheckpoint | null>(null);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingAutosaveRef = useRef(false);
  const lastSavedFingerprintRef = useRef<string>("");
  const lastSavedAtRef = useRef<number | null>(null);
  const bodyTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const latestSelectionRef = useRef<{ start: number; end: number; text: string } | null>(null);
  const analystWorkerRef = useRef<Worker | null>(null);
  const analystDirtyRef = useRef(false);
  const lastAnalystFingerprintRef = useRef("");
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bodyCharacterCount = form.body.length;
  /** ~200 wpm, aligned with typical reading-time estimates for multi-column heuristic. */
  const previewReadingTimeSecs = useMemo(
    () =>
      Math.max(
        1,
        Math.round((form.body.trim().split(/\s+/).filter(Boolean).length / 200) * 60)
      ),
    [form.body]
  );
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

    const hasArticleType =
      form.articleType === "custom"
        ? form.articleTypeCustom.trim().length > 1
        : form.articleType.trim().length > 0;
    return (
      form.headline.trim().length > 0 &&
      form.body.trim().length > 0 &&
      hasArticleType &&
      !isBodyTooLong
    );
  }, [
    form.contentKind,
    form.headline,
    form.body,
    form.articleType,
    form.articleTypeCustom,
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

  function appendAssistAngleToBody(fragment: string) {
    const piece = fragment.trim();
    if (!piece) return;
    setForm((prev) => {
      const base = prev.body.trimEnd();
      const sep = base.length === 0 ? "" : "\n\n";
      return { ...prev, body: `${base}${sep}${piece}` };
    });
    requestAnimationFrame(() => {
      const ta = bodyTextareaRef.current;
      if (!ta) return;
      ta.focus();
      const len = ta.value.length;
      ta.setSelectionRange(len, len);
    });
  }

  function buildDraftPayloadFromForm(state: FormState) {
    const bodyToSave =
      state.contentKind === "recipe"
        ? [
            state.recipeIngredientsText.trim()
              ? `Ingredients:\n${state.recipeIngredientsText.trim()}`
              : "",
            state.recipeInstructionsText.trim()
              ? `Instructions:\n${state.recipeInstructionsText.trim()}`
              : "",
            state.body.trim(),
          ]
            .filter(Boolean)
            .join("\n\n")
        : state.body;
    return {
      title: state.headline,
      body: bodyToSave,
      contentKind: state.contentKind,
      articleType: state.contentKind === "user_article" ? state.articleType : null,
      articleTypeCustom:
        state.contentKind === "user_article" && state.articleType === "custom"
          ? state.articleTypeCustom
          : null,
      category: state.contentKind === "user_article" ? state.category : "recipe",
      locale: state.locale,
      explicitHashtags: state.explicitHashtags
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
      pullQuote: state.pullQuote,
      neverSendToAi: state.neverSendToAi,
    };
  }

  function draftFingerprint(state: FormState): string {
    const payload = buildDraftPayloadFromForm(state);
    return JSON.stringify(payload);
  }

  function applyFullDraftToForm(latest: CreatorDraft) {
    setActiveDraftId(latest.id);
    setActiveDraftRevision(latest.revision);
    setForm((prev) => ({
      ...prev,
      headline: latest.title ?? prev.headline,
      body: latest.body ?? prev.body,
      pullQuote: latest.pullQuote ?? prev.pullQuote,
      category: latest.category ?? prev.category,
      articleType: latest.articleType ?? prev.articleType,
      articleTypeCustom: latest.articleTypeCustom ?? prev.articleTypeCustom,
      contentKind: latest.contentKind ?? prev.contentKind,
      locale: latest.locale ?? prev.locale,
      explicitHashtags: latest.explicitHashtags.join(", "),
      neverSendToAi: latest.neverSendToAi === true,
    }));
    lastSavedFingerprintRef.current = JSON.stringify({
      title: latest.title,
      body: latest.body,
      contentKind: latest.contentKind,
      articleType: latest.articleType,
      articleTypeCustom: latest.articleTypeCustom,
      category: latest.category,
      locale: latest.locale,
      explicitHashtags: latest.explicitHashtags,
      pullQuote: latest.pullQuote,
      neverSendToAi: latest.neverSendToAi === true,
    });
    lastSavedAtRef.current = Date.now();
    setAutosaveStatus("saved");
  }

  /** Deferred after first paint: prefer localStorage id, then bootstrap/API summary, then fetch full row. */
  async function hydrateActiveDraft() {
    let savedId: string | null = null;
    try {
      savedId = localStorage.getItem("gentle_stream_active_draft_id");
    } catch {
      savedId = null;
    }

    async function tryLoadFullDraft(id: string): Promise<boolean> {
      setDraftContentLoading(true);
      try {
        const singleRes = await fetch(`/api/creator/drafts/${id}`, { credentials: "include" });
        if (!singleRes.ok) return false;
        const singlePayload = (await singleRes.json()) as { draft?: CreatorDraft };
        const latest = singlePayload.draft;
        if (!latest) return false;
        applyFullDraftToForm(latest);
        return true;
      } catch {
        return false;
      } finally {
        setDraftContentLoading(false);
      }
    }

    if (savedId && (await tryLoadFullDraft(savedId))) return;

    let target: CreatorDraftSummary | null =
      (savedId ? initialDraftSummaries.find((s) => s.id === savedId) : null) ??
      initialDraftSummaries[0] ??
      null;

    if (!target) {
      const response = await fetch("/api/creator/drafts?limit=1&summary=1", {
        credentials: "include",
      });
      if (!response.ok) return;
      const payload = (await response.json()) as { draftSummaries?: CreatorDraftSummary[] };
      target = payload.draftSummaries?.[0] ?? null;
    }

    if (!target) return;
    setActiveDraftId(target.id);
    setActiveDraftRevision(target.revision);
    await tryLoadFullDraft(target.id);
  }

  async function loadDraftVersions(draftId: string) {
    const response = await fetch(`/api/creator/drafts/${draftId}/versions`, {
      credentials: "include",
    });
    if (!response.ok) return;
    const payload = (await response.json()) as { versions?: CreatorDraftVersion[] };
    setDraftVersions(payload.versions ?? []);
  }

  async function ensureDraftExists(): Promise<{ id: string; revision: number } | null> {
    if (activeDraftId && activeDraftRevision != null)
      return { id: activeDraftId, revision: activeDraftRevision };
    const response = await fetch("/api/creator/drafts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(buildDraftPayloadFromForm(form)),
    });
    if (!response.ok) {
      const apiError = await parseApiClientError(response);
      setAutosaveStatus("error");
      setAutosaveError(formatApiClientError(apiError));
      return null;
    }
    const payload = (await response.json()) as { draft?: CreatorDraft };
    if (!payload.draft) return null;
    setActiveDraftId(payload.draft.id);
    setActiveDraftRevision(payload.draft.revision);
    return { id: payload.draft.id, revision: payload.draft.revision };
  }

  async function flushAutosave() {
    const fingerprint = draftFingerprint(form);
    if (fingerprint === lastSavedFingerprintRef.current) return;
    setAutosaveStatus("saving");
    setAutosaveError(null);
    setAutosaveConflict(false);
    const draftRef = await ensureDraftExists();
    if (!draftRef) return;
    const response = await fetch(`/api/creator/drafts/${draftRef.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        expectedRevision: draftRef.revision,
        ...buildDraftPayloadFromForm(form),
        autosave: true,
      }),
    });
    if (response.status === 409) {
      setAutosaveStatus("error");
      setAutosaveConflict(true);
      setAutosaveError("Draft was updated in another tab. Refresh draft to continue.");
      return;
    }
    if (!response.ok) {
      const apiError = await parseApiClientError(response);
      setAutosaveStatus("error");
      setAutosaveError(formatApiClientError(apiError));
      return;
    }
    const payload = (await response.json()) as { draft?: CreatorDraft };
    if (payload.draft) {
      setActiveDraftRevision(payload.draft.revision);
      if (activeDraftId == null) setActiveDraftId(payload.draft.id);
    }
    lastSavedFingerprintRef.current = fingerprint;
    lastSavedAtRef.current = Date.now();
    setAutosaveStatus("saved");
  }

  async function loadSubmissions(input?: { reset?: boolean }) {
    const reset = input?.reset !== false;
    if (reset) setLoading(true);
    else setLoadingMore(true);
    try {
      const params = new URLSearchParams();
      params.set("limit", "12");
      params.set("summary", "1");
      if (!reset && nextCursor) params.set("cursor", nextCursor);
      const response = await fetch(`/api/creator/submissions?${params.toString()}`, {
        credentials: "include",
      });
      if (!response.ok) {
        const apiError = await parseApiClientError(response);
        setMessage(formatApiClientError(apiError));
        return;
      }
      const payload = (await response.json()) as {
        submissions?: ArticleSubmission[];
        nextCursor?: string | null;
      };
      const rows = payload.submissions ?? [];
      setSubmissions((prev) => {
        if (reset) return rows;
        const seen = new Set(prev.map((entry) => entry.id));
        return [...prev, ...rows.filter((entry) => !seen.has(entry.id))];
      });
      setNextCursor(payload.nextCursor ?? null);
    } finally {
      if (reset) setLoading(false);
      else setLoadingMore(false);
    }
  }

  useEffect(() => {
    if (serverListBootstrap) return;
    void loadSubmissions({ reset: true });
  }, [serverListBootstrap]);

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const raf = requestAnimationFrame(() => {
      timeoutId = setTimeout(() => void hydrateActiveDraft(), 0);
    });
    return () => {
      cancelAnimationFrame(raf);
      if (timeoutId) clearTimeout(timeoutId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- hydrate once; bootstrap summaries from server
  }, []);

  useEffect(() => {
    if (form.contentKind !== "user_article") return;
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    setIdlePromptVisible(false);
    idleTimerRef.current = setTimeout(() => {
      if (form.body.trim().length === 0) setIdlePromptVisible(true);
    }, 5000);
    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, [form.body, form.contentKind]);

  useEffect(() => {
    if (!autocompleteEnabled || form.contentKind !== "user_article") return;
    const trimmed = form.body.trim();
    if (trimmed.length < 50) {
      setAutocompleteSuggestion(null);
      return;
    }
    const handle = setTimeout(async () => {
      const response = await fetch("/api/creator/autocomplete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          headline: form.headline,
          articleType: form.articleTypeCustom.trim() || form.articleType,
          context: trimmed.slice(-800),
        }),
      });
      if (!response.ok) return;
      const payload = (await response.json().catch(() => ({}))) as { suggestion?: string };
      setAutocompleteSuggestion(payload.suggestion ?? null);
    }, 450);
    return () => clearTimeout(handle);
  }, [
    autocompleteEnabled,
    form.articleType,
    form.articleTypeCustom,
    form.body,
    form.contentKind,
    form.headline,
  ]);

  useEffect(() => {
    const fingerprint = draftFingerprint(form);
    if (fingerprint === lastSavedFingerprintRef.current) return;
    pendingAutosaveRef.current = true;
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(() => {
      pendingAutosaveRef.current = false;
      void flushAutosave();
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- debounce on form fingerprint only
  }, [form]);

  useEffect(() => {
    function onVisibilityChange() {
      if (document.visibilityState !== "hidden") return;
      if (pendingAutosaveRef.current) {
        pendingAutosaveRef.current = false;
        if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
        void flushAutosave();
      }
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- uses refs and flush
  }, []);

  useEffect(() => {
    if (!activeDraftId) setDraftVersions([]);
  }, [activeDraftId]);

  useEffect(() => {
    revisionsOpenRef.current = revisionsOpen;
  }, [revisionsOpen]);

  useEffect(() => {
    try {
      if (activeDraftId) localStorage.setItem("gentle_stream_active_draft_id", activeDraftId);
    } catch {
      // best-effort only
    }
  }, [activeDraftId]);

  useEffect(() => {
    const worker = new Worker(
      new URL("./writer-analyst.worker.ts", import.meta.url)
    );
    analystWorkerRef.current = worker;
    worker.onmessage = (event: MessageEvent<AnalystCheckpoint>) => {
      const checkpoint = event.data;
      setLatestAnalyst(checkpoint);
      setAnalystCheckpoints((prev) => {
        const next = [checkpoint, ...prev].slice(0, 30);
        try {
          localStorage.setItem("gentle_stream_analyst_checkpoints", JSON.stringify(next));
        } catch {
          // best-effort local persistence only
        }
        return next;
      });
    };
    try {
      const raw = localStorage.getItem("gentle_stream_analyst_checkpoints");
      if (raw) {
        const parsed = JSON.parse(raw) as AnalystCheckpoint[];
        if (Array.isArray(parsed)) {
          const cleaned = parsed.slice(0, 30);
          setAnalystCheckpoints(cleaned);
          setLatestAnalyst(cleaned[0] ?? null);
        }
      }
    } catch {
      // ignore bad local payloads
    }
    return () => {
      worker.terminate();
      analystWorkerRef.current = null;
    };
  }, []);

  useEffect(() => {
    analystDirtyRef.current = true;
  }, [form.body, form.headline]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (!analystEnabled) return;
      if (!analystDirtyRef.current) return;
      const fingerprint = `${form.headline.trim()}::${form.body.trim()}`;
      if (!fingerprint || fingerprint === lastAnalystFingerprintRef.current) return;
      lastAnalystFingerprintRef.current = fingerprint;
      analystDirtyRef.current = false;
      analystWorkerRef.current?.postMessage({
        headline: form.headline,
        body: form.body,
        requestNags: !analystQuietMode,
      });
    }, 5 * 60 * 1000);
    return () => window.clearInterval(interval);
  }, [analystEnabled, analystQuietMode, form.body, form.headline]);

  async function submitForm() {
    if (!canSubmit) return;
    if (pendingAutosaveRef.current) {
      pendingAutosaveRef.current = false;
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
      await flushAutosave();
    }
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
              articleType: form.contentKind === "user_article" ? form.articleType : undefined,
              articleTypeCustom:
                form.contentKind === "user_article" && form.articleType === "custom"
                  ? form.articleTypeCustom
                  : undefined,
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
      if (!response.ok) {
        const apiError = await parseApiClientError(response);
        setMessage(formatApiClientError(apiError));
        return;
      }
      setForm(EMPTY_FORM);
      setEditingId(null);
      await loadSubmissions({ reset: true });
      setMessage(isEdit ? "Submission updated." : "Submission sent for review.");
    } finally {
      setBusy(false);
    }
  }

  async function beginEdit(submission: ArticleSubmission) {
    setBusy(true);
    setMessage(null);
    try {
      let full = submission;
      if (!submission.body || submission.body.trim().length === 0) {
        const response = await fetch(`/api/creator/submissions/${submission.id}`, {
          credentials: "include",
        });
        if (!response.ok) {
          const apiError = await parseApiClientError(response);
          setMessage(formatApiClientError(apiError));
          return;
        }
        const payload = (await response.json()) as { submission?: ArticleSubmission };
        if (payload.submission) full = payload.submission;
      }

      setEditingId(full.id);
      setBodyEditorTab("write");
      setForm({
        headline: full.headline,
        body: full.body,
        pullQuote: full.pullQuote,
        category: full.category,
        articleType: full.articleType ?? BUILT_IN_ARTICLE_TYPES[0],
        articleTypeCustom: full.articleTypeCustom ?? "",
        contentKind: full.contentKind,
        locale: full.locale,
        explicitHashtags: full.explicitHashtags.join(", "),
        recipeServings:
          full.contentKind === "recipe"
            ? String(full.recipeServings ?? "")
            : "",
        recipeIngredientsText:
          full.contentKind === "recipe"
            ? (full.recipeIngredients ?? []).join("\n")
            : "",
        recipeInstructionsText:
          full.contentKind === "recipe"
            ? (full.recipeInstructions ?? []).join("\n\n")
            : "",
        recipePrepTimeMinutes:
          full.contentKind === "recipe"
            ? String(full.recipePrepTimeMinutes ?? "")
            : "",
        recipeCookTimeMinutes:
          full.contentKind === "recipe"
            ? String(full.recipeCookTimeMinutes ?? "")
            : "",
        recipeImages: full.contentKind === "recipe" ? full.recipeImages ?? [] : [],
        neverSendToAi: false,
      });
    } finally {
      setBusy(false);
    }
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
      if (!response.ok) {
        const apiError = await parseApiClientError(response);
        setMessage(formatApiClientError(apiError));
        return;
      }
      await loadSubmissions({ reset: true });
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
      if (!response.ok) {
        const apiError = await parseApiClientError(response);
        setRecipeImportMessage(
          `Import failed (${response.status}): ${formatApiClientError(apiError)}`
        );
        setRecipeImportIsError(true);
        return;
      }
      const payload = (await response.json().catch(() => ({}))) as {
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
      if (!payload.recipe) {
        setRecipeImportMessage("Import failed: Could not import this recipe link.");
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

  async function requestAssist(
    mode: "improve" | "continue" | "headline",
    options?: {
      workflowId?: "startup_inspiration" | "startup_brainstorm" | "startup_random" | "stuck_assist";
      helpMode?: "inspiration" | "brainstorm" | "random" | "stuck";
      context?: string;
    }
  ) {
    setAssistBusy(true);
    setAssistError(null);
    setAssistSuggestion(null);
    setAssistOpeningAngles([]);
    setAssistCostEstimate(null);
    setAssistEscalation(false);
    try {
      const textarea = bodyTextareaRef.current;
      const selection =
        textarea != null
          ? {
              start: textarea.selectionStart ?? 0,
              end: textarea.selectionEnd ?? 0,
              text: form.body.slice(textarea.selectionStart ?? 0, textarea.selectionEnd ?? 0),
            }
          : null;
      latestSelectionRef.current = selection;
      const response = await fetch("/api/creator/assist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          mode,
          workflowId: options?.workflowId,
          helpMode: options?.helpMode,
          contentKind: form.contentKind,
          articleType: form.articleType,
          articleTypeCustom: form.articleType === "custom" ? form.articleTypeCustom : undefined,
          headline: form.headline,
          body: form.body,
          draftId: activeDraftId ?? undefined,
          selectedText: selection?.text,
          selectionStart: selection?.start,
          selectionEnd: selection?.end,
          stream: true,
          context: options?.context,
        }),
      });
      if (!response.ok) {
        const apiError = await parseApiClientError(response);
        setAssistError(formatApiClientError(apiError));
        return;
      }
      const contentType = response.headers.get("Content-Type") ?? "";
      if (contentType.includes("text/event-stream")) {
        const reader = response.body?.getReader();
        if (!reader) {
          setAssistError("AI assist stream is unavailable right now.");
          return;
        }
        const decoder = new TextDecoder();
        let buffer = "";
        let aggregate = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const events = buffer.split("\n\n");
          buffer = events.pop() ?? "";
          for (const event of events) {
            const line = event
              .split("\n")
              .find((entry) => entry.startsWith("data: "));
            if (!line) continue;
            const parsed = JSON.parse(line.slice(6)) as
              | { type: "delta"; delta: string }
              | {
                  type: "done";
                  provider?: string;
                  model?: string;
                  costEstimateUsd?: number;
                  isEscalation?: boolean;
                  openingAngles?: string[];
                };
            if (parsed.type === "delta") {
              aggregate += parsed.delta;
              setAssistSuggestion(aggregate.trim());
            } else if (parsed.type === "done") {
              if (typeof parsed.costEstimateUsd === "number")
                setAssistCostEstimate(parsed.costEstimateUsd);
              setAssistEscalation(parsed.isEscalation === true);
              if (Array.isArray(parsed.openingAngles) && parsed.openingAngles.length > 0)
                setAssistOpeningAngles(parsed.openingAngles.map((a) => String(a).trim()).filter(Boolean));
            }
          }
        }
        if (!aggregate.trim()) {
          setAssistError("AI assist returned no content.");
        }
        return;
      }
      const payload = (await response.json().catch(() => ({}))) as {
        result?: string;
        costEstimateUsd?: number;
        isEscalation?: boolean;
        openingAngles?: string[];
      };
      if (!payload.result) {
        setAssistError("AI assist is unavailable right now.");
        return;
      }
      setAssistSuggestion(payload.result);
      if (Array.isArray(payload.openingAngles) && payload.openingAngles.length > 0)
        setAssistOpeningAngles(payload.openingAngles.map((a) => String(a).trim()).filter(Boolean));
      if (typeof payload.costEstimateUsd === "number")
        setAssistCostEstimate(payload.costEstimateUsd);
      setAssistEscalation(payload.isEscalation === true);
    } finally {
      setAssistBusy(false);
    }
  }

  async function createManualCheckpoint() {
    if (!activeDraftId || activeDraftRevision == null) return;
    const response = await fetch(`/api/creator/drafts/${activeDraftId}/versions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ expectedRevision: activeDraftRevision }),
    });
    if (!response.ok) {
      const apiError = await parseApiClientError(response);
      setMessage(formatApiClientError(apiError));
      return;
    }
    if (revisionsOpenRef.current) await loadDraftVersions(activeDraftId);
    setMessage("Checkpoint saved.");
  }

  async function restoreDraftVersion(versionId: string) {
    if (!activeDraftId || activeDraftRevision == null) return;
    const response = await fetch(`/api/creator/drafts/${activeDraftId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        expectedRevision: activeDraftRevision,
        action: "restore",
        restoreVersionId: versionId,
      }),
    });
    if (response.status === 409) {
      setAutosaveConflict(true);
      setAutosaveError("Draft changed in another tab before restore.");
      return;
    }
    if (!response.ok) {
      const apiError = await parseApiClientError(response);
      setMessage(formatApiClientError(apiError));
      return;
    }
    const payload = (await response.json()) as { draft?: CreatorDraft };
    if (!payload.draft) return;
    setActiveDraftRevision(payload.draft.revision);
    setForm((prev) => ({
      ...prev,
      headline: payload.draft?.title ?? prev.headline,
      body: payload.draft?.body ?? prev.body,
      pullQuote: payload.draft?.pullQuote ?? prev.pullQuote,
      category: payload.draft?.category ?? prev.category,
      articleType: payload.draft?.articleType ?? prev.articleType,
      articleTypeCustom: payload.draft?.articleTypeCustom ?? prev.articleTypeCustom,
      contentKind: payload.draft?.contentKind ?? prev.contentKind,
      locale: payload.draft?.locale ?? prev.locale,
      explicitHashtags: payload.draft?.explicitHashtags.join(", ") ?? prev.explicitHashtags,
      neverSendToAi: payload.draft?.neverSendToAi ?? prev.neverSendToAi,
    }));
    setMessage("Version restored.");
    if (revisionsOpenRef.current) await loadDraftVersions(activeDraftId);
  }

  const assistTitles = assistActionTitles({
    contentKind: form.contentKind,
    hasOpeningAngles: assistOpeningAngles.length > 0,
  });

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
                href="/creator/settings"
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
                Creator settings
              </Link>
              <Link
                href="/creator/usage"
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
                Usage
              </Link>
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
              <input aria-label="Headline" value={form.headline} onChange={(e) => setForm((f) => ({ ...f, headline: e.target.value }))} placeholder="Headline" style={{ padding: "0.45rem", border: "1px solid #bbb" }} />
              {form.contentKind === "user_article" ? (
                <>
                  <select value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} style={{ padding: "0.45rem", border: "1px solid #bbb" }}>
                    {CATEGORIES.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                  <select
                    value={form.articleType}
                    onChange={(e) => setForm((f) => ({ ...f, articleType: e.target.value }))}
                    style={{ padding: "0.45rem", border: "1px solid #bbb" }}
                  >
                    {BUILT_IN_ARTICLE_TYPES.map((value) => (
                      <option key={value} value={value}>
                        {articleTypeLabel(value)}
                      </option>
                    ))}
                    <option value="custom">Custom type...</option>
                  </select>
                  {form.articleType === "custom" ? (
                    <input
                      value={form.articleTypeCustom}
                      onChange={(e) => setForm((f) => ({ ...f, articleTypeCustom: e.target.value }))}
                      placeholder="Describe custom article type"
                      style={{ padding: "0.45rem", border: "1px solid #bbb" }}
                    />
                  ) : null}
                </>
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
                <div style={{ display: "flex", gap: "0.35rem", alignItems: "center" }}>
                  <button
                    type="button"
                    onClick={() => {
                      setHelpMenuOpen((prev) => !prev);
                      setIdlePromptVisible(false);
                    }}
                    style={{
                      padding: "0.2rem 0.45rem",
                      border: "1px solid #888",
                      background: "#fff",
                      fontSize: "0.75rem",
                      cursor: "pointer",
                    }}
                  >
                    AI Assist
                  </button>
                  <span style={{ fontSize: "0.78rem", color: isBodyTooLong ? "#8b4513" : "#666" }}>
                    {bodyCharacterCount.toLocaleString()} / {MAX_SUBMISSION_BODY_CHARS.toLocaleString()}
                  </span>
                </div>
              </div>
              {(idlePromptVisible || helpMenuOpen) ? (
                <div style={{ marginTop: "0.5rem", border: "1px solid #d8d2c7", background: "#faf8f3", padding: "0.5rem", display: "grid", gap: "0.45rem" }}>
                  <strong style={{ fontSize: "0.82rem" }}>Need a starting push with AI Assist?</strong>
                  <input
                    value={helpContext}
                    onChange={(event) => setHelpContext(event.target.value)}
                    placeholder="Optional context (e.g. dramatic, intellectual, stern, cold)"
                    style={{ padding: "0.42rem", border: "1px solid #bbb" }}
                  />
                  <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
                    <button
                      type="button"
                      onClick={() =>
                        void requestAssist("continue", {
                          workflowId: "startup_inspiration",
                          helpMode: "inspiration",
                          context: helpContext,
                        })
                      }
                      style={{ padding: "0.24rem 0.5rem", border: "1px solid #1a472a", background: "#fff", cursor: "pointer", fontSize: "0.76rem" }}
                    >
                      Inspiration
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        void requestAssist("improve", {
                          workflowId: "startup_brainstorm",
                          helpMode: "brainstorm",
                          context: helpContext,
                        })
                      }
                      style={{ padding: "0.24rem 0.5rem", border: "1px solid #1a472a", background: "#fff", cursor: "pointer", fontSize: "0.76rem" }}
                    >
                      Brainstorm
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        void requestAssist("continue", {
                          workflowId: "startup_random",
                          helpMode: "random",
                          context: helpContext,
                        })
                      }
                      style={{ padding: "0.24rem 0.5rem", border: "1px solid #1a472a", background: "#fff", cursor: "pointer", fontSize: "0.76rem" }}
                    >
                      Random
                    </button>
                  </div>
                </div>
              ) : null}

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

              <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap", marginTop: "0.45rem" }}>
                <label style={{ display: "inline-flex", alignItems: "center", gap: "0.38rem", fontSize: "0.76rem", color: "#444" }}>
                  <input
                    type="checkbox"
                    checked={form.neverSendToAi}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, neverSendToAi: event.target.checked }))
                    }
                  />
                  Never send this draft to AI
                </label>
              </div>
              <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap", marginTop: "0.3rem" }}>
                <button
                  type="button"
                  disabled={assistBusy || form.neverSendToAi}
                  onClick={() => void requestAssist("improve")}
                  style={{ padding: "0.25rem 0.5rem", border: "1px solid #1a472a", background: "#fff", cursor: assistBusy ? "wait" : "pointer", fontSize: "0.78rem" }}
                >
                  Improve paragraph
                </button>
                <button
                  type="button"
                  disabled={assistBusy || form.neverSendToAi}
                  onClick={() => void requestAssist("continue")}
                  style={{ padding: "0.25rem 0.5rem", border: "1px solid #1a472a", background: "#fff", cursor: assistBusy ? "wait" : "pointer", fontSize: "0.78rem" }}
                >
                  Continue draft
                </button>
                <button
                  type="button"
                  disabled={assistBusy || form.neverSendToAi}
                  onClick={() => void requestAssist("headline")}
                  style={{ padding: "0.25rem 0.5rem", border: "1px solid #1a472a", background: "#fff", cursor: assistBusy ? "wait" : "pointer", fontSize: "0.78rem" }}
                >
                  Suggest headline
                </button>
                <button
                  type="button"
                  disabled={assistBusy || form.neverSendToAi}
                  onClick={() =>
                    void requestAssist("improve", {
                      workflowId: "stuck_assist",
                      helpMode: "stuck",
                    })
                  }
                  style={{ padding: "0.25rem 0.5rem", border: "1px solid #1a472a", background: "#fff", cursor: assistBusy ? "wait" : "pointer", fontSize: "0.78rem" }}
                >
                  I&apos;m stuck
                </button>
              </div>
              {assistError ? (
                <p style={{ margin: "0.4rem 0 0", color: "#8b4513", fontSize: "0.8rem" }}>
                  {assistError}
                </p>
              ) : null}
              {assistCostEstimate != null ? (
                <p style={{ margin: "0.35rem 0 0", fontSize: "0.76rem", color: "#666" }}>
                  Estimated assist cost: ${assistCostEstimate.toFixed(4)}
                  {assistEscalation ? " (escalated)" : ""}
                </p>
              ) : null}
              {assistSuggestion ? (
                <div style={{ marginTop: "0.45rem", border: "1px solid #d8d2c7", background: "#faf8f3", padding: "0.5rem" }}>
                  <p style={{ margin: 0, fontSize: "0.78rem", color: "#333", whiteSpace: "pre-wrap" }}>{assistSuggestion}</p>
                  {assistOpeningAngles.length > 0 ? (
                    <div style={{ marginTop: "0.45rem" }}>
                      <span style={{ fontSize: "0.72rem", color: "#555", display: "block", marginBottom: "0.28rem" }}>
                        Suggested openings (click a line to add only that text):
                      </span>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "stretch", gap: "0.12rem" }}>
                        {assistOpeningAngles.map((angle, index) => (
                          <button
                            key={`assist-angle-${index}-${angle.slice(0, 40)}`}
                            type="button"
                            title={assistTitles.openingLine}
                            onClick={() => appendAssistAngleToBody(angle)}
                            style={{
                              display: "block",
                              width: "100%",
                              textAlign: "left",
                              fontWeight: 600,
                              fontSize: "0.8rem",
                              color: "#111",
                              background: "transparent",
                              border: "none",
                              padding: "0.28rem 0.2rem",
                              cursor: "pointer",
                              borderRadius: "4px",
                              lineHeight: 1.35,
                            }}
                            onMouseEnter={(event) => {
                              event.currentTarget.style.fontWeight = "800";
                              event.currentTarget.style.background = "#f0ebe0";
                            }}
                            onMouseLeave={(event) => {
                              event.currentTarget.style.fontWeight = "600";
                              event.currentTarget.style.background = "transparent";
                            }}
                          >
                            {angle}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {assistOpeningAngles.length > 0 ? (
                    <p style={{ margin: "0.35rem 0 0", fontSize: "0.7rem", color: "#666" }}>
                      Apply prepends all openings (or replaces your selection). Insert below appends them. The analysis
                      above is never inserted by those buttons.
                    </p>
                  ) : null}
                  <div style={{ display: "flex", gap: "0.35rem", marginTop: "0.4rem", flexWrap: "wrap" }}>
                    <button
                      type="button"
                      title={assistTitles.apply}
                      onClick={() => {
                        if (!assistSuggestion) return;
                        if (form.contentKind !== "user_article") {
                          setForm((f) => ({ ...f, headline: assistSuggestion.trim() }));
                          return;
                        }
                        const anglesBlock = assistOpeningAngles.join("\n\n").trim();
                        if (anglesBlock) {
                          const sel = latestSelectionRef.current;
                          if (sel && sel.start !== sel.end) {
                            setForm((f) => ({
                              ...f,
                              body: `${f.body.slice(0, sel.start)}${anglesBlock}${f.body.slice(sel.end)}`,
                            }));
                            return;
                          }
                          setForm((f) => {
                            const rest = f.body.trim();
                            const sep = rest.length === 0 ? "" : "\n\n";
                            return { ...f, body: `${anglesBlock}${sep}${rest}`.trim() };
                          });
                          return;
                        }
                        setForm((f) => ({ ...f, body: assistSuggestion.trim() }));
                      }}
                      style={{ padding: "0.22rem 0.48rem", border: "1px solid #888", background: "#fff", cursor: "pointer", fontSize: "0.75rem" }}
                    >
                      Apply
                    </button>
                    <button
                      type="button"
                      title={assistTitles.insertBelow}
                      onClick={() => {
                        const block =
                          assistOpeningAngles.length > 0
                            ? assistOpeningAngles.join("\n\n")
                            : assistSuggestion.trim();
                        if (!block) return;
                        setForm((f) => ({
                          ...f,
                          body: `${f.body.trim()}\n\n${block}`.trim(),
                        }));
                      }}
                      style={{ padding: "0.22rem 0.48rem", border: "1px solid #888", background: "#fff", cursor: "pointer", fontSize: "0.75rem" }}
                    >
                      Insert below
                    </button>
                    <button
                      type="button"
                      title={assistTitles.replaceSelection}
                      onClick={() => {
                        const selection = latestSelectionRef.current;
                        if (!selection) return;
                        const block =
                          assistOpeningAngles.length > 0
                            ? assistOpeningAngles.join("\n\n")
                            : assistSuggestion;
                        setForm((f) => {
                          const nextBody = `${f.body.slice(0, selection.start)}${block}${f.body.slice(selection.end)}`;
                          return { ...f, body: nextBody };
                        });
                      }}
                      style={{ padding: "0.22rem 0.48rem", border: "1px solid #888", background: "#fff", cursor: "pointer", fontSize: "0.75rem" }}
                    >
                      Replace selection
                    </button>
                    <button
                      type="button"
                      title={assistTitles.copy}
                      onClick={() => void navigator.clipboard.writeText(assistSuggestion)}
                      style={{ padding: "0.22rem 0.48rem", border: "1px solid #888", background: "#fff", cursor: "pointer", fontSize: "0.75rem" }}
                    >
                      Copy
                    </button>
                    <button
                      type="button"
                      title={assistTitles.dismiss}
                      onClick={() => {
                        setAssistSuggestion(null);
                        setAssistOpeningAngles([]);
                      }}
                      style={{ padding: "0.22rem 0.48rem", border: "1px solid #888", background: "#fff", cursor: "pointer", fontSize: "0.75rem" }}
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              ) : null}
              {autocompleteSuggestion && autocompleteEnabled ? (
                <div style={{ marginTop: "0.35rem", border: "1px dashed #b9b2a4", padding: "0.45rem", background: "#fff" }}>
                  <p style={{ margin: 0, fontSize: "0.78rem", color: "#666" }}>
                    Autocomplete suggestion: {autocompleteSuggestion}
                  </p>
                  <button
                    type="button"
                    onClick={() =>
                      setForm((prev) => ({
                        ...prev,
                        body: `${prev.body}${prev.body.endsWith(" ") ? "" : " "}${autocompleteSuggestion}`.trim(),
                      }))
                    }
                    style={{ marginTop: "0.35rem", padding: "0.22rem 0.48rem", border: "1px solid #888", background: "#fff", cursor: "pointer", fontSize: "0.74rem" }}
                  >
                    Accept suggestion
                  </button>
                </div>
              ) : null}

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
                  onSelect={(e) => {
                    const target = e.currentTarget;
                    latestSelectionRef.current = {
                      start: target.selectionStart ?? 0,
                      end: target.selectionEnd ?? 0,
                      text: form.body.slice(
                        target.selectionStart ?? 0,
                        target.selectionEnd ?? 0
                      ),
                    };
                  }}
                  placeholder={"Write in Markdown...\n\n## Section heading\n\nParagraph text with **bold** and _italic_.\n\n> Pull quote or emphasis.\n\n---\n\nNext section..."}
                  style={{ minHeight: "220px", width: "100%", padding: "0.55rem", border: "1px solid #bbb", resize: "vertical" }}
                />
              ) : (
                <div style={{ minHeight: "220px", border: "1px solid #bbb", padding: "0.6rem", background: "#faf8f3" }}>
                  <ArticleBodyMarkdown
                    markdown={form.body.trim() ? form.body : "*Preview appears here as you write.*"}
                    variant="reader"
                    fontPreset="literary"
                    readingTimeSecs={previewReadingTimeSecs}
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
                            {/* eslint-disable-next-line @next/next/no-img-element -- recipe preview URLs are uploaded/user-provided external assets */}
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
            <input aria-label="Pull quote" value={form.pullQuote} onChange={(e) => setForm((f) => ({ ...f, pullQuote: e.target.value }))} placeholder="Pull quote (optional)" style={{ padding: "0.45rem", border: "1px solid #bbb" }} />
            <input aria-label="Locale" value={form.locale} onChange={(e) => setForm((f) => ({ ...f, locale: e.target.value }))} placeholder="Locale (default global)" style={{ padding: "0.45rem", border: "1px solid #bbb" }} />
            <input aria-label="Explicit hashtags" value={form.explicitHashtags} onChange={(e) => setForm((f) => ({ ...f, explicitHashtags: e.target.value }))} placeholder="Explicit hashtags, comma separated" style={{ padding: "0.45rem", border: "1px solid #bbb" }} />
          </div>

          <div style={{ display: "flex", gap: "0.65rem", alignItems: "center", flexWrap: "wrap", marginTop: "0.7rem" }}>
            <p
              style={{
                margin: 0,
                fontSize: "0.8rem",
                color:
                  autosaveStatus === "error"
                    ? "#8b4513"
                    : autosaveStatus === "saved"
                      ? "#2f5f3a"
                      : "#666",
              }}
            >
              {autosaveStatus === "saving"
                ? "Autosaving draft..."
                : autosaveStatus === "saved"
                  ? "Draft saved"
                  : autosaveStatus === "error"
                    ? `Autosave failed${autosaveError ? `: ${autosaveError}` : ""}`
                    : "Autosave idle"}
            </p>
            {activeDraftRevision != null ? (
              <span style={{ fontSize: "0.75rem", color: "#666" }}>
                Revision #{activeDraftRevision}
              </span>
            ) : null}
            {lastSavedAtRef.current ? (
              <span style={{ fontSize: "0.75rem", color: "#666" }}>
                Last save {new Date(lastSavedAtRef.current).toLocaleTimeString()}
              </span>
            ) : null}
            {draftContentLoading ? (
              <span style={{ fontSize: "0.75rem", color: "#666" }}>Loading draft content…</span>
            ) : null}
          </div>

          {autosaveConflict ? (
            <p aria-live="polite" style={{ color: "#8b4513", margin: "0.45rem 0 0" }}>
              Another tab changed this draft. Reload the page or restore a version before continuing.
            </p>
          ) : null}
          {message ? <p aria-live="polite" style={{ color: "#7b2d00", margin: "0.45rem 0 0" }}>{message}</p> : null}
          <div style={{ marginTop: "0.45rem", border: "1px dashed #d8d2c7", padding: "0.45rem", background: "#fff" }}>
            <div style={{ display: "flex", gap: "0.8rem", flexWrap: "wrap", alignItems: "center" }}>
              <label style={{ display: "inline-flex", gap: "0.35rem", alignItems: "center", fontSize: "0.76rem", color: "#555" }}>
                <input
                  type="checkbox"
                  checked={analystEnabled}
                  onChange={(event) => setAnalystEnabled(event.target.checked)}
                />
                Local analyst enabled
              </label>
              <label style={{ display: "inline-flex", gap: "0.35rem", alignItems: "center", fontSize: "0.76rem", color: "#555" }}>
                <input
                  type="checkbox"
                  checked={analystQuietMode}
                  onChange={(event) => setAnalystQuietMode(event.target.checked)}
                />
                Quiet mode (no writing nags)
              </label>
            </div>
            {latestAnalyst ? (
              <p style={{ margin: "0.45rem 0 0", fontSize: "0.75rem", color: "#666" }}>
                Analyst snapshot: {latestAnalyst.metrics.wordCount} words, {latestAnalyst.metrics.paragraphCount} paragraphs,
                phase {latestAnalyst.metrics.sectionPhase}, avg sentence {latestAnalyst.metrics.avgSentenceWords}.
              </p>
            ) : (
              <p style={{ margin: "0.45rem 0 0", fontSize: "0.75rem", color: "#777" }}>
                Analyst checkpoints run every 5 minutes only after text changes.
              </p>
            )}
            {!analystQuietMode && latestAnalyst && latestAnalyst.notes.length > 0 ? (
              <ul style={{ margin: "0.35rem 0 0", paddingLeft: "1rem", color: "#666", fontSize: "0.75rem" }}>
                {latestAnalyst.notes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            ) : null}
          </div>

          <div style={{ display: "flex", gap: "0.55rem", marginTop: "0.75rem", flexWrap: "wrap" }}>
            <button onClick={submitForm} disabled={!canSubmit || busy} style={{ padding: "0.45rem 0.7rem", border: "1px solid #1a472a", background: "#fff", cursor: "pointer" }}>
              {busy ? "Saving..." : editingId ? "Save pending draft" : "Submit for approval"}
            </button>
            {editingId ? (
              <button onClick={() => { setEditingId(null); setForm(EMPTY_FORM); }} style={{ padding: "0.45rem 0.7rem", border: "1px solid #888", background: "#fff", cursor: "pointer" }}>
                Cancel edit
              </button>
            ) : null}
            {activeDraftId && activeDraftRevision != null ? (
              <button
                type="button"
                onClick={() => void createManualCheckpoint()}
                style={{ padding: "0.45rem 0.7rem", border: "1px solid #666", background: "#fff", cursor: "pointer" }}
              >
                Checkpoint
              </button>
            ) : null}
          </div>
          {activeDraftId && activeDraftRevision != null ? (
            <div style={{ marginTop: "0.65rem", display: "grid", gap: "0.35rem" }}>
              <button
                type="button"
                onClick={() => {
                  setRevisionsOpen((prev) => {
                    const next = !prev;
                    if (next && activeDraftId) void loadDraftVersions(activeDraftId);
                    return next;
                  });
                }}
                style={{
                  padding: "0.28rem 0.5rem",
                  border: "1px solid #999",
                  background: "#fff",
                  cursor: "pointer",
                  fontSize: "0.78rem",
                  width: "fit-content",
                }}
              >
                {revisionsOpen ? "Hide revision history" : "Show revision history"}
              </button>
              {revisionsOpen ? (
                draftVersions.length > 0 ? (
                  <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
                    {draftVersions.slice(0, 5).map((version) => (
                      <button
                        key={version.id}
                        type="button"
                        onClick={() => void restoreDraftVersion(version.id)}
                        style={{
                          padding: "0.25rem 0.45rem",
                          border: "1px solid #999",
                          background: "#fff",
                          cursor: "pointer",
                          fontSize: "0.75rem",
                        }}
                      >
                        {version.versionReason} · {new Date(version.createdAt).toLocaleTimeString()}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p style={{ margin: 0, fontSize: "0.76rem", color: "#777" }}>
                    No checkpoints yet. Save a checkpoint to see history here.
                  </p>
                )
              ) : null}
            </div>
          ) : null}
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
            <>
              <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: "0.65rem" }}>
                {submissions.map((submission) => (
                  <li key={submission.id} style={{ border: "1px solid #ddd", padding: "0.7rem", background: "#fff" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem", alignItems: "center" }}>
                      <strong style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>{submission.headline}</strong>
                      <span style={{ fontSize: "0.75rem", textTransform: "uppercase", color: "#555" }}>{submission.status}</span>
                    </div>
                    <p style={{ margin: "0.35rem 0 0", color: "#666", fontSize: "0.86rem" }}>
                      {submission.contentKind === "recipe"
                        ? `Recipe • ${new Date(submission.createdAt).toLocaleString()}`
                        : `${submission.category} • ${(submission.articleTypeCustom || submission.articleType || "article").replaceAll("_", " ")} • ${new Date(submission.createdAt).toLocaleString()}`}
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
                        <button onClick={() => void beginEdit(submission)} style={{ padding: "0.35rem 0.6rem", border: "1px solid #999", background: "#fff", cursor: "pointer" }}>
                          {submission.status === "changes_requested" ? "Revise" : "Edit"}
                        </button>
                        <button onClick={() => void withdrawSubmission(submission.id)} style={{ padding: "0.35rem 0.6rem", border: "1px solid #b05", background: "#fff", cursor: "pointer" }}>
                          Withdraw
                        </button>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
              {nextCursor ? (
                <div style={{ marginTop: "0.75rem" }}>
                  <button
                    type="button"
                    disabled={loadingMore}
                    onClick={() => void loadSubmissions({ reset: false })}
                    style={{ padding: "0.4rem 0.7rem", border: "1px solid #888", background: "#fff", cursor: loadingMore ? "wait" : "pointer" }}
                  >
                    {loadingMore ? "Loading..." : "Load more"}
                  </button>
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
