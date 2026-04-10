import { config } from "dotenv";

config({ path: ".env.local" });

import type { UpsertRssFeedInput } from "@/lib/db/rssFeeds";
import {
  createRssFeed,
  listRssFeeds,
  updateRssFeed,
} from "@/lib/db/rssFeeds";

const BULK_FEEDS: UpsertRssFeedInput[] = [
  {
    feedUrl: "https://www.sciencedaily.com/rss/all.xml",
    publisher: "ScienceDaily",
    label: "All Headlines",
    categoryHint: "Science & Discovery",
    localeHint: "global",
    toneRiskScore: 3,
  },
  {
    feedUrl: "https://www.eurekalert.org/rss.xml",
    publisher: "EurekAlert!",
    label: "Research News",
    categoryHint: "Science & Discovery",
    localeHint: "global",
    toneRiskScore: 3,
  },
  {
    feedUrl: "https://www.goodnewsnetwork.org/feed/",
    publisher: "Good News Network",
    label: "Top Good News",
    categoryHint: "Human Kindness",
    localeHint: "global",
    toneRiskScore: 4,
  },
  {
    feedUrl: "https://www.positive.news/feed/",
    publisher: "Positive News",
    label: "Latest",
    categoryHint: "Human Kindness",
    localeHint: "global",
    toneRiskScore: 3,
  },
  {
    feedUrl: "https://www.edutopia.org/rss.xml",
    publisher: "Edutopia",
    label: "Latest",
    categoryHint: "Education",
    localeHint: "US",
    toneRiskScore: 2,
  },
];

function normalizedUrl(value: string): string {
  return new URL(value.trim()).toString();
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const existing = await listRssFeeds();
  const existingByUrl = new Map(
    existing.map((feed) => [normalizedUrl(feed.feedUrl).toLowerCase(), feed])
  );

  let created = 0;
  let updated = 0;
  for (const input of BULK_FEEDS) {
    const key = normalizedUrl(input.feedUrl).toLowerCase();
    const current = existingByUrl.get(key);
    if (!current) {
      if (!dryRun) await createRssFeed(input);
      created += 1;
      continue;
    }
    if (!dryRun) await updateRssFeed(current.id, input);
    updated += 1;
  }

  console.log(
    `[rss-bulk-upsert] ${dryRun ? "dry-run " : ""}created=${created} updated=${updated} total=${BULK_FEEDS.length}`
  );
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown error";
  console.error(`[rss-bulk-upsert] failed: ${message}`);
  process.exit(1);
});
