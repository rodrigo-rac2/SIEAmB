# SIEAmB — Current Status

> Last updated: 2026-08-31 (update this file whenever meaningful progress happens)
> Daily log: `.claude/log/<year>-w<week>.md` · Pending items: `.claude/log/PENDING.md` (commands: `/log-daily`, `/pending-items`)

## Where we are

**Phase 0 (visual prototype) is COMPLETE and live**: https://rodrigo-rac2.github.io/SIEAmB/

- CI and Pages deploy are green on `main`. Every push to `main` auto-deploys.
- **First client feedback is in (2026-08-31)**: Thays approved the prototype and asked for (1) an editais page (ANPOCS-style HTML pages) and (2) the logged-in submission area with attachments/status — which is exactly plan §6. Najara and professora Viviane still reviewing.
- **URGENT: Rodrigo owes the group a hosting-plan recommendation by 2026-09-01** (PENDING R1) — research is done in the plan, needs packaging in non-technical pt-BR with costs in R$.
- Team: Samuel (@0Samuel09) added as collaborator (invite pending accept); `develop` branch + ruleset protecting main/develop (PR + 1 approval; admin bypass for Rodrigo). Flow: `feature/* → develop → main`.
- Project WhatsApp group exists (Najara, Thays, Rodrigo, Samuel, 2 design people).

## What works today

- Monorepo (npm workspaces): `packages/shared`, `packages/frontend`, `packages/e2e`
- All public pages in 4 languages (pt-BR default forced, en, es, zh-CN) — flag buttons in the topbar, preference in localStorage (`sieamb-locale`)
- Multi-event routing: `/2026/` (current), `/2025/` (archived stub), root redirects to current event (configured via `isCurrent` in `packages/frontend/src/data/events.json`)
- Pre-registration form with CPF/passport validation (zod schemas in `@sieamb/shared`)
- News (avisos) list + detail with markdown
- Tests: 22 unit (Vitest) + 17 E2E (Playwright, desktop + mobile projects), all green
- GitHub Pages SPA trick: `public/404.html` + sessionStorage restore in `index.html`

## What is placeholder / fake

- **Visual identity**: placeholder green theme. Official identity from the design team lands ONLY in `packages/frontend/src/styles/tokens.css` + logo assets (currently an emoji 🌿 in Header.tsx)
- **All content**: dates, fee amounts, thematic areas, committee names, contact email (sieamb@ufcg.edu.br is a GUESS), about text — all in `packages/frontend/src/data/*.json` fixtures
- **Registration does NOT persist** — StaticDataProvider simulates success. Real persistence = Supabase (Phase 0.5/1)
- **zh-CN translations are machine-drafted** — need native-speaker review before the event

## Next steps (in order)

1. **Send the hosting recommendation to the group (due 2026-09-01!)** — Supabase sa-east-1 + Vercel + Render/Railway, R$0 until payments phase, then ~US$30-40/mo (plan §10.5)
2. **Editais page** — add the route/section now with "em breve", fill when the committee sends the content (they don't have the edital yet)
3. **Collect real content from the committee** (dates, fees, areas, committee, email, about text) → replace fixtures
4. **Apply official visual identity** when design team delivers → tokens.css + logo (what we need was itemized to the group on 2026-08-31)
5. **Supabase project** (sa-east-1, free tier): persist registrations + news, admin login for the committee (see docs/IMPLEMENTATION_PLAN.md §4, tasks T0.7–T0.10)
6. **Phase 1**: Express API, admin panel, emails (Resend), Vercel cutover — plan §5
7. Later: submissions with logged-in area (§6 — client-confirmed requirement), Mercado Pago payments (§7), certificates/anais (§8)

## External dependencies to kick off early

- Custom domain `sieamb.ufcg.edu.br` — needs UFCG IT (not started)
- Mercado Pago account under the empresa júnior CNPJ (not started; money flows to them)
- ISSN application via IBICT for the anais (not started, slow process)
- Design identity (in progress by the event's design team)

## Key links

- Live site: https://rodrigo-rac2.github.io/SIEAmB/
- Repo: https://github.com/rodrigo-rac2/SIEAmB
- Full plan: docs/IMPLEMENTATION_PLAN.md (also published as a Claude artifact: https://claude.ai/code/artifact/6af1a1b5-57dc-4440-abd3-237a6f3ee474)
- Reference site (inspiration): https://engema.org.br/28/
