# Bunot-Bunot User Flows

**Status:** public, account-free core flow is live and verified; recovery, live isolation, and device-specific checks remain.

## Start a bunutan

1. Visitor opens the landing page and selects **Start a Bunutan**.
2. The server creates an isolated session and sets its random management capability in a protected browser cookie.
3. The visitor lands on the new session's participant screen and names the event; description is optional.
4. Owner adds names individually, pastes a list, or imports CSV. The app validates the full batch, warns on repeats, and keeps equal names as distinct entries.
5. Owner reviews the roster, then starts a round.

## Draw and share

1. The session screen shows event name, roster count, round state, and remaining participants.
2. Owner requests one draw. The server verifies the capability and commits the draw transaction before the UI reveals it.
3. Retry and simultaneous requests cannot select the same participant twice. Failures show no winner and consume no participant.
4. Owner can open session results or copy the separate read-only party-display link.
5. Audience sees event identity, confirmed reveal, and remaining count; no management controls or full roster.
6. At zero remaining, the round completes. Owner may start a new round; earlier results remain unchanged.

## Session recovery and lifecycle

- The landing page keeps the latest session ID in an HttpOnly cookie and shows a resume link; the separate capability cookie grants management access.
- Owner can download or view a recovery backup once and use its recovery code in another browser to restore the management cookie.
- A session owner can rename, archive, or manage participants only with the capability; public display IDs never authorize changes.
- Expired sessions show a plain-language notice and follow the configured retention/recovery policy.

## Edge cases

- No roster: explain how to add names; prevent starting a round.
- Duplicate names: warn, preserve separate participant IDs.
- Invalid/oversized CSV: identify the problem; avoid partial unintended writes.
- Missing/invalid capability: do not reveal private session data; offer recovery or a new session.
- Expired session: reject changes and draws; explain whether recovery is still available.
- Database/network failure: show a retry message; never invent a result.
- Public link: return only the approved presentation projection and deny all management operations.
