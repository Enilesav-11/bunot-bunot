# Bunot-Bunot Product Requirements

**Status:** anonymous-session product implemented locally; production hosting and some device checks remain.
**Product:** Bunot-Bunot: Paskong Pinoy Edition

## Product outcome

Anyone can start a bunutan without an account, add names, draw fairly, keep results, and share a read-only party display. Each session is isolated and managed by a private browser capability.

## User modes

- **Session owner:** anonymous operator with a capability stored in a protected browser cookie; manages one bunutan.
- **Audience:** opens a separate public link to view the approved presentation only.
- **Visitor:** lands on the public site and can start immediately.

## Required first release

- Public landing page with a primary **Start a Bunutan** action. No sign-in, registration, password reset, or account dashboard.
- Starting creates a persistent session with a unique internal ID, random public display ID, creation/expiry timestamps, and a random management capability.
- Store only a one-way verifier for the management capability. Keep the raw capability in an HttpOnly, Secure-in-production, SameSite cookie; never put it in a URL or public response.
- Offer a separate recovery code or downloadable backup so a session can be recovered in another browser.
- Name and optionally describe the session; add, edit, search, remove, or bulk-import participants. Preserve equal names as separate participant IDs.
- Create numbered rounds; persist order and time; prevent repeated participants within a round, including concurrent requests.
- Keep completed results across refresh and later rounds. Export participant lists and draw history.
- Provide a separate, unguessable public presentation link. It exposes only approved display fields and grants no management access.
- Support desktop, mobile, tablet, and projector layouts with clear keyboard, loading, empty, success, and error states.

## Product rules

1. Session creation requires no personal information or account.
2. Every management request proves the session capability server-side; a public ID alone never authorizes a write.
3. Public presentation access is read-only and does not reveal the roster or capability.
4. Drawing is server-controlled and transactional. A round selects each eligible participant at most once.
5. Duplicate display names remain separate participants.
6. Refreshing the same browser restores the existing session; it must not create another session automatically.
7. Expired or archived sessions cannot accept new management changes or draws; their retention and purge period must be configured before production.

## Outside this release

Accounts, user profiles, multi-owner roles, guest accounts, invitations, notifications, prizes, payments, and subscription billing.

## Success measures

- A first-time visitor can start a session and begin adding names without encountering authentication.
- Two browser visitors can operate separate sessions without reading or changing each other's private data.
- A round with *N* participants yields *N* distinct committed results, even under concurrency or retry.
- Refresh preserves session and results; the recovery backup restores management access in a second browser.
- The public link displays the party state without allowing roster or draw changes.

## Constraints

- Preferred stack: Next.js App Router, TypeScript, Supabase/PostgreSQL, Vercel, and GitHub Actions.
- Keep participant data to display names and system-managed identifiers/status/timestamps.
- Never expose service-role credentials or management capabilities to public responses.
- The project mirror has no supplied photography. Use the existing parol artwork and add approved assets before production.
