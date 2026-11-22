# Project status

**Phase:** public landing page live; production bunutan backend not connected through Vercel

**Updated:** 2026-11-22

## Implemented

- Public Paskong Pinoy landing page using Marshmallow `#fffbe9`, Ribbon `#8f0500`, Garland `#044529`, Sugar Cookie `#ffecc5`, and Hot Cacao `#562400`.
- No accounts, sign-in, registration, user profiles, or authenticated dashboard.
- Anonymous sessions with session-specific HttpOnly management cookies, hashed one-time recovery codes, separate public display IDs, and expiry/recovery windows.
- Participant add/edit/remove/search, bulk paste and CSV import, duplicate-name identification, settings, draw history, CSV exports, and read-only projector display.
- PostgreSQL drawing is server-controlled, transaction-safe, concurrency-safe, and protected by session capability checks, rate limits, RLS, and unique constraints.
- All four migrations are applied to the active production Bunot Supabase project. Recovery-code rotation and the missing participant FK index are included.

## Verification

- `npm run lint`, `npx tsc --noEmit`, `npm test` (4 tests), and `npm run build` pass.
- `npx supabase test db`: 22 pgTAP assertions pass.
- Local integration test passes session isolation, 20 concurrent unique draws, public projection, and recovery rotation.
- Local browser smoke flow passed: create session, add duplicate names, draw all participants, and open the public display.
- Hosted Supabase smoke transaction passed session isolation, 20 unique draws, completed-round/public projection checks, recovery-code rotation, old-code invalidation, and renewed management access. Temporary records were removed.
- `https://bunot-bunot-lemon.vercel.app` returns HTTP 200 with the Bunot landing page. Unauthorized requests to `/api/cron/purge` return 401 as intended.

## Hosting and blockers

The public source repository is [Enilesav-11/bunot-bunot](https://github.com/Enilesav-11/bunot-bunot). Recovery work is published on `codex/production-recovery` at commit `af7d0b2`; the repository default remains `feat/anonymous-bunutan-platform`. Vercel settings, production environment variables, deployed branch, and deployed commit could not be inspected. The landing page responds, but no production session has been created through the website.

GitHub's `app` and `database` checks passed on the published branch. Vercel produced a Preview deployment, but the URL returns Vercel's login page without project authorization; it is not a public substitute for the production site.

The production Supabase project is active in the approved Free organization in Singapore. Hosted checks confirm RLS on all five application tables, no direct table privileges for `anon` or `authenticated`, and `service_role`-only execution for app RPCs. Health advisor is clean. Remaining RLS-without-policy notices are informational for the server-only RPC model; the two remaining unindexed-FK notices have existing leading-column indexes. Unused-index notices are expected on an empty project.

Vercel Production still needs `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `RATE_LIMIT_SECRET`, and `CRON_SECRET`. The service-role key must be copied directly from Supabase to Vercel's sensitive environment-variable form; do not share or commit it. Redeploy after setting the variables.

`WARDROBE Production` remains `INACTIVE`. Supabase rejected the restore because the owner has reached the two-active-Free-project limit. No other project was paused and no paid plan was selected. Restoring requires a free active-project slot or owner approval for paid capacity.

## Remaining checks

- Configure Vercel production variables and redeploy the intended production branch.
- Verify session creation, participant management, drawing, refresh, recovery, public sharing, isolation, and HTTPS cookies through the live website and an independent browser.
- Confirm Vercel cron execution, production logs, and mobile/tablet presentation layouts.
- Confirm the Vercel environment variables and production branch before merging this recovery branch or changing the production deployment.
