# Verification plan and results

**Status:** local build, database integrity, concurrency, and core browser journey pass; hosting and responsive checks remain open.

## Automated checks

| Check | Coverage | Result |
|---|---|---|
| Unit tests | Participant text and CSV parsing, spreadsheet formula safety | 4 passing |
| pgTAP | RLS/grants, capability isolation, duplicate names, roster lock, retry idempotency, unique selections, round completion, global limits, archive recovery, expiry and purge | 19 passing |
| Anonymous integration | Two isolated sessions, 20 concurrent draws, recovery rotation, narrow public projection, no browser table reads | Passing; 20 unique participant IDs |
| Lint and TypeScript | App source | Passed |
| Production build | Next.js optimized build | Passed |

Run these from the README. Database checks need local Supabase; the integration test also needs local URL, publishable key, and service-role key in the environment.

## Browser journey completed

- Opened the landing page without an account prompt.
- Created an anonymous session and saw the one-time recovery code.
- Added four participants, including two identical display names; the roster kept and marked them separately.
- Started a round and drew all four participants. Results persisted in order and the round completed at zero remaining.
- Opened the separate public display; it showed the latest saved name and remaining count without management controls or roster access.

## Not verified yet

- CSV download in a browser, the refreshed-home resume link, restoring through the recovery form, and phone/tablet layouts.
- Public access from an incognito browser or a second physical device.
- Production cron, hosted Supabase behavior, GitHub Actions, HTTPS, and deployment; no cloud project or public URL is configured.
