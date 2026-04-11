# Contributing

Thanks for helping improve Gentle Stream.

## Local setup

- Use Node.js **22+** (see `.nvmrc`; run `nvm use`).
- Install deps from repo root: `npm install`.
- Copy `.env.example` to `.env.local`.
- For auth-free local dev:
  - `AUTH_DISABLED=1`
  - `DEV_USER_ID=dev-local`
  - `DEV_LIGHT=1`

## Core commands

- Dev server: `npm run dev` (or `npm run dev-light`)
- Unit tests: `npm run test:unit`
- Lint: `npm run lint`
- Build: `npm run build`

## Environment policy

See `docs/env-matrix.md` for required/optional vars by environment.

Important: optional feed modules are opt-in. If a module flag is not set, treat it as disabled.

## PR expectations

- Keep behavior changes scoped and documented in `CHANGELOG.md` under `Unreleased`.
- Add/update tests for logic changes where feasible.
- Do not commit secrets or local `.env` files.
- For feed rendering/UI work, verify both light and dark themes.

## Package status

Workspace packages under `packages/*` have mixed maturity:

- Stable: `@gentle-stream/domain`
- Active extraction: `@gentle-stream/feed-engine`, `@gentle-stream/games-engine`
- Experimental: `@gentle-stream/api-client`, `@gentle-stream/platform-adapters`, `@gentle-stream/storage-adapters`

