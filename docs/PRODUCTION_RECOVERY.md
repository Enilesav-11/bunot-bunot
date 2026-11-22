# Production recovery

**Updated:** 2026-11-23
**Status:** production backend is deployed and the core live bunutan flow is verified.

## Confirmed state

- Vercel Production is Ready at `https://bunot-bunot-lemon.vercel.app`, branch `feat/anonymous-bunutan-platform`, commit `1bc352b`. The public site serves over HTTPS.
- All four runtime variables are set for Production. Production creates sessions and completes draws against Supabase. The Supabase server key was rotated; the previous key was revoked after verification.
- Live browser test passed without sign-in: create a session, add three participants, draw all three once, reach zero remaining, and refresh with results intact. An independent Edge browser showed the latest result in the read-only public display with no management controls.
- The test bunutan was archived and then deleted with its participants and draw history. A database check confirmed zero remaining rows; its public link no longer resolves.
- `GET /api/cron/purge` returns 401 without a bearer token, as intended. The scheduled cron execution itself has not been verified.
- GitHub Actions `app` and `database` checks passed for the recovery branch. Vercel Preview is access-protected; production is public.
- Supabase project `bunot-bunot` (`ipmwdrtjskihipaheuuo`) is `ACTIVE_HEALTHY` in the approved Free organization, Singapore. Four checked-in migrations are applied. All five app tables have RLS enabled, no direct table privileges for `anon` or `authenticated`, and app RPC execution is limited to `service_role`.
- Hosted database smoke checks passed separate-session capability isolation, 20 participant inserts and unique draws, completed-round and public projection checks, recovery-code rotation, rejection of the old code, and renewed management access. The transaction removed all temporary records.
- Health advisor is clean. RLS-without-policy notices are expected for the server-only RPC model. Two FK notices are covered by existing leading-column indexes; empty-project unused-index warnings do not indicate a workload issue.
- The GitHub repository is public; its default and Vercel production branch is `feat/anonymous-bunutan-platform`.
- `.env.local` points to local Supabase. Credential values were not read or copied.
- `WARDROBE Production` (`qvucctetggwlxqqgfear`) is `INACTIVE`. Restore was attempted and Supabase denied it because the owner reached the two-active-Free-project limit. No other project was paused or upgraded.

## Vercel production variables

| Variable | Value/source | Setting |
|---|---|---|
| `SUPABASE_URL` | Bunot Supabase project | Set in Production |
| `SUPABASE_SERVICE_ROLE_KEY` | Rotated Supabase secret key | Set in Production; keep secret |
| `RATE_LIMIT_SECRET` | Fresh random value of at least 32 bytes | Set in Production; keep secret |
| `CRON_SECRET` | Separate fresh random value | Set in Production; keep secret |
| `TRUSTED_CLIENT_IP_HEADER` | Leave unset on Vercel | Optional override only |
| `SUPABASE_ANON_KEY` | Local integration test only | Not required at runtime on Vercel |

Never put the service-role key in chat, source control, a `NEXT_PUBLIC_` variable, or a browser bundle. The current production deployment includes the rotated key.

## Remaining deployment steps

1. Test recovery-code use in a second browser and isolation between two live sessions.
2. Verify HTTPS cookie attributes, Vercel runtime logs, scheduled purge execution, and phone/tablet/projector layouts.

## WARDROBE restore blocker

Supabase Free allows two active projects for this owner across organizations. Bunot occupies one slot; restoring WARDROBE requires another free slot or a paid plan. This request forbids pausing another production service and does not approve paid changes. Leave WARDROBE inactive until an owner frees capacity or explicitly approves the paid route.
