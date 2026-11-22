# Bunot-Bunot

A public Paskong Pinoy bunutan. Visitors can create a session without an account, add names, draw in a transaction-safe round, and share a read-only party display.

## Run locally

1. Install Node.js 20.9 or newer and Docker Desktop.
2. Install packages with `npm ci`.
3. Start local Supabase: `npx supabase start --agent no --exclude storage-api,imgproxy,studio,edge-runtime,logflare,vector,supavisor,realtime,postgres-meta`.
4. Copy `.env.example` to `.env.local`. Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from local Supabase status. Create a random `RATE_LIMIT_SECRET` of at least 32 bytes. Set `SUPABASE_ANON_KEY` too when running the browser-permission integration check. Keep the service-role key server-only.
5. Apply the database: `npx supabase db reset` (local only).
6. Run `npm run dev` and open `http://localhost:3000`.

## Checks

- `npm run lint`
- `npx tsc --noEmit`
- `npm test`
- `npm run build`
- `npx supabase test db`
- `npm run test:concurrency` (requires local Supabase credentials in the environment)

## Production setup

Deploy the repository to Vercel and create a dedicated Supabase project. Configure `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `RATE_LIMIT_SECRET`, and `CRON_SECRET` in Vercel. Vercel's forwarded client-IP header is used for rate limits; on another host, set `TRUSTED_CLIENT_IP_HEADER` to a header overwritten by its trusted proxy. Apply all checked-in migrations to that dedicated project before publishing. The service-role key must never use a `NEXT_PUBLIC_` name or reach browser code.

The source is in the public [GitHub repository](https://github.com/Enilesav-11/bunot-bunot). A hosted Supabase project and Vercel deployment are still pending, so this is not yet a public website. See `docs/PROJECT_STATUS.md` for the blockers and remaining setup.

## Project notes

See `docs/` for product, design, architecture, database, security, API, and test details.
