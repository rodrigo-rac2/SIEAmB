# SIEAmB — Current Status

> Last updated: 2026-10-10 (update this file whenever meaningful progress happens)
> Daily log: `.claude/log/<year>-w<week>.md` · Backlog: GitHub Issues by milestone (commands: `/log-daily`, `/pending-items`)

## Where we are

**Production site live at https://sieamb.org** (Vercel, since 2026-10-10). `develop` → https://dev.sieamb.org, every PR gets a preview URL. The old GitHub Pages URL redirects (branch `gh-pages`).

- **Backlog = GitHub Issues by milestone**: https://github.com/rodrigo-rac2/SIEAmB/milestones. Nearest: **Edital (23 Oct 2026)** with #11 editais page, #37 thematic areas, #7 fees, #6 slug year, #12 committee asks. Then **Registrations + submissions open (10 Nov 2026)**: #13 Supabase, #14 registration persistence + e-mail, #15 admin, #16 payment decision by 24/10, #17 submissions MVP, #18 Resend.
- **Hard date**: registrations open on **2026-11-10** (Rodrigo's commitment to Najara; Even3 fallback for payment like 2025).
- **Process**: `feature/<issue>-<slug>` → PR to `develop` (`Closes #N`) → release PR `develop → main`. Required checks: `quality`, `e2e-smoke`, `e2e-preview` (Playwright against the Vercel deployment), `branch-policy` (main only from develop/hotfix/*). Rodrigo admin-merges while alone; Samuel's invite still pending.
- **Applied on 2026-10-10 from Najara's input**: March 2027 dates, online venue (YouTube), committee schedule, About page (general text + 2025 text + idealizadores), team page per edition with photos/bios/groups (Comitê Científico, Revisores, Mídias; 2025 keeps its team + palestrantes), Equipe in the menu, editions link in the top bar.
- **Waiting on Najara** (message sent 2026-10-10 evening): lot dates (she does them tonight), edital text, II edição thematic areas, edition year 2027 vs 2026 (decides the URL slug, #6), "dezembro" programme date, confirm the unnamed 2025 photo is Laura, Rodrigo's own team entry.

## What works today

- Monorepo (npm workspaces): `packages/shared`, `packages/frontend`, `packages/e2e`
- All public pages in 4 languages (pt-BR default forced, en, es, zh-CN) — flag buttons in the topbar, preference in localStorage (`sieamb-locale`)
- Multi-event routing: `/2027/` (current II SIEAmB, 24–26 Mar 2027, slug may become `/2027/` per #6), `/2025/` (archived recap with team, speakers, anais), root redirects to current event (`isCurrent` in `events.json`)
- **Per-edition themes** (ADR-001): each event's optional `theme` overrides the CSS tokens for that edition only; archived editions keep their palette forever. Current-edition identity goes in the event `theme`, tokens.css is just the neutral fallback. 2025 has a demo blue theme as proof
- Pre-registration form with CPF/passport validation (zod schemas in `@sieamb/shared`)
- News (avisos) list + detail with markdown
- Tests: 55 unit/integration (Vitest + RTL on the fixtures) + 38 E2E (Playwright, desktop + mobile; `@deployed` spec runs against real deployments), all green
- SPA routing on Vercel via `rewrites` in `vercel.json`

## What is placeholder / fake

- **Visual identity 2026: APPLIED** (palette, Garet/Lora fonts, logo, lockup hero, cracked-earth texture) via the event record + `public/brand/2027/`. tokens.css remains the neutral fallback. Still open: 2026 theme/dates text from the committee (the design mock still shows 2025's), optional SVG exports
- **Still placeholder**: fee lot dates and category labels (#7), thematic areas for 2027 (#37), edition presentation text for 2027 (`aboutMd` null → "em breve"), editais (#11), news items, sponsors logos, contact e-mail (fixtures say sieambufcg@gmail.com from the old site). Everything else on the public pages is real committee content
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
