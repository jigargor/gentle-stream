import { listEnabledRssFeeds, recordRssFeedHealth } from "@/lib/db/rssFeeds";
import {
  advanceRssDiscoveryCursor,
  getRssDiscoveryCursorPosition,
} from "@/lib/db/rssDiscoveryState";
import { normaliseUrl } from "@/lib/db/articles";
import { captureMessage } from "@/lib/observability";

export interface RssDiscoveryCandidate {
  headline: string;
  sourceUrl: string;
  rationale: string;
  sourcePublishedAt?: string | null;
  summary?: string | null;
  body?: string | null;
  imageUrl?: string | null;
}

interface RssItem {
  title: string;
  link: string;
  publishedAt: string | null;
  summary: string | null;
  body: string | null;
  imageUrl: string | null;
}

interface DiscoverFromRssInput {
  categoryHint?: string;
  targetLocale?: string;
  discoveryProvider?: string;
  targetCount: number;
  seenUrls: string[];
  seenHeadlines: string[];
}

const FETCH_TIMEOUT_MS = 8_000;
const MAX_COMMON_PATH_CHECKS = 6;
const DEFAULT_MAX_FEEDS = 18;
const DEFAULT_FEED_POOL_LIMIT = 100;
const DEFAULT_ITEMS_PER_FEED = 8;

function cleanXmlText(value: string): string {
  return value
    .replace(/^<!\[CDATA\[/, "")
    .replace(/\]\]>$/, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

function cleanXmlHtml(value: string): string {
  const raw = value
    .replace(/^<!\[CDATA\[/, "")
    .replace(/\]\]>$/, "");
  const withBreaks = raw
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ");
  const withoutTags = withBreaks.replace(/<[^>]+>/g, " ");
  return decodeXmlEntities(withoutTags)
    .replace(/[ \t]+\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractTag(block: string, tagName: string): string | null {
  const match = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "i").exec(block);
  if (match?.[1]) return cleanXmlText(match[1]);
  return null;
}

function extractTagHtml(block: string, tagName: string): string | null {
  const match = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "i").exec(block);
  if (match?.[1]) return cleanXmlHtml(match[1]);
  return null;
}

function extractAtomLink(entry: string): string | null {
  const m = /<link[^>]+href=["']([^"']+)["'][^>]*>/i.exec(entry);
  if (!m?.[1]) return null;
  return m[1].trim();
}

function extractMediaUrl(block: string, baseUrl: string): string | null {
  const patterns = [
    /<enclosure[^>]+url=["']([^"']+)["'][^>]*>/i,
    /<media:content[^>]+url=["']([^"']+)["'][^>]*>/i,
    /<media:thumbnail[^>]+url=["']([^"']+)["'][^>]*>/i,
  ];
  for (const pattern of patterns) {
    const m = pattern.exec(block);
    if (!m?.[1]) continue;
    try {
      return new URL(m[1], baseUrl).toString();
    } catch {
      continue;
    }
  }
  return null;
}

function parseRssItems(xml: string): RssItem[] {
  const itemBlocks = xml.match(/<item[\s\S]*?<\/item>/gi) ?? [];
  if (itemBlocks.length > 0) {
    return itemBlocks
      .map((item) => {
        const title = extractTag(item, "title") ?? "";
        const link = extractTag(item, "link") ?? "";
        const publishedAt = extractTag(item, "pubDate");
        const summary = extractTagHtml(item, "description");
        const body = extractTagHtml(item, "content:encoded") ?? summary;
        const imageUrl = extractMediaUrl(item, link);
        return { title, link, publishedAt, summary, body, imageUrl };
      })
      .filter((item) => item.title && item.link);
  }

  const atomBlocks = xml.match(/<entry[\s\S]*?<\/entry>/gi) ?? [];
  return atomBlocks
    .map((entry) => {
      const title = extractTag(entry, "title") ?? "";
      const link = extractAtomLink(entry) ?? "";
      const publishedAt = extractTag(entry, "updated") ?? extractTag(entry, "published");
      const summary = extractTagHtml(entry, "summary");
      const body = extractTagHtml(entry, "content") ?? summary;
      const imageUrl = extractMediaUrl(entry, link);
      return { title, link, publishedAt, summary, body, imageUrl };
    })
    .filter((item) => item.title && item.link);
}

async function fetchText(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        accept:
          "application/rss+xml, application/atom+xml, application/xml, text/xml, text/html;q=0.9, */*;q=0.1",
      },
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

function looksLikeFeedXml(text: string): boolean {
  const lowered = text.toLowerCase();
  return lowered.includes("<rss") || lowered.includes("<feed") || lowered.includes("<rdf:rdf");
}

function discoverAlternateFeedLinks(html: string, baseUrl: string): string[] {
  const out = new Set<string>();
  const matches = html.match(/<link[^>]+>/gi) ?? [];
  for (const tag of matches) {
    if (!/rel=["'][^"']*alternate/i.test(tag)) continue;
    if (!/type=["'](?:application\/rss\+xml|application\/atom\+xml|application\/xml|text\/xml)["']/i.test(tag))
      continue;
    const hrefMatch = /href=["']([^"']+)["']/i.exec(tag);
    if (!hrefMatch?.[1]) continue;
    try {
      out.add(new URL(hrefMatch[1], baseUrl).toString());
    } catch {
      // ignore invalid URLs
    }
  }
  return Array.from(out);
}

async function resolveFeedEndpoint(candidateUrl: string): Promise<string> {
  const normalized = candidateUrl.trim();
  const firstBody = await fetchText(normalized);
  if (looksLikeFeedXml(firstBody)) return normalized;

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(normalized);
  } catch {
    throw new Error("Invalid URL");
  }

  const alternates = discoverAlternateFeedLinks(firstBody, normalized);
  for (const alt of alternates) {
    const body = await fetchText(alt);
    if (looksLikeFeedXml(body)) return alt;
  }

  const base = `${parsedUrl.protocol}//${parsedUrl.host}`;
  const commonPaths = ["/feed", "/rss", "/rss.xml", "/feed.xml", "/feeds/all.rss.xml", "/feeds/posts/default"];
  for (const path of commonPaths.slice(0, MAX_COMMON_PATH_CHECKS)) {
    try {
      const possible = `${base}${path}`;
      const body = await fetchText(possible);
      if (looksLikeFeedXml(body)) return possible;
    } catch {
      // keep trying
    }
  }

  throw new Error("Could not resolve RSS/Atom endpoint");
}

function isRecentEnough(isoLike: string | null): boolean {
  if (!isoLike) return true;
  const ms = Date.parse(isoLike);
  if (!Number.isFinite(ms)) return true;
  const ageMs = Date.now() - ms;
  return ageMs <= 30 * 24 * 60 * 60 * 1000;
}

function rotateFeeds<T>(feeds: T[], startIndex: number, count: number): T[] {
  if (feeds.length === 0 || count <= 0) return [];
  const normalizedStart =
    ((Math.trunc(startIndex) % feeds.length) + feeds.length) % feeds.length;
  const ordered = feeds
    .slice(normalizedStart)
    .concat(feeds.slice(0, normalizedStart));
  return ordered.slice(0, Math.min(count, ordered.length));
}

export async function discoverCandidatesFromRss(input: DiscoverFromRssInput): Promise<RssDiscoveryCandidate[]> {
  const startedAtMs = Date.now();
  const maxFeeds = Math.max(1, Math.min(100, Number(process.env.RSS_DISCOVERY_MAX_FEEDS ?? DEFAULT_MAX_FEEDS)));
  const feedPoolLimit = Math.max(
    maxFeeds,
    Math.min(500, Number(process.env.RSS_DISCOVERY_FEED_POOL_LIMIT ?? DEFAULT_FEED_POOL_LIMIT))
  );
  const itemsPerFeed = Math.max(
    1,
    Math.min(40, Number(process.env.RSS_DISCOVERY_ITEMS_PER_FEED ?? DEFAULT_ITEMS_PER_FEED))
  );
  const feedPool = await listEnabledRssFeeds({
    localeHint: input.targetLocale,
    categoryHint: input.categoryHint,
    limit: feedPoolLimit,
  });
  const cursorStart =
    feedPool.length > 0 ? await getRssDiscoveryCursorPosition() : 0;
  const feeds = rotateFeeds(feedPool, cursorStart, maxFeeds);
  const seenUrlSet = new Set(input.seenUrls.map((url) => normaliseUrl(url)));
  const seenHeadlineSet = new Set(input.seenHeadlines.map((headline) => headline.trim().toLowerCase()));
  const candidates: RssDiscoveryCandidate[] = [];
  let feedsAttempted = 0;
  let filteredByRecency = 0;
  let filteredByDedup = 0;
  let filteredByInvalid = 0;
  let itemsParsed = 0;

  for (const feed of feeds) {
    if (candidates.length >= input.targetCount) break;
    feedsAttempted += 1;
    try {
      const feedEndpoint = await resolveFeedEndpoint(feed.feedUrl);
      const xml = await fetchText(feedEndpoint);
      const items = parseRssItems(xml).slice(0, itemsPerFeed);
      itemsParsed += items.length;
      let acceptedFromFeed = 0;
      for (const item of items) {
        if (acceptedFromFeed >= itemsPerFeed || candidates.length >= input.targetCount) break;
        if (!isRecentEnough(item.publishedAt)) {
          filteredByRecency += 1;
          continue;
        }
        const normalizedUrl = normaliseUrl(item.link);
        const normalizedHeadline = item.title.trim().toLowerCase();
        if (!normalizedUrl || !normalizedHeadline) {
          filteredByInvalid += 1;
          continue;
        }
        if (seenUrlSet.has(normalizedUrl) || seenHeadlineSet.has(normalizedHeadline)) {
          filteredByDedup += 1;
          continue;
        }
        seenUrlSet.add(normalizedUrl);
        seenHeadlineSet.add(normalizedHeadline);
        acceptedFromFeed += 1;
        candidates.push({
          headline: item.title.trim(),
          sourceUrl: item.link.trim(),
          rationale: `RSS feed: ${feed.publisher || feed.label || feed.feedUrl}`,
          sourcePublishedAt: item.publishedAt,
          summary: item.summary,
          body: item.body,
          imageUrl: item.imageUrl,
        });
      }
      await recordRssFeedHealth({ id: feed.id, ok: true });
    } catch (error: unknown) {
      await recordRssFeedHealth({
        id: feed.id,
        ok: false,
        errorMessage: error instanceof Error ? error.message : "RSS fetch failed",
      });
    }
  }

  const cursorNext =
    feedPool.length > 0
      ? await advanceRssDiscoveryCursor({
          feedPoolSize: feedPool.length,
          advanceBy: Math.max(1, feedsAttempted),
        })
      : 0;

  const out = candidates.slice(0, input.targetCount);
  captureMessage({
    level: "info",
    message: "rss.discovery.summary",
    context: {
      discoveryProvider: input.discoveryProvider ?? "unknown",
      categoryHint: input.categoryHint ?? "none",
      targetLocale: input.targetLocale ?? "global",
      targetCount: input.targetCount,
      feedPoolSize: feedPool.length,
      feedCountSelected: feeds.length,
      feedCountAttempted: feedsAttempted,
      cursorStart,
      cursorNext,
      feedItemsParsed: itemsParsed,
      candidateCount: out.length,
      filteredByRecency,
      filteredByDedup,
      filteredByInvalid,
      durationMs: Date.now() - startedAtMs,
    },
  });
  return out;
}

