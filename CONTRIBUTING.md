# Contributing

Thanks for helping improve Gentle Stream.

## Local setup

- Use Node.js **24** (minimum in `package.json` is `>=24`). `.nvmrc` and `.node-version` pin **24** to match CI (`actions/setup-node`); run `nvm use` or `fnm use` before installs.
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

## Versioning

- This project follows semver with pre-1.0 rules; see `docs/versioning-policy.md`.
- User-visible bug fixes increment patch (`0.1.0` -> `0.1.1`).
- Backward-compatible features and pre-1.0 breaking changes increment minor (`0.1.0` -> `0.2.0`).

## Package status

Workspace packages under `packages/*` have mixed maturity:

- Stable: `@gentle-stream/domain`
- Active extraction: `@gentle-stream/feed-engine`, `@gentle-stream/games-engine`
- Experimental: `@gentle-stream/api-client`, `@gentle-stream/platform-adapters`, `@gentle-stream/storage-adapters`

## Shared import policy

- Prefer app-facing re-exports for shared domain data in route/component code:
  - `@/lib/types`
  - `@/lib/constants`
  - `@/lib/games/types`
- Use direct `@gentle-stream/domain/*` imports when authoring package-layer code under `packages/*`.

