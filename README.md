# Gentle Stream

> *"All the news that lifts the spirit."*

A full-stack news product that surfaces only uplifting stories — no deaths, crimes, or disasters — in a broadsheet-style reading experience. Articles are personalised per signed-in user, deduplicated across ingest runs, and mixed with optional puzzle breaks. Built end-to-end to show product thinking, data discipline, and operational care: auth, library UX, game stats, CI/CD, and a three-agent LLM pipeline that stays off the hot path for the feed.

---

## What it does

Gentle Stream curates real news from the web, filters for positive stories, and presents them in a newspaper-inspired UI with infinite scroll. Each signed-in user gets a feed ranked from category weights, emotions, locale, freshness, and reading history — without repeating the same article.

**Content generation and consumption are decoupled** (Reddit/Substack-style): a background pipeline fills an article pool; **`GET /api/feed` does not call an LLM** — it reads the pool and ranks in milliseconds.

---

## Features (product surface)

| Area | Details |
|------|---------|
| **Auth** | Supabase Auth (e.g. Google, email). Email sign-in clickwrap requires agreeing to the Terms of service + Privacy policy, and optionally Cloudflare Turnstile when enabled. Session-aware APIs; optional local `AUTH_DISABLED` / `DEV_USER_ID` for development only. |
| **Profile** | Display name, **unique** `@username` (case-insensitive in DB), optional avatar (Storage + URL validation), **24-hour cooldown** after each username change. |
| **Reading** | Save articles to a library, read saved pieces, optional likes — persisted in Postgres with RLS-oriented design. |
| **Games** | **Sudoku**, **word search**, **killer sudoku**, and **nonogram** in the feed (and a hero puzzle beside the lead story). Difficulty presets, in-progress **cloud resume** for sudoku & word search where enabled, **completion logging** for stats. “How to play” links (Wikipedia) on sudoku, killer sudoku, and nonogram. |
| **Game statistics** | Completions recorded per user; **game stats** page and summary in the profile menu. |
| **Personalisation** | Category weights, preferred emotions/locales, **games vs news ratio** (presets refresh the feed from the top). |
| **Editorial ops** | Crons: scheduler (stock check → ingest), tagger (enrichment), cleanup (currently no-op), plus persisted ingest run logs for ops/debugging. |

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                     Browser                          │
│  NewsFeed.tsx  →  GET /api/feed?userId=&section=N   │
│  Supabase session → /api/user/* (profile, saves, …) │
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
│   /api/cron/cleanup     currently no-op              │
└──────────────────────────────┬──────────────────────┘
                               │ (when stock < threshold)
┌──────────────────────────────▼──────────────────────┐
│                   Agent Pipeline                      │
│                                                      │
│  Ingest Agent  ──→  Tagger Agent  ──→  Supabase DB  │
│  (Claude + web    (Claude, no web     articles,     │
│   search)          search, cheap)     user_profiles  │
└─────────────────────────────────────────────────────┘
```

### The three agents

| Agent | Triggered by | Uses LLM? | Web search? | Purpose |
|-------|----------------|-----------|---------------|---------|
| **Ingest** | Scheduler cron or cold-start fallback | Yes | Yes | Fetches real, recent articles one at a time; extracts source URLs; stores raw content |
| **Tagger** | Cron every 5 min | Yes | No | Classifies stored articles: tags, sentiment, emotion, locale, quality score (0–1) |
| **Ranker** | Every feed request | **No** | No | Scores the article pool against the user's profile; returns top N |

The Ranker stays LLM-free so every scroll stays fast and cheap; the Tagger front-loads structure.

### Ranking score

```
score = qualityScore
      × (categoryWeight × 8)   // user's stated interest, re-scaled from avg 0.125
      × emotionBoost            // 1.3× match, 0.85× mismatch
      × localeBoost             // 1.2× match, 0.8× mismatch
      × freshnessFactor         // linear decay: 1.0 at day 0 → 0.3 at day 7
      × noveltyPenalty          // 1.0 < 10 uses, 0.85 < 50 uses, 0.6 beyond
```

Mixed feed behaviour, untagged fallback, and deterministic category rotation are unchanged in spirit from the original design — see `lib/agents/rankerAgent.ts`.

---

## Deduplication

Three layers address duplicate or near-duplicate stories across ingest runs:

### Layer 1 — Headline fingerprint
Fingerprint = normalised headline + `|` + **category** (punctuation stripped, whitespace collapsed, lowercased). Same headline in **different** categories is allowed. A **UNIQUE** constraint on `fingerprint` is the last line of defence. Preflight existence checks use per-value queries so characters like `&` in category names are safe with PostgREST.

### Layer 2 — Source URL overlap
Normalised source URLs live in `TEXT[]` with a GIN index; overlap (`&&`) catches the same real article under a different generated title.

### Layer 3 — Prompt avoid-list
Recent headlines and URLs for the category are injected into the ingest prompt to avoid repeat searches.

---

## Token rate-limit management

The ingest agent tracks real `usage.input_tokens` against a conservative per-minute budget and waits for the Anthropic window to reset when needed. **One article per LLM call** avoids `max_tokens` truncation breaking JSON parsing.

---

## Quality: tests & CI/CD

| Layer | What runs |
|-------|-----------|
| **Typecheck & build** | `tsc --noEmit` and `next build` with placeholder public env vars (no secrets on fork PRs). |
| **Unit / generator tests** | `tests/unit/articleDedupKeys.test.ts` (pure fingerprint + URL key normalization), `scripts/test-citations.ts`, `test-sudoku.ts`, `test-word-search.ts`, `test-killer-nonogram.ts` — no DB dependency for dedup key semantics. |
| **DB integration** | `test-dedup.ts`, `test-url-dedup.ts` — real Supabase integration smoke checks (overlap queries + constraints); tagged test rows cleaned up in `finally`. |
| **Security weekly audits** | Scheduled GitHub workflow `/.github/workflows/security-weekly.yml` runs `npm run security:inventory`, `npm run security:rls-audit`, and `npm run security:audit` weekly. |
| **GitHub Actions** | Reusable workflow: **CI** on pull requests and pushes to `develop` (unit + component + Storybook tests, Playwright smoke, and DB integration when secrets are available). Additional workflows run **cross-browser E2E** on `develop` pushes/manual dispatch and a **nightly full E2E matrix**. |
| **Vercel** | `vercel.json` currently enables Git deployments on `main` and disables them on `develop`/`feature/*`; production can still be promoted via `deploy.yml`. |

---

## Project structure (high level)

```
gentle-stream/
├── app/                    # App Router: pages, layouts, api/* routes
├── components/             # NewsFeed, ArticleCard, games/, auth/, user/ProfileMenu, …
├── lib/
│   ├── agents/             # ingest, tagger, ranker
│   ├── db/                 # client, articles, users, migrations/, schema.sql
│   ├── games/              # generators, types, feed pick
│   ├── supabase/           # browser + server clients, middleware
│   └── user/               # feed settings, username policy, …
├── scripts/                # ingest CLI, test-*.ts
└── .github/workflows/      # ci.yml, ci-reusable.yml, deploy.yml
```

---

## Tech stack

| Layer | Choice | Why |
|-------|--------|-----|
| Framework | Next.js 16 (App Router) | SSR, colocated API routes, Vercel-friendly |
| Language | TypeScript (strict) | End-to-end types for articles, profiles, games |
| Database | Supabase (PostgreSQL) | Postgres + GIN on arrays; Auth + Storage |
| AI | Anthropic Claude | Structured JSON + web search for ingest |
| Styling | Tailwind + inline styles | Utilities + precise editorial typography |
| Fonts | Playfair Display, IM Fell English, UnifrakturMaguntia | Broadsheet feel — not generic UI fonts |
| Deploy | Vercel + GitHub Actions | Crons on Vercel; gated, smoke-tested production deploys |

---

## UI design decisions

The newspaper aesthetic is the product: blackletter masthead, rotating section layouts, drop caps, pull quotes, warm newsprint palette, sticky category bar, hero images (Pollinations + Picsum fallback with graceful degradation), and partial sections when stock is low so the feed never shows an empty hole. Details live in the components and prior design notes in git history.

Dark mode is currently experimental; contrast hardening is actively tracked and iterated in the profile/menu and article-card surfaces.

---

## Getting started

### Prerequisites

- **Node.js 24** (use `.nvmrc` / `.node-version`; matches GitHub Actions `node-version`)
- A [Supabase](https://supabase.com) project
- An [Anthropic](https://console.anthropic.com) API key (for ingest / tagger)

### 1. Clone and install

```bash
git clone https://github.com/<your-org-or-username>/gentle-stream.git
cd gentle-stream
nvm use
npm install
```

### 2. Database

In Supabase **SQL Editor**, run in order:

1. `lib/db/schema.sql`
2. Every `lib/db/migrations/NNN_*.sql` file in **ascending numeric prefix** order (`001` before `002`, …). If two migrations share the same number, use the repo’s filename order.

This creates articles, fingerprints, games, profiles, avatars, saves/likes, `username_set_at`, etc.

### 3. Environment variables

```bash
cp .env.example .env.local
```

See `.env.example` for documented variables. At minimum for a full local run:

- `ANTHROPIC_API_KEY`
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `CRON_SECRET`
- `NEXT_PUBLIC_TURNSTILE_ENABLED=0` and `TURNSTILE_ENABLED=0` for local auth-friendly development (recommended)
- If enabling Turnstile, set:
  - `NEXT_PUBLIC_TURNSTILE_ENABLED=1` + `NEXT_PUBLIC_TURNSTILE_SITE_KEY`
  - `TURNSTILE_ENABLED=1` + `TURNSTILE_SECRET_KEY`
- `NEXT_PUBLIC_SUPPORT_EMAIL` (shown on `/data-deletion` and used for privacy contact mailto)
- `NEXT_PUBLIC_LEGAL_LAST_UPDATED` (label used on `/privacy`, `/terms`, `/data-deletion`, `/sms-consent`)

Configure **Auth providers** and **redirect URLs** in the Supabase dashboard to match your local or deployed origin.

- Add every origin you actually use (for example `http://localhost:3000`, LAN IP, production URL).
- Use `/**` patterns for callback paths (for example `http://localhost:3000/**`), not just `/*`.
- Set Supabase **Site URL** to your canonical production domain to avoid fallback confusion.
- Keep `NEXT_PUBLIC_AUTH_REDIRECT_ORIGIN` aligned with allowed redirect origins when you need a fixed override.

### 4. Article pool (optional but needed for a rich feed)

```bash
npm run ingest          # categories + tagging (see scripts/ingest/README.md if present)
npm run ingest:tag        # tag-only pass
```

### 5. Dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

**`npm run dev-light`** sets `DEV_LIGHT=1` so `/api/feed` skips live ingest during local iteration (fewer moving parts).

---

## Scripts

```bash
npm run dev                    # Next.js dev
npm run dev-light              # Dev without feed-triggered ingest
npm run build                  # Production build
npm run lint                   # ESLint
npm run ingest                 # Ingest CLI
npm run ingest:all             # Full ingest pass
npm run ingest:tag             # Tagger-only

npx tsx scripts/test-citations.ts
npx tsx scripts/test-sudoku.ts
npx tsx scripts/test-word-search.ts
npx tsx scripts/test-killer-nonogram.ts
npx tsx scripts/test-dedup.ts          # Supabase secrets required
npx tsx scripts/test-url-dedup.ts      # Supabase secrets required

npm run test:unit               # vitest (node) unit/routes
npm run test:component          # vitest + react-testing-library (jsdom)
npm run storybook               # Storybook UI dev server
npm run test:stories            # Storybook interaction/a11y test runner
npm run test:e2e:smoke          # Playwright smoke (Chromium)
npm run test:e2e:cross-browser  # Playwright Chromium + Firefox + WebKit
```

---

## API reference (selected)

### `GET /api/feed`

Ranked section for a user. Query params include `userId`, `sectionIndex`, optional `category`, `pageSize`. See route implementation for exact behaviour and `fromCache`.

### User & library (session cookie auth)

- **`GET` / `PATCH /api/user/profile`** — display name, username, avatar URL.
- **`GET/POST/DELETE /api/user/article-saves`** — saved library.
- **`POST /api/user/game-completion`** — record a finished puzzle (used for stats).
- **`GET/PUT/DELETE /api/user/game-save`** — cloud resume for supported games.
- **`GET /api/user/game-stats`** — aggregated completions.
- **`GET` / `POST /api/user/preferences`** — category weights, game ratio, etc.

### Cron routes

Header: `x-cron-secret: <CRON_SECRET>` (or configured equivalent).

| Route | Schedule (vercel.json) | Role |
|-------|-------------------------|------|
| `GET /api/cron/scheduler` | Every 10 min | Stock check → ingest when low or stale |
| `GET /api/cron/tagger` | Every 3 min | Tag untagged articles |
| `GET /api/cron/cleanup` | Daily 03:00 UTC | No-op (TTL cleanup disabled) |
| `GET /api/cron/games` | Every 6 hours | Maintains game pools |
| `GET /api/cron/engagement-health` | Every 15 min | Engagement freshness and guardrail checks |
| `GET /api/cron/affinity-refresh` | Every 15 min | Refreshes user-category affinity features |

### Ingest log inspection

Use this authenticated endpoint to inspect recent scheduler runs with per-category detail:

- `GET /api/admin/cron/ingest-logs?limit=20`
- Auth header: `Authorization: Bearer <CRON_SECRET>` (or `x-cron-secret`)
- Returns run-level metadata (`ok`, `totalInserted`, duration notes) and category rows (`beforeCount`, `requestedCount`, `insertedCount`, `reason`, `errorMessage`)

This is the fastest way to confirm whether low stock is caused by ingest failures, dedup skips, or tagger lag.

---
### Legal pages & clickwrap

Public legal endpoints:
- `/privacy`
- `/terms`
- `/data-deletion`
- `/sms-consent`

Clickwrap / consent behavior:
- Social sign-in (Google/Facebook) redirects to `/terms/accept` until the user scrolls through Terms and agrees (cookie-backed gate).
- Email auth (`/login` → email/password Sign in or Sign up) requires checking the “I have read and agree…” box (Terms + Privacy) before submission.
- Sign up uses Supabase email verification (`signUp` + `emailRedirectTo`) before first password login.
- When Turnstile is enabled in env vars, the `/login` page renders the Cloudflare widget and `POST /api/auth/email-password` verifies the Turnstile token (rate-limited).

---

## Deployment

### Production flow

1. Merge to **`main`** (e.g. via PR from `develop`).
2. **GitHub Actions** `deploy.yml` runs typecheck, build, unit tests, integration tests (with secrets from the **Production** environment), then **`vercel deploy --prod`**, then HTTP smoke tests.

Set GitHub **repository or environment secrets** as required by the workflow (Vercel token/org/project, Supabase URL + service role for integration, public Supabase keys for build placeholders, `CRON_SECRET`, etc.). **Environment-scoped secrets** only apply to jobs that declare `environment: Production` — match your workflow to your GitHub Environment configuration.

### Vercel project

Add the same env vars as production. `vercel.json` currently allows Git-triggered deployment on `main`, so if you want Action-only promotion, disable Git deployment for `main` in Vercel project settings (or set `git.deploymentEnabled.main` to `false`).

On **Hobby** plan, verify cron behaviour; external schedulers can hit cron URLs with the secret if needed.

---

## Versioning

Gentle Stream follows semantic versioning with a pre-1.0 policy:

- Bug fixes: patch bump (`0.1.0` -> `0.1.1`)
- Backward-compatible features: minor bump (`0.1.0` -> `0.2.0`)
- Pre-1.0 breaking changes: minor bump (`0.2.0` -> `0.3.0`)
- Post-1.0 breaking changes: major bump (`1.4.0` -> `2.0.0`)

See [`docs/versioning-policy.md`](docs/versioning-policy.md) for full release rules and examples.

---

## Roadmap (examples)

- Implicit feedback (dwell time → weights)
- Richer settings UI surface area
- Stricter moderation / reporting for UGC if you open publishing
- Mobile shell (Expo) sharing APIs

---

## Engineering notes

**One article per LLM call** — avoids truncated JSON arrays from `max_tokens`.

**Ranker without LLM** — personalisation is arithmetic on fields the Tagger filled.

**Postgres + GIN on `TEXT[]`** — one indexed overlap query for URL dedup instead of app-side scans.

**Pollinations + Picsum** — hero imagery without a dedicated image pipeline; staged `onError` fallback in the article card.

**Partial feed sections** — return what exists in the pool instead of blocking on a long synchronous ingest.

---

## Release hygiene references

- Env matrix: [`docs/env-matrix.md`](docs/env-matrix.md)
- Security model summary: [`docs/security-model.md`](docs/security-model.md)
- Dependency audit policy: [`docs/dependency-audit-policy.md`](docs/dependency-audit-policy.md)
- API route index: [`API.md`](API.md)
- Security policy: [`SECURITY.md`](SECURITY.md)
- Community conduct: [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md)
- Contributor workflow: [`CONTRIBUTING.md`](CONTRIBUTING.md)
- Versioning policy: [`docs/versioning-policy.md`](docs/versioning-policy.md)
- Typography variation proposal: [`docs/article-typography-variation-plan.md`](docs/article-typography-variation-plan.md)

## License

MIT
