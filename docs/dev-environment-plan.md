# Dev Environment Plan (Isolated Backend + Domain + Migrations + Costs)

This document outlines a practical, step-by-step plan to create a true development environment that is isolated from production, including backend services, database, domain/subdomains, CI/CD wiring, migration strategy, branching model, and cost considerations.

## Recommended Environment Topology

Use four environments:

1. **Local** (developer machines)
2. **Dev** (shared team integration environment)
3. **Staging** (production-like validation)
4. **Prod** (live traffic)

For domain separation, use dedicated subdomains per environment:

- Frontend: `app-dev.example.com`
- Backend API: `api-dev.example.com`
- Optional admin/internal: `admin-dev.example.com`

Repeat this pattern for staging and production.

---

## Step-by-Step Implementation Plan

## 1) Choose isolation model

Pick one of these models up front:

- **Model A:** Shared cloud account/project, separate resources by environment (lower cost, simpler ops)
- **Model B:** Separate cloud account/project per environment (higher isolation, stricter controls)

Recommendation for most teams: start with **Model A** unless security/compliance requires full account-level isolation.

## 2) Define an environment contract

Create and maintain an environment matrix that includes:

- Domain names and API base URLs
- Database instance names and connection endpoints
- Cache/queue names
- Secret paths and key names
- Feature flag defaults per environment
- Third-party credentials split by environment

Goal: avoid accidental cross-environment traffic or credential reuse.

## 3) Provision infrastructure with IaC

Use Terraform/Pulumi/CDK with reusable modules that accept `environment` (`dev`, `staging`, `prod`).

Provision, per environment:

- Backend runtime (containers, serverless, or VM-based service)
- Managed database (separate instance or separate cluster+database)
- Cache (Redis)
- Object storage bucket
- Queue/topic resources (if async jobs exist)
- Logging/monitoring namespace
- TLS certificates and DNS records

Naming convention example: `myapp-dev-*`.

## 4) Configure domain, TLS, and network boundaries

- Add DNS records for `app-dev` and `api-dev`
- Issue/attach TLS certificates
- Restrict CORS to environment-matching frontend origins
- Configure auth callback URLs per environment (OAuth providers, SSO)
- Prevent cookie-domain overlap between dev/staging/prod

## 5) Isolate secrets and IAM access

Use a secret manager with per-environment paths, for example:

- `/myapp/dev/...`
- `/myapp/staging/...`
- `/myapp/prod/...`

Rules:

- Never reuse production credentials in non-production environments
- Apply least-privilege IAM policies per environment role/service

## 6) Branching and deployment strategy

Recommended Git strategy with `develop` as integration branch:

- `feature/*` -> PR into `develop`
- `develop` auto-deploys to **dev**
- `release/*` branches from `develop` for stabilization
- `main` represents production and deploys to **prod**
- Optional `staging` branch auto-deploys to staging (or deploy release branch to staging)

Repository protections:

- Required CI checks before merge
- Block direct pushes to `develop` and `main`
- Require migration safety checks on schema-changing PRs

## 7) Database migration strategy (expand/migrate/contract)

Use a backward-compatible rollout for all schema changes:

1. **Expand:** add nullable columns/tables/indexes only
2. Deploy app that can read/write both old and new paths
3. Backfill data with idempotent jobs/scripts
4. Switch reads via feature flag/config
5. Verify metrics, error rates, and data parity
6. **Contract:** remove old schema only after confidence window

Promotion order:

1. Local test DB
2. Dev DB
3. Staging DB
4. Prod DB

Operational requirements:

- Forward-only migrations in CI
- Single migration runner/lock to avoid race conditions
- Explicit rollback runbook (prefer app rollback before DB rollback)

## 8) CI/CD pipeline stages

### On pull requests

- Lint + type-check + tests
- Migration lint/safety checks
- Build immutable artifact/container image

### On merge to `develop`

- Deploy backend to dev
- Run dev migrations
- Execute dev smoke tests against `api-dev`

### On release/staging/prod promotions

- Manual approval gates where appropriate
- Ordered migration + deployment flow
- Post-deploy health checks and smoke tests

## 9) Development data strategy

- Use synthetic or masked data only
- Optional scheduled refresh from sanitized snapshot
- Keep deterministic seed scripts for repeatable testing
- Keep non-prod buckets/queues fully isolated from production

## 10) Observability and operational readiness

Per environment:

- Health checks (`/health`)
- Latency/error dashboards
- Structured logs with `environment` labels
- Alerts tuned by environment priority

UI safety recommendation: show a visible environment banner in non-production apps.

## 11) Cost model (monthly ballpark)

For one shared development backend environment, typical ranges:

- Compute/runtime: **$20-$150**
- Managed Postgres: **$30-$300**
- Redis/cache: **$15-$100**
- Object storage + egress: **$5-$50**
- Logs/monitoring/APM: **$10-$150**
- CI/CD minutes + artifacts: **$0-$100**
- Domain/DNS/TLS: **$1-$20**

Estimated total: **~$80-$870/month**, based on scale, service tier, traffic, and retention.

Cost controls:

- Auto-sleep non-prod services off-hours
- Use smaller DB/cache tiers in dev
- Shorter log retention in non-production
- Configure budget and anomaly alerts per environment

## 12) Practical execution checklist (in order)

1. Finalize environment matrix and naming conventions
2. Provision dev infrastructure via IaC
3. Configure `api-dev` and `app-dev` DNS + TLS
4. Create dev secrets and IAM roles
5. Wire CI/CD deployment from `develop`
6. Add migration pipeline checks and safety guards
7. Deploy first backend build to dev
8. Run baseline migrations and seed data
9. Add smoke tests and core dashboards
10. Publish runbooks (deploy, rollback, migration, incident)

---

## Notes for future tightening

- Move from shared account to account-per-environment if compliance needs increase.
- Add ephemeral preview environments per PR once core dev/staging/prod flow is stable.
- Add automated drift detection on IaC and policy checks in CI.
