# SIEAmB — Session History

Append a dated entry per working session. Newest first.

## 2026-09-01 — Per-edition themes (ADR-001)

- Design team (Daniela) asked whether the site is per-event or general; Najara confirmed: permanent site, palette changes every edition. Architecture didn't support that (single global tokens.css) — implemented it the same day.
- `EventTheme` type in shared + `theme` field on events; `eventThemeVars()` maps it to CSS custom-property overrides applied on the `.event-shell` wrapper in PageLayout. tokens.css becomes neutral fallback; the current edition's identity will live in the event's `theme` (rollover becomes data-only). Full rationale in docs/adr/001-per-edition-themes.md.
- 2025 got a demo blue palette; E2E asserts the two editions render different topbar colors. 26 unit + 19 E2E green.
- Group: Lara (design) will send identity as png/jpg; hosting recommendation message drafted for Rodrigo to send (PENDING R1).

## 2026-08-31 — Team setup, onboarding docs, project logging

- Added Samuel (@0Samuel09, estagiário 6º período ADS) as collaborator (write, invite pending); created `develop`; ruleset `protect-main-develop` (PR + 1 approval, no force push/deletion, admin bypass)
- README rewritten as full pt-BR onboarding doc; CI now also runs on develop pushes
- Created `.claude/` workspace (STATUS, HISTORY, /status, /wrap-up, 3 skills) and project-local daily logging (`.claude/log/` + /log-daily + /pending-items) — SIEAmB tracking stays in this repo, separate from Rodrigo's personal weekly-log
- WhatsApp group developments: Thays approved prototype and asked for editais page + logged-in submission area (both fit the plan); Najara asked for a hosting recommendation → **due 2026-09-01**; 2 design people joined the group; itemized design-asset needs sent to the group

## 2026-08-30 — Phase 0 built and shipped

- Researched ENGEMA 28 (reference site) and cloud options; wrote docs/IMPLEMENTATION_PLAN.md (5 phases, Prisma schema, testing strategy, DevOps). Recommendation: Supabase sa-east-1 + Vercel + Express on Render/Railway; Mercado Pago Checkout Pro for payments (Pix ~0%).
- Built the entire Phase 0 prototype in one session:
  - Monorepo scaffold (npm workspaces, ESLint, Prettier, Node 22)
  - `@sieamb/shared`: types, zod registration schema, CPF validator (mod-11)
  - `@sieamb/frontend`: React 18 + Vite + React Router; 15 pages; DataProvider abstraction (static/supabase/api switchable via `VITE_DATA_PROVIDER`)
  - i18n with react-i18next: pt-BR, en, es, zh-CN (zh-CN added mid-session at Rodrigo's request)
  - `@sieamb/e2e`: Playwright smoke suite, chromium + Pixel 7 projects, `locale: 'pt-BR'`
  - CI (lint/typecheck/unit + e2e jobs) and deploy-pages workflows
- CI fixes along the way: `@types/node` missing in e2e; root `test` script was running Playwright without browsers in the quality job (split unit vs e2e)
- UX changes from Rodrigo: language switcher moved from header dropdown to **flag buttons in the topbar**; **pt-BR forced as first-visit default** (detector reads localStorage only)
- Gotcha discovered: GitHub Pages CDN caches for 10 min (`cache-control: max-age=600`) — new deploys take up to 10 min to appear; incognito confirms
- Drafted the WhatsApp message to Najara/Thays presenting the prototype (clipboard handoff)

## Context about the project

- Client: Najara (organizer, Patos-PB) + Thays; event by UFCG PPGERN (pós-graduação em engenharia e gestão de recursos naturais)
- 2nd edition of the event; Rodrigo is the volunteer builder and future maintainer
- Payment (when it comes) goes to the university's empresa júnior (has CNPJ)
- Rodrigo works evenings on this; keep everything in a state someone else could take over
