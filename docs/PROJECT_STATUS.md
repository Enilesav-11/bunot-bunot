# Project status

**Phase:** public anonymous bunutan live; production backend verified

**Updated:** 2026-11-23

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
- Production Vercel deployment is Ready at commit `1bc352b` on `feat/anonymous-bunutan-platform`. All four runtime variables are set for Production.
- Live Vercel flow passed without sign-in: create session, add three names, draw each exactly once, complete the round, refresh, and retain results. An independent Edge browser saw the read-only party display with zero remaining and no management controls. The test session and results were removed afterward.
- Supabase's production server key was rotated; the previous key was revoked after the live flow passed. No key value is stored in the repository.
- `https://bunot-bunot-lemon.vercel.app` serves the public site over HTTPS. `GET /api/cron/purge` without a bearer token returns 401 as intended.

## Hosting and blockers

The public source repository is [Enilesav-11/bunot-bunot](https://github.com/Enilesav-11/bunot-bunot). Recovery work is published on `codex/production-recovery`; production now tracks `feat/anonymous-bunutan-platform` at `1bc352b`. GitHub's `app` and `database` checks passed on the recovery branch. Vercel Preview remains access-protected; production is public.

The production Supabase project is active in the approved Free organization in Singapore. Hosted checks confirm RLS on all five application tables, no direct table privileges for `anon` or `authenticated`, and `service_role`-only execution for app RPCs. Health advisor is clean. Remaining RLS-without-policy notices are informational for the server-only RPC model; the two remaining unindexed-FK notices have existing leading-column indexes. Unused-index notices are expected on an empty project.

`WARDROBE Production` remains `INACTIVE`. Supabase rejected the restore because the owner has reached the two-active-Free-project limit. No other project was paused and no paid plan was selected. Restoring requires a free active-project slot or owner approval for paid capacity.

## Remaining checks

- Verify a recovery code in a second browser and isolation between two live sessions.
- Verify scheduled purge execution, production logs, HTTPS cookie attributes, and phone/tablet/projector layouts.
