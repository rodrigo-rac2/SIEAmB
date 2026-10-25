# SIEAmB — Current Status

> Last updated: 2026-10-25 (update this file whenever meaningful progress happens)
> Daily log: `.claude/log/<year>-w<week>.md` · Backlog: GitHub Issues by milestone (commands: `/log-daily`, `/pending-items`)

## Where we are

**Production site live at https://sieamb.org** (Vercel, since 2026-10-10). `develop` → https://dev.sieamb.org, every PR gets a preview URL. The old GitHub Pages URL redirects (branch `gh-pages`).

- **Backlog = GitHub Issues by milestone**: https://github.com/rodrigo-rac2/SIEAmB/milestones. Nearest: **Edital (23 Oct 2026)** with #11 editais page, #37 thematic areas, #7 fees, #6 slug year, #12 committee asks. Then **Registrations + submissions open (10 Nov 2026)**: #13 Supabase, #14 registration persistence + e-mail, #15 admin, #16 payment decision by 24/10, #17 submissions MVP, #18 Resend.
- **Hard date**: registrations open on **2026-11-10** (Rodrigo's commitment to Najara; Even3 fallback for payment like 2025).
- **Process**: `feature/<issue>-<slug>` → PR to `develop` (`Closes #N`) → release PR `develop → main`. Required checks: `quality`, `e2e-smoke`, `e2e-preview` (Playwright against the Vercel deployment), `branch-policy` (main only from develop/hotfix/*). Rodrigo admin-merges while alone; Samuel's invite still pending.
- **Every change goes through an issue (rule since 2026-10-11)**, even one opened and closed in the same sitting; multi-topic requests are split. Closed issues are the resolution log.
- **Translations (2026-10-12)**: UI strings were already complete; fixture content is now `LocalizedText` (`string | {pt-BR, en?, es?, zh-CN?}`, resolved by `localize()` / `useLocalized()` with pt-BR fallback). Venue, important dates, team groups, fee lots, areas, news, bios, founder affiliations and about texts carry en/es/zh-CN (machine-drafted, zh-CN under #23). A Playwright guard (`i18n-leaks.spec.ts`) fails on Portuguese showing up in the other languages. Language switcher shows flag + PT/EN/ES/中文 with full contrast.
- **CI (2026-10-12)**: `e2e-preview` no longer depends on the Vercel GitHub app. The build emits `/version.json` with the commit SHA; the workflow runs on `pull_request` and pushes to develop/main, derives the URL from the branch, waits until it serves the head SHA, then runs Playwright. The Vercel app stopped posting deployments/checks on 12 Oct (and one build died with `git_info_fail`); builds still need it. Vercel's automatic DDoS mitigation challenged sieamb.org for ~20 min after release #92 because of our own test traffic (#93 lightened the guard).
- **Applied on 2026-10-10 from Najara's input**: March 2027 dates, online venue (YouTube), committee schedule, About page (general text + 2025 text + idealizadores), team page per edition with photos/bios/groups (Comitê Científico, Revisores, Mídias; 2025 keeps its team + palestrantes), Equipe in the menu, editions link in the top bar.
- **Najara's 11 Oct batch applied**: Lattes/ORCID for Viviane, Thays, Laura, Luana, Lourdes; affiliations for Pollyanna, Luana, Zhou Lin, Thays; hero reads "24, 25 e 26 de março de 2027" (`formatDateList`). Slug is `/2027/` with `/2026/` redirecting; lots 10/11→01/01 and 02/01→20/03; programme "dezembro de 2026"; Laura's photo confirmed.
- **Database (2026-10-14, #13)**: two free Supabase projects in sa-east-1, `sieamb-prod` (ref lmqprlysncmnozjrmrsb, Vercel Production) and `sieamb-dev` (ref tasvpjomfncmrpdosqwm, Vercel Preview + Development, local, CI). `packages/db` holds the Prisma 7 schema (Phase 1 tables: events, content tables, users, event_members, news, fee_tiers, registrations, audit_logs), the init migration with the hand-written companions (one-current-event index, `auth.users → public.users` trigger, RLS with public-read and own-row policies, grants) and a seed that upserts the two events from the frontend fixtures. Migration applied and seeded on both projects. Runtime uses the transaction pooler (`DATABASE_URL`), migrations the session pooler (`DIRECT_URL`); the direct `db.<ref>` host is IPv6-only so CI can't use it. Secrets: `.env.local` is Rodrigo's vault (prefixed names), `.env` the generated local copy, Vercel env vars per environment, GitHub secrets `SUPABASE_{PROD,DEV}_*`. Workflows: `db-backup.yml` (weekly pg_dump of prod, encrypted with the `BACKUP_PASSPHRASE` secret and kept in the `db-backups` release, restore steps in `docs/db-backups.md`, #145), `db-keepalive.yml` (REST reads on both projects every 4 hours, #112) and `db-watchdog.yml` (every 6 hours restores a paused project through the Management API and opens an issue, needs `SUPABASE_ACCESS_TOKEN`, #144). Supabase never defines how much activity prevents pausing, so the watchdog is the real guarantee. Projects were created with "automatically expose new tables" OFF, so every new table needs explicit grants in its migration. **Browser-side inserts (#149)**: Prisma's `@default(uuid())` is client-side and never runs through PostgREST, so a table the anon role inserts into needs `DEFAULT gen_random_uuid()` in the database (`pre_registrations` uses `dbgenerated`). The `schema.test.ts` guard allows exactly one browser write grant: `INSERT` on `pre_registrations`.
- **Team page (2026-10-20, #118)**: five new reviewers from Najara's Drive batch (Marconi, Alyne, Ellora, Mayra, Anna Rebeca) live on sieamb.org; Mayra's photo still pending (card shows her initial, named exception in the fixture test). Niklas left the reviewers (#102) and stays in the Comitê Científico.
- **Still waiting on the committee**: II SIEAmB presentation text (with Prof. Viviane for approval, #12), edital text (#11), 2027 thematic areas (#37), Rodrigo's own team entry (#12), Mayra's photo (#12), payment account holder by 24 Oct (#16). **Waiting on Rodrigo**: Supabase/Resend/Mercado Pago accounts (#13, #14, #15, #16, #18), `.env.local` template ready.

## What works today

- Monorepo (npm workspaces): `packages/shared`, `packages/frontend`, `packages/e2e`
- All public pages in 4 languages (pt-BR default forced, en, es, zh-CN), UI strings and fixture content alike — flag + code buttons in the topbar, preference in localStorage (`sieamb-locale`)
- Multi-event routing: `/2027/` (current II SIEAmB, 24–26 Mar 2027, slug may become `/2027/` per #6), `/2025/` (archived recap with team, speakers, anais), root redirects to current event (`isCurrent` in `events.json`)
- **Per-edition themes** (ADR-001): each event's optional `theme` overrides the CSS tokens for that edition only; archived editions keep their palette forever. Current-edition identity goes in the event `theme`, tokens.css is just the neutral fallback. 2025 has a demo blue theme as proof
- Pre-registration form with CPF/passport validation (zod schemas in `@sieamb/shared`) and LGPD consent, persisted to `pre_registrations` (#149). Read the rows with the service role key (Supabase Table Editor or REST); the e2e form submit runs on local/preview only, never on production
- News (avisos) list + detail with markdown
- Tests: Vitest + RTL on the fixtures (shared + frontend, incl. a locale-completeness test over every content string) + Playwright (desktop + mobile; smoke, `@deployed`, Portuguese-leak guard) run locally in CI and against every Vercel deployment, all green
- SPA routing on Vercel via `rewrites` in `vercel.json`

## What is placeholder / fake

- **Visual identity 2026: APPLIED** (palette, Garet/Lora fonts, logo, lockup hero, cracked-earth texture) via the event record + `public/brand/2027/`. tokens.css remains the neutral fallback. Still open: 2026 theme/dates text from the committee (the design mock still shows 2025's), optional SVG exports
- **Still placeholder**: fee lot dates and category labels (#7), thematic areas for 2027 (#37), edition presentation text for 2027 (`aboutMd` null → "em breve"), editais (#11), news items, sponsors logos, contact e-mail (fixtures say sieambufcg@gmail.com from the old site). Everything else on the public pages is real committee content
- **Pre-registration persists since 2026-10-25 (#149)**: the form inserts anonymously into `pre_registrations` (Supabase, RLS insert-only for anon, no reads; service role exports). No password, no account, no confirmation e-mail yet (#14, #18). `VITE_DATA_PROVIDER=supabase` on Vercel (all environments); a local build without it still fakes success. Submissions before 25 Oct were lost
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

1. **Edital (23 Oct 2026)** — #11 editais page (scaffold buildable now), #12 presentation text + Rodrigo's entry, #37 areas (2025 list buildable now), #58 not-found for unknown slug
2. **Registrations + submissions open (10 Nov 2026)** — #13 Supabase, #14 registration persistence + e-mail, #15 admin, #16 payment decision (by 24 Oct), #17 submissions MVP, #18 Resend
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
