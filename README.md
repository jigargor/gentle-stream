# The Good News Daily

A Next.js 14 web application that surfaces only uplifting news, rendered in a classic broadsheet newspaper aesthetic with infinite scroll.

## Tech Stack

- **Next.js 14** (App Router)
- **TypeScript**
- **Tailwind CSS**
- **Claude API** with web search — server-side only, API key never exposed to client
- **react-intersection-observer** — infinite scroll sentinel

---

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Set up your API key

```bash
cp .env.example .env.local
```

Open `.env.local` and replace the placeholder with your real key:

```
ANTHROPIC_API_KEY=sk-ant-your-real-key-here
```

> **Never commit `.env.local`** — it's already in `.gitignore`.

### 3. Run the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Project Structure

```
good-news-daily/
├── app/
│   ├── layout.tsx            # Root layout — fonts, metadata
│   ├── page.tsx              # Home route → renders <NewsFeed />
│   ├── globals.css           # Global styles, fonts, animations
│   └── api/
│       └── news/
│           └── route.ts      # API route — calls Claude server-side
├── components/
│   ├── NewsFeed.tsx          # Infinite scroll orchestrator (client)
│   ├── Masthead.tsx          # Gothic blackletter header
│   ├── CategoryBar.tsx       # Sticky category filter nav
│   ├── ArticleCard.tsx       # Individual article with drop cap + pull quote
│   ├── NewsSection.tsx       # 3-article grid with rotating layouts
│   ├── LoadingSection.tsx    # Spinner shown while fetching
│   └── ErrorBanner.tsx       # Error state with retry button
├── lib/
│   ├── constants.ts          # Categories, colors, layout count
│   ├── types.ts              # Shared TypeScript types
│   └── fetchNews.ts          # Claude API logic (server-side only)
├── .env.example              # Copy to .env.local and fill in key
└── README.md
```

---

## How It Works

1. `NewsFeed.tsx` (client component) renders the page and watches a sentinel element at the bottom via `IntersectionObserver`.
2. When the sentinel comes into view, it calls `GET /api/news?sectionIndex=N&category=...`.
3. `app/api/news/route.ts` runs server-side, reads `ANTHROPIC_API_KEY` from env, and calls `lib/fetchNews.ts`.
4. `fetchNews.ts` prompts Claude with web search enabled, requesting 3 uplifting articles as JSON.
5. Articles are returned to the client and rendered as a `<NewsSection>` with one of 3 rotating grid layouts.

---

## Deployment

### Vercel (recommended)

```bash
npm install -g vercel
vercel
```

Add `ANTHROPIC_API_KEY` as an environment variable in the Vercel dashboard under **Settings → Environment Variables**.

### Other platforms

Set `ANTHROPIC_API_KEY` as a server-side environment variable. The Next.js API route keeps it secure.

---

## Roadmap

- [ ] Games layer (Sudoku, Word Search) interspersed between news sections
- [ ] Settings panel — games/news ratio slider, category weighting
- [ ] Mobile app (React Native / Expo)
- [ ] Personalisation — saved preferences, reading history
