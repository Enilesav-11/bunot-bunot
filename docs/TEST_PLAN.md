# Verification plan and results

**Status:** local, hosted database, and core production browser checks pass; recovery, live isolation, device layout, and scheduled cron remain unverified.

## Automated checks

| Check | Coverage | Result |
|---|---|---|
| Unit tests | Participant text and CSV parsing, spreadsheet formula safety | 4 passing |
| pgTAP | RLS/grants, capability isolation, duplicate names, roster lock, retry idempotency, unique selection, round completion, rate limits, recovery, expiry, purge | 22 passing |
| Local integration | Session isolation, 20 concurrent draws, recovery rotation, public projection, browser table denial | Passing; 20 unique participant IDs |
| Lint and TypeScript | App source | Passed |
| Production build | Next.js optimized build | Passed |
| Hosted Supabase smoke | Session isolation, 20 unique draws, completion/public projection, recovery-code rotation and invalidation | Passed; temporary records removed |
| Vercel production browser | Anonymous session, three unique draws, refresh persistence, independent read-only party display | Passed at commit `1bc352b`; temporary session and results deleted |

## Browser journey completed locally

- Opened the landing page without an account prompt.
- Created a session and saved the one-time recovery code.
- Added four participants, including duplicate display names; the roster preserved distinct IDs.
- Drew all four participants and confirmed the round completed at zero remaining.
- Opened the read-only party display.

## Live site check

- `https://bunot-bunot-lemon.vercel.app` serves the public landing page and creates bunutans without sign-in.
- Three live participants were each drawn once; the round completed at zero remaining and survived refresh.
- An independent Edge browser displayed the latest result and remaining count with no management controls. The temporary session was deleted afterward; its public link no longer resolves.
- `/api/cron/purge` returns 401 without a valid bearer secret.
- GitHub Actions `app` and `database` checks pass for the published recovery branch. Its Vercel Preview requires Vercel login and is not publicly accessible.

## Not verified yet

- Live recovery in a second browser, cross-session isolation, HTTPS cookie attributes, scheduled Vercel cron execution, and runtime logs.
- Phone/tablet visual layout and projector fullscreen in an independent browser.
- Preview journey outside the Vercel-authenticated project context.
