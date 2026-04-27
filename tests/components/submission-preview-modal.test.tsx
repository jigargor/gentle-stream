import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ArticleSubmission } from "@/lib/types";
import { SubmissionPreviewModal } from "@/components/creator/SubmissionPreviewModal";

function buildSubmission(overrides?: Partial<ArticleSubmission>): ArticleSubmission {
  return {
    id: "sub-1",
    authorUserId: "creator-1",
    headline: "Test Submission",
    subheadline: "",
    body: "## Body\n\nParagraph.",
    pullQuote: "",
    category: "recipe",
    contentKind: "user_article",
    locale: "global",
    explicitHashtags: [],
    articleType: "explanatory",
    articleTypeCustom: null,
    status: "pending",
    adminNote: null,
    rejectionReason: null,
    reviewedByUserId: null,
    reviewedAt: null,
    publishedArticleId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("SubmissionPreviewModal", () => {
  it("renders article content and closes via button", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <SubmissionPreviewModal
        open
        submission={buildSubmission({ body: "Article preview body text." })}
        onClose={onClose}
      />
    );

    expect(screen.getByRole("dialog", { name: /submission preview/i })).toBeInTheDocument();
    expect(screen.getByText("Article preview body text.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /close submission preview/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("renders recipe-specific fields when contentKind is recipe", () => {
    render(
      <SubmissionPreviewModal
        open
        submission={buildSubmission({
          contentKind: "recipe",
          body: "",
          recipeServings: 4,
          recipeIngredients: ["1 onion", "2 cloves garlic"],
          recipeInstructions: ["Chop onion.", "Saute onion and garlic."],
        })}
        onClose={() => undefined}
      />
    );

    expect(screen.getByText("Ingredients")).toBeInTheDocument();
    expect(screen.getByText("1 onion")).toBeInTheDocument();
    expect(screen.getByText("Instructions")).toBeInTheDocument();
    expect(screen.getByText("Saute onion and garlic.")).toBeInTheDocument();
  });
});
