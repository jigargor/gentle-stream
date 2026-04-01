import { NextRequest, NextResponse } from "next/server";
import {
  parseEnglishWikipediaArticleTitle,
  stripUnsafeWikiHtmlFragment,
  wikiHtmlApiPathForTitle,
} from "@/lib/games/wikiReader";

const WIKI_USER_AGENT =
  "GentleStream/1.0 (in-app rabbit-hole reader; contact via site operator)";

export async function GET(request: NextRequest) {
  const titleParam = request.nextUrl.searchParams.get("title")?.trim();
  const urlParam = request.nextUrl.searchParams.get("url")?.trim();

  const title =
    titleParam && titleParam.length > 0
      ? titleParam
      : urlParam
        ? parseEnglishWikipediaArticleTitle(urlParam)
        : null;

  if (!title) {
    return NextResponse.json(
      { error: "Provide a valid English Wikipedia article title or full /wiki/ URL." },
      { status: 400 }
    );
  }

  if (title.length > 280) {
    return NextResponse.json({ error: "Title is too long." }, { status: 400 });
  }

  const upstream = wikiHtmlApiPathForTitle(title);

  let res: Response;
  try {
    res = await fetch(upstream, {
      headers: {
        "User-Agent": WIKI_USER_AGENT,
        Accept: "text/html; charset=utf-8",
      },
      next: { revalidate: 600 },
    });
  } catch {
    return NextResponse.json(
      { error: "Could not reach Wikipedia. Try again in a moment." },
      { status: 502 }
    );
  }

  if (!res.ok) {
    const status = res.status === 404 ? 404 : 502;
    return NextResponse.json(
      {
        error:
          res.status === 404
            ? "That page is not available as an article."
            : "Wikipedia returned an error.",
      },
      { status }
    );
  }

  const raw = await res.text();
  const html = stripUnsafeWikiHtmlFragment(raw);

  return NextResponse.json({
    title,
    html: `<base href="https://en.wikipedia.org/" />${html}`,
  });
}
