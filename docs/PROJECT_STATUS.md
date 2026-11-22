# Project status

**Phase:** implementation complete; production setup blocked on hosting access
**Updated:** 2026-11-22

## Implemented

- Public Paskong Pinoy landing page with the supplied palette: Marshmallow `#fffbe9`, Ribbon `#8f0500`, Garland `#044529`, Sugar Cookie `#ffecc5`, and Hot Cacao `#562400`.
- No account pages, registration, login, password reset, organizer dashboard, auth middleware, or browser Supabase client.
- Anonymous bunutan sessions with a private HttpOnly management cookie, hashed one-time recovery code, independent public display ID, 30-day idle expiry, and 60-day recovery retention.
- Same-browser resume link after landing-page refresh; session ID and management capability use separate HttpOnly cookies.
- Participant add/edit/remove/search, bulk paste and CSV import, duplicate-name identification, session settings, round history, participant/results CSV exports, and read-only projector display.
- PostgreSQL functions validate capabilities, lock the session/round, use unbiased cryptographic selection, enforce unique results and retry idempotency, rate-limit both per session and globally, and prevent direct browser table access. A protected cleanup endpoint and daily Vercel cron configuration are included.
- Documentation, local Supabase configuration, CI database tests, and production environment-variable examples updated.

## Verification completed

- `npm run lint`, `npx tsc --noEmit`, and `npm test` (4 unit tests) pass.
- `npx supabase test db` passes 19 pgTAP assertions, including global rate limits, archived recovery, expiry, and purge.
- The local integration test creates independent sessions, checks cross-session access denial, runs 20 concurrent draws, verifies all participant IDs are unique, checks the read-only public projection, and verifies recovery rotates the management capability.
- Browser journey on `http://localhost:3000`: create session, add four names including a duplicate, draw all four, and open the public display. The local smoke session remains in the local database and the browser tab is on its read-only display.

## Hosting status

The source is pushed to the public [Enilesav-11/bunot-bunot](https://github.com/Enilesav-11/bunot-bunot) repository on `feat/anonymous-bunutan-platform`. No public URL exists and no production deployment has been claimed.

Production setup is blocked in two places. Supabase rejected creation in the approved organization because its free-project limit is reached; existing unrelated projects were not changed. Vercel can read the `Enilesav` team, but its project-creation request returned `403 Forbidden`; no Vercel project or deployment exists. The Vercel CLI is not installed. Once hosting access is resolved, create the dedicated Supabase project, connect the GitHub repository to Vercel, configure `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `RATE_LIMIT_SECRET`, and `CRON_SECRET`, apply the migration, then verify the resulting HTTPS URL from an independent device.

## Remaining checks

- Verify CSV downloads, the refreshed-home resume link, recovery through the actual browser form, and responsive layouts on phone/tablet.
- Verify the cleanup endpoint with a production cron request and confirm production RLS/service-role configuration.
- Add approved reference photography if desired; the supplied photo references are not present as usable project assets.
