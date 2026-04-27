import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const requireCreatorAccessMock = vi.fn();
const consumeRateLimitMock = vi.fn();
const getCreatorSettingsMock = vi.fn();
const listCreatorMemorySummariesMock = vi.fn();
const createCreatorMemorySessionMock = vi.fn();
const upsertCreatorMemorySummaryMock = vi.fn();
const createCreatorAuditEventMock = vi.fn();
const generateRecipeAssistStructuredMock = vi.fn();

vi.mock("@/lib/auth/creator-security", () => ({
  isCreatorAccessDenied: (value: unknown) =>
    value != null && typeof value === "object" && "status" in (value as object),
  requireCreatorAccess: requireCreatorAccessMock,
}));

vi.mock("@/lib/security/rateLimit", () => ({
  buildRateLimitKey: () => "rate-key",
  consumeRateLimit: consumeRateLimitMock,
  rateLimitExceededResponse: () => new Response("limited", { status: 429 }),
}));

vi.mock("@/lib/env", () => ({
  getEnv: () => ({
    CREATOR_WORKFLOW_ROLLOUT_ALLOWLIST: "",
    CREATOR_DEBUG_PROMPT_LOGGING: false,
  }),
}));

vi.mock("@/lib/db/creatorDrafts", () => ({
  getCreatorDraftById: vi.fn(),
}));

vi.mock("@/lib/db/creatorStudio", () => ({
  getCreatorSettings: getCreatorSettingsMock,
  listCreatorMemorySummaries: listCreatorMemorySummariesMock,
  createCreatorMemorySession: createCreatorMemorySessionMock,
  upsertCreatorMemorySummary: upsertCreatorMemorySummaryMock,
  createCreatorAuditEvent: createCreatorAuditEventMock,
  CreatorStudioSchemaUnavailableError: class CreatorStudioSchemaUnavailableError extends Error {},
}));

vi.mock("@/lib/creator/assist/recipe-assist-structured", () => ({
  generateRecipeAssistStructured: generateRecipeAssistStructuredMock,
}));

vi.mock("@/lib/creator/assist-diagnosis", () => ({
  generateAssistDiagnosis: vi.fn(),
}));

vi.mock("@/lib/creator/assist-startup-structured", () => ({
  generateAssistStartupStructured: vi.fn(),
}));

vi.mock("@/lib/creator/model-router", () => ({
  generateCreatorText: vi.fn(),
}));

vi.mock("@/lib/llm/client", () => ({
  estimateProviderCallCostUsd: () => 0.001,
  LlmProviderError: class LlmProviderError extends Error {},
}));

describe("POST /api/creator/assist (recipe path)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireCreatorAccessMock.mockResolvedValue({ userId: "creator-1" });
    consumeRateLimitMock.mockResolvedValue({ allowed: true });
    getCreatorSettingsMock.mockResolvedValue({
      schemaAvailable: true,
      settings: {
        modelMode: "auto",
        memoryRetentionDays: 30,
      },
    });
    listCreatorMemorySummariesMock.mockResolvedValue([]);
    createCreatorMemorySessionMock.mockResolvedValue(undefined);
    upsertCreatorMemorySummaryMock.mockResolvedValue(undefined);
    createCreatorAuditEventMock.mockResolvedValue(undefined);
    generateRecipeAssistStructuredMock.mockResolvedValue({
      structured: {
        schemaVersion: "1.0",
        responseType: "recipe_assist",
        summary: "Use a simple aromatic base and short simmer.",
        suggestedHeadline: "Easy Tomato Bean Stew",
        suggestedIngredients: ["olive oil", "onion", "tomatoes", "beans"],
        suggestedInstructions: ["Saute onion.", "Add tomatoes and beans.", "Simmer and season."],
        starterOption: "Start by naming your base ingredients.",
        nextAction: "Write exact amounts for each ingredient.",
      },
      displayText: "Recipe guidance text",
      provider: "openai",
      model: "gpt-test",
      inputTokens: 10,
      outputTokens: 12,
    });
  });

  it("auto-routes empty recipe drafts to startup intent instead of failing", async () => {
    const { POST } = await import("@/app/api/creator/assist/route");
    const request = new NextRequest("http://localhost/api/creator/assist", {
      method: "POST",
      body: JSON.stringify({
        mode: "improve",
        contentKind: "recipe",
        headline: "",
        body: "",
        stream: false,
      }),
      headers: { "Content-Type": "application/json" },
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(generateRecipeAssistStructuredMock).toHaveBeenCalledWith(
      expect.objectContaining({
        intent: "startup",
      })
    );
    await expect(response.json()).resolves.toMatchObject({
      recipeAssist: {
        responseType: "recipe_assist",
      },
    });
  });

  it("uses improve intent when recipe has existing ingredient context", async () => {
    const { POST } = await import("@/app/api/creator/assist/route");
    const request = new NextRequest("http://localhost/api/creator/assist", {
      method: "POST",
      body: JSON.stringify({
        mode: "improve",
        contentKind: "recipe",
        headline: "Weeknight soup",
        body: "",
        recipeIngredients: ["1 onion", "2 carrots"],
        recipeInstructions: ["Chop vegetables."],
        stream: false,
      }),
      headers: { "Content-Type": "application/json" },
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(generateRecipeAssistStructuredMock).toHaveBeenCalledWith(
      expect.objectContaining({
        intent: "improve",
        recipeIngredients: ["1 onion", "2 carrots"],
      })
    );
  });
});
