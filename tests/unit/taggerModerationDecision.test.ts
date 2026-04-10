import { describe, expect, it } from "vitest";
import { resolveModerationDecision } from "@/lib/agents/taggerAgent";

describe("resolveModerationDecision", () => {
  it("defaults to approved when moderation is absent", () => {
    const decision = resolveModerationDecision({
      tags: ["science"],
      sentiment: "uplifting",
      emotions: ["joy"],
      locale: "global",
      readingTimeSecs: 120,
      qualityScore: 0.6,
    });
    expect(decision.status).toBe("approved");
    expect(decision.confidence).toBeNull();
  });

  it("maps flag_for_review to flagged", () => {
    const decision = resolveModerationDecision({
      tags: ["policy"],
      sentiment: "uplifting",
      emotions: ["hope"],
      locale: "global",
      readingTimeSecs: 140,
      qualityScore: 0.5,
      moderation: {
        isPolitical: true,
        politicalScope: "civic_policy",
        action: "flag_for_review",
        confidence: 0.55,
        rationale: "Public-policy focus",
        reasons: ["policy_discussion"],
      },
    });
    expect(decision.status).toBe("flagged");
    expect(decision.reason).toBe("Public-policy focus");
  });

  it("maps reject with high confidence to rejected", () => {
    const decision = resolveModerationDecision({
      tags: ["election"],
      sentiment: "uplifting",
      emotions: ["hope"],
      locale: "US",
      readingTimeSecs: 130,
      qualityScore: 0.4,
      moderation: {
        isPolitical: true,
        politicalScope: "campaign_election",
        action: "reject",
        confidence: 0.96,
        rationale: "Election campaign story",
        reasons: ["campaign", "candidate"],
      },
    });
    expect(decision.status).toBe("rejected");
  });

  it("downgrades reject with low confidence to flagged", () => {
    const decision = resolveModerationDecision({
      tags: ["city hall"],
      sentiment: "uplifting",
      emotions: ["hope"],
      locale: "US",
      readingTimeSecs: 130,
      qualityScore: 0.4,
      moderation: {
        isPolitical: true,
        politicalScope: "elected_official",
        action: "reject",
        confidence: 0.4,
        rationale: "Could be local politics",
        reasons: ["mayor"],
      },
    });
    expect(decision.status).toBe("flagged");
  });
});
