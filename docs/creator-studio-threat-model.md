# Creator Studio Threat Model

## Data Classification

- **Secrets (critical):** BYOK provider API keys, wrapped DEKs, key material metadata.
- **Sensitive content:** creator drafts, prompt context, memory session content.
- **Operational metadata:** token usage, model/provider selections, workflow IDs, fallback reasons.
- **Account/security events:** MFA step-up events, key lifecycle actions, memory export/delete.

## Trust Boundaries

- **Browser client:** untrusted input surface.
- **App server route handlers:** trusted orchestration boundary; enforces authz and redaction.
- **Supabase DB:** data persistence boundary; protected by RLS + server-side owner checks.
- **LLM providers:** external processors; only minimal required context should cross this boundary.

## Threats and Controls

- **Cross-tenant data access**
  - Enforce owner checks in every Creator API route.
  - RLS policies on all creator studio tables (`creator_settings`, `creator_provider_keys`, memory tables, audit table).
- **Secret exfiltration**
  - BYOK keys encrypted at rest (envelope encryption).
  - No plaintext key returned to client.
  - Log/tracing redaction by default.
- **Session hijack / CSRF**
  - Origin checks on mutating APIs.
  - Step-up TOTP for high-risk actions.
- **Prompt injection via memory/context**
  - Separate memory context lane from system/workflow lane.
  - Keep workflow instructions immutable server-side.
- **Cost abuse**
  - Per-request, daily, monthly limits.
  - Timeout/cancellation/retry policies with bounded fallback.

## Tenant Boundary Rules

- Every creator API must derive `userId` from session cookie auth, never from client payload.
- Every DB write/read for creator studio data must include `user_id = session_user_id`.
- Admin-only overrides require explicit admin auth path and audit logging.

## Audit Events (minimum)

- MFA step-up verified/failed for protected actions.
- BYOK create, rotate, revoke, delete, test-connection.
- Model mode changes (including max enable/disable).
- Memory export, memory deletion.

## Logging and Retention

- Do not log raw prompt/response by default.
- Debug logging must be explicit and short-lived.
- Memory has retention/TTL and user-level delete/export controls.
