# Versioning Policy

Gentle Stream uses Semantic Versioning (`MAJOR.MINOR.PATCH`) with pre-1.0 rules.

Current baseline: `0.1.0`.

## Bump Rules

### Pre-1.0 (`0.x.y`)

- Breaking change: bump `MINOR` (`0.1.0` -> `0.2.0`)
- Backward-compatible feature: bump `MINOR` (`0.1.0` -> `0.2.0`)
- Bug fix (including "silent" user-visible fixes): bump `PATCH` (`0.1.0` -> `0.1.1`)
- Docs/chore/internal-only (no runtime behavior change): no mandatory release; may batch into next planned release

### Post-1.0 (`1.x.y+`)

- Breaking change: bump `MAJOR` (`1.4.2` -> `2.0.0`)
- Backward-compatible feature: bump `MINOR` (`1.4.2` -> `1.5.0`)
- Bug fix: bump `PATCH` (`1.4.2` -> `1.4.3`)

## Mapping To Decimal-Style Intent

If you think in decimal increments:

- `+1` corresponds to semver major (`x.0.0` after 1.0)
- `+0.1` corresponds to semver minor (`0.1.0` -> `0.2.0`, or `1.4.0` -> `1.5.0`)
- `+0.01` corresponds to semver patch (`0.1.0` -> `0.1.1`, or `1.4.2` -> `1.4.3`)

Use semver fields directly; do not treat versions as decimal math.

## Release Cadence Guidance

- `0.1.x`: stabilization and release-hygiene fixes
- `0.2.0`: first major internal cleanup/modularity milestone
- `1.0.0`: stable public contracts and contributor/release process

## Release Steps (semantic-release)

1. Merge changes into `develop` for prereleases (`beta`) and into `main` for stable releases.
2. GitHub Actions runs quality gates and executes semantic-release.
3. semantic-release determines the next version from commit messages, updates `CHANGELOG.md`, creates a tag (`vX.Y.Z`), and publishes a GitHub Release.

## Pre-1.0.0 transition

- We temporarily map legacy commit subjects like `fix ...`, `fixed ...`, and `hotfix ...` to `patch` bumps.
- Conventional Commit subjects remain preferred (`feat:`, `fix:`, etc.) and are what we will enforce after `1.0.0`.

## Post-1.0.0 hardening

- Remove temporary fallback release rules in `.releaserc.cjs`.
- Make commitlint a required status check on pull requests.
- Keep `develop` prereleases enabled for validation and progressively roll stable releases from `main`.
