export type IngestDiscoveryProvider = "anthropic_web_search" | "rss_seed_only";

export function resolveIngestDiscoveryProvider(
  rawProvider: string | undefined
): IngestDiscoveryProvider {
  const normalized = rawProvider?.trim().toLowerCase();
  if (normalized === "rss_seed_only") return "rss_seed_only";
  return "anthropic_web_search";
}

