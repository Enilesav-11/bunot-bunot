# Application interfaces

**Status:** describes the current local implementation. Management operations use Next.js Server Actions, not a public REST API. Their framework transport is not a stable third-party API contract.

## Pages and routes

| Route | Access and behavior |
|---|---|
| `/` | Public landing page. `createSession` starts a bunutan without an account. |
| `/sessions/[sessionId]` | Management page. Reads and mutations require the session-specific management cookie. Without valid access, the page offers recovery. |
| `/sessions/[sessionId]/export?kind=participants\|results` | CSV download guarded by the same management cookie. Invalid ID, kind, or access returns `404`. Responses are private and non-cacheable. |
| `/p/[publicId]` | Read-only party display. Server-side lookup returns only event name/status, round number/status, latest revealed name, draw order, and participant counts. Invalid or expired links return not found. |
| `GET /api/cron/purge` | Scheduled cleanup only. Requires `Authorization: Bearer <CRON_SECRET>`; unauthorized requests return `401`. Vercel schedule is daily at 00:17 UTC. |

There is no browser-facing session REST endpoint and no anonymous Supabase RPC. Server routes and actions use a server-only client and service-role database functions.

## Server Actions

Actions on an existing session are bound to its ID and require the matching HttpOnly cookie; `createSession` creates access, and `recoverSession` exchanges the one-time recovery code for new access. Management RPCs revalidate capability, session status, and expiry.

| Action | Behavior |
|---|---|
| `createSession()` | Creates a session with default name `Christmas Party Bunutan`; sets the management cookie; returns the session ID and one-time recovery code. |
| `refreshSessionAccess(id)` | Validates session access and refreshes the cookie. |
| `updateSession(id, form)` | Updates event name (1–120 characters) and optional description (up to 2,000 characters). |
| `addParticipants(id, state, form)` | Adds pasted names or CSV. CSV maximum 1 MB; maximum 500 names per submission and 5,000 participants per session. Names are 1–120 characters; duplicate names remain distinct participants. |
| `updateParticipant(id, participantId, form)` / `removeParticipant(id, participantId)` | Edit or soft-remove a participant. Participant changes are rejected during an in-progress round. |
| `startRound(id)` | Starts a round and snapshots currently active participants. Repeated start while a round is active returns that round. |
| `drawNext(id, roundId, requestKey)` | Requests the next server-selected result. A UUID request key makes retries idempotent; returns the saved result, remaining count, round status, and replay indicator. |
| `archiveSession(id)` | Archives the session when no round is in progress. |
| `recoverSession(id, state, form)` | Exchanges a valid one-time recovery code for a rotated management cookie. Recovery code format is five groups of four hexadecimal characters. |

Action failures are returned as user-facing form/draw errors or handled by page redirects; Server Actions do not promise a separate REST status-code contract.

## Database functions

The server calls `create_bunutan_session`, `get_bunutan_session`, `update_bunutan_session`, `add_bunutan_participants`, `update_bunutan_participant`, `remove_bunutan_participant`, `start_bunutan_round`, `draw_bunutan_next`, `get_public_bunutan`, `recover_bunutan_session`, `archive_bunutan_session`, and `purge_expired_bunutan_sessions`. All are granted to `service_role` only. Management functions receive the session capability internally; public presentation receives only the public ID and returns the approved projection.

Production Supabase, Vercel credentials, and a public URL are not configured, so this document describes implemented local behavior rather than a live service contract.
