"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  BarChart3,
  Bold,
  Check,
  Clock,
  Copy,
  FileClock,
  Heading2,
  History,
  Italic,
  Link as LinkIcon,
  List,
  Minus,
  Quote,
  RefreshCw,
  Save,
  Send,
  Settings,
  Sparkles,
  UserRound,
  Wand2,
  X,
} from "lucide-react";
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

type LlmActivityStage = "sending" | "thinking" | "streaming" | "complete";
type LlmActivityKind = "assist" | "autocomplete";

interface LlmActivity {
  kind: LlmActivityKind;
  stage: LlmActivityStage;
  label: string;
  costEstimateUsd?: number;
}

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

function IconButton({
  label,
  children,
  onClick,
  disabled = false,
  className,
}: {
  label: string;
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cx("creator-icon-button", className)}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

function StreamRibbon({
  activity,
  idleLabel = "AI ready",
}: {
  activity: LlmActivity | null;
  idleLabel?: string;
}) {
  return (
    <div
      className={cx(
        "creator-stream-ribbon",
        activity ? "creator-stream-ribbon--" + activity.stage : "creator-stream-ribbon--idle"
      )}
      role="status"
      aria-live="polite"
    >
      <span className="creator-stream-ribbon__flow" aria-hidden="true" />
      <span className="creator-stream-ribbon__label">{activity?.label ?? idleLabel}</span>
      {activity?.costEstimateUsd != null ? (
        <span className="creator-stream-ribbon__cost">{"$" + activity.costEstimateUsd.toFixed(4)}</span>
      ) : null}
    </div>
  );
}

function formatLocalClock(value: number | string | null | undefined): string {
  if (value == null) return "";
  try {
    return new Date(value).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  } catch {
    return "";
  }
}

function formatSubmissionMeta(submission: ArticleSubmission): string {
  const created = new Date(submission.createdAt).toLocaleString();
  if (submission.contentKind === "recipe") return "Recipe / " + created;
  const kind = (submission.articleTypeCustom || submission.articleType || "article").replaceAll("_", " ");
  return submission.category + " / " + kind + " / " + created;
}

function submissionStatusClass(status: ArticleSubmission["status"]): string {
  if (status === "approved") return "creator-status-pill--success";
  if (status === "rejected" || status === "withdrawn") return "creator-status-pill--danger";
  if (status === "changes_requested") return "creator-status-pill--warning";
  return "creator-status-pill--neutral";
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
    ? "Uses only the suggested opening lines below-not the analysis paragraph above. If you highlighted text in the body, that selection is replaced with those lines. If nothing is highlighted, every opening line is inserted at the very start of your draft."
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
      ? "Copies the explanation paragraph above to the clipboard. To put a single hook in your draft, click that line under suggested openings instead."
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
  const [llmActivity, setLlmActivity] = useState<LlmActivity | null>(null);
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
  const llmCompleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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

  function clearLlmCompletionTimer() {
    if (llmCompleteTimerRef.current) {
      clearTimeout(llmCompleteTimerRef.current);
      llmCompleteTimerRef.current = null;
    }
  }

  function markLlmActivity(activity: LlmActivity | null) {
    clearLlmCompletionTimer();
    setLlmActivity(activity);
  }

  function completeLlmActivity(
    kind: LlmActivityKind,
    label: string,
    costEstimateUsd?: number
  ) {
    clearLlmCompletionTimer();
    setLlmActivity({ kind, stage: "complete", label, costEstimateUsd });
    llmCompleteTimerRef.current = setTimeout(() => {
      setLlmActivity((prev) =>
        prev?.kind === kind && prev.stage === "complete" ? null : prev
      );
      llmCompleteTimerRef.current = null;
    }, 1600);
  }

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
    if (
      !autocompleteEnabled ||
      form.contentKind !== "user_article" ||
      form.neverSendToAi ||
      assistBusy
    ) {
      setAutocompleteSuggestion(null);
      return;
    }
    const trimmed = form.body.trim();
    if (trimmed.length < 50) {
      setAutocompleteSuggestion(null);
      return;
    }
    let cancelled = false;
    const handle = setTimeout(async () => {
      markLlmActivity({
        kind: "autocomplete",
        stage: "sending",
        label: "Autocomplete is checking the current",
      });
      try {
        const response = await fetch("/api/creator/autocomplete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            headline: form.headline,
            articleType: form.articleTypeCustom.trim() || form.articleType,
            context: trimmed.slice(-800),
          }),
        });
        if (cancelled) return;
        if (!response.ok) {
          setLlmActivity(null);
          return;
        }
        const payload = (await response.json().catch(() => ({}))) as { suggestion?: string };
        setAutocompleteSuggestion(payload.suggestion ?? null);
        completeLlmActivity("autocomplete", "Autocomplete suggestion ready");
      } catch {
        if (!cancelled) setLlmActivity(null);
      }
    }, 450);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- debounced request tracks form fields directly
  }, [
    autocompleteEnabled,
    assistBusy,
    form.articleType,
    form.articleTypeCustom,
    form.body,
    form.contentKind,
    form.headline,
    form.neverSendToAi,
  ]);

  useEffect(() => {
    return () => {
      clearLlmCompletionTimer();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- cleanup ref timer on unmount
  }, []);

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
    markLlmActivity({ kind: "assist", stage: "sending", label: "Sending to AI" });
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
        setLlmActivity(null);
        return;
      }
      markLlmActivity({ kind: "assist", stage: "thinking", label: "Thinking" });
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
              markLlmActivity({
                kind: "assist",
                stage: "streaming",
                label: "Streaming suggestion",
              });
              setAssistSuggestion(aggregate.trim());
            } else if (parsed.type === "done") {
              if (typeof parsed.costEstimateUsd === "number")
                setAssistCostEstimate(parsed.costEstimateUsd);
              completeLlmActivity(
                "assist",
                "Suggestion ready",
                typeof parsed.costEstimateUsd === "number" ? parsed.costEstimateUsd : undefined
              );
              setAssistEscalation(parsed.isEscalation === true);
              if (Array.isArray(parsed.openingAngles) && parsed.openingAngles.length > 0)
                setAssistOpeningAngles(parsed.openingAngles.map((a) => String(a).trim()).filter(Boolean));
            }
          }
        }
        if (!aggregate.trim()) {
          setAssistError("AI assist returned no content.");
          setLlmActivity(null);
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
      completeLlmActivity("assist", "Suggestion ready", payload.costEstimateUsd);
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
  const activeDraftSummary = activeDraftId
    ? initialDraftSummaries.find((draft) => draft.id === activeDraftId) ?? null
    : initialDraftSummaries[0] ?? null;
  const selectedArticleType =
    form.contentKind === "recipe"
      ? "Recipe"
      : form.articleType === "custom"
        ? form.articleTypeCustom.trim() || "Custom article"
        : articleTypeLabel(form.articleType);
  const editorTitle = form.headline.trim() || (editingId ? "Untitled revision" : "Untitled draft");
  const autosaveLabel =
    autosaveStatus === "saving"
      ? "Saving draft"
      : autosaveStatus === "saved"
        ? "Draft saved"
        : autosaveStatus === "error"
          ? autosaveError ? "Autosave failed: " + autosaveError : "Autosave failed"
          : "Autosave idle";
  const autosaveTone =
    autosaveStatus === "error"
      ? "creator-status-pill--danger"
      : autosaveStatus === "saved"
        ? "creator-status-pill--success"
        : "creator-status-pill--neutral";
  const lastSavedClock = formatLocalClock(lastSavedAtRef.current);
  const assistDisabled = assistBusy || form.neverSendToAi;
  const bodyLimitTone = isBodyTooLong ? "creator-status-pill--warning" : "creator-status-pill--neutral";

  return (
    <main className="creator-studio">
      <div className="creator-studio__shell">
        <header className="creator-commandbar">
          <div className="creator-commandbar__copy">
            <p className="creator-eyebrow">Gentle Stream</p>
            <h1>Creator Studio</h1>
            <p>Draft, revise, and submit work without leaving the writing flow.</p>
          </div>
          <nav className="creator-commandbar__actions" aria-label="Creator Studio navigation">
            {publicProfileHref ? (
              <Link className="creator-action-link" href={publicProfileHref}>
                <UserRound size={15} aria-hidden="true" />
                Public profile
              </Link>
            ) : null}
            <Link className="creator-action-link" href="/creator/settings">
              <Settings size={15} aria-hidden="true" />
              Settings
            </Link>
            <Link className="creator-action-link" href="/creator/usage">
              <BarChart3 size={15} aria-hidden="true" />
              Usage
            </Link>
            <Link className="creator-action-link creator-action-link--quiet" href="/">
              <ArrowLeft size={15} aria-hidden="true" />
              Back to app
            </Link>
          </nav>
        </header>

        {llmActivity ? <StreamRibbon activity={llmActivity} /> : null}

        <div className="creator-studio__grid">
          <aside className="creator-studio__rail creator-studio__rail--left">
            <section className="creator-panel">
              <div className="creator-panel__heading">
                <div>
                  <p className="creator-eyebrow">Current draft</p>
                  <h2>Writing state</h2>
                </div>
                <FileClock size={18} aria-hidden="true" />
              </div>
              <div className="creator-status-stack">
                <span className={cx("creator-status-pill", autosaveTone)}>
                  {autosaveStatus === "saved" ? <Check size={13} aria-hidden="true" /> : <Clock size={13} aria-hidden="true" />}
                  {autosaveLabel}
                </span>
                {activeDraftRevision != null ? (
                  <span className="creator-status-pill creator-status-pill--neutral">Revision #{activeDraftRevision}</span>
                ) : null}
                {lastSavedClock ? (
                  <span className="creator-status-pill creator-status-pill--neutral">Saved {lastSavedClock}</span>
                ) : null}
                {draftContentLoading ? (
                  <span className="creator-status-pill creator-status-pill--neutral">Loading draft</span>
                ) : null}
              </div>
              {activeDraftSummary ? (
                <div className="creator-mini-card">
                  <strong>{activeDraftSummary.title || "Untitled draft"}</strong>
                  <span>{activeDraftSummary.wordCount.toLocaleString()} words / {activeDraftSummary.locale}</span>
                </div>
              ) : (
                <p className="creator-muted">No saved draft selected yet.</p>
              )}
            </section>

            <section className="creator-panel creator-panel--submissions">
              <div className="creator-panel__heading">
                <div>
                  <p className="creator-eyebrow">Queue</p>
                  <h2>Submissions</h2>
                </div>
                <span className="creator-count-badge">{submissions.length}</span>
              </div>
              {loading ? (
                <p className="creator-muted">Loading submissions...</p>
              ) : submissions.length === 0 ? (
                <div className="creator-empty-state">
                  <Sparkles size={18} aria-hidden="true" />
                  <p>No submissions yet.</p>
                </div>
              ) : (
                <div className="creator-submission-list">
                  {submissions.map((submission) => (
                    <article key={submission.id} className="creator-submission-card">
                      <div className="creator-submission-card__top">
                        <strong>{submission.headline}</strong>
                        <span className={cx("creator-status-pill", submissionStatusClass(submission.status))}>
                          {submission.status.replaceAll("_", " ")}
                        </span>
                      </div>
                      <p>{formatSubmissionMeta(submission)}</p>
                      {submission.adminNote ? (
                        <p className="creator-note creator-note--warning">Moderator note: {submission.adminNote}</p>
                      ) : null}
                      {submission.rejectionReason ? (
                        <p className="creator-note creator-note--danger">Rejection reason: {submission.rejectionReason}</p>
                      ) : null}
                      {submission.status === "pending" || submission.status === "changes_requested" ? (
                        <div className="creator-button-row">
                          <button type="button" className="creator-button creator-button--small" onClick={() => void beginEdit(submission)}>
                            {submission.status === "changes_requested" ? "Revise" : "Edit"}
                          </button>
                          <button type="button" className="creator-button creator-button--small creator-button--danger" onClick={() => void withdrawSubmission(submission.id)}>
                            Withdraw
                          </button>
                        </div>
                      ) : null}
                    </article>
                  ))}
                  {nextCursor ? (
                    <button type="button" className="creator-button creator-button--ghost" disabled={loadingMore} onClick={() => void loadSubmissions({ reset: false })}>
                      {loadingMore ? "Loading..." : "Load more"}
                    </button>
                  ) : null}
                </div>
              )}
            </section>
          </aside>

          <section className="creator-editor" aria-label="Creator editor">
            <div className="creator-editor__masthead">
              <div>
                <span className="creator-status-pill creator-status-pill--accent">
                  {editingId ? "Editing pending submission" : "Draft workspace"}
                </span>
                <h2>{editorTitle}</h2>
                <p>{selectedArticleType} / {form.category || "Uncategorized"}</p>
              </div>
              <div className="creator-segmented" role="group" aria-label="Compose type">
                <button type="button" className={cx("creator-segmented__option", form.contentKind === "user_article" && "is-active")} onClick={() => setForm((f) => ({ ...f, contentKind: "user_article" }))}>
                  Article
                </button>
                <button type="button" className={cx("creator-segmented__option", form.contentKind === "recipe" && "is-active")} onClick={() => setForm((f) => ({ ...f, contentKind: "recipe" }))}>
                  Recipe
                </button>
              </div>
            </div>

            <div className="creator-field-grid creator-field-grid--metadata">
              <label className="creator-field creator-field--wide">
                <span>Headline</span>
                <input className="creator-input creator-input--headline" aria-label="Headline" value={form.headline} onChange={(e) => setForm((f) => ({ ...f, headline: e.target.value }))} placeholder="Headline" />
              </label>
              {form.contentKind === "user_article" ? (
                <>
                  <label className="creator-field">
                    <span>Category</span>
                    <select className="creator-input" value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}>
                      {CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}
                    </select>
                  </label>
                  <label className="creator-field">
                    <span>Article type</span>
                    <select className="creator-input" value={form.articleType} onChange={(e) => setForm((f) => ({ ...f, articleType: e.target.value }))}>
                      {BUILT_IN_ARTICLE_TYPES.map((value) => <option key={value} value={value}>{articleTypeLabel(value)}</option>)}
                      <option value="custom">Custom type...</option>
                    </select>
                  </label>
                  {form.articleType === "custom" ? (
                    <label className="creator-field">
                      <span>Custom type</span>
                      <input className="creator-input" value={form.articleTypeCustom} onChange={(e) => setForm((f) => ({ ...f, articleTypeCustom: e.target.value }))} placeholder="Describe custom article type" />
                    </label>
                  ) : null}
                </>
              ) : null}
            </div>

            {form.contentKind === "user_article" ? (
              <div className="creator-writing-surface">
                <div className="creator-writing-surface__toolbar">
                  <div className="creator-toolbar-icons" aria-label="Markdown formatting toolbar">
                    <IconButton label="Bold" onClick={() => insertMarkdown("**", "**", "bold")}><Bold size={16} aria-hidden="true" /></IconButton>
                    <IconButton label="Italic" onClick={() => insertMarkdown("_", "_", "italic")}><Italic size={16} aria-hidden="true" /></IconButton>
                    <IconButton label="Heading" onClick={() => insertMarkdown("## ", "", "Section title")}><Heading2 size={16} aria-hidden="true" /></IconButton>
                    <IconButton label="Quote" onClick={() => insertMarkdown("> ", "", "Quote")}><Quote size={16} aria-hidden="true" /></IconButton>
                    <IconButton label="Bullet list" onClick={() => insertMarkdown("- ", "", "List item")}><List size={16} aria-hidden="true" /></IconButton>
                    <IconButton label="Link" onClick={() => insertMarkdown("[", "](https://example.com)", "Link text")}><LinkIcon size={16} aria-hidden="true" /></IconButton>
                    <IconButton label="Section break" onClick={() => insertMarkdown("\n\n---\n\n", "", "")}><Minus size={16} aria-hidden="true" /></IconButton>
                  </div>
                  <span className={cx("creator-status-pill", bodyLimitTone)}>{bodyCharacterCount.toLocaleString()} / {MAX_SUBMISSION_BODY_CHARS.toLocaleString()}</span>
                </div>

                {llmActivity ? <StreamRibbon activity={llmActivity} /> : null}

                <div className="creator-segmented creator-segmented--compact" role="group" aria-label="Editor mode">
                  <button type="button" className={cx("creator-segmented__option", bodyEditorTab === "write" && "is-active")} onClick={() => setBodyEditorTab("write")}>Write</button>
                  <button type="button" className={cx("creator-segmented__option", bodyEditorTab === "preview" && "is-active")} onClick={() => setBodyEditorTab("preview")}>Preview</button>
                </div>

                {bodyEditorTab === "write" ? (
                  <textarea
                    ref={bodyTextareaRef}
                    className="creator-textarea creator-textarea--body"
                    value={form.body}
                    onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
                    onSelect={(e) => {
                      const target = e.currentTarget;
                      latestSelectionRef.current = {
                        start: target.selectionStart ?? 0,
                        end: target.selectionEnd ?? 0,
                        text: form.body.slice(target.selectionStart ?? 0, target.selectionEnd ?? 0),
                      };
                    }}
                    placeholder={"Write in Markdown...\n\n## Section heading\n\nParagraph text with **bold** and _italic_.\n\n> Pull quote or emphasis.\n\n---\n\nNext section..."}
                  />
                ) : (
                  <div className="creator-preview-pane">
                    <ArticleBodyMarkdown markdown={form.body.trim() ? form.body : "*Preview appears here as you write.*"} variant="reader" fontPreset="literary" readingTimeSecs={previewReadingTimeSecs} />
                  </div>
                )}

                <details className="creator-details">
                  <summary>Markdown quick guide</summary>
                  <div>
                    <p><strong>Bold:</strong> <code>**text**</code> / <strong>Italic:</strong> <code>_text_</code></p>
                    <p><strong>Heading:</strong> <code>## Title</code> / <strong>Quote:</strong> <code>&gt; line</code></p>
                    <p><strong>List:</strong> <code>- item</code> / <strong>Link:</strong> <code>[label](https://...)</code></p>
                  </div>
                </details>
              </div>
            ) : (
              <div className="creator-recipe-panel">
                <div className="creator-panel__heading"><div><p className="creator-eyebrow">Recipe mode</p><h2>Recipe details</h2></div></div>
                <label className="creator-field creator-field--wide">
                  <span>Import recipe from link</span>
                  <div className="creator-inline-field">
                    <input className="creator-input" value={recipeImportUrl} onChange={(e) => setRecipeImportUrl(e.target.value)} placeholder="https://example.com/recipe" />
                    <button type="button" className="creator-button" onClick={() => void importRecipeFromLink()} disabled={recipeImportBusy}>{recipeImportBusy ? "Importing..." : "Import"}</button>
                  </div>
                </label>
                {recipeImportMessage ? <p className={cx("creator-note", recipeImportIsError ? "creator-note--danger" : "creator-note--success")}>{recipeImportMessage}</p> : <p className="creator-muted">Imports are limited to allowlisted domains.</p>}

                <div className="creator-field-grid">
                  <label className="creator-field"><span>Servings</span><input className="creator-input" type="number" value={form.recipeServings} onChange={(e) => setForm((f) => ({ ...f, recipeServings: e.target.value }))} placeholder="e.g. 4" /></label>
                  <label className="creator-field"><span>Prep time</span><input className="creator-input" type="number" value={form.recipePrepTimeMinutes} onChange={(e) => setForm((f) => ({ ...f, recipePrepTimeMinutes: e.target.value }))} placeholder="Minutes" /></label>
                  <label className="creator-field"><span>Cook time</span><input className="creator-input" type="number" value={form.recipeCookTimeMinutes} onChange={(e) => setForm((f) => ({ ...f, recipeCookTimeMinutes: e.target.value }))} placeholder="Minutes" /></label>
                </div>
                <label className="creator-field creator-field--wide"><span>Ingredients</span><textarea className="creator-textarea" value={form.recipeIngredientsText} onChange={(e) => setForm((f) => ({ ...f, recipeIngredientsText: e.target.value }))} placeholder={"1 tbsp olive oil\n1 onion, diced\n2 cloves garlic"} /></label>
                <label className="creator-field creator-field--wide"><span>Instructions</span><textarea className="creator-textarea" value={form.recipeInstructionsText} onChange={(e) => setForm((f) => ({ ...f, recipeInstructionsText: e.target.value }))} placeholder={"Step one...\n\nStep two...\n\nStep three..."} /></label>
                <label className="creator-field creator-field--wide">
                  <span>Recipe pictures</span>
                  <input
                    key={recipeImageInputKey}
                    className="creator-input"
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
                        const res = await fetch("/api/user/recipe-images/upload", { method: "POST", body: fd, credentials: "include" });
                        const payload = await res.json().catch(() => ({}));
                        if (!res.ok) throw new Error(typeof payload.error === "string" ? payload.error : "Upload failed");
                        const urls = Array.isArray(payload.urls) ? (payload.urls as string[]) : [];
                        setForm((f) => ({ ...f, recipeImages: urls }));
                      } catch (err: unknown) {
                        setRecipeImagesError(err instanceof Error ? err.message : "Upload failed");
                      } finally {
                        setRecipeImagesBusy(false);
                      }
                    }}
                  />
                </label>
                {recipeImagesError ? <p className="creator-note creator-note--danger">{recipeImagesError}</p> : null}
                {form.recipeImages.length > 0 ? (
                  <div className="creator-image-grid">
                    {form.recipeImages.map((url, idx) => (
                      <div key={url + "-" + idx} className="creator-image-tile">
                        {/* eslint-disable-next-line @next/next/no-img-element -- recipe preview URLs are uploaded/user-provided external assets */}
                        <img src={url} alt={"Recipe image " + (idx + 1)} width={96} height={96} />
                        <button type="button" className="creator-button creator-button--small creator-button--ghost" onClick={() => setForm((f) => ({ ...f, recipeImages: f.recipeImages.filter((_, i) => i !== idx) }))}>Remove</button>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            )}

            <div className="creator-field-grid creator-field-grid--metadata">
              <label className="creator-field creator-field--wide"><span>Pull quote</span><input className="creator-input" aria-label="Pull quote" value={form.pullQuote} onChange={(e) => setForm((f) => ({ ...f, pullQuote: e.target.value }))} placeholder="Optional pull quote" /></label>
              <label className="creator-field"><span>Locale</span><input className="creator-input" aria-label="Locale" value={form.locale} onChange={(e) => setForm((f) => ({ ...f, locale: e.target.value }))} placeholder="global" /></label>
              <label className="creator-field creator-field--wide"><span>Explicit hashtags</span><input className="creator-input" aria-label="Explicit hashtags" value={form.explicitHashtags} onChange={(e) => setForm((f) => ({ ...f, explicitHashtags: e.target.value }))} placeholder="comma separated" /></label>
            </div>

            {autosaveConflict ? <p className="creator-note creator-note--danger" aria-live="polite">Another tab changed this draft. Reload the page or restore a version before continuing.</p> : null}
            {message ? <p className="creator-note creator-note--warning" aria-live="polite">{message}</p> : null}

            <div className="creator-editor__footer">
              <div className="creator-status-stack creator-status-stack--inline">
                <span className={cx("creator-status-pill", autosaveTone)}>
                  {autosaveStatus === "saved" ? <Check size={13} aria-hidden="true" /> : <Save size={13} aria-hidden="true" />}
                  {autosaveLabel}
                </span>
                {activeDraftRevision != null ? <span className="creator-status-pill creator-status-pill--neutral">Revision #{activeDraftRevision}</span> : null}
              </div>
              <div className="creator-button-row">
                <button type="button" className="creator-button creator-button--primary" onClick={() => void submitForm()} disabled={!canSubmit || busy}>
                  <Send size={15} aria-hidden="true" />
                  {busy ? "Saving..." : editingId ? "Save pending draft" : "Submit for approval"}
                </button>
                {editingId ? (
                  <button type="button" className="creator-button creator-button--ghost" onClick={() => { setEditingId(null); setForm(EMPTY_FORM); }}>
                    <X size={15} aria-hidden="true" />
                    Cancel edit
                  </button>
                ) : null}
                {activeDraftId && activeDraftRevision != null ? (
                  <button type="button" className="creator-button creator-button--ghost" onClick={() => void createManualCheckpoint()}>
                    <RefreshCw size={15} aria-hidden="true" />
                    Checkpoint
                  </button>
                ) : null}
              </div>
            </div>
          </section>

          <aside className="creator-studio__rail creator-studio__rail--right">
            <section className="creator-panel creator-panel--assist">
              <div className="creator-panel__heading">
                <div><p className="creator-eyebrow">LLM workspace</p><h2>AI Assist</h2></div>
                <Wand2 size={18} aria-hidden="true" />
              </div>
              <StreamRibbon activity={llmActivity} idleLabel={form.neverSendToAi ? "AI disabled for this draft" : "AI ready"} />
              <label className="creator-check-row">
                <input
                  type="checkbox"
                  checked={form.neverSendToAi}
                  onChange={(event) => {
                    const checked = event.target.checked;
                    setForm((prev) => ({ ...prev, neverSendToAi: checked }));
                    if (checked) {
                      setAutocompleteSuggestion(null);
                      markLlmActivity(null);
                    }
                  }}
                />
                Never send this draft to AI
              </label>

              {(idlePromptVisible || helpMenuOpen) ? (
                <div className="creator-assist-prompt">
                  <strong>Need a starting push?</strong>
                  <input className="creator-input" value={helpContext} onChange={(event) => setHelpContext(event.target.value)} placeholder="Optional context: dramatic, skeptical, warm..." />
                  <div className="creator-button-row">
                    <button type="button" className="creator-button creator-button--small" disabled={assistDisabled} onClick={() => void requestAssist("continue", { workflowId: "startup_inspiration", helpMode: "inspiration", context: helpContext })}>Inspiration</button>
                    <button type="button" className="creator-button creator-button--small" disabled={assistDisabled} onClick={() => void requestAssist("improve", { workflowId: "startup_brainstorm", helpMode: "brainstorm", context: helpContext })}>Brainstorm</button>
                    <button type="button" className="creator-button creator-button--small" disabled={assistDisabled} onClick={() => void requestAssist("continue", { workflowId: "startup_random", helpMode: "random", context: helpContext })}>Random</button>
                  </div>
                </div>
              ) : null}

              <div className="creator-button-grid">
                <button type="button" className="creator-button" onClick={() => { setHelpMenuOpen((prev) => !prev); setIdlePromptVisible(false); }}><Sparkles size={15} aria-hidden="true" />Prompt ideas</button>
                <button type="button" className="creator-button" disabled={assistDisabled} onClick={() => void requestAssist("improve")}>Improve</button>
                <button type="button" className="creator-button" disabled={assistDisabled} onClick={() => void requestAssist("continue")}>Continue</button>
                <button type="button" className="creator-button" disabled={assistDisabled} onClick={() => void requestAssist("headline")}>Headline</button>
                <button type="button" className="creator-button" disabled={assistDisabled} onClick={() => void requestAssist("improve", { workflowId: "stuck_assist", helpMode: "stuck" })}>I&apos;m stuck</button>
              </div>

              {assistError ? <p className="creator-note creator-note--danger">{assistError}</p> : null}
              {assistCostEstimate != null ? <p className="creator-muted">Estimated assist cost: {"$" + assistCostEstimate.toFixed(4)}{assistEscalation ? " (escalated)" : ""}</p> : null}
              {assistSuggestion ? (
                <div className="creator-suggestion-card">
                  <p>{assistSuggestion}</p>
                  {assistOpeningAngles.length > 0 ? (
                    <div className="creator-opening-list">
                      <span>Suggested openings</span>
                      {assistOpeningAngles.map((angle, index) => (
                        <button key={"assist-angle-" + index + "-" + angle.slice(0, 40)} type="button" title={assistTitles.openingLine} onClick={() => appendAssistAngleToBody(angle)}>{angle}</button>
                      ))}
                    </div>
                  ) : null}
                  <div className="creator-button-row">
                    <button
                      type="button"
                      className="creator-button creator-button--small"
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
                            setForm((f) => ({ ...f, body: f.body.slice(0, sel.start) + anglesBlock + f.body.slice(sel.end) }));
                            return;
                          }
                          setForm((f) => {
                            const rest = f.body.trim();
                            const sep = rest.length === 0 ? "" : "\n\n";
                            return { ...f, body: (anglesBlock + sep + rest).trim() };
                          });
                          return;
                        }
                        setForm((f) => ({ ...f, body: assistSuggestion.trim() }));
                      }}
                    >
                      Apply
                    </button>
                    <button
                      type="button"
                      className="creator-button creator-button--small"
                      title={assistTitles.insertBelow}
                      onClick={() => {
                        const block = assistOpeningAngles.length > 0 ? assistOpeningAngles.join("\n\n") : assistSuggestion.trim();
                        if (!block) return;
                        setForm((f) => ({ ...f, body: (f.body.trim() + "\n\n" + block).trim() }));
                      }}
                    >
                      Insert below
                    </button>
                    <button
                      type="button"
                      className="creator-button creator-button--small"
                      title={assistTitles.replaceSelection}
                      onClick={() => {
                        const selection = latestSelectionRef.current;
                        if (!selection) return;
                        const block = assistOpeningAngles.length > 0 ? assistOpeningAngles.join("\n\n") : assistSuggestion;
                        setForm((f) => ({ ...f, body: f.body.slice(0, selection.start) + block + f.body.slice(selection.end) }));
                      }}
                    >
                      Replace
                    </button>
                    <button type="button" className="creator-button creator-button--small creator-button--ghost" title={assistTitles.copy} onClick={() => void navigator.clipboard.writeText(assistSuggestion)}><Copy size={14} aria-hidden="true" />Copy</button>
                    <button type="button" className="creator-button creator-button--small creator-button--ghost" title={assistTitles.dismiss} onClick={() => { setAssistSuggestion(null); setAssistOpeningAngles([]); }}>Dismiss</button>
                  </div>
                </div>
              ) : null}

              {autocompleteSuggestion && autocompleteEnabled ? (
                <div className="creator-suggestion-card creator-suggestion-card--compact">
                  <strong>Autocomplete suggestion</strong>
                  <p>{autocompleteSuggestion}</p>
                  <button type="button" className="creator-button creator-button--small" onClick={() => setForm((prev) => ({ ...prev, body: (prev.body + (prev.body.endsWith(" ") ? "" : " ") + autocompleteSuggestion).trim() }))}>Accept suggestion</button>
                </div>
              ) : null}
            </section>

            <section className="creator-panel">
              <div className="creator-panel__heading"><div><p className="creator-eyebrow">Progress</p><h2>Local analyst</h2></div></div>
              <label className="creator-check-row"><input type="checkbox" checked={analystEnabled} onChange={(event) => setAnalystEnabled(event.target.checked)} />Local analyst enabled</label>
              <label className="creator-check-row"><input type="checkbox" checked={analystQuietMode} onChange={(event) => setAnalystQuietMode(event.target.checked)} />Quiet mode</label>
              {latestAnalyst ? (
                <p className="creator-muted">{latestAnalyst.metrics.wordCount} words, {latestAnalyst.metrics.paragraphCount} paragraphs, phase {latestAnalyst.metrics.sectionPhase}, avg sentence {latestAnalyst.metrics.avgSentenceWords}.</p>
              ) : (
                <p className="creator-muted">Checkpoints run every 5 minutes only after text changes.</p>
              )}
              {!analystQuietMode && latestAnalyst && latestAnalyst.notes.length > 0 ? (
                <ul className="creator-note-list">{latestAnalyst.notes.map((note) => <li key={note}>{note}</li>)}</ul>
              ) : null}
            </section>

            <section className="creator-panel">
              <div className="creator-panel__heading">
                <div><p className="creator-eyebrow">Versions</p><h2>Revision history</h2></div>
                <History size={18} aria-hidden="true" />
              </div>
              {activeDraftId && activeDraftRevision != null ? (
                <>
                  <button type="button" className="creator-button creator-button--ghost" onClick={() => { setRevisionsOpen((prev) => { const next = !prev; if (next && activeDraftId) void loadDraftVersions(activeDraftId); return next; }); }}>
                    {revisionsOpen ? "Hide history" : "Show history"}
                  </button>
                  {revisionsOpen ? (
                    draftVersions.length > 0 ? (
                      <div className="creator-version-list">
                        {draftVersions.slice(0, 5).map((version) => (
                          <button key={version.id} type="button" onClick={() => void restoreDraftVersion(version.id)}>
                            <span>{version.versionReason}</span>
                            <small>{formatLocalClock(version.createdAt)}</small>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="creator-muted">No checkpoints yet. Save a checkpoint to see history here.</p>
                    )
                  ) : null}
                </>
              ) : (
                <p className="creator-muted">Save a draft before revision history appears.</p>
              )}
            </section>
          </aside>
        </div>
      </div>
    </main>
  );
}
