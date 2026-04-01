# Frontend Testing Phases (Vitest + Storybook + Playwright)

This repo uses three complementary testing lanes:

- **Vitest + React Testing Library** for fast unit/component behavior checks.
- **Storybook** for isolated UI states + interaction checks.
- **Playwright** for browser-level user journeys.

## Local commands

### Unit / integration

- `npm run test:unit` — node-focused unit tests.
- `npm run test:component` — jsdom component tests with React Testing Library.
- `npm run test:integration` — integration tests under `tests/integration`.

### Storybook

- `npm run storybook` — start Storybook locally on port `6006`.
- `npm run test:stories` — launch Storybook in CI mode and run story tests.

### Playwright

- `npm run test:e2e:install` — install browser binaries.
- `npm run test:e2e:smoke` — smoke tests (Chromium only, `@smoke` specs).
- `npm run test:e2e:chromium` — full Chromium lane.
- `npm run test:e2e:cross-browser` — Chromium + Firefox + WebKit.
- `npm run test:e2e:full` — alias for cross-browser full suite.

## CI phase mapping

### Phase A (PR gate)

- `fast-checks` job in `.github/workflows/ci-reusable.yml` now includes:
  - `test:unit`
  - `test:component`
  - `test:stories`
  - `test:e2e:smoke`

### Phase B (broader browser coverage)

- `.github/workflows/e2e-cross-browser.yml` runs cross-browser Playwright on:
  - pushes to `develop`
  - manual dispatch (`workflow_dispatch`)

### Phase C (nightly full suite)

- `.github/workflows/e2e-nightly.yml` runs nightly UTC schedule:
  - unit + component + integration
  - storybook tests
  - full cross-browser Playwright

## Writing new tests

- Component tests go in `tests/components/**/*.test.tsx`.
- Storybook stories live next to components: `*.stories.tsx`.
- Browser specs go in `tests/e2e/**/*.spec.ts`.
- Tag PR smoke scenarios with `@smoke` so they run in Phase A.
