# ADR-009: The site runs on Vercel functions and Supabase, with no server of our own

**Date:** 2026-11-17 · **Status:** Accepted (records what was built between 2026-11-05 and 2026-11-17) · **Issues:** #158, #208, #216, #219, #273

## Context

The implementation plan (August 2026) and the budget note in STATUS (September 2026) described an Express API on a small paid host, later on an AWS Lambda Function URL, with files on Cloudflare R2 and a JWT login with roles. None of that was built. When the first server code was needed, for payments, the choice was made by what the project already had: a Vercel project and two Supabase projects, both free, and one volunteer maintaining everything. This record writes down what the site runs on today, so nobody reads the old plan as the current design.

## Decisions

1. **No long-running server.** Everything the browser cannot do by itself is a Vercel function under `api/v1/`. Each file there is a thin entry point; the logic and its tests live in the `packages/server` workspace (`payments`, `account`, `submissions`, `admin`, `core`).
2. **Few functions, many actions.** The Hobby plan caps the number of functions, and a `[action].ts` file loses to the catch-all rewrite that serves the single-page app. So `account`, `submissions` and `admin` are one function each, and `vercel.json` rewrites `/api/v1/<area>/<action>` to it. There are eight functions today: three for payments, one for the background job, one for the registration notice, and those three.
3. **The server talks to the database over Supabase's REST interface with the service-role key** (`core/rest.ts`), not through Prisma. A function starts cold, and a REST call needs no connection pool. Prisma (`packages/db`) is kept for what it is good at: the schema as documentation and the migrations.
4. **Migrations are hand-written SQL files** under `packages/db/prisma/migrations`, applied with `prisma migrate deploy` over the session pooler (`DIRECT_URL`). Database functions, policies, indexes and the scheduler are in those files, because they are part of how the site works. Every table has `created_at`, and a test reads the files to keep conventions.
5. **Row-level security is on for every table.** The browser only writes a registration (`pre_registrations`, insert-only for the anonymous role) and reads public content. Everything else goes through a function that checks who is asking.
6. **Supabase Auth holds the accounts and the passwords** (ADR-007). Roles are rows in `event_members` per edition, plus `users.is_platform_admin` for the owner (ADR-002, ADR-008). There is no JWT of our own: each call sends the Supabase access token and the function asks Supabase who it belongs to.
7. **Files are in Supabase Storage**, in the private bucket `submissions`, uploaded through a one-time link and downloaded through a one-minute link (ADR-008). Cloudflare R2 was planned for size; a paper is at most 10 MB and the free allowance is enough for one edition. Revisit for the anais.
8. **Public content is still files in the repository** (`packages/frontend/src/data/*.json`): dates, fees, areas, team, news, editais, the submission rules. A change of content is a pull request. The server reads the same fee table and the same submission rules the pages show, so the two cannot disagree.
9. **E-mail goes through Resend over SMTP** (ADR-005), first written to an outbox table, then sent.
10. **The database starts the background job** every 10 minutes (`pg_cron` and `pg_net`, #273, ADR-005 decision 5). GitHub Actions proved unable to keep that time. The same workflow remains as an hourly second line.
11. **GitHub Actions keeps the rest of the housekeeping**: the weekly encrypted backup of production (`db-backup.yml`, also started by hand before a release), reads of the public tables every 4 hours so the free databases are not paused for lack of use (`db-keepalive.yml`), and a watchdog every 6 hours that restores a paused project and opens an issue about it (`db-watchdog.yml`, #144).
12. **New parts are switched on per deployment** by a pair of variables, one for the pages (`VITE_…`) and one for the functions: `VITE_PAYMENTS_ENABLED`; `VITE_ACCOUNTS_ENABLED` with `ACCOUNTS_ENABLED`. Off, the pages show nothing and the functions answer 503. This is how a part lives on dev for weeks while production stays as it was.
13. **Two databases, three sites.** `sieamb-prod` serves sieamb.org. `sieamb-dev` serves dev.sieamb.org, every preview, local work and the automatic browser tests, so real testers and tests share it: tests use addresses of their own (`e2e+<run>-…@sieamb.org`), are never mailed, clean up after every run, and what is about test data stays among test accounts (#248, #255).

## Consequences

- There is nothing to keep running, patch or pay for besides the plans themselves. The cost today is the Resend plan (upgraded on 2026-11-17) and the domain.
- A function has a time limit and starts cold. Work that could be long is bounded on purpose: an announcement sends for up to 40 seconds and leaves the rest queued (#281).
- The server cannot import `@sieamb/shared` (an ES module, while the functions are built as CommonJS). It keeps its own copy of the CPF check. It fails only once deployed, never in the unit tests.
- The Hobby plan allows 12 functions and forbids commercial use; the upgrade is #168.
- The free database is paused after a week without use and has no point-in-time recovery. The keep-alive and the weekly backup are the answer to both.
- Because content is in the repository, the organisers cannot edit a date or a notice themselves. That was accepted for this edition.
- `docs/IMPLEMENTATION_PLAN.md` describes the earlier design (Express, Lambda, R2, JWT, the Preferences API of Mercado Pago). It is kept as history, with a note at its top.
