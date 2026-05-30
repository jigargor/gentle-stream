# API Reference

This document is the contributor-facing index for routes under `app/api/**`.

For machine-generated route metadata, see:

- `scripts/security-route-inventory.ts`
- `security/route-inventory.json`

## Auth Models

- `public`: no session required.
- `session_user`: signed-in user cookie/session required.
- `admin_guard`: admin-only access via shared admin guard.
- `cron_secret`: cron-authenticated request (`Authorization: Bearer <CRON_SECRET>`).

## Response And Error Conventions

- Successful routes return JSON payloads with route-specific fields.
- Error responses use a shared envelope from `lib/api/errors.ts`:
  - `error`: human-readable message
  - `code`: stable code (`ERR_*`)
  - `traceId`: request correlation id
  - optional: `details`, `unlockAt`, `retryAfterSec`

## Route Index

## Feed And Discovery

| Route | Methods | Auth | Notes |
|---|---|---|---|
| `/api/feed` | `GET` | `session_user`/guest fallback | Ranked feed section data, optional cold-start queueing. |
| `/api/feed/related` | `GET` | `public` | Related headline/cluster surface for article context. |
| `/api/feed/force-ingest` | `POST` | `cron_secret` | Manually trigger ingest refill path. |
| `/api/feed/modules/weather` | `GET` | `public` | Weather module payload for feed cards. |
| `/api/feed/modules/spotify` | `GET` | `public` | Spotify mood module payload. |
| `/api/feed/modules/apod` | `GET` | `public` | NASA APOD module payload. |
| `/api/feed/modules/todo` | `GET`,`POST` | `public`,`session_user` | Feed todo module read/update surface. |

## Auth

| Route | Methods | Auth | Notes |
|---|---|---|---|
| `/api/auth/email-password` | `POST` | `public` | Email/password sign in/up with origin, rate-limit, and Turnstile validation. |
| `/api/auth/email-link` | `GET`,`POST` | `public` | Email-link auth support route. |
| `/api/auth/guest-access` | `POST` | `public` | Guest-entry/session helper for limited interactions. |

## User Profile, Preferences, Library

| Route | Methods | Auth | Notes |
|---|---|---|---|
| `/api/user/profile` | `GET`,`PATCH` | `session_user` | Profile read/update (`displayName`, `username`, `avatarUrl`, `weatherLocation`). |
| `/api/user/preferences` | `GET`,`POST` | `session_user` | Feed/user preference persistence. |
| `/api/user/avatar` | `POST`,`DELETE` | `session_user` | Avatar upload/select/remove. |
| `/api/user/article-saves` | `GET`,`POST`,`DELETE` | `session_user` | Library save state by article. |
| `/api/user/article-likes` | `GET`,`POST`,`DELETE` | `session_user` | Like state for articles. |
| `/api/user/article-engagement` | `POST` | `session_user` | Engagement telemetry ingest. |
| `/api/user/game-completion` | `GET`,`POST` | `session_user` | Completion signatures + completion writes. |
| `/api/user/game-save` | `GET`,`PUT`,`DELETE` | `session_user` | In-progress game cloud save slices. |
| `/api/user/game-stats` | `GET` | `session_user` | Aggregated game stats for profile/menu. |
| `/api/user/spotify-mood-feedback` | `POST` | `session_user` | User feedback for spotify mood module. |
| `/api/user/recipe-ratings` | `GET`,`PUT` | `session_user` | Recipe ratings by user. |
| `/api/user/recipe-images/upload` | `POST` | `session_user` | Upload route for recipe image assets. |

## Creator Surfaces

| Route | Methods | Auth | Notes |
|---|---|---|---|
| `/api/creator/onboarding` | `GET`,`POST` | `public`/`session_user` | Creator onboarding status + submit flow. |
| `/api/creator/submissions` | `GET`,`POST` | `session_user` | Creator submission listing and create. |
| `/api/creator/submissions/[id]` | `PATCH` | `session_user` | Edit/withdraw/update submission details. |
| `/api/creator/assist` | `POST` | `session_user` | Creator assist tooling endpoint. |
| `/api/creator/recipe-import` | `POST` | `session_user` | Recipe import/parsing route. |

## Admin

| Route | Methods | Auth | Notes |
|---|---|---|---|
| `/api/admin/submissions` | `GET` | `admin_guard` | Moderation queue listing for creator submissions. |
| `/api/admin/submissions/[id]/approve` | `POST` | `admin_guard` | Approve a submission. |
| `/api/admin/submissions/[id]/reject` | `POST` | `admin_guard` | Reject a submission. |
| `/api/admin/submissions/[id]/request-changes` | `POST` | `admin_guard` | Request revisions from creator. |
| `/api/admin/articles/moderation` | `GET` | `admin_guard` | Moderation queue for article entities. |
| `/api/admin/articles/moderation/[id]/approve` | `POST` | `admin_guard` | Approve moderated article. |
| `/api/admin/articles/moderation/[id]/reject` | `POST` | `admin_guard` | Reject moderated article. |
| `/api/admin/articles/moderation/[id]/restore` | `POST` | `admin_guard` | Restore moderated article. |
| `/api/admin/rss-feeds` | `GET`,`POST` | `admin_guard` | RSS feed registry list/create. |
| `/api/admin/rss-feeds/[id]` | `PATCH`,`DELETE` | `admin_guard` | RSS feed update/delete. |
| `/api/admin/feedback` | `GET` | `admin_guard` | Site feedback review queue. |
| `/api/admin/cron/ingest-logs` | `GET` | `cron_secret` | Ingest run observability and category-level outcomes. |

## Cron Jobs

| Route | Methods | Auth | Notes |
|---|---|---|---|
| `/api/cron/scheduler` | `GET` | `cron_secret` | Category stock/freshness checks and ingest dispatch. |
| `/api/cron/tagger` | `GET` | `cron_secret` | Batch article enrichment/tagging. |
| `/api/cron/cleanup` | `GET` | `cron_secret` | Cleanup maintenance task. |
| `/api/cron/games` | `GET` | `cron_secret` | Game pool maintenance. |
| `/api/cron/engagement-health` | `GET` | `cron_secret` | Engagement + freshness health checks. |
| `/api/cron/affinity-refresh` | `GET` | `cron_secret` | Affinity/materialized signals refresh. |

## Games

| Route | Methods | Auth | Notes |
|---|---|---|---|
| `/api/game/sudoku` | `GET` | `public` | Sudoku puzzle generation/fetch. |
| `/api/game/killer-sudoku` | `GET` | `public` | Killer Sudoku generation/fetch. |
| `/api/game/word-search` | `GET` | `public` | Word search generation/fetch. |
| `/api/game/nonogram` | `GET` | `public` | Nonogram generation/fetch. |
| `/api/game/crossword` | `GET` | `public` | Crossword generation/fetch. |
| `/api/game/connections` | `GET` | `public` | Connections puzzle generation/fetch (daily-aware). |
| `/api/game/rabbit-hole` | `GET` | `public` | Rabbit Hole puzzle generation/fetch. |
| `/api/game/wiki-read` | `GET` | `public` | External wiki read helper for gameplay context. |

## Content, Feedback, And Legal

| Route | Methods | Auth | Notes |
|---|---|---|---|
| `/api/articles/search` | `GET` | `public` | Article search endpoint. |
| `/api/articles/translate` | `POST` | `session_user` | Translation helper endpoint. |
| `/api/news` | `GET` | `public` | News listing endpoint for non-feed surfaces. |
| `/api/feedback` | `POST` | `public` | User feedback submission. |
| `/api/legal/terms-accept` | `POST` | `session_user` | Persist terms-accept state. |

## Webhooks

| Route | Methods | Auth | Notes |
|---|---|---|---|
| `/api/webhooks/twilio/status` | `POST`,`GET` | `public` with signature/token validation | Twilio status callback + diagnostics path. |

## Request/Response Shape Notes

Exact route payload contracts live in each route’s schema and handler:

- Input validation: `zod` schemas and `parseJsonBody(...)`
- Error shaping: `apiErrorResponse(...)` from `lib/api/errors.ts`
- Session auth helper: `getSessionUserId(...)` from `lib/api/sessionUser.ts`
- Admin guard: `requireAdmin(...)` from `lib/api/adminAuth.ts`
- Cron auth guard: `isAuthorizedCronRequest(...)` from `lib/cron/verifyRequest.ts`

When adding or changing routes, update this file and regenerate inventory with:

`npx tsx scripts/security-route-inventory.ts`
