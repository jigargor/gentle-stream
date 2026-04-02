# Mobile Modularization Plan (Steps 1 and 2)

This document starts implementation planning for:

1. **Step 1: Modularization pass only** (extract reusable domain/api/feed/game logic)
2. **Step 2: Expo skeleton** (create iOS + Android app shell with auth + feed bootstrap)

It is intentionally execution-focused: concrete file moves, package boundaries, acceptance criteria, and test gates.

---

## Goals

- Maximize shared code across web, iOS, and Android.
- Keep Next.js web app behavior stable while extracting reusable modules.
- Build a native shell (Expo) that consumes shared modules without duplicating business logic.

## Non-goals (for these steps)

- No complete mobile UI parity yet.
- No game UI parity yet (only architecture hooks and adapters).
- No production store submission work in this phase.

---

## Target monorepo shape

```txt
apps/
  web/                      # existing Next.js app (migrated in place)
  mobile/                   # new Expo app (step 2)
packages/
  domain/                   # shared interfaces, zod schemas, constants
  api-client/               # typed client wrappers for /api/*
  feed-engine/              # feed orchestration + pure selection logic
  games-engine/             # reducers/validators/state serializers
  storage-adapters/         # localStorage / AsyncStorage abstraction
  platform-adapters/        # geo/share/deeplink contracts
```

---

## Step 1: Modularization pass plan

### 1.1 Package boundaries

### `packages/domain`
- Move shared interfaces and schema-first contracts.
- Initial sources:
  - `lib/types.ts`
  - `lib/constants.ts`
  - `lib/validation/schemas.ts`

Deliverables:
- `packages/domain/src/types/*`
- `packages/domain/src/constants/*`
- `packages/domain/src/schemas/*`
- Backward-compatible exports consumed by `apps/web`.

### `packages/feed-engine`
- Extract pure feed orchestration logic from `components/NewsFeed.tsx`.
- Initial extraction targets:
  - article dedupe helpers (`articleUniqKey`, cleaning helpers)
  - section decision functions (game slot vs article slot)
  - module insertion policy wrappers
  - feed cache policy state machine (pure logic only)

Deliverables:
- `packages/feed-engine/src/plan-feed-section.ts`
- `packages/feed-engine/src/dedupe.ts`
- `packages/feed-engine/src/module-policy.ts`
- Deterministic unit tests for each branch condition.

### `packages/games-engine`
- Extract reducer/state logic currently embedded in game components.
- Initial target:
  - Sudoku reducer + cloud hydration/serialization support from `components/games/SudokuCard.tsx`

Deliverables:
- `packages/games-engine/src/sudoku/reducer.ts`
- `packages/games-engine/src/sudoku/serialize.ts`
- `packages/games-engine/src/sudoku/validators.ts`
- Snapshot and behavior tests for mistakes/undo/hydration edge cases.

### `packages/api-client`
- Typed API wrappers over existing Next routes.
- Initial endpoints:
  - `/api/feed`
  - `/api/user/preferences`
  - `/api/articles/search`
  - `/api/user/game-save`
  - `/api/user/game-completion`

Deliverables:
- `packages/api-client/src/client.ts`
- `packages/api-client/src/endpoints/*.ts`
- Runtime parsing via shared `domain` schemas where available.

### `packages/storage-adapters`
- Browser and mobile persistence contract.

Deliverables:
- `StorageAdapter` interface (`get`, `set`, `remove`)
- web implementation (localStorage)
- mobile implementation stub (AsyncStorage-backed in step 2)

### `packages/platform-adapters`
- Platform contract only in step 1 (no full implementation).

Deliverables:
- `GeoAdapter`, `ShareAdapter`, `DeepLinkAdapter` interfaces
- web implementations for existing browser behavior
- no-op/test doubles for unit tests

---

## Step 1 execution sequence

1. Establish npm workspaces (`apps/*`, `packages/*`).
2. Introduce `packages/domain` and switch web imports to package paths.
3. Introduce `packages/api-client` and replace direct `fetch` in non-UI utility layers first.
4. Extract `feed-engine` pure modules; keep `NewsFeed.tsx` as orchestration shell.
5. Extract `games-engine` Sudoku logic; wire back into existing component.
6. Add adapter contracts and web implementations.
7. Final parity verification (no behavior regressions on web feed/game flows).

---

## Step 1 acceptance criteria

- Web app still passes lint/unit/integration tests.
- Feed request behavior is unchanged for:
  - category filter
  - kind filter
  - search
  - dedupe + cooldown flows
  - module insertion rules
- Sudoku behavior is unchanged for:
  - mistakes and lockout
  - undo semantics
  - cloud hydrate edge cases
- Shared package tests run green in CI-compatible mode.

---

## Step 2: Expo skeleton plan

### 2.1 Create `apps/mobile`

- Bootstrap Expo TypeScript app.
- Configure workspace build + tsconfig references.
- Add navigation structure (Expo Router or React Navigation) with:
  - `/` feed shell
  - `/login` auth entry
  - `/auth/callback` deep-link callback handler

### 2.2 Wire shared modules

- Consume:
  - `@gentle-stream/domain`
  - `@gentle-stream/api-client`
  - `@gentle-stream/storage-adapters`
  - `@gentle-stream/platform-adapters`
- Implement mobile `StorageAdapter` (AsyncStorage).
- Implement mobile `DeepLinkAdapter` + auth callback bridge.

### 2.3 Initial native features (step-2 scope only)

- Session bootstrap and guarded routes.
- Feed list screen using `/api/feed` via shared client.
- Preferences bootstrap (`/api/user/preferences`) for game ratio/theme setup.
- Basic article card rendering parity at data level (not full style parity).

---

## Step 2 acceptance criteria

- Expo app runs on iOS simulator and Android emulator.
- Deep-link callback can restore authenticated session.
- Feed list renders first section and loads additional sections.
- Type-safe API client is shared with web.
- Mobile app compiles with no TypeScript errors.

---

## Testing strategy for steps 1 and 2

### Required automated checks

- `npm run lint`
- `npm run test:unit`
- `npm run test:integration`

### Additional step-1 checks

- Package-level unit tests for extracted feed/game modules.
- Serialization/hydration round-trip tests for game engines.
- Contract tests for API client response parsing.

### Additional step-2 checks

- `expo-doctor` / Expo config validation
- native smoke flow:
  - launch app
  - sign in
  - fetch feed first page
  - pull/load next section

---

## Risk register (early)

1. **Large `NewsFeed.tsx` extraction risk**
   - Mitigation: extract pure functions first, keep React orchestration local.
2. **Game logic coupled to web component state**
   - Mitigation: move reducer/state transitions first; UI wrappers second.
3. **Auth deep-link differences across platforms**
   - Mitigation: unified deep-link adapter contract + platform-specific tests.
4. **Regression risk during module relocation**
   - Mitigation: maintain compatibility exports and migrate imports incrementally.

---

## Task checklist (planning started on this branch)

- [x] Define package boundaries and extraction map.
- [x] Define step-1 and step-2 acceptance criteria.
- [x] Define test gates for both steps.
- [ ] Add workspace scaffolding (`apps/`, `packages/`) in implementation PR(s).
- [ ] Extract first shared package (`domain`).
- [ ] Bootstrap Expo app with shared API client and auth callback route.

