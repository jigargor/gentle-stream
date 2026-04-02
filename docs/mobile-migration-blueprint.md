# Mobile Migration Blueprint: File-by-File Extraction Map

This blueprint defines the concrete migration path from the current Next.js repo layout to a shared-modules architecture for web + iOS + Android.

It complements `docs/mobile-modularization-plan.md` and answers:

- **what moves first**
- **which files move where**
- **in what order**
- **how to keep web behavior stable while migrating**

---

## 1) Current-state summary

The repository already has strong reusable logic in `lib/*` and API routes in `app/api/*`, but several domain concerns are coupled to web UI components:

- Feed orchestration is heavily embedded in `components/NewsFeed.tsx`.
- Game reducer/state logic is embedded in `components/games/*Card.tsx`.
- Browser APIs (`localStorage`, `navigator`, `sendBeacon`) are directly used in component files.

The migration approach is:

1. Extract pure/domain logic into `packages/*`.
2. Keep `apps/web` behavior unchanged through compatibility re-exports and incremental import rewiring.
3. Introduce `apps/mobile` (Expo) once shared contracts are stable.

---

## 2) Target structure

```txt
apps/
  web/                                # existing Next app (migrated in place initially)
  mobile/                             # Expo app (added in phase 6+)
packages/
  domain/                             # shared types, constants, schemas
  api-client/                         # typed API client wrappers
  feed-engine/                        # feed planning/section assembly logic
  games-engine/                       # game reducers, validators, serializers
  storage-adapters/                   # storage abstraction (web/mobile)
  platform-adapters/                  # geo/share/deeplink contracts
```

---

## 3) Migration sequence (high level)

1. **Foundation**
   - workspace/package scaffolding
   - `packages/domain` extraction
2. **Typed transport**
   - `packages/api-client` extraction
3. **Feed extraction**
   - `packages/feed-engine` from `NewsFeed`
4. **Game logic extraction**
   - `packages/games-engine` from card components
5. **Platform abstractions**
   - storage + native/web adapters
6. **Mobile app shell**
   - Expo app bootstrap + auth/deeplink + feed
7. **Incremental parity**
   - additional screens, then game UIs

Each phase has acceptance gates and rollback-safe boundaries.

---

## 4) File-by-file extraction map (ordered)

## Phase 0 — Scaffolding and guardrails

### Add
- `package.json` (workspace config update only)
- `packages/domain/package.json`
- `packages/domain/src/index.ts`
- (later) `packages/*/package.json` and `src/index.ts` for each package

### Keep stable
- All existing runtime imports continue using `@/lib/*` paths until each migration slice is proven.

Acceptance gate:
- `npm run lint`
- `npm run test:unit`
- `npm run test:integration`

---

## Phase 1 — `packages/domain` extraction (first implementation slice)

### Move/copy source-of-truth into `packages/domain`

| Current file | New file | Notes |
|---|---|---|
| `lib/constants.ts` | `packages/domain/src/constants.ts` | Category constants + defaults |
| `lib/games/types.ts` | `packages/domain/src/games/types.ts` | Game type interfaces |
| `lib/types.ts` | `packages/domain/src/types.ts` | Shared feed/profile/article types |
| `lib/validation/schemas.ts` | `packages/domain/src/schemas/validation.ts` | Zod schemas (slice 1b) |

### Compatibility re-export shim (no behavior change)

| Existing file (stays) | Change |
|---|---|
| `lib/constants.ts` | Re-export from `packages/domain/src/constants` |
| `lib/games/types.ts` | Re-export from `packages/domain/src/games/types` |
| `lib/types.ts` | Re-export from `packages/domain/src/types` |

### Follow-up rewiring (safe, incremental)

- Replace imports in non-UI files first (`lib/*`, route handlers) to `@gentle-stream/domain`.
- Leave component-level rewiring until feed/game extraction phases.

Acceptance gate:
- Type behavior unchanged in all `app/api/*` and existing components.

---

## Phase 2 — `packages/api-client`

### Create
- `packages/api-client/src/client.ts`
- `packages/api-client/src/endpoints/feed.ts`
- `packages/api-client/src/endpoints/user-preferences.ts`
- `packages/api-client/src/endpoints/article-search.ts`
- `packages/api-client/src/endpoints/game-save.ts`
- `packages/api-client/src/endpoints/game-completion.ts`

### Extract from call sites

| Existing usage | New owner |
|---|---|
| Direct fetches in `components/NewsFeed.tsx` to `/api/feed`, `/api/articles/search`, `/api/user/preferences` | `packages/api-client` wrappers |
| Game save/completion fetches from `components/games/*` | `packages/api-client` wrappers |
| Engagement transport from `lib/engagement/client.ts` (optional in this phase) | typed endpoint wrapper |

Acceptance gate:
- API payload parsing centralized and typed.
- No endpoint behavior changes server-side.

---

## Phase 3 — `packages/feed-engine`

### Extract pure feed logic from `components/NewsFeed.tsx`

| Current in `NewsFeed.tsx` | New file |
|---|---|
| `stripCiteTags`, `cleanArticle`, `articleUniqKey` | `packages/feed-engine/src/dedupe.ts` |
| `shouldBeGame` + related helpers | `packages/feed-engine/src/slot-policy.ts` |
| feed cache staleness/freshness checks | `packages/feed-engine/src/cache-policy.ts` |
| module insertion policy wrappers | `packages/feed-engine/src/module-policy.ts` |
| section plan decision object model | `packages/feed-engine/src/plan-section.ts` |

### Keep in web shell (for now)
- React state wiring
- `useEffect` lifecycle wiring
- direct rendering of sections

Acceptance gate:
- Feed ordering and dedupe behavior unchanged.
- Existing tests + new deterministic feed-engine tests pass.

---

## Phase 4 — `packages/games-engine`

### Sudoku first (highest leverage)

| Current file | New files |
|---|---|
| `components/games/SudokuCard.tsx` reducer/helpers | `packages/games-engine/src/sudoku/reducer.ts` |
| hydrate/serialize helpers in `SudokuCard` | `packages/games-engine/src/sudoku/serialize.ts` |
| validation helpers (`isSudokuGrid9x9`, coercers) | `packages/games-engine/src/sudoku/validators.ts` |

Then repeat for:

- `components/games/WordSearchCard.tsx`
- `components/games/KillerSudokuCard.tsx`
- `components/games/NonogramCard.tsx`
- `components/games/CrosswordCard.tsx`
- `components/games/ConnectionsCard.tsx`

Acceptance gate:
- Mistake/undo/cloud-hydrate semantics unchanged.
- completion/game-save payload shape unchanged.

---

## Phase 5 — adapters (`storage-adapters`, `platform-adapters`)

### `packages/storage-adapters`
- `src/types.ts` (`StorageAdapter` interface)
- `src/web/local-storage.ts`
- `src/mobile/async-storage.ts`

### `packages/platform-adapters`
- `src/types.ts` (`GeoAdapter`, `ShareAdapter`, `DeepLinkAdapter`)
- `src/web/*` implementations
- `src/mobile/*` implementations (enabled when Expo lands)

### Initial web call-site rewiring

| Existing file | Adapter use |
|---|---|
| `components/NewsFeed.tsx` | storage + geo adapters |
| `lib/engagement/client.ts` | beacon/flush adapter option |
| `components/user/ProfileMenu.tsx` | storage adapter for preference cache |

Acceptance gate:
- Browser behavior unchanged.
- Adapters unit-tested with doubles.

---

## Phase 6 — Expo app shell (`apps/mobile`)

### Add
- `apps/mobile/package.json`
- `apps/mobile/app/_layout.tsx`
- `apps/mobile/app/index.tsx`
- `apps/mobile/app/login.tsx`
- `apps/mobile/app/auth/callback.tsx`
- `apps/mobile/src/auth/*`
- `apps/mobile/src/feed/*`

### Shared package use
- `@gentle-stream/domain`
- `@gentle-stream/api-client`
- `@gentle-stream/storage-adapters`
- `@gentle-stream/platform-adapters`

### Mobile-first scope
- Auth bootstrap + deep-link callback
- Feed first page + load-more
- profile preference bootstrap (theme/game-ratio reads)

Acceptance gate:
- iOS simulator + Android emulator boot and sign-in flow works.

---

## 5) Import migration policy

To reduce risk:

1. **Introduce package as source of truth.**
2. **Keep old `lib/*` path as compatibility re-export.**
3. **Migrate imports incrementally by subsystem.**
4. **Remove compatibility re-export only after all references are updated and stable.**

This avoids large blast-radius import rewrites.

---

## 6) Suggested commit slicing

1. `chore(workspace): add package scaffolding and domain package shell`
2. `refactor(domain): extract constants/types with compatibility re-exports`
3. `feat(api-client): add typed wrappers for feed/preferences/search`
4. `refactor(feed): extract feed-engine pure planners`
5. `refactor(games): extract sudoku engine and wire web component`
6. `feat(mobile): bootstrap Expo shell with auth callback and feed bootstrap`

Each commit should run:
- `npm run lint`
- `npm run test:unit`
- `npm run test:integration`

---

## 7) Rollback points

Rollback-safe boundaries:

- After each package introduction (before import rewiring)
- After each compatibility re-export change
- After each subsystem import migration
- Before Expo shell introduction

Because compatibility re-exports are kept during migration, reverting is straightforward.

---

## 8) Immediate next implementation slice

The next concrete code changes (starting now):

1. Add workspace/package scaffolding for `packages/domain`.
2. Create `packages/domain/src/{constants.ts,games/types.ts,types.ts,index.ts}`.
3. Convert `lib/constants.ts`, `lib/games/types.ts`, and `lib/types.ts` to re-export shims.
4. Run full validation and commit.

