# Scaling considerations

**Disclaimer:** There is **no current plan or commitment to scale** infrastructure for multi-instance or high-traffic deployment. Gentle Stream today runs as a **single deployment**. This document exists only to **think through** how the app would behave and what to watch for if requirements change later.

---

## Why the current session model is instance-friendly

Supabase session validation uses **signed tokens in HTTP cookies**. Any app instance with the same environment keys can call `getUser()` / refresh without **sticky sessions** (affinity to one server). The app-specific **`gs_sess_start`** cookie is **opaque** and evaluated the same on every instance.

Relevant code paths: `lib/supabase/server.ts`, `lib/supabase/middleware.ts`, `lib/supabase/response-client.ts`, `lib/auth/session-policy.ts`.

---

## Best practices and things to consider

- **Avoid per-request hot database paths:** Cache read-heavy, low-risk data (feature flags, public config, CDN’d static assets). For user-specific data, short-TTL caches keyed by `userId` in **Redis / Upstash** (or similar), with explicit invalidation on writes, can reduce Supabase load as traffic grows.

- **Session revocation at scale:** JWTs are stateless. **Force logout everywhere** may require a **session version / id in the database**, a **denylist in Redis**, or shorter JWT TTL plus refresh. The wall-clock session cap enforced via `gs_sess_start` is an **additional** policy, not a substitute for global revocation.

- **Rate limiting and abuse:** Centralize counters (**Redis**) so all instances share limits (e.g. per IP and per user id). In-memory limits only help one process.

- **WebSockets / realtime:** If added later, they often need **sticky routing** or a **shared pub/sub** layer—different constraints than plain REST behind a load balancer.

- **Edge vs Node:** Public pages may benefit from **edge caching**; authenticated routes usually stay dynamic. Avoid caching personalized HTML at a CDN without careful `Vary` / cookie rules.

- **Database cost and latency:** Use connection pooling (Supabase pooler), batch reads, avoid N+1 in feed generation, and consider **read replicas** when the hosting plan allows.

---

## Possible next steps (only if scaling becomes a real requirement)

Introduce Redis (or equivalent) for cache and rate limits; add a **session version** column or similar for forced logout; load **analytics** only after consent is read client-side; add **observability** (latency, DB time per route) before optimizing blindly.
