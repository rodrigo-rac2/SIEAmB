# SIEAmB — Session History

Append a dated entry per working session. Newest first.

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
