# Project status

**Phase:** public landing page deployed; production database connection pending
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

The source is pushed to the public [Enilesav-11/bunot-bunot](https://github.com/Enilesav-11/bunot-bunot) repository on `feat/anonymous-bunutan-platform`. The public Vercel URL https://bunot-bunot-lemon.vercel.app returns HTTP 200 and serves the Bunot landing page; database-backed session creation and drawing have not been verified.

The Supabase production project is active in the approved free organization in Singapore. `WARDROBE Production` was paused at the user's direction to free a project slot. Both migrations are applied; all five public application tables have RLS enabled, and all 12 RPCs are executable only by `service_role`. The security advisor's RLS-without-policies notice is expected for this server-only RPC design; performance advisories note three unindexed foreign keys and two unused indexes on the empty database. The local `.env.local` Supabase URL still points to the local development API. Configure `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `RATE_LIMIT_SECRET`, and `CRON_SECRET` in Vercel, then verify session creation and drawing on the public URL.

## Remaining checks

- Verify CSV downloads, the refreshed-home resume link, recovery through the actual browser form, and responsive layouts on phone/tablet.
- Verify the cleanup endpoint with a production cron request and confirm production RLS/service-role configuration.
- Add approved reference photography if desired; the supplied photo references are not present as usable project assets.
