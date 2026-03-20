# Gentle Stream

> *"All the news that lifts the spirit."*

A full-stack AI-powered news application that surfaces only uplifting content — no deaths, crimes, or disasters. Articles are rendered in a classic broadsheet newspaper aesthetic with infinite scroll, multi-layer content deduplication, and per-user personalisation driven by a three-agent LLM pipeline.

Built as a portfolio project to demonstrate production-grade engineering: agentic AI workflows, deliberate technology selection, modular architecture, and the kind of iterative problem-solving that separates thoughtful engineers from order-takers.

---

## What it does

Gentle Stream continuously curates real news from across the web, filters it for only positive stories, and presents them in a polished broadsheet UI that feels like an editorial product — not an AI demo. Each user's feed is personalised based on category preferences, emotional tone, locale, and reading history, without ever showing the same article twice.

The system is designed around one principle borrowed from Reddit and Substack: **content generation and content consumption are decoupled**. A background agent pipeline continuously fills a pool of enriched, tagged articles. The feed API never calls the LLM — it just queries the pool and ranks it per-user in milliseconds.

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                     Browser                          │
│  NewsFeed.tsx  →  GET /api/feed?userId=&section=N   │
└────────────────────────┬────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────┐
│                  API Layer (Next.js)                  │
│                                                      │
│   /api/feed  →  Ranker Agent  →  Supabase DB        │
│                 (pure TS, no LLM)                    │
│                                                      │
│   /api/cron/scheduler   checks stock per category    │
│   /api/cron/tagger      enriches untagged articles   │
│   /api/cron/cleanup     removes expired articles     │
└──────────────────────────────┬──────────────────────┘
                               │ (when stock < threshold)
┌──────────────────────────────▼──────────────────────┐
│                   Agent Pipeline                      │
│                                                      │
│  Ingest Agent  ──→  Tagger Agent  ──→  Supabase DB  │
│  (Claude + web    (Claude, no web     articles table │
│   search)          search, cheap)    user_profiles   │
└─────────────────────────────────────────────────────┘
```

### The three agents

| Agent | Triggered by | Uses LLM? | Web search? | Purpose |
|---|---|---|---|---|
| **Ingest** | Scheduler cron or cold-start fallback | Yes | Yes | Fetches real, recent articles one at a time; extracts source URLs; stores raw content |
| **Tagger** | Cron every 5 min | Yes | No | Classifies stored articles: tags, sentiment, emotion, locale, quality score (0–1) |
| **Ranker** | Every feed request | **No** | No | Scores the article pool against the user's profile using a weighted arithmetic formula; returns top N |

The Ranker being LLM-free is a deliberate design decision. It runs on every scroll event and needs to be fast and cheap. Intelligence was front-loaded into the Tagger so the Ranker can operate on structured metadata rather than raw text.

### Ranking score

```
score = qualityScore
      × (categoryWeight × 8)   // user's stated interest, re-scaled from avg 0.125
      × emotionBoost            // 1.3× match, 0.85× mismatch
      × localeBoost             // 1.2× match, 0.8× mismatch
      × freshnessFactor         // linear decay: 1.0 at day 0 → 0.3 at day 7
      × noveltyPenalty          // 1.0 < 10 uses, 0.85 < 50 uses, 0.6 beyond
```

Category selection uses a **deterministic weighted shuffle** seeded by `sectionIndex`, so the same user sees a consistent feed order across page loads rather than a random one on every scroll.

When no category filter is active (the default mixed feed), the Ranker draws candidates from **all categories** in a deterministic rotation rather than picking a single category per section. It walks categories in weighted order — primary pick first, then the remaining categories offset by `sectionIndex` — and fills the candidate pool from each until it has enough to rank. This means every scroll section can surface stories from across the full catalog, not just whatever one category happened to win the weighted draw.

If the Tagger agent has a backlog (e.g. rate-limited after a large ingest), the Ranker falls back to serving freshly ingested but untagged articles rather than showing an empty feed. Untagged articles skip the quality/emotion/locale scoring and are ordered by recency instead.

---

## Deduplication

This was the most technically interesting problem in the project. The LLM was returning duplicate articles across ingest runs — sometimes identical, sometimes the same real article with a slightly different Claude-generated headline. Three layers address this:

### Layer 1 — Headline fingerprint
Every article is fingerprinted as `normalised(headline) + "|" + category`, where normalisation strips punctuation, collapses whitespace, and lowercases. This catches exact duplicates, casing variants, and punctuation differences. A `UNIQUE` constraint on the `fingerprint` column in Postgres makes this a hard guarantee at the DB level.

### Layer 2 — Source URL overlap
The Anthropic web search response includes `web_search_tool_result` blocks containing the real URLs Claude read. The ingest agent extracts these URLs, normalises them (strips `https://`, `www.`, query params, trailing slashes), and stores them in a `TEXT[]` column with a GIN index. Before inserting any article, an array overlap query (`&&` operator) checks whether any of its source URLs are already stored — catching cases where Claude found the same BBC or Reuters article but summarised it under a completely different headline.

### Layer 3 — Prompt avoid-list
Before each API call, the ingest agent queries the DB for recent headlines and source URLs for that category and injects them into the prompt. This prevents Claude from even searching the same story again, saving the API call entirely rather than catching the duplicate after the fact.

```
Same article, different Claude title — caught by Layer 2 (URL overlap)
Same article, same title — caught by Layer 1 (fingerprint)  
Re-run after restart — caught by Layer 3 (avoid-list seeded from DB)
Any slip-through — caught by Layer 1 DB UNIQUE constraint (upsert + ignoreDuplicates)
```

---

## Token rate-limit management

The Anthropic free tier allows 30,000 input tokens per minute. Web search responses consume a large but unpredictable number of input tokens (the search results themselves are injected into context). Rather than guessing, the ingest agent reads the actual `usage.input_tokens` from each API response and tracks cumulative usage against a 25,000-token conservative budget. When the window is exhausted it waits exactly long enough for the 65-second window to reset before continuing — no over-waiting, no hard failures.

Each ingest call requests exactly **one article**. This was a deliberate choice after multi-article batches caused `stop_reason: max_tokens` truncations that broke JSON parsing. One article per call means the output is always complete, always parseable, and easy to recover from on failure.

---

## Project structure

```
gentle-stream/
│
├── app/                          Next.js 14 App Router
│   ├── layout.tsx                Root layout, Google Fonts preconnect
│   ├── page.tsx                  Home route → <NewsFeed />
│   ├── globals.css               Newspaper utility classes, animations
│   └── api/
│       ├── feed/route.ts         Main feed endpoint — serves from DB via Ranker
│       ├── user/
│       │   └── preferences/      GET/POST user profile (weights, game ratio, etc.)
│       └── cron/
│           ├── scheduler/        Stock check per category, triggers Ingest
│           ├── tagger/           Enriches untagged articles (runs every 5 min)
│           └── cleanup/          Deletes expired articles (runs nightly)
│
├── components/
│   ├── NewsFeed.tsx              Infinite scroll orchestrator (client component)
│   ├── Masthead.tsx              Gothic blackletter sticky header
│   ├── CategoryBar.tsx           Horizontal category filter nav
│   ├── ArticleCard.tsx           Drop cap, pull quote, column layout; AI hero image with fallback
│   ├── NewsSection.tsx           3-article grid with 3 rotating layout templates
│   ├── LoadingSection.tsx        Spinner shown while fetching
│   └── ErrorBanner.tsx           Error state with retry
│
├── lib/
│   ├── constants.ts              Categories, stock thresholds, default weights
│   ├── types.ts                  All TypeScript interfaces (RawArticle, StoredArticle, UserProfile…)
│   ├── article-image.ts          Hero image URL builders (Pollinations AI + Picsum fallback)
│   ├── agents/
│   │   ├── ingestAgent.ts        Claude + web search → DB; token budget tracker; URL extraction
│   │   ├── taggerAgent.ts        Claude classification → enrichment fields
│   │   └── rankerAgent.ts        Weighted scoring, multi-category pool, deterministic selection
│   └── db/
│       ├── client.ts             Supabase singleton (server-side only)
│       ├── schema.sql            Initial table definitions
│       ├── articles.ts           All article CRUD + dedup logic
│       ├── users.ts              User profile CRUD
│       └── migrations/
│           ├── 001_add_fingerprint.sql
│           └── 002_add_source_urls.sql
│
└── scripts/
    ├── ingest/
    │   ├── run.ts                CLI ingest runner (replaces cron in development)
    │   └── README.md
    ├── test-dedup.ts             DB integration tests for fingerprint dedup
    ├── test-citations.ts         Unit tests for <cite> tag stripping
    └── test-url-dedup.ts         DB integration tests for URL-based dedup
```

---

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js 14 (App Router) | SSR for SEO, API routes colocated with UI, Vercel-native deployment |
| Language | TypeScript (strict) | End-to-end type safety; `RawArticle` → `StoredArticle` transformation is type-checked |
| Database | Supabase (PostgreSQL) | Managed Postgres with a generous free tier; GIN indexes for array overlap queries; Row-level security ready |
| AI | Anthropic Claude Sonnet 4 | Best-in-class instruction following for structured JSON output; web search tool built-in |
| Styling | Tailwind CSS + inline styles | Tailwind for layout utilities; inline styles for the precise newspaper typographic measurements |
| Fonts | Playfair Display, IM Fell English, UnifrakturMaguntia | Chosen specifically for broadsheet authenticity — no generic Inter or Roboto |
| Deployment | Vercel | Native cron jobs, zero-config Next.js, edge-ready |

---

## UI design decisions

The newspaper aesthetic isn't cosmetic — it's the product. Key decisions:

- **Gothic blackletter masthead** (`UnifrakturMaguntia`) for immediate editorial authority
- **Three rotating grid layouts** per news section so the feed never looks repetitive as you scroll
- **Drop caps on every article's first paragraph** using float + oversized first-letter, matching how broadsheets handle column openers
- **Pull quotes** positioned between paragraphs 1 and 2, styled in the category's accent colour
- **Warm newsprint palette** (`#faf8f3` background, `#ede9e1` page) rather than stark white — easier on the eyes, feels like paper
- **Sticky category bar** on a black background — the only element that breaks from the sepia palette, which draws the eye without being loud. The bar wraps on narrower screens and removes the orphaned right border on the last item.
- **Hero images** on lead articles, generated from each article’s `imagePrompt` field via [Pollinations.ai](https://pollinations.ai) — free AI image generation with no API key required. A three-stage fallback handles failures gracefully: AI image → deterministic stock photo from Picsum (seeded by article ID so the same article always gets the same photo) → text caption. Users see something meaningful even if the image service is unavailable.
- **Partial-page rendering** — if only 1 or 2 articles are available for a section (e.g. stock nearly exhausted), `NewsSection` renders them in adapted single-column or two-column layouts rather than refusing to render. The feed never shows a blank gap.

---

## Getting started

### Prerequisites
- Node.js 18+
- A [Supabase](https://supabase.com) project (free tier works)
- An [Anthropic API key](https://console.anthropic.com)

### 1. Clone and install

```bash
git clone https://github.com/your-username/gentle-stream.git
cd gentle-stream
npm install
```

### 2. Set up the database

Open your Supabase project → **SQL Editor → New query**. Run these in order:

```
lib/db/schema.sql
lib/db/migrations/001_add_fingerprint.sql
lib/db/migrations/002_add_source_urls.sql
```

### 3. Configure environment variables

```bash
cp .env.example .env.local
```

```env
ANTHROPIC_API_KEY=sk-ant-...
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
CRON_SECRET=any-random-string-you-choose
```

### 4. Populate the article pool

The feed won't load until the DB has articles. Run the ingest script to prime it:

```bash
# Ingest all 8 categories (6 articles each) then tag them
npm run ingest

# Or target a single category for a quick test
npm run ingest -- --category "Science & Discovery" --count 2
```

The script prints a live stock report and logs token budget usage so you can watch it work.

### 5. Run the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Available scripts

```bash
npm run dev                                        # Start Next.js dev server
npm run build                                      # Production build
npm run ingest                                     # Ingest all categories
npm run ingest -- --category "Arts & Culture"      # Ingest one category
npm run ingest -- --count 10                       # Custom article count
npm run ingest:tag                                 # Tag untagged articles only

npx tsx scripts/test-citations.ts                  # Unit tests (no DB)
npx tsx scripts/test-dedup.ts                      # Fingerprint dedup (writes/cleans DB)
npx tsx scripts/test-url-dedup.ts                  # URL dedup (writes/cleans DB)
```

---

## API reference

### `GET /api/feed`

Returns a ranked section of articles for a user.

| Parameter | Type | Description |
|---|---|---|
| `userId` | string | Anonymous or authenticated user ID |
| `sectionIndex` | number | Position in the infinite scroll feed |
| `category` | string? | Pin to a specific category; omit to use weighted selection |
| `pageSize` | number? | Articles per section (default: 3) |

```json
{
  "articles": [...],
  "category": "Science & Discovery",
  "fromCache": true
}
```

`fromCache: false` means the DB was empty and a live ingest ran synchronously. The client shows a "freshly sourced" notice in this case.

### `GET /api/user/preferences?userId=...`
### `POST /api/user/preferences`

Read or update a user's personalisation profile.

```json
{
  "userId": "anon_...",
  "categoryWeights": {
    "Science & Discovery": 0.30,
    "Arts & Culture": 0.20,
    "Human Kindness": 0.20,
    "Environment & Nature": 0.15,
    "Innovation & Tech": 0.15,
    "Community Heroes": 0,
    "Health & Wellness": 0,
    "Education": 0
  },
  "preferredEmotions": ["awe", "wonder"],
  "gameRatio": 0.1
}
```

### Cron routes

All cron routes require the `x-cron-secret` header matching `CRON_SECRET`.

| Route | Schedule | Purpose |
|---|---|---|
| `GET /api/cron/scheduler` | Every 30 min | Checks per-category stock; runs Ingest if below threshold |
| `GET /api/cron/tagger` | Every 5 min | Tags up to 20 untagged articles |
| `GET /api/cron/cleanup` | Daily at 3am UTC | Deletes expired articles (> 7 days old) |

---

## Deployment

### Vercel (recommended)

```bash
npm i -g vercel
vercel
```

Add the four environment variables in **Vercel Dashboard → Settings → Environment Variables**. The `vercel.json` cron schedules activate automatically on Pro/Team plans. On the Hobby plan, trigger the cron routes via an external scheduler such as [cron-job.org](https://cron-job.org).

---

## Roadmap

These are the natural next steps, roughly prioritised:

- **Settings panel UI** — sliders for category weights, emotion toggles, game/news ratio control, all wired to `POST /api/user/preferences`
- **Games layer** — Sudoku and word search interspersed between news sections at the user-configured ratio
- **Authentication** — NextAuth.js for persistent named accounts; currently anonymous IDs live in `localStorage`
- **Implicit feedback** — track reading time per article to automatically re-weight category preferences over time
- **Mobile app** — React Native / Expo sharing the same API layer

---

## Testing philosophy

Tests are colocated in `scripts/` and run with `tsx` — no test framework overhead. Each test file is self-contained, documents what it covers, and cleans up after itself. The priority was testing the behaviours most likely to break silently and cost money: database deduplication and LLM output parsing.

| File | Type | What it covers |
|---|---|---|
| `test-citations.ts` | Unit | `stripCitations()` — all `<cite>` tag variants, edge cases |
| `test-dedup.ts` | DB integration | Fingerprint dedup: exact, casing, whitespace, cross-category, batch |
| `test-url-dedup.ts` | Unit + DB integration | `normaliseUrl()` unit cases; URL overlap blocking with real DB rows |

---

## Engineering notes

A few decisions worth calling out explicitly:

**Why one article per LLM call?** Multi-article batches caused `stop_reason: max_tokens` truncations that broke JSON parsing mid-array. One article per call guarantees the output is always complete. The token budget tracker compensates for the higher call volume.

**Why not use the Anthropic `web_fetch` tool to scrape article URLs?** Investigated and rejected. The `web_fetch` tool has a hard security constraint: it can only fetch URLs that have already appeared in the conversation from a prior `web_search` result. This means two API calls per article (search → fetch), doubling latency and cost with no token saving — the opposite of the goal.

**Why is the Ranker LLM-free?** Personalisation doesn't require intelligence — it requires structure. The Tagger front-loads the intelligence by classifying articles into emotion, locale, sentiment, and quality score fields that the Ranker can score arithmetically in microseconds. This is the architecture pattern used by every production recommendation system at scale.

**Why Supabase over a simpler solution?** PostgreSQL's GIN index on `TEXT[]` columns makes the source-URL deduplication query a single, fast, indexed array overlap operation (`&&`). That query would require application-level iteration on any key-value store. The right tool for the job.

**Why Pollinations + Picsum rather than storing generated images?** Generating and storing images per article would require a separate image generation API key, a storage bucket, and a CDN. Pollinations provides free AI image generation with no key required for basic use. Picsum provides a deterministic stock photo fallback keyed by article ID so the same article always gets the same photo across page loads. If either fails, the article degrades gracefully to a text caption via a three-stage `onError` fallback chain in `ArticleCard.tsx`.

**Why serve partial pages rather than blocking on ingest?** The original feed route triggered a full synchronous ingest whenever fewer than `pageSize` articles were available, blocking the client for several minutes under rate limits. The updated behaviour returns whatever is in the pool immediately (even 1-2 articles) and only triggers live ingest on true zero. The client gets something to read right away; the pool refills in the background.

---

## License

MIT
