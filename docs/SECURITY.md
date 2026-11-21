# Security

**Status:** anonymous-session controls are implemented locally. Production credentials, hosting, and remote security have not been configured or verified.

## Capability and public access

- Session management uses 32 cryptographically random bytes in a URL-safe token. The server stores only its SHA-256 verifier.
- The raw token is carried in a session-specific `HttpOnly`, `SameSite=Strict` cookie (`Secure` in production; 30-day max age). It is not placed in a URL, client-readable storage, or management-action result.
- Management operations validate the capability against the session verifier and check session status/expiry. Recovery accepts a separate 80-bit code once, rotates the management verifier, and clears the recovery verifier.
- Public presentation uses an independent random public ID. Its server-rendered page calls a narrow projection function; it cannot manage the session or retrieve the roster. The RPC has no `anon` grant.

## Server and database boundary

`src/lib/supabase/admin.ts` is server-only and reads `SUPABASE_SERVICE_ROLE_KEY` from server environment. It disables persisted client auth state. Never move this key to a `NEXT_PUBLIC_` variable or browser bundle.

RLS is enabled on all public tables. Direct table and function privileges are revoked from `public`, `anon`, and `authenticated`; approved RPCs are granted to `service_role` only. Security-definer functions use an empty fixed `search_path` and qualified object names. The service-role boundary makes server-side capability validation essential: never add a route that accepts an unchecked session ID or bypasses the management RPCs.

Draws serialize on a row lock and commit the result with the round state. Rejection-sampled `pgcrypto` bytes avoid modulo bias; unique constraints prevent duplicate participants, positions, or request keys within a round. The request key makes retries return the committed result.

## Rate limits and retention

The server HMACs the forwarded client address with `RATE_LIMIT_SECRET`; only that derived key is stored. Database limits are 20 session creations per day, 240 management calls per minute per key globally plus 180 per session, 180 public calls per minute per key, and 20 recovery attempts per hour per key globally plus 8 per session. Production must run behind a trusted proxy that supplies the expected forwarding header.

Management activity extends the 30-day idle expiry and 60-day recovery/purge deadline. Public reads do not extend them. A bearer-protected `/api/cron/purge` handler invokes database cleanup; Vercel schedules it daily. The production `CRON_SECRET` and schedule still require deployment configuration.

## Verification and remaining work

Local verification reported 12 pgTAP checks, 20 concurrent draw requests without duplicate selections, and passing lint, type, unit, and build checks. No production database, deployment, or independent public-browser security check exists yet. Apply the migration to the production project and verify its grants, environment variables, HTTPS cookie behavior, cron authorization, session isolation, expiry, recovery, and live draw behavior before calling the service production-ready.
