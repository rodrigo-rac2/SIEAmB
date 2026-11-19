# SIEAmB - Seminário Internacional de Estudos Ambientais

## Session start

Read `.claude/context/STATUS.md` first — it has the current state, what's placeholder, and decisions. `.claude/context/HISTORY.md` has the session log. **The backlog is GitHub Issues** (`gh issue list --milestone <name>`), ordered by milestone; `.claude/log/PENDING.md` is retired. Use `/status` to regroup and `/wrap-up` before ending a session. Project skills live in `.claude/skills/` (update-content, apply-identity, new-edition).

## Project Overview

Academic conference website for UFCG's graduate program in Engineering and Natural Resource Management. Multi-edition support (domain loads the most recent configured event).

## Tech Stack

- **Monorepo** managed with npm workspaces
- **Frontend**: React + TypeScript + Vite
- **Server**: Vercel functions under `api/v1/` (thin entry points), logic and tests in `packages/server`. There is no Express server (ADR-009)
- **Database, login and files**: Supabase (Postgres with row-level security, Auth, Storage). The server reaches it over REST with the service-role key
- **Schema and migrations**: Prisma schema as documentation, hand-written SQL migrations in `packages/db`
- **E-mail and payments**: Resend over SMTP through an outbox table; Mercado Pago Orders API
- **Testing**: Vitest (unit + component integration with RTL and the static fixtures), Playwright (E2E, local build in CI and against every Vercel deployment; `BASE_URL=<url> npm run test:e2e`)
- **Deployment**: Vercel (prod https://sieamb.org from `main`, dev https://dev.sieamb.org from `develop`, preview per PR). The old GitHub Pages URL only redirects to sieamb.org

## Project Structure

```
api/v1/         # Vercel functions (account, submissions, admin, payments, registrations)
packages/
  frontend/     # React SPA
  server/       # Logic behind the functions: payments, account, submissions, admin, core
  db/           # Prisma schema + hand-written SQL migrations
  shared/       # Shared types and utilities (frontend only at runtime; the server cannot import it once deployed)
  e2e/          # Playwright E2E tests, sample data and cleanup scripts
docs/adr/       # Decision records 001 to 010
```

## Commands

```bash
npm install           # Install all workspace dependencies
npm run dev           # Start the frontend in dev mode (the functions run on Vercel; previews and dev are the place to try them)
npm run build         # Build all packages
npm run test          # Run unit + integration tests
npm run test:e2e      # Run Playwright E2E tests
npm run lint          # Lint all packages
```

## Branching model

`main` (production → sieamb.org) and `develop` (integration → dev.sieamb.org) are protected by a ruleset: PR + 1 approval required, no force push, no deletion. **Never commit directly to main or develop, even with admin bypass** (process decision 2026-10-10). Day-to-day work: `feature/<issue>-<slug>` branches → PR to `develop` (body `Closes #<issue>`) → PR `develop → main` to release. Emergencies: `hotfix/<issue>-<slug>` → PR to `main`, then PR to `develop`. The `branch-policy` check rejects any other PR into `main`. Required checks on both branches: `quality`, `e2e-smoke`, `e2e-preview` (Playwright against the Vercel deployment), `branch-policy`. Rodrigo admin-merges while he is the only active developer. Issues are written in English.

**Every change goes through an issue, no exceptions** (Rodrigo, 2026-10-11): even a one-line fix you will resolve immediately gets an issue first, because closed issues are the project's resolution log. Split a multi-topic request (a WhatsApp message with links, affiliations and a date change) into one issue per topic. Open one PR per issue, or one PR closing several issues only when they touch the same file and would conflict otherwise. Docs and process changes (this file, README) follow the same rule.

## Conventions

- All code and comments in English
- **i18n from day one**: react-i18next, locales `pt-BR` (default), `en`, `es`, `zh-CN`. All UI strings live in `packages/frontend/src/locales/<locale>.json` — never hardcoded in components. Language switcher in the header; preference persisted in localStorage. Dynamic content (news) is written per-language later; Phase 0 news is pt-BR only. NOTE: zh-CN translations are machine-drafted and need native-speaker review before the event.
- Multi-event architecture: every entity relates to an `event` record
- API routes: `/api/v1/<resource>`; `account`, `submissions` and `admin` are one function each, reached as `/api/v1/<area>/<action>` through a rewrite in `vercel.json`
- Environment variables in `.env` files (never committed); `.env.local` is Rodrigo's vault with prefixed names for prod and dev
- Database migrations are SQL files in `packages/db/prisma/migrations`, applied with `DIRECT_URL=<session pooler of the right database> npm run migrate:deploy -w @sieamb/db`. Every table has `created_at` and row-level security. Check which database the address points at before running, and never run one on production without a backup and Rodrigo's go
- New parts are switched on per deployment by a pair of variables (`VITE_ACCOUNTS_ENABLED` with `ACCOUNTS_ENABLED`); production gets them only at a release
- The dev database is shared by real testers and by the automatic browser tests: tests use `e2e+<run>-…@sieamb.org` addresses, are never mailed, and clean up after themselves. Anything about test data stays among test accounts
- Whatever is being processed on a screen says so: shaded line, spinner, "Processando…" (#278)

## Key Architectural Decisions

The full records are in `docs/adr/` (001 themes, 002 roles, 003 peer review, 004 payments, 005 e-mails and reminders, 006 soft delete, 007 accounts, 008 submissions and the organisers' panel, 009 how the site runs, 010 a person is identified by CPF or passport). Write a new one whenever a decision changes how the system is built, in the same pull request as the change.

- Multi-event by design: `events` table with `is_current` flag; all content (news, submissions, registrations) scoped to an event
- Per-edition visual theme: each event has an optional `theme` (EventTheme) overriding CSS tokens for that edition only (applied in PageLayout via `eventThemeVars`); the palette changes every edition and archived editions keep theirs
- Public content (dates, fees, areas, team, news, editais, submission rules) is JSON in `packages/frontend/src/data/`; a change of content is a pull request. There is no news editor
- Paper submission (ADR-008): authors are one ordered list, any of them sends, only the sender changes or withdraws; the review is **not blind**, organisers choose one or more reviewers per paper. The review form is not built
- Auth and roles (ADR-002, ADR-007, ADR-008): Supabase Auth; roles per edition in `event_members` (Administrador `ADMIN`, Organizador `ORGANIZER`, Avaliador `REVIEWER`) plus the owner (`users.is_platform_admin`, set in the database). Nobody is shown a role above their own; only the owner gives Administrador, changes someone's e-mail or CPF, or types a password for them
- E-mails (ADR-005): written to an outbox first, then sent; a background job started by the database every 10 minutes retries, records reminders and re-checks payments
- Production has payments, e-mails, accounts, papers and the panel since the release of 2026-11-19 (pull request #274). New work still lands on dev first and reaches production through a `develop → main` pull request, with Rodrigo's go
