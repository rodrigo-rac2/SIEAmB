# SIEAmB — Session History

Append a dated entry per working session. Newest first.

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
