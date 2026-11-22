# Architecture

**Status:** anonymous-session architecture and the production Supabase schema are in place. The public Vercel landing page is live; its session backend has not been verified.

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

The browser's latest session ID and the management capability are held in separate HttpOnly cookies; only the capability authorizes access. Management activity refreshes the 30-day idle expiry and 60-day recovery/purge deadline. Public reads do not extend either deadline. A recovery code can be used once to rotate management access without unarchiving a session; owners can replace a saved recovery code, invalidating the previous one. Rate limits apply per session and globally per HMAC-derived client key. The protected `/api/cron/purge` route calls the transactional database purge; `vercel.json` schedules it daily at 00:17 UTC. Expired sessions and their participants, snapshots, rounds, and results are removed after the recovery window.

## Deployment and verification

The source is in the public GitHub repository. Vercel Production at `https://bunot-bunot-lemon.vercel.app` runs from `feat/anonymous-bunutan-platform` at commit `1bc352b`, with all four runtime variables configured. The active production Supabase project has all four checked-in migrations applied.

Verification: 22 pgTAP checks, a 20-request concurrent-draw integration test, lint, TypeScript, unit tests, and the production build pass locally. A hosted Supabase transaction smoke test passed 20 unique draws, session isolation, public projection, and recovery-code rotation; test data was removed. The Vercel production draw flow and public read-only display passed at commit `1bc352b`; scheduled cron execution remains unverified.
