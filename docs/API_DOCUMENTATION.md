# Application interfaces

**Status:** describes the local implementation. Online exchange routes and RPCs require the pending production migration. Management operations use Next.js Server Actions, not a public REST API. Their framework transport is not a stable third-party API contract.

## Pages and routes

| Route | Access and behavior |
|---|---|
| `/` | Public landing page. `createSession` starts a bunutan without an account. |
| `/sessions/[sessionId]` | Management page. Reads and mutations require the session-specific management cookie. Without valid access, the page offers recovery. |
| `/sessions/[sessionId]/export?kind=participants\|results` | CSV download guarded by the same management cookie. Invalid ID, kind, or access returns `404`. Responses are private and non-cacheable. |
| `/p/[publicId]` | Read-only party display. Server-side lookup returns only event name/status, round number/status, latest revealed name, draw order, and participant counts. Invalid or expired links return not found. |
| `/events/new` | Public online exchange setup. Creates an anonymous organizer capability and one-time recovery code. |
| `/e/[publicId]` | Read-only event details and confirmed count; exposes no participant names or assignments. |
| `/join#<invitation-token>` | Consumes one invitation token, replaces it with a participant capability, then removes the fragment from browser history. |
| `/participant` | Private participant portal, authenticated by a participant-specific HttpOnly cookie. |
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
| `rotateRecoveryCode(id)` | Replaces the current recovery code; the previous code becomes invalid. |
| `createOnlineEvent(state, form)` | Creates an asynchronous exchange with deadlines, time zone, optional budget, instructions, and wishlist setting. |
| `addGiftInvites(id, state, form)` / `updateGiftInvitation(id, participantId, form)` / `revokeGiftInvitation(id, participantId)` | Creates, edits, or revokes participant-specific invitations before roster lock. Invitation delivery remains manual through copied links. |
| `claimGiftInvitation(token)` / `confirmGiftParticipation(response)` | Claims one invitation on a device and records one participant's confirmation or decline. |
| `openGiftRegistration(id)` / `closeGiftRegistration(id)` / `revokeGiftInvitation(id, participantId)` | Controls registration and prevents revoked invitation links from being reused. Registration can reopen before its deadline. |
| `lockGiftRoster(id)` / `generateGiftAssignments(id)` | Locks confirmed participants and transactionally saves a validated one-to-one assignment round. |
| `saveGiftWishlist(state, form)` / `revealMyGiftAssignment()` | Saves the participant's optional wishlist or reveals only their saved recipient after the release time. |
| `getPublicOnlineEvent(publicId)` / `getParticipantPortal()` | Server-side reads return event-safe fields or the current participant's own portal data. |

Action failures are returned as user-facing form/draw errors or handled by page redirects; Server Actions do not promise a separate REST status-code contract.

## Database functions

The server calls `create_bunutan_session`, `get_bunutan_session`, `update_bunutan_session`, `add_bunutan_participants`, `update_bunutan_participant`, `remove_bunutan_participant`, `start_bunutan_round`, `draw_bunutan_next`, `get_public_bunutan`, `recover_bunutan_session`, `rotate_bunutan_recovery_code`, `archive_bunutan_session`, and `purge_expired_bunutan_sessions`. All are granted to `service_role` only. Management functions receive the session capability internally; public presentation receives only the public ID and returns the approved projection.

The public Vercel URL serves the account-free bunutan flow backed by the production Supabase schema. Live session creation, participant management, drawing, refresh persistence, and public read-only projection passed at commit `1bc352b`. The purge route rejects missing bearer credentials; scheduled execution remains unverified.
