# SIEAmB — Current Status

> Last updated: 2026-11-19. Update this file whenever something meaningful changes.
> Decisions: `docs/adr/` (001 to 010). Session log: `.claude/context/HISTORY.md`. Backlog: GitHub Issues by milestone.
> The long narrative this file had until 2026-11-17 is kept, word for word, at the end of HISTORY.md.

## In short

The II SIEAmB site is live at https://sieamb.org with the public pages, registration and payment. The submission system (accounts, papers, the organisers' panel, announcements) is finished and tested on https://dev.sieamb.org and **waits for Rodrigo's go to reach production**. That release is prepared as the draft pull request **#274**, with a production backup taken on 2026-11-17. **Plan (Rodrigo, 2026-11-17 night): release on the evening of 2026-11-18**, after the team has tested on dev during the day and after more manual testing. Not before, and not without his word that evening.

**Changed on 2026-11-19:** testing on a real phone, Rodrigo found that an account could send a paper with nothing but an e-mail. He decided that a person is identified by a document (CPF or passport with its country) at sign-up and on every author line of a paper (ADR-010, issue #342, five parts: #343 to #347). **The release waits for that work**, for a hands-on pass on dev after it, and for his word. The edital says nothing about a document for co-authors: the committee should be told before the form asks.

## What is where

| | Production, https://sieamb.org (`main`) | Dev, https://dev.sieamb.org (`develop`) |
|---|---|---|
| Public pages in four languages, two editions | Live | Live |
| Registration form, saved to the database | Live | Live |
| Payment by card and boleto (Mercado Pago), return page, pay later link | Live since 2026-11-16 | Sandbox |
| E-mails: registration received, payment processing, confirmed, failed, reminders | Live since 2026-11-16 | Live |
| Accounts, Minha área | Off | Live since 2026-11-17 |
| Papers: send, change, withdraw, Meus trabalhos | Off | Live |
| Reviewers: chosen per paper, "Trabalhos para avaliar" | Off | Live |
| Organisers' panel: registrations, papers, people and roles, announcements, requests | Off | Live |
| Notices in the site (bell) | Off | Live |
| Background job on time, every 10 minutes | No: GitHub starts it, a few times a day (#273) | Yes: the database starts it |

"Off" means the two switches `VITE_ACCOUNTS_ENABLED` and `ACCOUNTS_ENABLED` are not set on Vercel Production and the migrations `20261117010000` to `20261118010000` have not run on `sieamb-prod`.

## Live in production

- **Site**: `/2027/` (current, 24 to 26 March 2027, online) and `/2025/` (archive); the root goes to the current edition; `/2026/` redirects. pt-BR by default, en, es, zh-CN. Per-edition theme (ADR-001).
- **Content** is files in `packages/frontend/src/data/`: dates, fees (three categories, two lots), thematic areas, team, editais, news, presentation text. All real committee content.
- **Registration**: the form writes to `pre_registrations` (anonymous insert only, nobody reads it from the browser).
- **Payment** (ADR-004): Mercado Pago Checkout Pro with the Orders API, account held by the Empresa Júnior de Engenharia Florestal - UFCG. Card and boleto, no Pix. Fee looked up on the server from the same table the page shows.
- **E-mails** (ADR-005): Resend over SMTP as `inscricoes@sieamb.org`, replies to the committee's Gmail. Every e-mail is first a row in an outbox, sent at once and retried by the background job. Reminders are on: 1 and 3 days after registering, then 7 days and 1 day before the end of each fee lot, 08:00 to 20:00 only. The Resend plan was upgraded on 2026-11-17.

## On dev, waiting for the release

Decisions in ADR-007 (accounts), ADR-008 (the rest) and ADR-010 (who a person is).

- **Who a person is** (ADR-010): a CPF, a passport with its country, or both, read the same way in the browser, on the server and in the database. One account per document. Every author of a paper has one; the limits are counted per person; a co-author's place waits for the same e-mail and the same document.
- **Accounts**: create with name, e-mail and document, choose the password after the link in the e-mail (where the document is confirmed or corrected), log in, forgotten password, Minha área with the papers first, the registration, the pay link and the profile. A registration with the same confirmed e-mail joins the account; one under another e-mail with the same CPF or passport is offered and joined by a link sent to that e-mail. Signing up on the way to a page continues to it. Password fields have a show and hide button.
- **Papers**: rules in `submissionRules.json` (window 15/11/2026 to 18/01/2027, up to 5 authors, 3 papers as first author and 5 in any other place, 12 to 15 pages for an article and 4 to 6 for an expanded abstract, PDF or Word up to 10 MB). Authors are one ordered list with name and e-mail; any of them sends the paper; typing a name suggests people already in the system with the e-mail masked. Only whoever sent it changes or withdraws it; the other authors see and download it. The closing date is shown and does not lock; organisers close and reopen by a button.
- **Review**: not blind. Organisers choose one reviewer or more per paper, never one of its authors. A paper with a reviewer is "em avaliação" and locked for its sender. The reviewer has `/:event/avaliacoes` with the file. **The review form is not built.**
- **Panel** `/:event/painel`: registrations (list, search, spreadsheet, manual registration, manual status with a reason, soft delete and restore, reminders one by one or to everyone who owes), papers (authors and their registration, reviewers, file, close and reopen), people and roles, announcements, requests to join a registration to an account. Every action is in `audit_logs`. Whatever is being processed shades its line and says "Processando…".
- **Announcements** to everyone, the registered, the authors, the reviewers or the organisers: recorded, shown in the bell, and e-mailed in the same click for up to 40 seconds, the rest by the background job.
- **Notices in the site**: bell in the top bar and `/:event/notificacoes`.

### Who may do what

| | Dono(a) do site | Administrador | Organizador | Avaliador |
|---|---|---|---|---|
| In the database | `users.is_platform_admin` | `event_members` `ADMIN` | `ORGANIZER` | `REVIEWER` |
| Opens the panel | Yes | Yes | Yes | No |
| Gives and takes roles | All three | Organizador, Avaliador | Avaliador | None |
| Registrations: manual, status, delete, see CPF | Yes | Yes | Sees the list, no documents | No |
| Changes or withdraws someone's paper | Yes | Yes | No | No |
| Chooses reviewers, closes submissions, sends announcements | Yes | Yes | Yes | No |
| Corrects another person's name and institution, sends a new-password e-mail | Anyone | People below them | No | No |
| Changes someone's e-mail or CPF, types a password for them | Yes | No | No | No |

Nobody is shown a role above their own. Roles given to an address without an account wait for that account.

## The release to production

**Done on 2026-11-19**, with Rodrigo's go, after a rehearsal of the twelve migrations on `sieamb-prod` inside a transaction that was rolled back. In order: fresh backup (label `before-submissions-release-2026-11-19`), the twelve migrations, the private bucket `submissions`, the two Vault secrets, the two flags on Vercel Production, pull request #274 merged into `main` (630543a). Checked after: 15 registrations and 9 payments untouched, the 10-minute job answered 200 from sieamb.org, the public pages and the new forms open on desktop and iPhone profile with no error, and nothing was written as a test. Still to do: steps 7 and 8 below, and the one registration with a passport, whose country is stored as BR (unknown) and is to be corrected by hand in the panel. The steps as they were planned:

1. Backup of `sieamb-prod`. One was taken on 2026-11-17 (label `before-submissions-release`); take a fresh one right before the release, since registrations and payments keep arriving.
2. Twelve migrations, `20261117010000_accounts` to `20261119020000_save_submission`. They add, with one exception: `20261119010000_identity_documents` rewrites passport numbers already in `pre_registrations` to upper case without separators (format only). Count the passport registrations on production first: their country is BR, because the form never asked, and is read as "not known".
3. The private storage bucket `submissions`.
4. The two Vault secrets `sieamb_site_url` and `sieamb_cron_secret` on `sieamb-prod`, so the 10-minute job has something to call.
5. `VITE_ACCOUNTS_ENABLED` and `ACCOUNTS_ENABLED` on Vercel Production.
6. Merge, deploy, check the live site without writing test data.
7. Rodrigo creates his account on sieamb.org and it is marked `is_platform_admin`. Without an owner nobody can give Administrador.
8. As owner, Rodrigo gives the roles by e-mail in "Pessoas e papéis": Najara Administrador, Thays Organizador, the reviewers Avaliador. Each person creates their own account with that address and their own document (CPF or passport). No temporary password is needed.

The 43 issues finished on dev close when that pull request reaches `main`.

## Waiting on Rodrigo

- Paused on 2026-11-19 while the team and the authors use the live site. The owner account is set (step 7). Step 8 is partly done: eight reviewers were given Avaliador by e-mail; Najara (Administrador) and Thays (Organizador) are Rodrigo's to give in "Pessoas e papéis", unless he already did (one other invitation was waiting before the eight).
- The one registration with a passport has its country stored as BR (unknown): correct it in the panel.
- Check in the Resend dashboard that the eight invitations were delivered.
- "Validate the passport number if filled contains the country code" (2026-11-19) was read as "a filled passport requires its country", which is enforced. Confirm that is what was meant.
- The edital says nothing about co-authors' documents; Najara should know the form asks for them.
- Open, low priority: #341 (panel tabs empty for a moment), #328 (hero buttons shift when the fonts arrive), a refusal on screen stays in Portuguese after switching language (not filed).
- One real low-value payment and its refund, and sending the pay link to the people who registered before payments existed (#166). The R$ 30 boleto test and the R$ 70 card test are still to be refunded.
- A boleto paid after its one-day order expires: is it credited? (#167)
- The Vercel plan: Hobby forbids commercial use and caps functions at 12; we use 8 (#168).
- A Pix key on the Mercado Pago account.
- To confirm, from the hand-over checklist (#229): the edital's limits counted by place in the author list; a paper with a reviewer locked for its sender; "Retirar" taken from organisers together with "Alterar"; one manual reminder per person per day; registering with a CPF does not copy it to the account (logged in, the form now takes the document from the account, ADR-010); no unsubscribe link in announcements and reminders.
- When the committee announces the new schedule: change `closesAt` in `submissionRules.json`.
- Remove `PAYMENTS_NOW` from Vercel Preview: it was for trying lot 1 before 10 November.
- His own entry on the team page (#12).

## Not built

- The review form (criteria, recommendation, opinions), the committee's decision and results, reviewer certificates (#21).
- Certificates and anais (#22); the ISSN application has not started.
- A screen to issue refunds; the empenho flow; merging two registrations of the same person.
- Knowing when Resend drops an e-mail it had accepted (#261).
- An unsubscribe link.
- A native review of the zh-CN texts, which are machine-drafted (#23).
- The programme: the home page card says "Programação em breve".

## How it runs

Full record in `docs/adr/009-runtime-architecture.md`.

- **Vercel** (team `sieamb`, project `sieamb`, Hobby): `main` is production, `develop` is dev, every pull request gets a preview. Eight functions under `api/v1/`, logic and tests in `packages/server`.
- **Supabase**, two free projects in sa-east-1: `sieamb-prod` (ref `lmqprlysncmnozjrmrsb`) and `sieamb-dev` (ref `tasvpjomfncmrpdosqwm`, shared by dev, previews, local work and the automatic tests). Postgres, Auth, Storage. Row-level security on every table.
- **Migrations**: hand-written SQL in `packages/db/prisma/migrations`, applied with `DIRECT_URL=<session pooler> npm run migrate:deploy -w @sieamb/db`. Check that the address is the database you mean before running it.
- **Background job**: `POST /api/v1/payments/emails/deliver` with the site's `CRON_SECRET`. On dev the database starts it every 10 minutes (#273). On production that begins with the release; until then GitHub starts it, and GitHub runs a 10-minute schedule only a few times a day, so a failed e-mail or a due reminder can wait hours there. `email-sweep.yml` ("Run workflow") starts it by hand, and after the release stays as an hourly second line.
- **Other scheduled jobs** (GitHub Actions): weekly encrypted backup of production (`db-backup.yml`, see `docs/db-backups.md`), keep-alive reads every 4 hours, a watchdog every 6 hours that restores a paused project.
- **Switches**: `VITE_PAYMENTS_ENABLED` (Preview and Production); `VITE_ACCOUNTS_ENABLED` with `ACCOUNTS_ENABLED` (Preview only); `REMINDERS_ENABLED` (Production); `PAYMENTS_NOW` and `SUBMISSIONS_NOW` move the clock on previews only.
- **Secrets**: `.env.local` at the repository root is Rodrigo's vault, never committed. Vercel and GitHub hold their own copies. Nothing secret goes in an issue, a pull request or a migration.
- **Domain**: `sieamb.org` at Cloudflare (registrar and DNS; e-mail routing forwards `inscricoes@` to the committee's Gmail).

## Tests

- Unit and component tests with Vitest: `shared`, `frontend`, `server`, `db` (the last reads the schema and the migration files).
- Browser tests with Playwright, desktop and phone, against a local build and against every Vercel deployment: public pages, a guard against Portuguese leaking into the other languages, and, on dev and previews only, accounts, papers, the panel and notifications.
- The browser tests write to `sieamb-dev` with addresses of their own (`e2e+<run>-…@sieamb.org`), are never mailed, and remove what they created in a step that always runs. Sample data for people to look at: `npm run seed:demo -w @sieamb/e2e` (16 registrations and 5 papers under `demo.*@example.com`).
- Required checks on `develop` and `main`: `quality`, `e2e-smoke`, `e2e-preview`, `branch-policy`.

## Process

- Every change goes through an issue, even a one-line fix. `feature/<issue>-<slug>` → pull request to `develop` (`Closes #N`) → release pull request `develop` → `main`. Never a direct commit to either.
- Rodrigo admin-merges while he is the only developer.
- A decision that changes how the system is built gets a record in `docs/adr/`, in the same pull request.

## Key links

- Live site: https://sieamb.org · Dev: https://dev.sieamb.org
- Repository: https://github.com/rodrigo-rac2/SIEAmB · Milestones: https://github.com/rodrigo-rac2/SIEAmB/milestones
- Release draft: https://github.com/rodrigo-rac2/SIEAmB/pull/274 · Hand-over checklist: https://github.com/rodrigo-rac2/SIEAmB/issues/229
- The August 2026 plan, kept as history: `docs/IMPLEMENTATION_PLAN.md`
- Reference site (inspiration): https://engema.org.br/28/
