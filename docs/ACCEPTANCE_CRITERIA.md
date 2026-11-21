# Bunot-Bunot Acceptance Criteria

**Status:** local anonymous-session implementation; production URL and remaining device/recovery checks are pending.

## Public entry and session creation

- Landing page opens without an account and offers **Start a Bunutan** as its primary action.
- Starting creates a persistent, isolated session and takes the visitor directly to its participant screen; no login, registration, or email step appears.
- Session creation stores an internal ID, separate public ID, status, and timestamps without personal information.
- A session can be renamed and described; session state survives page refresh.

## Capability security and sharing

- The server generates a cryptographically random management capability and stores only a one-way verifier.
- The raw capability is held in a protected browser cookie, never returned in JSON or placed in a URL.
- Every sensitive operation validates the capability server-side. Missing, invalid, expired, and cross-session capabilities cannot read or change private data.
- Public display IDs grant read-only access to the allowed event/reveal/remaining-count projection; they cannot read the roster or perform writes/draws.
- Recovery code/backup restores an owner's management access in a different browser without exposing the management capability in a shareable URL.
- Anonymous and public roles have no direct access to private session tables or unrestricted writes; service-role credentials never reach browser code.
- Creation and capability-verification endpoints have rate limits; session expiration and cleanup are configured and tested.

## Session isolation and roster

- Two independent browser visitors create concurrent sessions; each sees and changes only its own roster and results.
- Owner can add, paste/import, search, edit, and remove participants before a round starts.
- Validation rejects blank/oversized names and malformed/oversized CSV with no unintended partial writes.
- Duplicate display names remain distinct participant records and receive a clear notice.
- Session expiration/archive prevents new edits and draws while applying the documented recovery and retention policy.

## Drawing integrity

- Selection is server-side using cryptographically secure unbiased randomness; client random values are never authoritative.
- For 20 participants, 20 successful draws yield each participant exactly once and zero remaining.
- Concurrent requests and repeated request keys cannot create duplicate results or consume extra participants.
- Each result stores participant snapshot, round, draw order, and draw time; refresh restores committed state.
- A new round keeps previous results intact. Unauthorized, failed, and exhausted-round requests create no result.
- Reveal animation starts only after the persisted result returns successfully.

## Presentation, recovery, and deployment

- Owner can create/copy a public display link; public viewers cannot change the session.
- Presentation mode works on a projector and mobile operator screen, exposes only approved fields, and respects reduced-motion settings.
- Same-browser recovery and recovery-code flow work after refresh, close/reopen, and in a second browser.
- CI covers isolation, capability checks, public projection, recovery, expiration, concurrency, and round persistence.
- Production URL is verified over HTTPS from a browser outside the developer's computer before deployment is claimed.
