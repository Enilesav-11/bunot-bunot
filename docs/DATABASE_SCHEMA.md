# Database schema

**Status:** implemented in the checked-in Supabase migrations. They have not been applied to a production project.

## Tables

| Table | Purpose and constraints |
|---|---|
| `public.bunutan_sessions` | UUID session ID; unique random `public_id`; event name/description; SHA-256 management and nullable recovery verifiers; `active`/`archived` status; activity, 30-day idle expiry, and 60-day recovery/purge timestamps. |
| `public.participants` | UUID participant ID, session FK, display name, `active`/`removed` status, timestamps. Names are not unique. |
| `public.draw_rounds` | Session FK, increasing round number, status/timestamps; unique `(session_id, round_number)` and at most one in-progress round per session. |
| `public.draw_round_participants` | Immutable per-round participant/name snapshot, linked to both the round and participant within the same session. |
| `public.draw_results` | Round/session/participant, draw order, UUID request key, timestamp; unique participant, order, and request key per round. |
| `private.rate_limits` | HMAC-derived key, scope, time window, and request count. Raw client addresses are not stored. |

Tables use foreign keys, checks, and lookup indexes. Historical rows use restrictive foreign keys; the purge function deletes dependent data in order within its transaction.

## Access and RPC boundary

RLS is enabled on every public table. Direct table access and function execution are revoked from `public`, `anon`, and `authenticated`; the migration grants required functions only to `service_role`. The Next.js server uses that key from a server-only module and supplies the management capability to each management RPC, which hashes and compares it against the session verifier. No client-side database access is part of the implementation.

`get_public_bunutan` accepts the separate public ID but is still service-role-only. It returns only the event name/status, current round state, latest revealed name, and counts. The public page calls it through the server; no anonymous database grant exists.

## Transaction rules

- `create_bunutan_session` validates and inserts the isolated session.
- Management functions validate capability, status, and expiry. Writes lock the session and refresh activity deadlines. Global and per-session rate limit buckets prevent enumeration and burst abuse.
- `start_bunutan_round` locks the session and snapshots active participants.
- `draw_bunutan_next` locks the round, returns an existing result for a repeated request key, otherwise selects and inserts a result atomically. Cryptographic selection uses 8 random bytes with rejection sampling to avoid modulo bias.
- Recovery locks the session, replaces the management verifier, clears the one-time recovery verifier, and restores access.
- `purge_expired_bunutan_sessions` removes sessions and dependent data once the 60-day recovery deadline passes, then clears old rate-limit buckets.

Local database verification reported 12 pgTAP checks. Production migration application and remote-policy verification remain outstanding.
