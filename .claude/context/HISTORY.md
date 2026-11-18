# SIEAmB — Session History

Append a dated entry per working session. Newest first.

## 2026-11-17, afternoon and evening — Feedback on dev, people and roles, e-mail trouble, release prepared

- **Organiser limits** (#264, #265, #266): an Organizador no longer changes or withdraws papers and is not told who the administrators are; the reviewer picker says why nobody can be chosen.
- **People and roles rebuilt** (#268 to #272, #275, #277, #280): one list of every account with its roles; an Organizador gives Avaliador, an Administrador also Organizador, only the owner gives Administrador; administrators correct a name and institution and send a new-password e-mail; only the owner changes an e-mail or a CPF or types a password; nobody is shown a role above their own. Rodrigo's dev account marked owner.
- **A clear waiting state** across the panel (#278) and a show-password button (#262).
- **The Resend daily limit was reached** (#261). The automatic tests had mailed the real organisers on dev about 200 times that morning (#255, already fixed), and dev shares the Resend account with production, so production's e-mails stopped for some hours too. Resend kept accepting messages and dropping them, so the site recorded them as sent. 104 test e-mails still queued on dev for two real people were found and removed before the limit reset. Rodrigo upgraded the plan.
- **The background job was not keeping time** (#273): on a 10-minute schedule, GitHub ran it three times in a day. Found when a failed reminder waited three hours and again when an announcement did not leave (#281). Now the database starts it (`pg_cron`, `pg_net`, secrets in Vault), proved on dev by three ticks on the minute, and an announcement sends its e-mails in the same click.
- **Release prepared, not done**: Rodrigo chose "prepare only". Production backup taken, draft pull request #274 with the ordered steps.
- **Backlog reviewed**: 11 issues closed (already live, or overtaken by what was built), 4 refreshed.
- **Documentation brought up to date** (#284): ADR-009 on how the site runs, ADR-002, 005, 007 and 008, the README, CLAUDE.md, and STATUS rewritten.
- **Closed for the day with the release set for the evening of 2026-11-18** (Rodrigo): the team tests the submission system on dev during the day, more manual testing follows, and only then production. Everything of the day is merged to `develop`; the only open pull request is the release draft #274.
- Lessons: a shared dev database needs the tests to stay among themselves in every channel, e-mail included; "accepted by the mail service" is not "delivered"; a scheduled GitHub workflow is not a clock; a label that wraps its field is not an exact match for a browser test.

## 2026-11-17 — Accounts on dev (slice 1 of the submission system)

- Plan agreed with Rodrigo: four slices (accounts, sending papers, organisation area, notifications), each finished and tested on dev before the next. Account optional to register, required to submit.
- Built accounts on dev (#208, #209, #210, ADR-007): create account, confirm e-mail, choose password, log in, forgotten password, Minha área, linking a registration by confirmed e-mail or by a CPF match proved with a link sent to the registration's e-mail, registration form tied to the account.
- Found by testing against the real login service, not by the unit tests: a password set while the address is unconfirmed survives confirmation (so the password is now chosen after the link); changing an unconfirmed account's password cancels its pending link; saving a password ends the session; a `[action].ts` function loses to the SPA catch-all rewrite; the functions cannot import `@sieamb/shared` (ES module versus CommonJS, fails only on Vercel).
- Browser tests run against the preview deployment and the dev database, with the confirmation link read from the login service because test addresses are never mailed.
- Exploratory pass with playwright-cli found three defects, fixed the same day (#212, #213, #214): no "Dados salvos" after the first CPF save, a spent link logging a logged-in person out, the top bar overflowing on phones.
- Slices 2, 3 and 4 built the same day with the edital's values (ADR-008): paper submissions with private file storage (#216), the general outbox and notifications (#217), the organisers' panel with manual registration, manual status, soft delete and roles (#219, #204), the bell and announcements (#221). Each slice: unit tests, a browser test against the preview and the dev database, then merged to develop.
- Found along the way: Supabase Storage answers with unencoded addresses and refuses object names with spaces or accents (we use our own random names); the audit line must read the "before" value before the change is made; a test that types into a form must wait for the right tab to be on screen.

## 2026-11-16 — Payments live, e-mails, reminders

- Payments released to production (#166): card and boleto through Mercado Pago, wording changed from "pré-inscrição" to "inscrição", "Inscrições abertas" call-out on the home page, CPF mask in the form.
- Real cards kept being refused as high risk. The order now sends the buyer's name without accents, the CPF and a single instalment (#191, #194, #198); the first card was approved after that. A card under Mercado Pago's review counts as pending, a refused card can be retried on the same order (#182, #188).
- E-mails built and released the same day (#185, #187, #195): outbox table, background job every 10 minutes from GitHub Actions, registration-received e-mail, Resend as the sender, `inscricoes@sieamb.org` with Cloudflare forwarding.
- Reminder schedule decided by Rodrigo after a look at what shops and event organisers do: day 1, day 3, then 7 days and 1 day before each fee date (#201). Switched on at 16:07; the first reminder went to the 10 people who registered before payments existed, and the first of them paid within two hours.
- Four test registrations erased by hand from production; soft delete proposed (#204, ADR-006).
- Submission system proposal written for Najara and Profa. Viviane as a shared document (roles, author flow, review, notifications, nine questions for the committee). Not built; waiting for their answers.
- Decisions recorded in ADR-004 (payments), ADR-005 (e-mails and reminders), ADR-006 (soft delete, proposed) (#205).
- Gotchas: the Pagar button on Mercado Pago's page stays locked when the browser is logged in as the seller; the Mercado Pago checkout refuses headless browsers; a boleto shows a three-day due date while the order expires in one (#167).

## 2026-11-05 — Payments built on dev (#16, #158, #160)

- Mercado Pago chosen, account under the empresa júnior, Checkout Pro with the Orders API. First server code in the repository (`packages/server`, Vercel functions under `/api/v1/payments`). Sandbox card and boleto payments confirmed end to end on dev; details in STATUS.md.

## 2026-10-25 — Pre-registrations persist (#149)

- Rodrigo: "this site is open for business... the pre-inscricao... is still just a template". Confirmed: the live form showed "Pré-inscrição recebida!" and `StaticDataProvider` faked success; every submission since 10 Oct was lost. The `registrations` table from #13 needs an auth user, so it could not take anonymous rows.
- Shipped #149 (PR #150 → develop, release #151 → main): `pre_registrations` table (anon INSERT-only RLS gated on `settings.registrationOpen`, no browser reads, service role exports), `SupabaseDataProvider` extending the static one with a single remote call, LGPD consent checkbox in place of the password field, `VITE_DATA_PROVIDER=supabase` on Vercel for all environments. Migrations applied on `sieamb-dev` and `sieamb-prod`.
- Found while probing: Prisma's `@default(uuid())` is client-side, so PostgREST inserts failed on `id`; a second migration adds `DEFAULT gen_random_uuid()`. The `schema.test.ts` guard now reads every migration and allows exactly one browser write grant.
- Verified end to end: REST probes on both projects (201 / 409 duplicate / 42501 closed event, select, update, delete), Playwright against a local build wired to dev, and a real browser submit on sieamb.org after the release (row landed, upper-cased duplicate rejected, probe deleted). The e2e form test skips the submit on production and uses a unique e-mail per run.
- Decisions: duplicates are blocked by e-mail per event only; CPF/passport duplicates accepted for now ("niche, no need to overengineer"). Najara told the data is being saved and the list will be used when registrations open. Docs follow-up is #152.

## 2026-10-12 — Translations end to end, CI off the Vercel app

- Two asks: the language switcher was nearly invisible, and "some stuff does not get translated". Audit with Playwright: all 142 UI keys exist in every locale; every leak was fixture content (venue, dates, areas, news, team groups, bios, about). Plan approved: machine-draft everything, flag zh-CN under #23.
- Shipped (one issue per PR, #78–#83, #89, #93 → PRs #84–#88, #90, #91, #94, releases #92 and the follow-up): switcher with flag + text code and solid active state; `LocalizedText` + `localize()` + `useLocalized()` in shared/frontend; translated venue, 14 date labels, 5 team groups, 2 lots, 6 areas, 2 news items, 22 bios, 4 founder affiliations, 2 about texts; Playwright guard over 19 routes × 3 locales; locale-completeness unit test.
- Vercel's GitHub app stopped posting deployments/checks (one build `git_info_fail`), blocking the required `e2e-preview`. Rewrote it: build emits `/version.json` with the SHA, workflow derives the URL from the branch and polls until it serves the head commit. Merges no longer depend on the app.
- Vercel's automatic DDoS mitigation challenged sieamb.org for ~20 min right after release #92 (6k requests in minutes from our own deployed test run + audits). #93 made the guard render pt-BR once per route and drop image/font/media requests.

## 2026-10-11 — Najara's links batch, issue-per-change rule

- Najara sent Lattes/ORCID (Viviane, Thays, Laura, Luana, Lourdes), affiliations (Pollyanna, Luana, Zhou Lin, Thays) and asked for the home date written out. Applied via #67–#69 (PRs #71, #72), released in #74. Viviane's founder card was missed (separate `founders.json`), fixed in #75/#76/#77 with a cross-file consistency test.
- Rodrigo: "make sure all changes go through an issue even if you're creating and resolving the issue immediately… we need a resolution log." Recorded in CLAUDE.md, README and memory (#70, PR #73).
- Issue review: #12 stays open only for the presentation text (now with Prof. Viviane for approval) and Rodrigo's entry; #16 no longer waits on the committee; #11/#37 have buildable parts.

## 2026-10-10 — Context regroup + rollout planning

- Najara's WhatsApp batch: event moved to 24–26 March 2027 and is online (YouTube); new cronograma (edital 23/10, submissions 09/11–18/01, results 12/03); fees 30/50, 50/70, 70/90; about-page = general text + per-edition text; idealizadores fixed; team page per edition (fixed + variable). Rodrigo committed to registrations opening 10/11/2026 (Even3 fallback).
- Captured the Wix "Sobre" and "Equipe" texts (general text, 2025 text, 4 idealizadores with bios, 2025 team bios) and the Unicamp per-year layout reference.
- Domain check (registro.br whois, 10/10): sieamb.org.br / .com.br / .net.br / .eco.br / .org / .com all free. `.org.br` is a restricted category (CNPJ); `.com.br`/`.eco.br` can go on a CPF.
- **sieamb.org registered (Cloudflare Registrar) and live on Vercel Hobby** (team `sieamb`, DNS stays on Cloudflare, apex + www via Domain Connect, Git-connected for auto-deploys). `vercel.json` sets `VITE_BASE=/` and SPA rewrites; vercel CLI is a root devDependency.
- Process decision: from now on `feature/* → develop → main`, no direct commits (PR #1 → develop, PR #2 → main were the first). Rodrigo admin-merges until Samuel is active.
- **Dev environment**: `dev.sieamb.org` bound to the `develop` branch (Vercel branch domain), `www` 308-redirects to the apex, Vercel Authentication on previews turned off (needed for Playwright against preview URLs later). All three domains verified and serving.
- **Backlog moved to GitHub Issues** (19 issues, #5–#23, English) under 4 milestones tied to the event dates (Edital 23 Oct · Registrations + submissions 10 Nov · Peer review Jan–Mar 2027 · Event 24–26 Mar 2027) and 4 labels (content, feature, infra, waiting-committee). PENDING.md retired with a mapping table. README got a "Backlog e processo" section and the environments table; CLAUDE.md, /status, /wrap-up, /pending-items, /log-daily and the two content skills now point at issues and the PR flow.
- **Content shipped the same day (PRs #26–#36, #40)**: #5 March 2027 dates + online venue + cronograma; #8/#9 About page (general text, per-edition text, idealizadores with bios); #10 team page per edition (Najara's bios doc + WhatsApp: Comitê Científico, Revisores with Thays coordinating, Mídias with Lara/Daniela coordinating; 2025 recap gains bios and Palestrantes); #31 20 photos from the Drive folder (zip via Finder, ffmpeg avif→jpg, face-biased square crops); #34 Equipe in the menu; #38/#39 bio shown once per person, editions link moved to the top bar so the menu stays on one line at laptop width. Unnamed 2025 photo wired as Laura by elimination (to confirm).
- **Testing process (PR #44)**: shared format tests, `lib/nav.ts` + `lib/team.ts` unit tests, RTL integration tests for About/Team/Venue/Header, Playwright `@deployed` spec and `BASE_URL` support, `e2e-preview.yml` on every Vercel deployment, `branch-policy.yml` (main only from develop/hotfix/*). Ruleset now requires quality, e2e-smoke, e2e-preview, branch-policy. Bug caught by the new tests: `<html lang>` stayed pt-BR after reload with a stored locale (fixed). #47 guards e2e-preview against the Pages deployment.
- **GitHub Pages retired (PR #49)**: workflow, 404 trick and `/SIEAmB/` base removed; Pages source switched to a one-file `gh-pages` redirect branch.
- Messages sent to Najara: team-page update + open questions (lot dates, edital, areas, edition year, "dezembro", Laura's photo). Her answers so far: team groups (doc updated), lot dates tonight, edital being finalised, comitê científico = Najara, Niklas, Viviane.

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

---

## Archive: STATUS.md as it was until the rewrite of 2026-11-17

Kept word for word, because it holds details that are nowhere else (what was confirmed against the Mercado Pago sandbox, the first real payments, the budget discussion of September 2026). Where it disagrees with the current STATUS.md or with a decision record, those win.

## SIEAmB — Current Status

> Last updated: 2026-11-16, evening (update this file whenever meaningful progress happens)
> Daily log: `.claude/log/<year>-w<week>.md` · Backlog: GitHub Issues by milestone (commands: `/log-daily`, `/pending-items`)

### Where we are

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
- **Payments (2026-11-05, #16, #158, #160)**: **live in production since 2026-11-16 (#166)**, card and boleto, no Pix; sandbox on dev. Mercado Pago account under the empresa júnior, developer app `SIEAmB Inscricoes` on Checkout Pro with the **API de Orders** (the panel flags the Preferences API as "será descontinuada em breve"; `docs/IMPLEMENTATION_PLAN.md` §7 still describes Preferences and needs the rewrite).
  - **Server** (first server code in the repo): Vercel functions in `/api/v1/payments/*` as thin entry points, logic and tests in the `packages/server` workspace. `POST orders` (body `{token}`) looks up the fee on the server from the same fixtures the fee table shows (`feeTiers.json`), creates the order (`POST /v1/orders`, idempotency key = our payment id) and answers with the `checkout_url`; a second call returns the same open order; an order older than 23 h is checked and cancelled at Mercado Pago before a new one is opened. `POST webhook/mercadopago` checks `x-signature`, reads the order back with `GET /v1/orders/{id}` and records the status. `GET status?p=<payment id>` serves the return page and re-reads an open order, so the page does not depend on the notification.
  - **Database** (migration `20261105230000_payments`, on sieamb-dev since 5 Nov and on sieamb-prod since 16 Nov, after a fresh backup): `payments` (service_role only, RLS on with no policy, one open payment per pre-registration by a partial unique index) and `pre_registrations.pay_token` (uuid, the handle that starts a payment; generated by the browser on insert because the anon role cannot read the row back). The frontend only sends it when `VITE_PAYMENTS_ENABLED=true`.
  - **Screens** (behind `VITE_PAYMENTS_ENABLED`, on for Vercel Preview and Production): pay button after the form, `/:event/inscricoes/pagar?t=<pay token>` for paying later, `/:event/inscricoes/pagamento?p=<payment id>` as the return page.
  - **Vercel env**: Preview has the sandbox `MP_ACCESS_TOKEN` and `MP_WEBHOOK_SECRET`, `VITE_PAYMENTS_ENABLED=true` and `PAYMENTS_NOW=2026-11-12T12:00:00-03:00` (moves only the fee-lookup clock so lot 1 can be tried before 10 Nov; ignored in production; **remove it after 10 Nov**). Production has the production `MP_ACCESS_TOKEN` and `MP_WEBHOOK_SECRET` and `VITE_PAYMENTS_ENABLED=true` since 16 Nov (release #169). `.env.local` holds production and test credentials, both webhook secrets and the test seller and buyer (`MP_*`, `MP_TEST_*`).
  - **Confirmed against real sandbox payments on 2026-11-05**: the signature recipe is HMAC-SHA256 over `id:<data.id lower-cased>;request-id:<x-request-id>;ts:<ts>;` with the webhook secret (the lower-casing is not in the docs pages we read); sandbox payments do send `order.processed` notifications, within seconds; the Vercel firewall lets Mercado Pago through; test credentials work with the Orders API although its reference says otherwise; an approved card payment is `processed` / `accredited`; Mercado Pago sends the buyer back to our return URL with its own `status=` query, which we ignore. The checkout answers **403 to a headless browser**, so an automated test can go as far as the redirect, not through the payment.
  - **Boleto (tested 2026-11-05 on dev)**: the checkout asks for CPF, name and address and generates the boleto; Mercado Pago sends `order.action_required` (`action_required` / `waiting_payment`, method `bolbradesco`) and the payment is recorded as PENDING, which the return page shows as "Pagamento em processamento". A boleto actually being paid could not be tried in the sandbox.
  - **Go-live checks (2026-11-16)**: on sieamb.org the order endpoint answers 404 to an unknown pay token, the status endpoint 404 to an unknown payment, the webhook 401 to a bad signature, and the pay page renders. The production token belongs to an active MLB account.
  - **Real payments (2026-11-16)**: first approved boleto (R$ 30, Rodrigo's test, later deleted from the database and still to be refunded, order id on #166) and first approved card (R$ 70, Rodrigo's own registration, still to be refunded). Three cards were refused as high risk and one went to manual review before the order started carrying the buyer's name without accents, the CPF and a single instalment (#191, #194, #198). The first real registrant paid the same evening, after the first reminder. Decisions in `docs/adr/004-payments-mercado-pago.md`.
  - **E-mails and reminders (2026-11-16, #185, #187, #195, #201)**: live in production. Every e-mail is a row in `payment_emails` first (unique `dedupe_key`, claimed by compare-and-swap, six attempts), delivered by the request or by the background job `POST /api/v1/payments/emails/deliver` that the database of each site starts every 10 minutes (`pg_cron` + `pg_net`, migration `20261118010000_background_job_schedule`, #273; on dev since 2026-11-17, **on production only after that migration runs and the two Vault secrets `sieamb_site_url` and `sieamb_cron_secret` are set there**). GitHub Actions (`email-sweep.yml`) is an hourly second line: on `*/10` it ran about three times a day. Kinds: registration received (with the pay link), payment processing, confirmed, failed, reminder. Reminders are on (`REMINDERS_ENABLED=true` on Vercel Production): 1 and 3 days after registering, then 7 days and 1 day before the end of each fee lot, 08:00 to 20:00 only. Sender is Resend over SMTP as `inscricoes@sieamb.org`, replies go to the committee's Gmail, and Cloudflare Email Routing forwards mail sent to that address. Texts in four languages. Migrations `20261116160000_payment_emails`, `20261116170000_payment_email_reminders`, `20261116180000_payment_email_received` on both databases. Decisions in `docs/adr/005-emails-and-reminders.md`.
  - **Test rows deleted (2026-11-16)**: four registrations with a plus sign in the e-mail were erased by hand from sieamb-prod, copy kept in the git-ignored `.env.backups/`. Soft delete is proposed in `docs/adr/006-soft-delete.md` (#204).
  - **Not done**: the refund of the two real test payments (#166); a boleto paid after the one-day order expiry was never verified (#167); the Vercel team is still on Hobby (#168, Rodrigo decided to upgrade); **no Pix** on the account (cards, boleto and account money only, a Pix key could not be created on 2026-11-05); the fee table only covers ESTUDANTE_GRADUACAO, ESTUDANTE_POS and PROFISSIONAL, any other category answers "no fee available"; people who pre-registered before payments existed need their pay link sent to them (every row has a `pay_token`); committee list of who paid (#15); refunds are recorded when Mercado Pago reports them but there is no screen to issue one; no empenho or exemption flow; no automated check of a real inbox (testmail.app or MailSlurp, not set up); Mercado Pago's approval advice not done (Device ID script, item details, integration quality); `PAYMENTS_NOW` should be removed from Vercel Preview; test rows named `TESTE PAGAMENTO (#160)` are in sieamb-dev.
- **Accounts (2026-11-17, #208, #209, #210)**: **on dev only**, slice 1 of the submission system. Create account (name and e-mail, the password is chosen after the link in the e-mail), log in, forgotten password, `/:event/minha-area` with the registration status, pay link and profile. A registration with the same confirmed e-mail is linked to the account; one under another e-mail with the same CPF or passport is offered as "is this yours?" and linked by a link sent to the registration's e-mail. The registration form is filled from the account and stops a CPF already registered under another e-mail. Server: one function `api/v1/account.ts` (rewrite in `vercel.json`), logic in `packages/server/src/account`. Switched by `VITE_ACCOUNTS_ENABLED` and `ACCOUNTS_ENABLED`, set on Vercel Preview only. Migration `20261117010000_accounts` (`pre_registrations.user_id`, `registration_link_requests`, `rate_limit_hits`, `hit_rate_limit()`) is on sieamb-dev only. **To release to production**: apply the migration to sieamb-prod after a backup, set both flags on Vercel Production, redeploy. Not built: the organisers' screen to approve a link request when the person lost the old inbox, merging duplicate registrations, turning off public sign-ups in the Supabase dashboard. Decisions in `docs/adr/007-accounts.md`. Next slices: sending papers, organisation area, notifications and announcements.
- **Submission system, slices 2 to 4 (2026-11-17, #216, #217, #219, #221)**: **on dev only**, behind the same two switches as accounts. Built with the edital's values, without waiting for the committee's answers.
  - **Papers**: `/:event/meus-trabalhos` and the form; rules in `submissionRules.json` (window 15/11/2026 to 18/01/2027, 5 authors, 3 as main and 5 as co-author, 12 to 15 and 4 to 6 pages, PDF or Word up to 10 MB), enforced by `packages/server/src/submissions`. Files in the private Supabase Storage bucket `submissions` (created by the server on first use), uploaded through a one-time link and downloaded through a one-minute link. One file with the authors' names; no blind version.
  - **Organisers' panel**: `/:event/painel` (inscrições, trabalhos, pessoas e papéis, comunicados, pedidos), server in `packages/server/src/admin`. Roles `ADMIN` and `ORGANIZER` per edition, platform administrators everywhere. Manual registration, manual status with reason, soft delete and restore of registrations (#204), role invitations for addresses without an account, approval of link requests, audit log.
  - **Notifications and announcements**: bell in the top bar, `/:event/notificacoes`, announcements to a group from the panel. General outbox `outbox_emails`, delivered by the same background job (40 per run).
  - **Functions**: `api/v1/account.ts`, `submissions.ts`, `admin.ts`, each reached by a rewrite in `vercel.json` (9 functions in all; the Hobby plan allows 12).
  - **Migrations on sieamb-dev only**: `20261117010000_accounts`, `20261117020000_submissions`, `20261117030000_organisation`, `20261117040000_announcements`.
  - **To release to production**: backup, the four migrations on sieamb-prod, `VITE_ACCOUNTS_ENABLED` and `ACCOUNTS_ENABLED` on Vercel Production, redeploy, give the first Administrador role (an invitation row for the address, or `users.is_platform_admin`), and upgrade the Resend plan before announcements are used (the free plan allows about 100 e-mails a day).
  - **Not built**: the review form (scores, recommendation, opinions), results, an unsubscribe link, merging two registrations of the same person (delete one instead).
  - **Changes asked by the committee and Rodrigo on 2026-11-17 (#230 to #233, #236)**, on dev only:
    - **Any author sends a paper** (#230): one ordered author list, no main author or co-author; whoever sends is in the list in any place; any listed author with an account changes or withdraws; the edital's limits are counted by place in the list (3 as first author, 5 elsewhere).
    - **Name suggestions** (#231): typing an author's name suggests people already in the system, with a masked e-mail; the page never gets the address (`search_people`, sealed reference).
    - **Review is not blind, one reviewer or more** (#232): organisers assign reviewers per paper in the panel; reviewers have `/:event/avaliacoes` with their papers and the file. A paper with a reviewer is "em avaliação" and locked for its authors. The review form is not built.
    - **The closing date does not lock** (#233): 18/01/2027 is only what the site shows (`locksAtClose: false`); the committee will postpone it and announce later. Until then the site says nothing about an extension.
    - **Close and reopen by button** (#236): organisers close submissions for the edition in the papers tab, and reopen them.
    - **Migrations on sieamb-dev only, added**: `20261117050000_people_search`, `20261117051000_people_search_institution`, `20261117060000_submission_reviewers`, `20261117061000_submission_reviewers_created_at`, `20261117070000_submissions_closed`.
  - **Feedback round of 2026-11-17 (Rodrigo and Najara testing on dev)**, all on dev only:
    - **Only the sender changes or withdraws a paper** (#250); the other authors see and download it. Administrators and the platform owner change or withdraw any paper at any time, from the panel's papers tab; an Organizador does not (#265), and does not see the administrators in "Pessoas e papéis" (#264). "Pessoas e papéis" is one list of every account with its roles (#268), where nobody is shown a role above their own (#275): an Organizador gives Avaliador, an Administrador also Organizador, only the owner (`users.is_platform_admin`) gives Administrador. Administrators and the owner correct another person's name and institution (#269) and send them a new-password link (#270), for people below them. **Before production: mark the owner's account with `is_platform_admin`, or nobody can give Administrador.** This replaced the "any listed author can change" of #230 the same day.
    - **Ways in** (#244, #246, #252, #253): the home page has "Enviar trabalho" beside "Fazer inscrição"; the top bar has "Entrar ou criar conta", and when logged in "Minha área", "Painel" (for who may open it) and "Sair" at the far right. Minha área opens with the papers ("Enviar novo trabalho"), and the not-registered reminder is at the bottom, as it is in Meus trabalhos (#257). Someone who creates an account on the way to a page continues to it after the e-mail link and the password (the page rides on the link, checked by the server).
    - **Fixes found by testing**: dates from the database were shown three hours late in the browser (#239, the server now marks them as UTC); the paper form was wider than a phone screen and the author row controls were tiny (#241); a reviewer was not told when losing the role took them off papers (#242); a cancelled test run left its data on dev (#248, the workflow now always cleans up); test runs e-mailed and notified the real organisers on dev, 168 e-mails in one day (#255, what is about test data now stays among test accounts).
    - The team's guide is the "Guia de teste" tab of the shared proposal document.
  - Decisions in `docs/adr/008-submissions-and-organisation.md` (and the note at the top of ADR-003).
- **Still waiting on the committee**: II SIEAmB presentation text (with Prof. Viviane for approval, #12), edital text (#11), 2027 thematic areas (#37), Rodrigo's own team entry (#12), Mayra's photo (#12). **Waiting on Rodrigo**: Supabase/Resend accounts (#13, #14, #15, #18), the Mercado Pago Pix key (#16), the refund of the test payments (#166) and the Vercel upgrade (#168). **Waiting on the committee too**: answers to the nine open questions of the submission system proposal (shared document, private until Rodrigo shares it; submissions are not built and the edital says they opened on 15/11/2026), `.env.local` template ready.

### What works today

- Monorepo (npm workspaces): `packages/shared`, `packages/frontend`, `packages/e2e`, `packages/db`, `packages/server` (logic behind the Vercel functions in `/api`)
- All public pages in 4 languages (pt-BR default forced, en, es, zh-CN), UI strings and fixture content alike — flag + code buttons in the topbar, preference in localStorage (`sieamb-locale`)
- Multi-event routing: `/2027/` (current II SIEAmB, 24–26 Mar 2027, slug may become `/2027/` per #6), `/2025/` (archived recap with team, speakers, anais), root redirects to current event (`isCurrent` in `events.json`)
- **Per-edition themes** (ADR-001): each event's optional `theme` overrides the CSS tokens for that edition only; archived editions keep their palette forever. Current-edition identity goes in the event `theme`, tokens.css is just the neutral fallback. 2025 has a demo blue theme as proof
- Pre-registration form with CPF/passport validation (zod schemas in `@sieamb/shared`) and LGPD consent, persisted to `pre_registrations` (#149). Read the rows with the service role key (Supabase Table Editor or REST); the e2e form submit runs on local/preview only, never on production
- News (avisos) list + detail with markdown
- Tests: Vitest + RTL on the fixtures (shared + frontend, incl. a locale-completeness test over every content string) + Playwright (desktop + mobile; smoke, `@deployed`, Portuguese-leak guard) run locally in CI and against every Vercel deployment, all green
- SPA routing on Vercel via `rewrites` in `vercel.json`

### What is placeholder / fake

- **Visual identity 2026: APPLIED** (palette, Garet/Lora fonts, logo, lockup hero, cracked-earth texture) via the event record + `public/brand/2027/`. tokens.css remains the neutral fallback. Still open: 2026 theme/dates text from the committee (the design mock still shows 2025's), optional SVG exports
- **Still placeholder**: fee lot dates and category labels (#7), thematic areas for 2027 (#37), edition presentation text for 2027 (`aboutMd` null → "em breve"), editais (#11), news items, sponsors logos, contact e-mail (fixtures say sieambufcg@gmail.com from the old site). Everything else on the public pages is real committee content
- **Pre-registration persists since 2026-10-25 (#149)**: the form inserts anonymously into `pre_registrations` (Supabase, RLS insert-only for anon, no reads; service role exports). No password, no account, no confirmation e-mail yet (#14, #18). `VITE_DATA_PROVIDER=supabase` on Vercel (all environments); a local build without it still fakes success. Submissions before 25 Oct were lost
- **zh-CN translations are machine-drafted** — need native-speaker review before the event

### Budget reality check (2026-09-13)

Professora Viviane (project lead) said there is **no budget for ~R$250/month**. Her Joomla suggestion was evaluated and rejected (legacy install, no registration/payment components, unsafe for CPF/payments — details kept off the public repo). The answer is the **R$0/month architecture**, which the stack already supports:

- Vercel free (frontend) + Supabase free (Postgres 500 MB, Auth; weekly `pg_dump` GitHub Action replaces PITR) + Express on **AWS Lambda Function URL** (always-free tier; App Runner dropped — it bills idle provisioned memory) + Cloudflare R2 free 10 GB for all PDFs (submissions + anais) + Resend free for email (needs the domain).
- **Peer review designed against Brazilian practice (ADR-003, 2026-09-13)**: research report in `docs/research/peer-review-brazilian-events.md` (JEMS, Even3, Doity, Galoá, SIGEventos, ANPAD, real forms). One anonymised PDF at submission; weighted 1–5 criteria form + gate + confidence + 4-option recommendation + comments to authors/committee; desk check; divergence ⇒ 3rd reviewer; committee decides oral/pôster; no rebuttal; ACCEPTED_PENDING_REGISTRATION; reviewer certificates.
- **Roles redesigned (ADR-002, 2026-09-13)**: per-edition memberships (`event_members`) with ADMIN, SCIENTIFIC_CHAIR, AREA_CHAIR, REVIEWER, EDITOR, FINANCE, STAFF + `is_platform_admin` flag; participant/author/registered are derived states. Conflict-of-interest rule and e-mail-based certificates for co-authors added to the plan.
- Payments with **no monthly fee**: Mercado Pago Checkout Pro / links de pagamento (per-transaction fees only; webhooks retry, so cold starts are fine). Alternative with even less build: Even3 for registration+payment (per-ticket fee, used by the 1st edition), our site stays the public face.
- Trade-offs: weekly instead of point-in-time backups, cold starts on the API, free-tier pausing mitigated by a scheduled ping.
- Remaining costs: domain ~R$40/yr + Samuel's bolsa (committee's call).

### Next steps

The backlog is GitHub Issues, ordered by milestone: https://github.com/rodrigo-rac2/SIEAmB/milestones

**Payments went live on 2026-11-16** (#166, release #169), six days after the planned opening. In this order:

1. **One real low-value payment and its refund** (Rodrigo, #166). Until then the production webhook secret is unchecked.
2. **Upgrade the Vercel team to Pro** (#168).
3. **Send the pay link to everyone who pre-registered before payments existed** (11 rows on 16 Nov). The link is `/:event/inscricoes/pagar?t=<pay_token>`. Nobody has received one.
4. **Boleto validity** (#167): orders expire after one day; check that a boleto paid later is credited, lengthen the validity if not.
5. **Pix key** on the Mercado Pago account (#16).
6. **Committee list of who paid** (#15). A CSV export covers the first days if the screen is not ready.
7. **Confirmation e-mail** (#18, #14). Blocked on the Resend key (`RESEND_API_KEY` is empty in `.env.local`).
8. **Submissions** (#17): no plan yet, a call for Rodrigo and the committee.

After launch: remove `PAYMENTS_NOW` from Vercel Preview (10 Nov has passed); accounts (#14); a way to issue refunds; the empenho and exemption flows; the payment decision ADR (#16 checklist) and the `docs/IMPLEMENTATION_PLAN.md` §7 rewrite for the Orders API; an automated test up to the checkout redirect.

Milestones after the opening: **Peer review (Jan-Mar 2027)** #21, **Event (24-26 Mar 2027)** #22 certificates/anais, #23 zh-CN review (no milestone). Still open from the Edital milestone: #132 presentation text, #12 committee asks.

### External dependencies to kick off early

- **Domain decided 2026-10-10: `sieamb.org`** (free as of 10/10; register at Cloudflare Registrar, Rodrigo's account). `sieamb.ufcg.edu.br` stays an optional STI ask
- Mercado Pago account under the empresa júnior CNPJ (open; developer app created 2026-11-05, see Payments above; money flows to them)
- ISSN application via IBICT for the anais (not started, slow process)
- Design identity (in progress by the event's design team)

### Key links

- Live site: https://sieamb.org (Vercel team `sieamb`, project `sieamb`, Git-connected to rodrigo-rac2/SIEAmB; `main` = production, `develop` = https://dev.sieamb.org). Old Pages URL https://rodrigo-rac2.github.io/SIEAmB/ redirects (branch `gh-pages`)
- Repo: https://github.com/rodrigo-rac2/SIEAmB
- Full plan: docs/IMPLEMENTATION_PLAN.md (also published as a Claude artifact: https://claude.ai/code/artifact/6af1a1b5-57dc-4440-abd3-237a6f3ee474)
- Reference site (inspiration): https://engema.org.br/28/
