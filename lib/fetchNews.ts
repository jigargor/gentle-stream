import type { Article } from "./types";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";

/**
 * Called server-side only (from the API route).
 * Hits the Anthropic API with web search enabled, returns 3 uplifting articles.
 */
export async function fetchUpliftingNews(
  category: string,
  existingHeadlines: string[] = []
): Promise<Article[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not set in environment variables.");
  }

  // Keep avoid-list short to minimise input tokens
  const avoidList = existingHeadlines.slice(-3).join("; ");

  const prompt = `Search the web for 3 real, recent, uplifting news stories in: "${category}". Positive only — no deaths, crimes, or disasters.${avoidList ? ` Avoid: ${avoidList}.` : ""}

Return raw JSON array only (no markdown):
[{"headline":"max 12 words","subheadline":"max 18 words","byline":"By Name","location":"City, Country","category":"${category}","body":"3 paragraphs separated by \\n\\n. Newspaper style, warm tone, include quotes.","pullQuote":"max 18 words","imagePrompt":"one sentence"}]`;

  // Retry up to 2 times on 429 rate-limit errors with exponential backoff
  const makeRequest = async (attempt: number): Promise<Response> => {
    const res = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "web-search-2025-03-05",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1000,
        tools: [{ type: "web_search_20250305", name: "web_search" }],
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (res.status === 429 && attempt < 2) {
      const wait = (attempt + 1) * 8000; // 8s, then 16s
      await new Promise((r) => setTimeout(r, wait));
      return makeRequest(attempt + 1);
    }

    return res;
  };

  const response = await makeRequest(0);

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Anthropic API error ${response.status}: ${err}`);
  }

  const data = await response.json();

  const textBlock = data.content?.find(
    (b: { type: string }) => b.type === "text"
  );
  if (!textBlock?.text) {
    throw new Error("No text content in Anthropic response.");
  }

  const raw: string = textBlock.text.replace(/```json|```/g, "").trim();
  const start = raw.indexOf("[");
  const end = raw.lastIndexOf("]");
  if (start === -1 || end === -1) {
    throw new Error("Could not find JSON array in response.");
  }

  const articles: Article[] = JSON.parse(raw.slice(start, end + 1));
  return articles;
}
