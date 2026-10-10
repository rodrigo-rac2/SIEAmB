# SIEAmB — Current Status

> Last updated: 2026-10-10 (update this file whenever meaningful progress happens)
> Daily log: `.claude/log/<year>-w<week>.md` · Backlog: GitHub Issues by milestone (commands: `/log-daily`, `/pending-items`)

## Where we are

**Phase 0 (visual prototype) is COMPLETE and live**: https://sieamb.org (Vercel, since 2026-10-10; the old GitHub Pages URL redirects there)

- CI is green on `main`; Vercel deploys every merge (`main` → sieamb.org, `develop` → dev.sieamb.org, previews per PR) and the Playwright suite runs against each deployment.
- **First client feedback is in (2026-08-31)**: Thays approved the prototype and asked for (1) an editais page (ANPOCS-style HTML pages) and (2) the logged-in submission area with attachments/status — which is exactly plan §6. Najara and professora Viviane still reviewing.
- **URGENT: Rodrigo owes the group a hosting-plan recommendation by 2026-09-01** (PENDING R1) — research is done in the plan, needs packaging in non-technical pt-BR with costs in R$.
- Team: Samuel (@0Samuel09) added as collaborator (invite pending accept); `develop` branch + ruleset protecting main/develop (PR + 1 approval; admin bypass for Rodrigo). Flow: `feature/* → develop → main`.
- Project WhatsApp group exists (Najara, Thays, Rodrigo, Samuel, 2 design people).

## Client input 2026-10-10 (Najara, WhatsApp) — NOT YET APPLIED

- **Event is now 24–26 March 2027, ONLINE** (YouTube channel https://youtube.com/@sieambufla6013). Fixtures still say 25–27 Nov 2026 at UFCG Campina Grande. Slug `/2026/` probably should become `/2027/`.
- **Cronograma II SIEAmB**: edital 23/10/2026 · submissions open 09/11/2026 · close 18/01/2027 · extension until 15/02/2027 · preliminary results 22/02/2027 · final results 12/03/2027 · author registration until 15/03/2027 · listener registration until 20/03/2027 · programme "dezembro" (odd, confirm) · event 24–26/03/2027.
- **Rodrigo committed: registrations open 10/11/2026** (fallback = Even3 like 2025 if the integrated system is not ready). Hard date.
- **Fees (3 categories × 2 lots)**: graduação R$30 / R$50 · pós R$50 / R$70 · professores e demais profissionais R$70 / R$90. The lot dates on her image (26/05–20/08, 21/08–20/10) predate the new cronograma — need new lot dates.
- **Sobre o evento**: keep the general institutional text from the Wix "Sobre o SIEAmb" page + keep the 2025 edition description + add this edition's text; every year appends its own presentation text.
- **Idealizadores are fixed** (Viviane Farias Silva, José Otávio Aguiar, Niklas Werner Weins, Najara Escarião Agripino — bios on the Wix page).
- **Team per edition**: fixed team (idealizadores) + variable team per edition, each archived edition keeps its own team. Reference layout: chinabrasilunicamp.wixsite.com/2023 and /2024 (one page per year, "Eventos Prévios" + "Equipe" with name + bio). Najara will send the current team names (some left, some joined, Rodrigo included).

## What works today

- Monorepo (npm workspaces): `packages/shared`, `packages/frontend`, `packages/e2e`
- All public pages in 4 languages (pt-BR default forced, en, es, zh-CN) — flag buttons in the topbar, preference in localStorage (`sieamb-locale`)
- Multi-event routing: `/2026/` (current), `/2025/` (archived stub), root redirects to current event (configured via `isCurrent` in `packages/frontend/src/data/events.json`)
- **Per-edition themes** (ADR-001): each event's optional `theme` overrides the CSS tokens for that edition only; archived editions keep their palette forever. Current-edition identity goes in the event `theme`, tokens.css is just the neutral fallback. 2025 has a demo blue theme as proof
- Pre-registration form with CPF/passport validation (zod schemas in `@sieamb/shared`)
- News (avisos) list + detail with markdown
- Tests: 22 unit (Vitest) + 17 E2E (Playwright, desktop + mobile projects), all green
- SPA routing on Vercel via `rewrites` in `vercel.json`

## What is placeholder / fake

- **Visual identity 2026: APPLIED** (palette, Garet/Lora fonts, logo, lockup hero, cracked-earth texture) via the event record + `public/brand/2026/`. tokens.css remains the neutral fallback. Still open: 2026 theme/dates text from the committee (the design mock still shows 2025's), optional SVG exports
- **All content**: dates, fee amounts, thematic areas, committee names, contact email (sieamb@ufcg.edu.br is a GUESS), about text — all in `packages/frontend/src/data/*.json` fixtures
- **Registration does NOT persist** — StaticDataProvider simulates success. Real persistence = Supabase (Phase 0.5/1)
- **zh-CN translations are machine-drafted** — need native-speaker review before the event

## Budget reality check (2026-09-13)

Professora Viviane (project lead) said there is **no budget for ~R$250/month**. Her Joomla suggestion was evaluated and rejected (legacy install, no registration/payment components, unsafe for CPF/payments — details kept off the public repo). The answer is the **R$0/month architecture**, which the stack already supports:

- Vercel free (frontend) + Supabase free (Postgres 500 MB, Auth; weekly `pg_dump` GitHub Action replaces PITR) + Express on **AWS Lambda Function URL** (always-free tier; App Runner dropped — it bills idle provisioned memory) + Cloudflare R2 free 10 GB for all PDFs (submissions + anais) + Resend free for email (needs the domain).
- **Peer review designed against Brazilian practice (ADR-003, 2026-09-13)**: research report in `docs/research/peer-review-brazilian-events.md` (JEMS, Even3, Doity, Galoá, SIGEventos, ANPAD, real forms). One anonymised PDF at submission; weighted 1–5 criteria form + gate + confidence + 4-option recommendation + comments to authors/committee; desk check; divergence ⇒ 3rd reviewer; committee decides oral/pôster; no rebuttal; ACCEPTED_PENDING_REGISTRATION; reviewer certificates.
- **Roles redesigned (ADR-002, 2026-09-13)**: per-edition memberships (`event_members`) with ADMIN, SCIENTIFIC_CHAIR, AREA_CHAIR, REVIEWER, EDITOR, FINANCE, STAFF + `is_platform_admin` flag; participant/author/registered are derived states. Conflict-of-interest rule and e-mail-based certificates for co-authors added to the plan.
- Payments with **no monthly fee**: Mercado Pago Checkout Pro / links de pagamento (per-transaction fees only; webhooks retry, so cold starts are fine). Alternative with even less build: Even3 for registration+payment (per-ticket fee, used by the 1st edition), our site stays the public face.
- Trade-offs: weekly instead of point-in-time backups, cold starts on the API, free-tier pausing mitigated by a scheduled ping.
- Remaining costs: domain ~R$40/yr + Samuel's bolsa (committee's call).

## Next steps

The backlog is GitHub Issues, ordered by milestone: https://github.com/rodrigo-rac2/SIEAmB/milestones

1. **Edital (23 Oct 2026)** — #5 dates/venue/schedule, #6 slug 2027, #7 fees, #8 about, #9 idealizadores, #10 team per edition, #11 editais page, #12 committee input
2. **Registrations + submissions open (10 Nov 2026)** — #13 Supabase, #14 registration persistence + e-mail, #15 admin, #16 payment decision (by 24 Oct), #17 submissions MVP, #18 Resend, #19 Playwright vs previews, #20 retire Pages
3. **Peer review (Jan-Mar 2027)** — #21
4. **Event (24-26 Mar 2027)** — #22 certificates/anais; #23 zh-CN review (no milestone)

## External dependencies to kick off early

- **Domain decided 2026-10-10: `sieamb.org`** (free as of 10/10; register at Cloudflare Registrar, Rodrigo's account). `sieamb.ufcg.edu.br` stays an optional STI ask
- Mercado Pago account under the empresa júnior CNPJ (not started; money flows to them)
- ISSN application via IBICT for the anais (not started, slow process)
- Design identity (in progress by the event's design team)

## Key links

- Live site: https://sieamb.org (Vercel team `sieamb`, project `sieamb`, Git-connected to rodrigo-rac2/SIEAmB; `main` = production, `develop` = https://dev.sieamb.org). Old Pages URL https://rodrigo-rac2.github.io/SIEAmB/ redirects (branch `gh-pages`)
- Repo: https://github.com/rodrigo-rac2/SIEAmB
- Full plan: docs/IMPLEMENTATION_PLAN.md (also published as a Claude artifact: https://claude.ai/code/artifact/6af1a1b5-57dc-4440-abd3-237a6f3ee474)
- Reference site (inspiration): https://engema.org.br/28/
