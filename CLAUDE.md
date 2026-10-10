# SIEAmB - Seminário Internacional de Estudos Ambientais

## Session start

Read `.claude/context/STATUS.md` first — it has the current state, what's placeholder, and decisions. `.claude/context/HISTORY.md` has the session log. **The backlog is GitHub Issues** (`gh issue list --milestone <name>`), ordered by milestone; `.claude/log/PENDING.md` is retired. Use `/status` to regroup and `/wrap-up` before ending a session. Project skills live in `.claude/skills/` (update-content, apply-identity, new-edition).

## Project Overview

Academic conference website for UFCG's graduate program in Engineering and Natural Resource Management. Multi-edition support (domain loads the most recent configured event).

## Tech Stack

- **Monorepo** managed with npm workspaces
- **Frontend**: React + TypeScript + Vite
- **Backend**: Express.js + TypeScript
- **Database**: PostgreSQL
- **ORM**: Prisma
- **Testing**: Vitest (unit + component integration with RTL and the static fixtures), Playwright (E2E, local build in CI and against every Vercel deployment; `BASE_URL=<url> npm run test:e2e`)
- **Deployment**: Vercel (prod https://sieamb.org from `main`, dev https://dev.sieamb.org from `develop`, preview per PR); GitHub Pages workflow is legacy

## Project Structure

```
packages/
  frontend/     # React SPA
  backend/      # Express API
  shared/       # Shared types and utilities
  e2e/          # Playwright E2E tests
```

## Commands

```bash
npm install           # Install all workspace dependencies
npm run dev           # Start frontend + backend in dev mode
npm run build         # Build all packages
npm run test          # Run unit + integration tests
npm run test:e2e      # Run Playwright E2E tests
npm run lint          # Lint all packages
```

## Branching model

`main` (production → sieamb.org) and `develop` (integration → dev.sieamb.org) are protected by a ruleset: PR + 1 approval required, no force push, no deletion. **Never commit directly to main or develop, even with admin bypass** (process decision 2026-10-10). Day-to-day work: `feature/<issue>-<slug>` branches → PR to `develop` (body `Closes #<issue>`) → PR `develop → main` to release. Emergencies: `hotfix/<issue>-<slug>` → PR to `main`, then PR to `develop`. The `branch-policy` check rejects any other PR into `main`. Required checks on both branches: `quality`, `e2e-smoke`, `e2e-preview` (Playwright against the Vercel deployment), `branch-policy`. Rodrigo admin-merges while he is the only active developer. Issues are written in English.

## Conventions

- All code and comments in English
- **i18n from day one**: react-i18next, locales `pt-BR` (default), `en`, `es`, `zh-CN`. All UI strings live in `packages/frontend/src/locales/<locale>.json` — never hardcoded in components. Language switcher in the header; preference persisted in localStorage. Dynamic content (news) is written per-language later; Phase 0 news is pt-BR only. NOTE: zh-CN translations are machine-drafted and need native-speaker review before the event.
- Multi-event architecture: every entity relates to an `event` record
- API routes: `/api/v1/<resource>`
- Environment variables in `.env` files (never committed)
- Database migrations via Prisma

## Key Architectural Decisions

- Multi-event by design: `events` table with `is_current` flag; all content (news, submissions, registrations) scoped to an event
- Per-edition visual theme: each event has an optional `theme` (EventTheme) overriding CSS tokens for that edition only (applied in PageLayout via `eventThemeVars`); the palette changes every edition and archived editions keep theirs
- News system: CRUD with rich text, managed by admin users
- Paper submission: abstract → full paper → blind review → acceptance workflow
- Auth: JWT-based, roles (admin, reviewer, author, attendee)
