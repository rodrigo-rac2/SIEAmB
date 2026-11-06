# SIEAmB — Current Status

> Last updated: 2026-11-05 (update this file whenever meaningful progress happens)
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
- **Payments (2026-11-05, #16, #158, #160)**: working end to end in the **sandbox on dev**, off in production. Mercado Pago account under the empresa júnior, developer app `SIEAmB Inscricoes` on Checkout Pro with the **API de Orders** (the panel flags the Preferences API as "será descontinuada em breve"; `docs/IMPLEMENTATION_PLAN.md` §7 still describes Preferences and needs the rewrite).
  - **Server** (first server code in the repo): Vercel functions in `/api/v1/payments/*` as thin entry points, logic and tests in the `packages/server` workspace. `POST orders` (body `{token}`) looks up the fee on the server from the same fixtures the fee table shows (`feeTiers.json`), creates the order (`POST /v1/orders`, idempotency key = our payment id) and answers with the `checkout_url`; a second call returns the same open order; an order older than 23 h is checked and cancelled at Mercado Pago before a new one is opened. `POST webhook/mercadopago` checks `x-signature`, reads the order back with `GET /v1/orders/{id}` and records the status. `GET status?p=<payment id>` serves the return page and re-reads an open order, so the page does not depend on the notification.
  - **Database** (migration `20261105230000_payments`, **applied to sieamb-dev only**): `payments` (service_role only, RLS on with no policy, one open payment per pre-registration by a partial unique index) and `pre_registrations.pay_token` (uuid, the handle that starts a payment; generated by the browser on insert because the anon role cannot read the row back). Production does not have the column yet, so the frontend only sends it when `VITE_PAYMENTS_ENABLED=true`.
  - **Screens** (behind `VITE_PAYMENTS_ENABLED`, on for Vercel Preview only): pay button after the form, `/:event/inscricoes/pagar?t=<pay token>` for paying later, `/:event/inscricoes/pagamento?p=<payment id>` as the return page.
  - **Vercel env**: Preview has the sandbox `MP_ACCESS_TOKEN` and `MP_WEBHOOK_SECRET`, `VITE_PAYMENTS_ENABLED=true` and `PAYMENTS_NOW=2026-11-12T12:00:00-03:00` (moves only the fee-lookup clock so lot 1 can be tried before 10 Nov; ignored in production; **remove it after 10 Nov**). Production has none of them, so the endpoints answer 503 there. `.env.local` holds production and test credentials, both webhook secrets and the test seller and buyer (`MP_*`, `MP_TEST_*`).
  - **Confirmed against real sandbox payments on 2026-11-05**: the signature recipe is HMAC-SHA256 over `id:<data.id lower-cased>;request-id:<x-request-id>;ts:<ts>;` with the webhook secret (the lower-casing is not in the docs pages we read); sandbox payments do send `order.processed` notifications, within seconds; the Vercel firewall lets Mercado Pago through; test credentials work with the Orders API although its reference says otherwise; an approved card payment is `processed` / `accredited`; Mercado Pago sends the buyer back to our return URL with its own `status=` query, which we ignore. The checkout answers **403 to a headless browser**, so an automated test can go as far as the redirect, not through the payment.
  - **Boleto (tested 2026-11-05 on dev)**: the checkout asks for CPF, name and address and generates the boleto; Mercado Pago sends `order.action_required` (`action_required` / `waiting_payment`, method `bolbradesco`) and the payment is recorded as PENDING, which the return page shows as "Pagamento em processamento". A boleto actually being paid could not be tried in the sandbox.
  - **Not done**: production migration and Vercel production env (go-live, needs Rodrigo's go); the production webhook secret was typed from a screenshot and is unchecked; **no Pix** on the account (cards, boleto and account money only, a Pix key could not be created on 2026-11-05); the fee table only covers ESTUDANTE_GRADUACAO, ESTUDANTE_POS and PROFISSIONAL, any other category answers "no fee available"; people who pre-registered before payments existed need their pay link sent to them (every row has a `pay_token`); committee list of who paid (#15); refunds are recorded when Mercado Pago reports them but there is no screen to issue one; no empenho or exemption flow; no confirmation e-mail (#18); ADR for the payment decision (#16 checklist); test rows named `TESTE PAGAMENTO (#160)` are in sieamb-dev.
- **Still waiting on the committee**: II SIEAmB presentation text (with Prof. Viviane for approval, #12), edital text (#11), 2027 thematic areas (#37), Rodrigo's own team entry (#12), Mayra's photo (#12). **Waiting on Rodrigo**: Supabase/Resend accounts (#13, #14, #15, #18), the Mercado Pago Pix key and the go-live decision for payments (#16), `.env.local` template ready.

## What works today

- Monorepo (npm workspaces): `packages/shared`, `packages/frontend`, `packages/e2e`, `packages/db`, `packages/server` (logic behind the Vercel functions in `/api`)
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

**Plan saved on 2026-11-05, driven by the 10 Nov opening.** The committee was asked on that day to test the payment flow on dev (https://dev.sieamb.org/2027/inscricoes/nova, sandbox test card). After their test, in this order:

1. **Apply the committee's feedback** on the texts, the fees and the flow, on dev.
2. **Settle what blocks go-live** (#16):
   - Pix key on the Mercado Pago account, or open with card and boleto only.
   - Boleto validity: orders are created with `expiration_time: P1D` and the order shows no separate due date for the boleto. Check whether a boleto paid on day two or three is still credited; lengthen the validity if not.
   - Vercel plan: #98 mentions Hobby; confirm the plan allows collecting fees.
3. **Go live, only with Rodrigo's go**: `migrate deploy` of `20261105230000_payments` on sieamb-prod, production `MP_ACCESS_TOKEN` / `MP_WEBHOOK_SECRET` / `VITE_PAYMENTS_ENABLED=true` on Vercel Production, release `develop` → `main` (closes #158, #160, #162), then one real low-value payment and its refund. That payment is also the check of the production webhook secret, which was typed from a screenshot.
4. **Send the pay link to everyone who pre-registered before payments existed.** Every row has a `pay_token`; the link is `/:event/inscricoes/pagar?t=<pay_token>`. Nobody has received one.
5. **Committee list of who paid** (#15). A CSV export covers the first days if the screen is not ready.
6. **Confirmation e-mail** (#18, #14). Blocked on the Resend key (`RESEND_API_KEY` is empty in `.env.local`).
7. **Submissions** (#17). Opening on 9 Nov needs accounts and PDF upload and has no plan yet: it needs a simpler fallback or a later date, a call for Rodrigo and the committee.

After launch: remove `PAYMENTS_NOW` from Vercel Preview once 10 Nov has passed; accounts (#14); a way to issue refunds; the empenho and exemption flows; the payment decision ADR (#16 checklist) and the `docs/IMPLEMENTATION_PLAN.md` §7 rewrite for the Orders API; an automated test up to the checkout redirect.

Milestones after the opening: **Peer review (Jan-Mar 2027)** #21, **Event (24-26 Mar 2027)** #22 certificates/anais, #23 zh-CN review (no milestone). Still open from the Edital milestone: #132 presentation text, #126 programme card.

## External dependencies to kick off early

- **Domain decided 2026-10-10: `sieamb.org`** (free as of 10/10; register at Cloudflare Registrar, Rodrigo's account). `sieamb.ufcg.edu.br` stays an optional STI ask
- Mercado Pago account under the empresa júnior CNPJ (open; developer app created 2026-11-05, see Payments above; money flows to them)
- ISSN application via IBICT for the anais (not started, slow process)
- Design identity (in progress by the event's design team)

## Key links

- Live site: https://sieamb.org (Vercel team `sieamb`, project `sieamb`, Git-connected to rodrigo-rac2/SIEAmB; `main` = production, `develop` = https://dev.sieamb.org). Old Pages URL https://rodrigo-rac2.github.io/SIEAmB/ redirects (branch `gh-pages`)
- Repo: https://github.com/rodrigo-rac2/SIEAmB
- Full plan: docs/IMPLEMENTATION_PLAN.md (also published as a Claude artifact: https://claude.ai/code/artifact/6af1a1b5-57dc-4440-abd3-237a6f3ee474)
- Reference site (inspiration): https://engema.org.br/28/
