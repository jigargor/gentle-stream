import { NextRequest, NextResponse } from "next/server";
import { fetchUpliftingNews } from "@/lib/fetchNews";
import { CATEGORIES } from "@/lib/constants";
import {
  buildRateLimitKey,
  consumeRateLimit,
  rateLimitExceededResponse,
} from "@/lib/security/rateLimit";

export async function GET(request: NextRequest) {
  const rateLimit = consumeRateLimit({
    policy: { id: "news-public", windowMs: 60_000, max: 24 },
    key: buildRateLimitKey({ request, routeId: "api-news" }),
  });
  if (!rateLimit.allowed) return rateLimitExceededResponse(rateLimit);

  const { searchParams } = new URL(request.url);

  const category = searchParams.get("category") || null;
  const sectionIndex = parseInt(searchParams.get("sectionIndex") || "0", 10);
  const existingHeadlines = searchParams.getAll("headline");

  // Rotate through categories if none specified
  const resolvedCategory =
    category && CATEGORIES.includes(category as never)
      ? category
      : CATEGORIES[sectionIndex % CATEGORIES.length];

  try {
    const articles = await fetchUpliftingNews(resolvedCategory, existingHeadlines);
    return NextResponse.json({ articles, category: resolvedCategory });
  } catch (error: unknown) {
    console.error("[/api/news] Error:", error);
    return NextResponse.json(
      { error: "Could not fetch news right now." },
      { status: 500 }
    );
  }
}
