# Architecture

**Status:** anonymous-session architecture is implemented locally. No Git remote, production Supabase project, Vercel project, or public URL is configured; deployment remains outstanding.

## Runtime and trust boundaries

- Next.js App Router, React, TypeScript, Tailwind CSS, Supabase, and PostgreSQL.
- The browser uses Next.js Server Actions for session creation and management. The browser has no Supabase client or Auth SDK.
- Server-only modules call PostgreSQL RPCs with `SUPABASE_SERVICE_ROLE_KEY`. Every management RPC validates the session capability in the database; public presentation uses a separate projection RPC.
- `/sessions/[sessionId]` is the management page. `/p/[publicId]` is read-only. The UUID management route and opaque presentation ID are separate identifiers.

```text
Management browser ── HttpOnly capability cookie ──> Next.js Server Actions
                                                      └─ service-role RPCs ──> PostgreSQL
Party display ── opaque public ID ──> Next.js page ── approved projection RPC ──┘
```

PostgreSQL tables have RLS enabled. Direct table and function access is revoked from `anon`, `authenticated`, and `public`; the application calls approved functions as `service_role`. The presentation function is also service-role-only, so no database credential or RPC is exposed to a public browser.

## Session and drawing

Creation generates a UUID session ID, an independent random public ID, a 32-byte management capability, and a one-time recovery code. Only SHA-256 verifiers for management and recovery secrets are persisted. The raw management capability is returned only as a session-specific HttpOnly cookie; the recovery code is displayed once for backup.

Each round snapshots participant IDs and names. The draw RPC locks the round, replays a matching request key, or selects an undrawn snapshot entry using rejection-sampled 64-bit `pgcrypto` randomness. Unique constraints on round participant, draw order, and request key prevent duplicate results and make retries idempotent.

## Expiry and recovery

The browser's latest session ID and the management capability are held in separate HttpOnly cookies; only the capability authorizes access. Management activity refreshes the 30-day idle expiry and 60-day recovery/purge deadline. Public reads do not extend either deadline. A recovery code can be used once to rotate management access without unarchiving a session. Rate limits apply per session and globally per HMAC-derived client key. The protected `/api/cron/purge` route calls the transactional database purge; `vercel.json` schedules it daily at 00:17 UTC. Expired sessions and their participants, snapshots, rounds, and results are removed after the recovery window.

## Deployment and verification

The local project is not publicly deployed. Production setup still needs a GitHub remote, production Supabase project with the migration applied, Vercel project, server environment variables (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `RATE_LIMIT_SECRET`, `CRON_SECRET`), and live-URL verification. Do not describe the app as deployed until that succeeds.

Local verification reported: 12 pgTAP database checks, a 20-request concurrent-draw integration test, and lint, type, unit, and production-build checks passed. This does not verify a remote database or deployment.
