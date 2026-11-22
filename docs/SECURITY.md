# Security

**Status:** production Supabase schema and grants are verified. Vercel secrets and the website's live database connection are not verified.

## Capability and public access

- Each session uses a 32-byte random management token; only its SHA-256 verifier is stored.
- The token is held in a session-specific HttpOnly, SameSite=Strict cookie (Secure in production), never a URL or browser-readable storage.
- Recovery uses a separate one-time code. Recovery rotates the management verifier; code rotation invalidates the earlier recovery code.
- A separate random public ID provides a narrow, read-only party projection. It cannot manage the session or read the participant roster.

## Server and database boundary

`src/lib/supabase/admin.ts` is server-only and reads `SUPABASE_SERVICE_ROLE_KEY`. Never expose this value to browser code or use a `NEXT_PUBLIC_` variable.

All five hosted public tables have RLS enabled. Direct table access is unavailable to `anon` and `authenticated`; the approved application RPCs are executable by `service_role` only. Security-definer functions use an empty fixed `search_path` and qualified names. Server-side capability checks remain mandatory for every management operation.

Draws lock the round, use rejection-sampled `pgcrypto` randomness, and commit results transactionally. Unique constraints prevent duplicate participants and request positions within a round; request keys make retries idempotent.

## Rate limits and retention

The server HMACs the trusted forwarded client address; only the derived key is stored. Limits cover session creation, management, public reads, and recovery. Vercel's forwarded client-IP header is used by default. Expired session data is purged by a bearer-protected endpoint scheduled daily in `vercel.json`.

## Verification and remaining risk

Local checks pass: 22 pgTAP assertions, 20-request concurrent drawing integration, lint, TypeScript, unit tests, and production build. Hosted Supabase smoke checks passed session isolation, 20 unique draws, public projection, recovery-code rotation, rejection of the old recovery code, and renewed management access; temporary test rows were removed. Health advisor is clean; the remaining RLS notices are informational because the app is server-only.

The public URL currently serves the landing page, but Vercel's production environment variables are not verified. Session creation, HTTPS cookie behavior, scheduled cron execution, and live browser isolation remain unverified until Vercel is configured and redeployed.
