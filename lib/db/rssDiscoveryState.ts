import { db } from "./client";

interface RssDiscoveryStateRow {
  cursor_position: number;
}

export async function getRssDiscoveryCursorPosition(): Promise<number> {
  const { data, error } = await db
    .from("rss_discovery_state")
    .select("cursor_position")
    .eq("id", true)
    .maybeSingle();
  if (error) throw new Error(`getRssDiscoveryCursorPosition: ${error.message}`);
  if (!data) {
    const { error: insertError } = await db
      .from("rss_discovery_state")
      .upsert({ id: true, cursor_position: 0 }, { onConflict: "id" });
    if (insertError) throw new Error(`getRssDiscoveryCursorPosition(insert): ${insertError.message}`);
    return 0;
  }
  return Math.max(0, Math.trunc((data as RssDiscoveryStateRow).cursor_position));
}

export async function advanceRssDiscoveryCursor(input: {
  feedPoolSize: number;
  advanceBy: number;
}): Promise<number> {
  const feedPoolSize = Math.max(0, Math.trunc(input.feedPoolSize));
  const advanceBy = Math.max(0, Math.trunc(input.advanceBy));
  if (feedPoolSize <= 0 || advanceBy <= 0) return 0;

  const current = await getRssDiscoveryCursorPosition();
  const next = (current + advanceBy) % feedPoolSize;
  const { error } = await db
    .from("rss_discovery_state")
    .upsert({ id: true, cursor_position: next }, { onConflict: "id" });
  if (error) throw new Error(`advanceRssDiscoveryCursor: ${error.message}`);
  return next;
}
