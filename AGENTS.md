# AGENTS.md

## Cursor Cloud specific instructions

### Overview

Gentle Stream currently runs as a root Next.js 16 (App Router) app. The `packages/*` workspace modules are active shared libraries, and `apps/*` is reserved for the planned future split (web/mobile) documented under `docs/mobile-*`. No Docker; run commands from workspace root.

### Node version

The project targets **Node.js 24** (`engines.node` is `>=24`). **`.nvmrc`** and **`.node-version`** both pin `24` for nvm, fnm, asdf, and similar tools. **GitHub Actions** uses `node-version: "24"` with `actions/setup-node`. Run `nvm use` (or your version manager’s equivalent) before installs.

**npm / lockfile:** `package.json` pins `npm@11.6.1` via `packageManager`. Use Corepack (`corepack enable`) so your npm matches CI; installing with a different **major** npm can rewrite `package-lock.json` in ways that make `npm ci` fail on GitHub (missing nested packages such as `@emnapi/*`). If that happens, run `npx npm@11.6.1 install` at the repo root and commit the updated lockfile.

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
