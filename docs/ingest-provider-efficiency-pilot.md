# Ingest Provider Efficiency Pilot

## Goal
- Reduce ingestion cost while preserving locale relevance and uplifting quality.

## Provider abstraction
- `INGEST_DISCOVERY_PROVIDER=anthropic_web_search` (default).
- `INGEST_DISCOVERY_PROVIDER=rss_seed_only` (pilot control mode, no LLM discovery).
- The ingest agent now routes discovery through a provider resolver (`lib/agents/ingestDiscoveryProvider.ts`).

## Pilot design
- Run 2-week A/B windows:
  - **A**: Anthropic web-search discovery + batch expansion.
  - **B**: RSS-seeded discovery fallback mode + batch expansion.
- Keep expansion pipeline, dedup, and policy filters identical across variants.
- Keep locale assignment strategy identical across variants.

## Success metrics
- Cost per inserted article.
- Insertions per 1k input tokens.
- Duplicate + precheck rejection rate.
- Policy rejection rate (political / solemn / low uplift).
- Locale relevance acceptance (manual spot-check sample).

## Exit criteria
- Promote lower-cost provider only if:
  - cost per inserted article improves by at least 25%,
  - locale relevance acceptance stays within 5% of baseline,
  - policy rejection rate does not regress materially.

