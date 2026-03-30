import { describe, expect, it } from "vitest";
import { parseMessageBatchJsonlLine } from "@/lib/anthropic/messageBatch";

describe("parseMessageBatchJsonlLine", () => {
  it("parses succeeded line with message", () => {
    const line = JSON.stringify({
      custom_id: "exp-0",
      result: {
        type: "succeeded",
        message: {
          role: "assistant",
          content: [{ type: "text", text: '{"headline":"Hi"}' }],
          usage: { input_tokens: 10, output_tokens: 20 },
        },
      },
    });
    const p = parseMessageBatchJsonlLine(line);
    expect(p?.succeeded).toBe(true);
    expect(p?.custom_id).toBe("exp-0");
    expect(p?.message?.usage).toEqual({ input_tokens: 10, output_tokens: 20 });
  });

  it("parses errored line", () => {
    const line = JSON.stringify({
      custom_id: "exp-1",
      result: {
        type: "errored",
        error: { type: "api_error", message: "boom" },
      },
    });
    const p = parseMessageBatchJsonlLine(line);
    expect(p?.succeeded).toBe(false);
    expect(p?.errorText).toContain("boom");
  });
});
