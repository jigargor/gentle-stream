"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { ArticleSubmission } from "@/lib/types";
import { ArticleBodyMarkdown } from "@/components/articles/ArticleBodyMarkdown";

interface SubmissionPreviewModalProps {
  open: boolean;
  submission: ArticleSubmission | null;
  onClose: () => void;
}

function formatDateTime(value: string | null): string {
  if (!value) return "";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return "";
  }
}

function formatStatus(value: ArticleSubmission["status"]): string {
  return value.replaceAll("_", " ");
}

export function SubmissionPreviewModal({
  open,
  submission,
  onClose,
}: SubmissionPreviewModalProps) {
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    closeButtonRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  if (!open || !submission) return null;
  if (typeof document === "undefined") return null;

  const createdAtLabel = formatDateTime(submission.createdAt);
  const reviewedAtLabel = formatDateTime(submission.reviewedAt);

  return createPortal(
    <div
      className="creator-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={`Submission preview: ${submission.headline}`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <article className="creator-modal-card">
        <header className="creator-modal-header">
          <div className="creator-modal-heading-copy">
            <p className="creator-eyebrow">Submission preview</p>
            <h3>{submission.headline || "Untitled submission"}</h3>
            {submission.subheadline ? <p>{submission.subheadline}</p> : null}
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            className="creator-button creator-button--ghost creator-button--small"
            onClick={onClose}
            aria-label="Close submission preview"
          >
            Close
          </button>
        </header>

        <div className="creator-modal-body">
          <div className="creator-status-stack creator-status-stack--inline">
            <span className="creator-status-pill creator-status-pill--neutral">
              {formatStatus(submission.status)}
            </span>
            {createdAtLabel ? (
              <span className="creator-status-pill creator-status-pill--neutral">
                Submitted {createdAtLabel}
              </span>
            ) : null}
            {reviewedAtLabel ? (
              <span className="creator-status-pill creator-status-pill--neutral">
                Reviewed {reviewedAtLabel}
              </span>
            ) : null}
          </div>

          {submission.adminNote ? (
            <p className="creator-note creator-note--warning">
              Moderator note: {submission.adminNote}
            </p>
          ) : null}
          {submission.rejectionReason ? (
            <p className="creator-note creator-note--danger">
              Rejection reason: {submission.rejectionReason}
            </p>
          ) : null}

          {submission.contentKind === "recipe" ? (
            <div className="creator-modal-section creator-modal-section--recipe">
              <div className="creator-modal-grid">
                <div className="creator-mini-card">
                  <strong>Servings</strong>
                  <span>{submission.recipeServings ?? "Not set"}</span>
                </div>
                <div className="creator-mini-card">
                  <strong>Prep time</strong>
                  <span>
                    {typeof submission.recipePrepTimeMinutes === "number"
                      ? `${submission.recipePrepTimeMinutes} min`
                      : "Not set"}
                  </span>
                </div>
                <div className="creator-mini-card">
                  <strong>Cook time</strong>
                  <span>
                    {typeof submission.recipeCookTimeMinutes === "number"
                      ? `${submission.recipeCookTimeMinutes} min`
                      : "Not set"}
                  </span>
                </div>
              </div>

              <section className="creator-mini-card">
                <strong>Ingredients</strong>
                {(submission.recipeIngredients ?? []).length > 0 ? (
                  <ul className="creator-modal-list">
                    {(submission.recipeIngredients ?? []).map((ingredient, index) => (
                      <li key={`ingredient-${index}-${ingredient}`}>{ingredient}</li>
                    ))}
                  </ul>
                ) : (
                  <span>No ingredients listed.</span>
                )}
              </section>

              <section className="creator-mini-card">
                <strong>Instructions</strong>
                {(submission.recipeInstructions ?? []).length > 0 ? (
                  <ol className="creator-modal-list creator-modal-list--ordered">
                    {(submission.recipeInstructions ?? []).map((instruction, index) => (
                      <li key={`instruction-${index}-${instruction}`}>{instruction}</li>
                    ))}
                  </ol>
                ) : (
                  <span>No instructions listed.</span>
                )}
              </section>

              {(submission.recipeImages ?? []).length > 0 ? (
                <div className="creator-image-grid">
                  {(submission.recipeImages ?? []).map((url, index) => (
                    <div key={`${url}-${index}`} className="creator-image-tile">
                      {/* eslint-disable-next-line @next/next/no-img-element -- read-only preview supports external uploaded recipe assets */}
                      <img src={url} alt={`Recipe preview image ${index + 1}`} width={96} height={96} />
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : (
            <div className="creator-modal-section">
              <p className="creator-muted">
                {submission.category} / {(submission.articleTypeCustom || submission.articleType || "article").replaceAll("_", " ")}
              </p>
              <ArticleBodyMarkdown
                markdown={submission.body || "*No article body available.*"}
                variant="reader"
                fontPreset="classic"
                multiColumn={false}
              />
            </div>
          )}
        </div>
      </article>
    </div>,
    document.body
  );
}
