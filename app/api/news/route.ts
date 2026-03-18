import { NextRequest, NextResponse } from "next/server";
import { fetchUpliftingNews } from "@/lib/fetchNews";
import { CATEGORIES } from "@/lib/constants";

export async function GET(request: NextRequest) {
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
    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
