# AGENTS.md

## Cursor Cloud specific instructions

### Overview

Gentle Stream is a single Next.js 16 (App Router) project — no monorepo, no Docker. All commands run from the workspace root.

### Node version

The project requires **Node.js 20.x** (see `.nvmrc`). Use `nvm use 20` before running any commands.

### Key commands

| Task | Command |
|------|---------|
| Install deps | `npm install` |
| Dev server | `npm run dev` (or `npm run dev-light` to skip live ingest) |
| Lint | `npm run lint` |
| Unit tests | `npm test` (vitest, no DB needed) |
| Build | `npm run build` |
| Type check | `npx tsc --noEmit` |

See `package.json` `scripts` section for the full list.

### Environment for local dev

Copy `.env.example` to `.env.local`. For auth-free local development:

```
AUTH_DISABLED=1
DEV_USER_ID=dev-local
DEV_LIGHT=1
```

Supabase keys can be placeholders when auth is disabled — the feed will show "Could not load stories" (expected without a real DB), but the dev server, game API endpoints, and all unit tests work fine.

### Tests

- **Unit tests** (`npm test` / `npm run test:unit`): Vitest config at `vitest.unit.config.ts`. Runs tests in `tests/unit/` and `tests/routes/`. No database or API keys needed — test setup in `tests/setup.ts` provides placeholder env vars.
- **Integration tests** (`npm run test:integration`): Config at `vitest.integration.config.ts`. Requires real Supabase credentials.
- **Script-based tests** (e.g. `npx tsx scripts/test-citations.ts`): Standalone scripts; some need a real DB.

### Caveats

- The `npm run build` command succeeds with placeholder Supabase env vars — the app validates `NEXT_PUBLIC_SUPABASE_URL` as a URL, so use a URL-shaped placeholder like `https://placeholder.supabase.co`.
- Game API endpoints (`/api/game/sudoku`, `/api/game/word-search`, `/api/game/killer-sudoku`, `/api/game/nonogram`, `/api/game/crossword`, `/api/game/connections`) work without a database — they generate puzzles on the fly.
- Turnstile must be explicitly disabled (`NEXT_PUBLIC_TURNSTILE_ENABLED=0`, `TURNSTILE_ENABLED=0`) or real keys provided; otherwise the login page may block.
