# Release Hygiene Baseline

Date: 2026-04-14

This snapshot records the quality baseline before release-hygiene cleanup work.

## Tooling Baseline

- Node runtime present: `v24.11.0` (project requirement is `>=24`; see `.nvmrc` / `.node-version`)
- TypeScript typecheck: `npx tsc --noEmit` passed
- Unit tests: `npm run test:unit` passed (`26` files, `89` tests)
- Component tests: `npm run test:component` passed (`2` files, `5` tests)

## Lint Baseline

`npm run lint` passed with warnings (`23` total, `0` errors):

- `15` x `@next/next/no-img-element`
- `6` x `react-hooks/exhaustive-deps`
- `2` x unused eslint-disable directives

## Notes

- Baseline is stable for type safety and test suite execution.
- Lint policy currently allows large warning volume via `--max-warnings=9999`; this will be tightened during release hygiene.
