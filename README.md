# The Good News Daily

A Next.js 14 application that surfaces only uplifting news, rendered in a classic broadsheet newspaper aesthetic with infinite scroll, content caching, and per-user personalisation.

---

## Architecture Overview

Content is decoupled from consumption — exactly like Reddit or Substack. A pool of tagged articles lives in the database. The feed API queries that pool and ranks it per-user. The LLM is only called when a category's stock drops below a threshold.

```
Browser
  └── GET /api/feed?userId=...&sectionIndex=N
        └── Ranker Agent          ← pure arithmetic, no LLM
              └── Supabase DB     ← pre-tagged article pool
                    ↑
              Tagger Agent        ← Claude, no web search (cheap)
                    ↑
              Ingest Agent        ← Claude + web search (only when stock is low)
                    ↑
              Scheduler Cron      ← runs every 30 min
```

### The three agents

| Agent | Trigger | LLM? | Web search? | Purpose |
|---|---|---|---|---|
| **Ingest** | Scheduler (stock < 20) or cold start | Yes | Yes | Fetches 12 real articles per category run |
| **Tagger** | Cron every 5 min, processes untagged | Yes | No | Adds tags, sentiment, emotion, quality score |
| **Ranker** | Every feed request | No | No | Scores articles against user profile, picks top N |

---

## Project Structure

```
good-news-daily/
├── app/
│   ├── layout.tsx
│   ├── page.tsx
│   ├── globals.css
│   └── api/
│       ├── feed/route.ts               ← main feed endpoint
│       ├── user/
│       │   └── preferences/route.ts    ← read/update user profile
│       └── cron/
│           ├── scheduler/route.ts      ← checks stock, triggers ingest
│           ├── tagger/route.ts         ← enriches untagged articles
│           └── cleanup/route.ts        ← deletes expired articles
├── components/
│   ├── NewsFeed.tsx
│   ├── Masthead.tsx
│   ├── CategoryBar.tsx
│   ├── ArticleCard.tsx
│   ├── NewsSection.tsx
│   ├── LoadingSection.tsx
│   └── ErrorBanner.tsx
├── lib/
│   ├── constants.ts
│   ├── types.ts
│   ├── db/
│   │   ├── client.ts                   ← Supabase singleton
│   │   ├── schema.sql                  ← run once in Supabase SQL editor
│   │   ├── articles.ts                 ← article read/write helpers
│   │   └── users.ts                    ← user profile helpers
│   └── agents/
│       ├── ingestAgent.ts
│       ├── taggerAgent.ts
│       └── rankerAgent.ts
├── .env.example
├── vercel.json                         ← cron schedules
└── README.md
```

---

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Set up Supabase

1. Create a free project at [supabase.com](https://supabase.com)
2. Go to **SQL Editor → New query**, paste `lib/db/schema.sql`, and run it
3. Copy your **Project URL** and **service role key** from **Settings → API**

### 3. Configure environment variables

```bash
cp .env.example .env.local
```

Fill in `.env.local`:

```
ANTHROPIC_API_KEY=sk-ant-...
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
CRON_SECRET=any-random-string
```

### 4. Prime the article pool (optional)

On first boot the DB is empty, so the feed falls back to live ingest automatically. To pre-populate before launch:

```bash
curl -H "x-cron-secret: your-secret" http://localhost:3000/api/cron/scheduler
curl -H "x-cron-secret: your-secret" http://localhost:3000/api/cron/tagger
```

Or just start the dev server and scroll — the feed self-populates on first load.

### 5. Run

```bash
npm run dev
```

---

## How the Feed Works

1. `NewsFeed.tsx` generates (or retrieves) an anonymous `userId` from `localStorage` and passes it on every feed request.
2. `GET /api/feed` calls the **Ranker Agent** with the user's profile.
3. The ranker pulls candidates from the pool (filtered by category and unseen by this user), scores them, and returns the top 3.
4. If stock is depleted, the API falls back to **live ingest** synchronously and shows a "freshly sourced" banner.
5. The **Scheduler** cron (every 30 min) keeps all categories stocked above threshold so the live fallback is rarely triggered.

### Ranking score formula

```
score = qualityScore
      × (categoryWeight × 8)
      × emotionBoost        # 1.3× if article matches preferred emotions
      × localeBoost         # 1.2× if article matches preferred locales
      × freshnessFactor     # 1.0 → 0.3 linear decay over 7 days
      × noveltyPenalty      # reduces score for widely-seen articles
```

---

## Personalisation

Update a user's profile via `POST /api/user/preferences`:

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

---

## Deployment (Vercel)

```bash
vercel
```

Add all four env vars in the Vercel dashboard. The `vercel.json` crons run automatically on Pro/Team plans. On Hobby, trigger via an external scheduler like cron-job.org.

---

## Roadmap

- [ ] Settings panel UI — category sliders, emotion toggles, game ratio
- [ ] Games layer — Sudoku, word search interspersed in the feed
- [ ] Auth — NextAuth.js for persistent named accounts
- [ ] Mobile app — React Native / Expo
- [ ] Implicit feedback — reading time signals to auto-tune category weights
