# Production recovery

**Updated:** 2026-11-22
**Status:** hosted Supabase is ready and smoke-tested; Vercel's bunutan backend is not configured.

## Confirmed state

- `https://bunot-bunot-lemon.vercel.app` serves the Bunot landing page (HTTP 200). The purge endpoint returns 401 without a bearer token, as intended. No live website bunutan has been run.
- GitHub Actions `app` and `database` checks passed for the recovery branch. Vercel created a Preview deployment, but it shows a Vercel login screen to an unauthenticated visitor.
- Supabase project `bunot-bunot` (`ipmwdrtjskihipaheuuo`) is `ACTIVE_HEALTHY` in the approved Free organization, Singapore. Four checked-in migrations are applied. All five app tables have RLS enabled, no direct table privileges for `anon` or `authenticated`, and app RPC execution is limited to `service_role`.
- Hosted database smoke checks passed separate-session capability isolation, 20 participant inserts and unique draws, completed-round and public projection checks, recovery-code rotation, rejection of the old code, and renewed management access. The transaction removed all temporary records.
- Health advisor is clean. RLS-without-policy notices are expected for the server-only RPC model. Two FK notices are covered by existing leading-column indexes; empty-project unused-index warnings do not indicate a workload issue.
- Vercel settings and production variables are inaccessible in this session. The GitHub repository is public; its default branch is `feat/anonymous-bunutan-platform`. The current Vercel production branch and deployed commit are unknown.
- `.env.local` points to local Supabase. Credential values were not read or copied.
- `WARDROBE Production` (`qvucctetggwlxqqgfear`) is `INACTIVE`. Restore was attempted and Supabase denied it because the owner reached the two-active-Free-project limit. No other project was paused or upgraded.

## Vercel production variables

| Variable | Value/source | Setting |
|---|---|---|
| `SUPABASE_URL` | `https://ipmwdrtjskihipaheuuo.supabase.co` | Production |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase project API keys | Production; paste directly as a sensitive value |
| `RATE_LIMIT_SECRET` | Fresh random value of at least 32 bytes | Production; keep secret |
| `CRON_SECRET` | A separate fresh random value | Production; keep secret |
| `TRUSTED_CLIENT_IP_HEADER` | Leave unset on Vercel | Optional override only |
| `SUPABASE_ANON_KEY` | Local integration test only | Not required at runtime on Vercel |

Never put the service-role key in chat, source control, a `NEXT_PUBLIC_` variable, or a browser bundle. Vercel environment changes require a new deployment.

## Remaining deployment steps

1. In Vercel, confirm the linked repository and production branch. Add the four Production variables above through the sensitive environment-variable form.
2. Redeploy the intended production branch.
3. From an independent browser, create a bunutan, manage participants, draw all names, refresh, recover from a backup code, and open its public display. Confirm a second session cannot manage it.
4. Verify HTTPS cookies, Vercel runtime logs, and the scheduled purge execution. Keep test data clearly named and remove it afterward.

## WARDROBE restore blocker

Supabase Free allows two active projects for this owner across organizations. Bunot occupies one slot; restoring WARDROBE requires another free slot or a paid plan. This request forbids pausing another production service and does not approve paid changes. Leave WARDROBE inactive until an owner frees capacity or explicitly approves the paid route.
