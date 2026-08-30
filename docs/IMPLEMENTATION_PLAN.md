# SIEAmB — Implementation Plan

Seminário Internacional de Estudos Ambientais (2nd edition) — UFCG.
Custom-built conference platform, multi-event from day one, maintained by a single developer.

All code, comments, identifiers, and docs: **English**. All user-facing content: **Portuguese (pt-BR)**. Copy lives in content files (`content/pt-BR/*.ts`), never hardcoded in components, so a future en/es locale is a file drop, not a refactor.

---

## Table of contents

1. [Architecture overview](#1-architecture-overview)
2. [Monorepo setup](#2-monorepo-setup)
3. [Database schema (Prisma)](#3-database-schema)
4. [Phase 0 — Visual prototype (detailed)](#4-phase-0--visual-prototype)
5. [Phase 1 — Registration + News](#5-phase-1--registration--news)
6. [Phase 2 — Paper submission](#6-phase-2--paper-submission)
7. [Phase 3 — Payment](#7-phase-3--payment)
8. [Phase 4 — Certificates + Anais](#8-phase-4--certificates--anais)
9. [Testing strategy](#9-testing-strategy)
10. [DevOps](#10-devops)
11. [Milestone summary](#11-milestone-summary)

---

## 1. Architecture overview

```
                        ┌─────────────────────────────┐
                        │  Frontend (React+Vite SPA)  │
                        │  Phase 0: GitHub Pages      │
                        │  Phase 1+: Vercel           │
                        └──────────┬──────────────────┘
                                   │
              ┌────────────────────┼─────────────────────┐
              │                    │                     │
   ┌──────────▼─────────┐ ┌───────▼────────┐  ┌─────────▼─────────┐
   │ Supabase Auth      │ │ Express API    │  │ Supabase Storage  │
   │ (email + Google)   │ │ (Render/       │  │ (PDFs: papers,    │
   │ JWT issuer         │ │  Railway)      │  │  certificates)    │
   └────────────────────┘ └───────┬────────┘  └───────────────────┘
                                  │ Prisma
                        ┌─────────▼─────────┐      ┌──────────────┐
                        │ Supabase Postgres │      │ Mercado Pago │
                        │ (sa-east-1)       │      │ (Phase 3)    │
                        └───────────────────┘      └──────────────┘
```

Key decisions (locked):

| Concern | Decision |
|---|---|
| Repo | npm-workspaces monorepo, single GitHub repo |
| Frontend | React 18 + TypeScript + Vite, React Router |
| Backend | Express + TypeScript (Phase 1+), REST `/api/v1/*` |
| DB | PostgreSQL on Supabase (sa-east-1), Prisma ORM + migrations |
| Auth | Supabase Auth (email/password + Google OAuth); Express verifies Supabase JWT; app roles in our own `users` table |
| Files | Supabase Storage (private buckets, signed URLs) |
| Payment | Mercado Pago Checkout Pro (Pix, card, boleto) + manual empenho flow |
| Multi-event | `events` table, `is_current` flag; every content entity has `event_id`; URLs `/:eventSlug/*`, root redirects to current |
| Identity keys | CPF for Brazilians, passport for foreigners (mutually exclusive, validated) |
| Email | Resend (or Supabase SMTP for auth-only mails in Phase 1); transactional templates in pt-BR |

Data-provider abstraction (important for Phase 0): the frontend never calls `fetch` directly from components. All reads/writes go through a `DataProvider` interface in `packages/frontend/src/services/`. Phase 0 ships a `StaticDataProvider` (JSON fixtures) and a `SupabaseDataProvider` (direct Supabase client, used for news + registration in Phase 0); Phase 1 adds an `ApiDataProvider` (Express). Chosen by env var. This is what lets the prototype be "real" without a backend deployment.

---

## 2. Monorepo setup

### 2.1 Folder structure

```
SIEAmB/
├── .github/
│   └── workflows/
│       ├── ci.yml                  # lint + typecheck + unit/integration tests (all PRs)
│       ├── deploy-pages.yml        # Phase 0: build frontend → GitHub Pages (push to main)
│       ├── deploy-api.yml          # Phase 1+: deploy backend (Render/Railway hook)
│       └── e2e.yml                 # Playwright against preview deploy
├── docs/
│   ├── IMPLEMENTATION_PLAN.md      # this file
│   └── adr/                        # architecture decision records (one .md per decision)
├── packages/
│   ├── shared/                     # @sieamb/shared
│   │   ├── src/
│   │   │   ├── types/              # DTOs, enums (mirrors Prisma enums)
│   │   │   ├── validation/         # zod schemas shared FE/BE (cpf, registration, news…)
│   │   │   ├── utils/              # cpf.ts (digit validation), dates.ts, money.ts (centavos)
│   │   │   └── index.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── frontend/                   # @sieamb/frontend
│   │   ├── public/
│   │   ├── src/                    # (full tree in §4.3)
│   │   ├── index.html
│   │   ├── vite.config.ts
│   │   └── package.json
│   ├── backend/                    # @sieamb/backend (scaffolded Phase 0, deployed Phase 1)
│   │   ├── prisma/
│   │   │   ├── schema.prisma
│   │   │   ├── migrations/
│   │   │   └── seed.ts
│   │   ├── src/
│   │   │   ├── app.ts              # Express app factory (no listen — testable)
│   │   │   ├── server.ts           # entrypoint
│   │   │   ├── config/             # env parsing (zod), constants
│   │   │   ├── middleware/         # auth (Supabase JWT verify), roles, error handler, rate limit
│   │   │   ├── modules/            # feature-sliced: routes+service+repo per module
│   │   │   │   ├── events/
│   │   │   │   ├── news/
│   │   │   │   ├── registrations/
│   │   │   │   ├── submissions/    # Phase 2
│   │   │   │   ├── reviews/        # Phase 2
│   │   │   │   ├── payments/      # Phase 3
│   │   │   │   └── certificates/  # Phase 4
│   │   │   ├── lib/                # prisma client, supabase admin client, mailer, storage
│   │   │   └── jobs/               # scheduled tasks (deadline reminders, payment recon)
│   │   └── package.json
│   └── e2e/                        # @sieamb/e2e — Playwright
│       ├── tests/
│       ├── fixtures/
│       ├── playwright.config.ts
│       └── package.json
├── package.json                    # workspaces root
├── tsconfig.base.json
├── .eslintrc.cjs / eslint.config.js
├── .prettierrc
├── .nvmrc                          # pin Node LTS (22)
├── .env.example
├── CLAUDE.md
└── README.md
```

### 2.2 Root package.json

```jsonc
{
  "name": "sieamb",
  "private": true,
  "workspaces": ["packages/*"],
  "scripts": {
    "dev": "npm-run-all --parallel dev:frontend dev:backend",
    "dev:frontend": "npm run dev -w @sieamb/frontend",
    "dev:backend": "npm run dev -w @sieamb/backend",
    "build": "npm run build -w @sieamb/shared && npm run build -w @sieamb/backend && npm run build -w @sieamb/frontend",
    "test": "npm run test --workspaces --if-present",
    "test:e2e": "npm run test -w @sieamb/e2e",
    "lint": "eslint packages --ext .ts,.tsx",
    "typecheck": "tsc -b",
    "db:migrate": "npm run db:migrate -w @sieamb/backend",
    "db:seed": "npm run db:seed -w @sieamb/backend"
  }
}
```

Notes:
- `@sieamb/shared` is consumed via workspace protocol; build it first (or use `tsc -b` project references — recommended, add `references` in each tsconfig).
- One ESLint + Prettier config at root; per-package tsconfigs extend `tsconfig.base.json` (`strict: true`, `noUncheckedIndexedAccess: true`).
- Husky + lint-staged optional but recommended (`pre-commit`: lint-staged; `pre-push`: typecheck).

### 2.3 Environments

| Env | Frontend | API | DB |
|---|---|---|---|
| local | Vite dev :5173 | Express :3001 | Supabase local (`supabase start`, Docker) or dev project |
| preview | Vercel preview / Pages branch | Render preview | Supabase branch or dev project |
| production | GitHub Pages (P0) → Vercel | Render/Railway | Supabase prod project |

`.env.example` documents: `DATABASE_URL`, `DIRECT_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `JWT_SECRET` (Supabase JWT secret for verification), `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_API_URL`, `VITE_DATA_PROVIDER` (`static|supabase|api`), `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET`, `RESEND_API_KEY`.

---

## 3. Database schema

Full Prisma schema, all phases (migrate incrementally — Phase 1 migration creates events/users/news/registration tables; Phase 2 adds submissions/reviews; Phase 3 payments; Phase 4 certificates. The schema below is the end state).

Conventions: UUID PKs, `snake_case` mapped table/column names, money in **integer centavos**, timestamps `created_at`/`updated_at` everywhere, soft-delete only where legally useful (news), everything else hard rows with status enums.

```prisma
// packages/backend/prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")     // Supabase pooled (pgbouncer)
  directUrl = env("DIRECT_URL")       // direct, for migrations
}

// ───────────────────────────── Events (multi-event core) ─────────────────────────────

model Event {
  id          String   @id @default(uuid())
  slug        String   @unique              // "2026" or "ii-sieamb"
  name        String                        // "II SIEAmB"
  fullName    String   @map("full_name")    // full pt-BR title
  edition     Int                           // 2
  startsAt    DateTime @map("starts_at")
  endsAt      DateTime @map("ends_at")
  venue       String?                       // "UFCG, Campina Grande - PB"
  isCurrent   Boolean  @default(false) @map("is_current")  // exactly one true (partial unique index, see SQL below)
  isArchived  Boolean  @default(false) @map("is_archived") // frozen past edition
  heroImageUrl String? @map("hero_image_url")
  settings    Json     @default("{}")       // per-event toggles: submissionsOpen, registrationOpen, showProgram…
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")

  news            News[]
  importantDates  ImportantDate[]
  thematicAreas   ThematicArea[]
  feeTiers        FeeTier[]
  registrations   Registration[]
  submissions     Submission[]
  certificates    Certificate[]
  committeeMembers CommitteeMember[]
  sponsors        Sponsor[]
  pages           StaticPage[]

  @@map("events")
}

model ImportantDate {
  id        String   @id @default(uuid())
  eventId   String   @map("event_id")
  label     String                      // pt-BR: "Prazo final de submissão de resumos"
  date      DateTime
  isExtended Boolean @default(false) @map("is_extended") // strikethrough old date pattern
  sortOrder Int      @default(0) @map("sort_order")
  event     Event    @relation(fields: [eventId], references: [id])

  @@index([eventId])
  @@map("important_dates")
}

model ThematicArea {
  id          String @id @default(uuid())
  eventId     String @map("event_id")
  code        String                    // "AT-01"
  name        String                    // pt-BR
  description String?
  sortOrder   Int    @default(0) @map("sort_order")
  event       Event  @relation(fields: [eventId], references: [id])
  submissions Submission[]

  @@unique([eventId, code])
  @@map("thematic_areas")
}

model CommitteeMember {
  id        String  @id @default(uuid())
  eventId   String  @map("event_id")
  name      String
  role      String                      // "Coordenação Geral", "Comitê Científico"…
  institution String?
  photoUrl  String? @map("photo_url")
  sortOrder Int     @default(0) @map("sort_order")
  event     Event   @relation(fields: [eventId], references: [id])

  @@index([eventId])
  @@map("committee_members")
}

model Sponsor {
  id       String  @id @default(uuid())
  eventId  String  @map("event_id")
  name     String
  tier     String  @default("apoio")    // "realização" | "patrocínio" | "apoio"
  logoUrl  String  @map("logo_url")
  website  String?
  sortOrder Int    @default(0) @map("sort_order")
  event    Event   @relation(fields: [eventId], references: [id])

  @@index([eventId])
  @@map("sponsors")
}

// Editable CMS-ish pages (O Evento, Regras de Submissão…) so committee text
// changes don't require a deploy once admin panel exists.
model StaticPage {
  id        String   @id @default(uuid())
  eventId   String   @map("event_id")
  slug      String                       // "o-evento", "regras-de-submissao"
  title     String
  bodyMd    String   @map("body_md")     // markdown, rendered client-side
  updatedBy String?  @map("updated_by")
  updatedAt DateTime @updatedAt @map("updated_at")
  event     Event    @relation(fields: [eventId], references: [id])

  @@unique([eventId, slug])
  @@map("static_pages")
}

// ───────────────────────────── Users & auth ─────────────────────────────

enum UserRole {
  ADMIN        // committee: full access
  EDITOR       // can manage news/pages, not users/payments
  REVIEWER
  PARTICIPANT  // default: author/attendee
}

model User {
  id            String    @id @default(uuid())  // == Supabase auth.users.id
  email         String    @unique
  fullName      String    @map("full_name")
  cpf           String?   @unique               // digits only; null for foreigners
  passport      String?                         // foreigners
  country       String    @default("BR")
  institution   String?
  lattesUrl     String?   @map("lattes_url")
  orcid         String?
  phone         String?
  role          UserRole  @default(PARTICIPANT)
  createdAt     DateTime  @default(now()) @map("created_at")
  updatedAt     DateTime  @updatedAt @map("updated_at")

  registrations     Registration[]
  submissionsOwned  Submission[]       @relation("submitter")
  authorships       SubmissionAuthor[]
  reviewAssignments ReviewAssignment[]
  certificates      Certificate[]
  newsAuthored      News[]

  @@map("users")
}

// ───────────────────────────── News ─────────────────────────────

enum NewsStatus {
  DRAFT
  PUBLISHED
  ARCHIVED
}

model News {
  id          String     @id @default(uuid())
  eventId     String     @map("event_id")
  authorId    String?    @map("author_id")
  slug        String
  title       String
  excerpt     String?                          // card/list teaser
  bodyMd      String     @map("body_md")       // markdown
  coverImageUrl String?  @map("cover_image_url")
  status      NewsStatus @default(DRAFT)
  isPinned    Boolean    @default(false) @map("is_pinned")
  publishedAt DateTime?  @map("published_at")
  createdAt   DateTime   @default(now()) @map("created_at")
  updatedAt   DateTime   @updatedAt @map("updated_at")
  deletedAt   DateTime?  @map("deleted_at")    // soft delete

  event  Event @relation(fields: [eventId], references: [id])
  author User? @relation(fields: [authorId], references: [id])

  @@unique([eventId, slug])
  @@index([eventId, status, publishedAt])
  @@map("news")
}

// ───────────────────────────── Registration & fees ─────────────────────────────

enum ParticipantCategory {
  ESTUDANTE_GRADUACAO
  ESTUDANTE_POS
  PROFESSOR
  PROFISSIONAL
  COMUNIDADE_UFCG      // adjust list with committee
}

enum Modality {
  PRESENCIAL
  ONLINE
}

// Fee matrix: category × deadline window × modality (ENGEMA pattern)
model FeeTier {
  id            String              @id @default(uuid())
  eventId       String              @map("event_id")
  category      ParticipantCategory
  modality      Modality
  label         String                            // "Lote 1 (até 30/04)"
  amountCents   Int                 @map("amount_cents")
  validFrom     DateTime            @map("valid_from")
  validUntil    DateTime            @map("valid_until")
  event         Event               @relation(fields: [eventId], references: [id])
  registrations Registration[]

  @@index([eventId, category, modality])
  @@map("fee_tiers")
}

enum RegistrationStatus {
  PENDING_PAYMENT
  CONFIRMED          // paid or exempt
  CANCELLED
  AWAITING_EMPENHO   // public-institution purchase-order flow
}

model Registration {
  id          String              @id @default(uuid())
  eventId     String              @map("event_id")
  userId      String              @map("user_id")
  feeTierId   String?             @map("fee_tier_id")
  category    ParticipantCategory
  modality    Modality
  status      RegistrationStatus  @default(PENDING_PAYMENT)
  proofUrl    String?             @map("proof_url")   // student proof / comprovante upload
  checkedInAt DateTime?           @map("checked_in_at") // Phase 4 attendance
  createdAt   DateTime            @default(now()) @map("created_at")
  updatedAt   DateTime            @updatedAt @map("updated_at")

  event    Event     @relation(fields: [eventId], references: [id])
  user     User      @relation(fields: [userId], references: [id])
  feeTier  FeeTier?  @relation(fields: [feeTierId], references: [id])
  payments Payment[]

  @@unique([eventId, userId])               // one registration per user per event
  @@index([eventId, status])
  @@map("registrations")
}

// ───────────────────────────── Payments (Phase 3) ─────────────────────────────

enum PaymentMethod {
  PIX
  CARD
  BOLETO
  EMPENHO      // manual: public institution PO
  EXEMPTION    // committee-granted fee waiver
}

enum PaymentStatus {
  CREATED
  PENDING      // MP: pending / in_process
  APPROVED
  REJECTED
  REFUNDED
  CHARGED_BACK
  EXPIRED
}

model Payment {
  id              String        @id @default(uuid())
  registrationId  String        @map("registration_id")
  method          PaymentMethod
  status          PaymentStatus @default(CREATED)
  amountCents     Int           @map("amount_cents")
  mpPreferenceId  String?       @map("mp_preference_id")  // Mercado Pago
  mpPaymentId     String?       @unique @map("mp_payment_id")
  empenhoNumber   String?       @map("empenho_number")
  empenhoDocUrl   String?       @map("empenho_doc_url")
  rawWebhook      Json?         @map("raw_webhook")       // last MP notification payload
  paidAt          DateTime?     @map("paid_at")
  createdAt       DateTime      @default(now()) @map("created_at")
  updatedAt       DateTime      @updatedAt @map("updated_at")

  registration Registration @relation(fields: [registrationId], references: [id])

  @@index([registrationId])
  @@map("payments")
}

// ───────────────────────────── Submissions & review (Phase 2) ─────────────────────────────

enum SubmissionType {
  RESUMO_EXPANDIDO
  ARTIGO_COMPLETO
}

enum SubmissionStatus {
  DRAFT
  SUBMITTED
  UNDER_REVIEW
  REVISIONS_REQUESTED
  RESUBMITTED
  ACCEPTED
  ACCEPTED_WITH_CHANGES
  REJECTED
  WITHDRAWN
}

model Submission {
  id             String           @id @default(uuid())
  eventId        String           @map("event_id")
  submitterId    String           @map("submitter_id")
  thematicAreaId String           @map("thematic_area_id")
  type           SubmissionType   @default(RESUMO_EXPANDIDO)
  code           String                              // "SIEAMB2-042", assigned on submit
  title          String
  abstractText   String           @map("abstract_text")
  keywords       String[]                            // 3-5
  status         SubmissionStatus @default(DRAFT)
  // Files: anonymized version is the ONLY one reviewers can access
  fileUrl        String?          @map("file_url")            // identified PDF
  fileAnonUrl    String?          @map("file_anon_url")       // blinded PDF
  finalFileUrl   String?          @map("final_file_url")      // camera-ready
  decidedAt      DateTime?        @map("decided_at")
  decisionNote   String?          @map("decision_note")       // committee note to authors
  createdAt      DateTime         @default(now()) @map("created_at")
  updatedAt      DateTime         @updatedAt @map("updated_at")

  event        Event              @relation(fields: [eventId], references: [id])
  submitter    User               @relation("submitter", fields: [submitterId], references: [id])
  thematicArea ThematicArea       @relation(fields: [thematicAreaId], references: [id])
  authors      SubmissionAuthor[]
  assignments  ReviewAssignment[]

  @@unique([eventId, code])
  @@index([eventId, status])
  @@index([submitterId])
  @@map("submissions")
}

// Co-authors don't need accounts; userId links when they have one.
// Max 3 submissions per author enforced in service layer (count authorships per event).
model SubmissionAuthor {
  id           String  @id @default(uuid())
  submissionId String  @map("submission_id")
  userId       String? @map("user_id")
  fullName     String  @map("full_name")
  email        String
  institution  String?
  isPresenter  Boolean @default(false) @map("is_presenter")
  sortOrder    Int     @default(0) @map("sort_order")

  submission Submission @relation(fields: [submissionId], references: [id], onDelete: Cascade)
  user       User?      @relation(fields: [userId], references: [id])

  @@index([submissionId])
  @@map("submission_authors")
}

enum AssignmentStatus {
  INVITED
  ACCEPTED
  DECLINED
  COMPLETED
  EXPIRED
}

enum Recommendation {
  ACCEPT
  ACCEPT_WITH_CHANGES
  REJECT
}

model ReviewAssignment {
  id           String           @id @default(uuid())
  submissionId String           @map("submission_id")
  reviewerId   String           @map("reviewer_id")
  status       AssignmentStatus @default(INVITED)
  dueAt        DateTime         @map("due_at")
  // Review content (1 row = 1 review; separate table not needed at this scale)
  scoreRelevance   Int?         @map("score_relevance")    // 1-5
  scoreMethod      Int?         @map("score_method")
  scoreWriting     Int?         @map("score_writing")
  commentsToAuthors   String?   @map("comments_to_authors")
  commentsToCommittee String?   @map("comments_to_committee")
  recommendation  Recommendation?
  completedAt     DateTime?     @map("completed_at")
  createdAt       DateTime      @default(now()) @map("created_at")

  submission Submission @relation(fields: [submissionId], references: [id])
  reviewer   User       @relation(fields: [reviewerId], references: [id])

  @@unique([submissionId, reviewerId])
  @@index([reviewerId, status])
  @@map("review_assignments")
}

// ───────────────────────────── Certificates (Phase 4) ─────────────────────────────

enum CertificateKind {
  PARTICIPACAO
  APRESENTACAO
  AVALIADOR
  ORGANIZACAO
  MINICURSO
}

model Certificate {
  id             String          @id @default(uuid())
  eventId        String          @map("event_id")
  userId         String          @map("user_id")
  kind           CertificateKind
  validationCode String          @unique @map("validation_code")  // short, URL-safe, e.g. "SIEAMB2-K7KQ-9F2M"
  payload        Json                                             // frozen render data: name, hours, title…
  pdfUrl         String          @map("pdf_url")
  issuedAt       DateTime        @default(now()) @map("issued_at")
  revokedAt      DateTime?       @map("revoked_at")

  event Event @relation(fields: [eventId], references: [id])
  user  User  @relation(fields: [userId], references: [id])

  @@unique([eventId, userId, kind])
  @@index([userId])
  @@map("certificates")
}

// ───────────────────────────── Audit ─────────────────────────────

model AuditLog {
  id        String   @id @default(uuid())
  actorId   String?  @map("actor_id")
  action    String                       // "news.publish", "payment.webhook", "submission.decide"
  entity    String
  entityId  String?  @map("entity_id")
  meta      Json?
  createdAt DateTime @default(now()) @map("created_at")

  @@index([entity, entityId])
  @@map("audit_logs")
}
```

Raw-SQL companions (in a Prisma migration `migration.sql`):

```sql
-- exactly one current event
CREATE UNIQUE INDEX one_current_event ON events (is_current) WHERE is_current;
-- user must have cpf XOR passport
ALTER TABLE users ADD CONSTRAINT cpf_or_passport
  CHECK (cpf IS NOT NULL OR passport IS NOT NULL);
```

Supabase specifics:
- Prisma owns the `public` schema; Supabase Auth lives in `auth`. Sync `auth.users → public.users` with a Postgres trigger on signup (insert id/email) — profile completion happens in-app.
- RLS: enable on tables the frontend touches directly via anon key. Phase 0/1: `news` (SELECT where `status='PUBLISHED'`), `events`, `important_dates`, `thematic_areas`, `sponsors`, `committee_members`, `static_pages` (public SELECT), `registrations` (INSERT/SELECT own via `auth.uid()`). Everything else denies anon; Express uses the service-role key.

---

## 4. Phase 0 — Visual prototype

**Goal:** deployed, navigable, pt-BR site on GitHub Pages showing the full structure of II SIEAmB; visually agnostic (neutral placeholder theme swappable via CSS tokens when the identity arrives); news list + registration form actually working against Supabase free tier; multi-event routing baked in. **Ship in ~1–2 weeks of evenings.**

### 4.1 What is functional vs placeholder

| Feature | Phase 0 state |
|---|---|
| All public pages, nav, footer, responsive layout | **Functional** (content = real committee text where available, lorem-pt otherwise) |
| Multi-event routing (`/:eventSlug/*`, root → current) | **Functional** (2 events seeded: I SIEAmB archived stub, II SIEAmB current) |
| News (Avisos): public list + detail | **Functional** — reads Supabase via anon key (RLS: published only); falls back to static JSON if `VITE_DATA_PROVIDER=static` |
| News admin CRUD | **Functional-lite**: hidden `/admin` route, Supabase Auth email login (2 committee accounts created manually), insert/edit via Supabase client + RLS policy `role in ('ADMIN','EDITOR')`. No Express yet. |
| Registration ("Pré-inscrição") | **Functional-lite**: form (name, email, CPF/passport, institution, category, modality) → Supabase Auth signup (passwordless magic link optional; simplest: email+password) + `registrations` insert with status `PENDING_PAYMENT`. Confirmation screen says payment instructions come later ("aguarde instruções de pagamento"). |
| Fee table | Static component fed by seeded `fee_tiers` (or fixture) — display only |
| Submission pages | **Placeholder**: rules page (real text), "Submissões abrem em breve" CTA, no form |
| Payment | **Absent** (Phase 3) |
| Login/account area | **Functional-lite**: login page, "Minha inscrição" page showing own registration (RLS SELECT own) |
| Visual identity | Neutral: CSS custom properties in `tokens.css` (2 brand colors as placeholders, system font stack + one Google-font-free fallback). Design team output = new token values + logo file. |

Decision point: if the developer wants Day-1 deploy before touching Supabase, run everything with `VITE_DATA_PROVIDER=static` first (pure static, zero services), then flip to `supabase` in the same phase. Both providers ship.

### 4.2 Pages (routes)

All under `/:eventSlug` (default redirect `/` → `/2026/`). GitHub Pages + SPA: use `404.html` copy-of-index redirect trick (script that restores the path) — keeps clean URLs; add `base: '/SIEAmB/'` in `vite.config.ts` unless a custom domain (e.g. `sieamb.ufcg.edu.br`) is configured, in which case `base: '/'` + `public/CNAME`.

| Route | Page | Content |
|---|---|---|
| `/` | redirect | to current event slug |
| `/:event/` | Home | topbar (dates + location) · header (logo + nav) · hero banner · quick-link cards (Inscrições, Submissões, Datas, Áreas Temáticas) · "O Evento" teaser · Datas Importantes strip · latest 3 Avisos · sponsors row · footer |
| `/:event/o-evento` | About | event description, objectives, público-alvo |
| `/:event/organizacao` | Committee | grouped cards by role (Coordenação, Comitê Científico, Comissão Organizadora) |
| `/:event/areas-tematicas` | Thematic areas | numbered list with descriptions |
| `/:event/submissoes` | Submission rules | rules text, template downloads (placeholder links), datas, "abre em breve" |
| `/:event/inscricoes` | Registration info | fee table (category × lote × modality), payment methods note, CTA → form |
| `/:event/inscricoes/nova` | Registration form | the functional form |
| `/:event/datas-importantes` | Important dates | timeline/table, extended-deadline strikethrough support |
| `/:event/avisos` | News list | cards, pinned first, pagination (client-side) |
| `/:event/avisos/:slug` | News detail | markdown render |
| `/:event/local` | Venue | UFCG campus info, static map image (no API key), hospedagem section |
| `/:event/contato` | Contact | emails, Instagram link/embed |
| `/edicoes-anteriores` | Editions | list of events; archived ones link to their slug |
| `/:event/entrar` | Login | Supabase email/password |
| `/:event/minha-inscricao` | My registration | auth-gated |
| `/admin` | Admin news | auth + role-gated; news table + editor (title, excerpt, markdown body, publish toggle) |
| `*` | 404 | pt-BR not-found |

### 4.3 Frontend folder structure (complete)

```
packages/frontend/src/
├── main.tsx
├── App.tsx                        # router setup, EventProvider
├── routes.tsx
├── styles/
│   ├── tokens.css                 # --color-primary, --color-accent, spacing, radii, fonts  ← design handoff lands HERE
│   ├── base.css                   # reset + typography
│   └── utilities.css
├── content/
│   └── pt-BR/
│       ├── common.ts              # nav labels, footer, buttons
│       ├── home.ts
│       ├── about.ts
│       ├── submissions.ts
│       ├── registration.ts
│       └── venue.ts
├── data/                          # static fixtures (StaticDataProvider + dev/tests)
│   ├── events.json
│   ├── news.json
│   ├── importantDates.json
│   ├── thematicAreas.json
│   ├── feeTiers.json
│   ├── committee.json
│   └── sponsors.json
├── services/
│   ├── DataProvider.ts            # interface: getEvents, getNews, getNewsBySlug, createRegistration, …
│   ├── StaticDataProvider.ts
│   ├── SupabaseDataProvider.ts
│   ├── ApiDataProvider.ts         # Phase 1 (stub now)
│   ├── supabaseClient.ts
│   └── index.ts                   # provider factory from VITE_DATA_PROVIDER
├── contexts/
│   ├── EventContext.tsx           # current event from :eventSlug param
│   └── AuthContext.tsx            # Supabase session + profile/role
├── hooks/
│   ├── useEvent.ts
│   ├── useNews.ts
│   ├── useAuth.ts
│   └── useDocumentTitle.ts
├── components/
│   ├── layout/
│   │   ├── TopBar.tsx             # dates + venue strip
│   │   ├── Header.tsx             # logo + Nav
│   │   ├── Nav.tsx                # desktop + mobile drawer
│   │   ├── Footer.tsx             # links, contacts, sponsor logos, "Realização: UFCG/PPGERN"
│   │   └── PageLayout.tsx         # TopBar+Header+<Outlet/>+Footer
│   ├── ui/                        # dumb, theme-token driven
│   │   ├── Button.tsx
│   │   ├── Card.tsx
│   │   ├── SectionTitle.tsx
│   │   ├── Badge.tsx
│   │   ├── Alert.tsx
│   │   ├── Spinner.tsx
│   │   ├── Table.tsx
│   │   ├── Modal.tsx
│   │   └── form/ (Input, Select, RadioGroup, Checkbox, FieldError)
│   ├── home/
│   │   ├── Hero.tsx
│   │   ├── QuickLinks.tsx
│   │   ├── AboutTeaser.tsx
│   │   ├── DatesStrip.tsx
│   │   ├── LatestNews.tsx
│   │   └── SponsorsRow.tsx
│   ├── news/
│   │   ├── NewsCard.tsx
│   │   ├── NewsList.tsx
│   │   └── MarkdownView.tsx       # react-markdown, sanitized
│   ├── registration/
│   │   ├── FeeTable.tsx
│   │   ├── RegistrationForm.tsx   # react-hook-form + zod (shared schemas)
│   │   └── RegistrationSuccess.tsx
│   ├── admin/
│   │   ├── AdminLayout.tsx
│   │   ├── NewsTable.tsx
│   │   └── NewsEditor.tsx
│   └── shared/
│       ├── ImportantDatesTable.tsx
│       ├── CommitteeGrid.tsx
│       ├── ThematicAreasList.tsx
│       ├── ProtectedRoute.tsx
│       └── Seo.tsx                # title/meta per page
├── pages/
│   ├── HomePage.tsx
│   ├── AboutPage.tsx
│   ├── CommitteePage.tsx
│   ├── ThematicAreasPage.tsx
│   ├── SubmissionRulesPage.tsx
│   ├── RegistrationInfoPage.tsx
│   ├── RegistrationFormPage.tsx
│   ├── ImportantDatesPage.tsx
│   ├── NewsListPage.tsx
│   ├── NewsDetailPage.tsx
│   ├── VenuePage.tsx
│   ├── ContactPage.tsx
│   ├── EditionsPage.tsx
│   ├── LoginPage.tsx
│   ├── MyRegistrationPage.tsx
│   ├── AdminNewsPage.tsx
│   └── NotFoundPage.tsx
└── lib/
    ├── format.ts                  # dates pt-BR (Intl), money BRL
    └── constants.ts
```

Styling: plain CSS modules or vanilla CSS with tokens (no Tailwind — keeps the design handoff to token swapping; if you prefer Tailwind, map tokens to a Tailwind theme instead, same principle). Every color/spacing/font reference goes through `var(--…)`.

### 4.4 Phase 0 task list (ordered)

1. **T0.1 Scaffold monorepo** — root package.json, tsconfigs, ESLint/Prettier, `.nvmrc`, workspace packages (shared, frontend, backend stub, e2e). *0.5d*
2. **T0.2 Shared package** — types (Event, News, Registration DTOs), zod schemas (registration form, news), `cpf.ts` validator + unit tests. *0.5d*
3. **T0.3 Frontend shell** — Vite + React Router, PageLayout, TopBar/Header/Nav/Footer, tokens.css, EventContext with static events fixture, `/` redirect, 404. *1d*
4. **T0.4 UI kit** — Button/Card/Table/Alert/form components against tokens. *0.5d*
5. **T0.5 Public pages** — all pages in §4.2 with StaticDataProvider + pt-BR content files. *2d*
6. **T0.6 GitHub Pages deploy** — `deploy-pages.yml` (build → `actions/deploy-pages`), 404.html SPA trick, base path. **First public URL here.** *0.5d*
7. **T0.7 Supabase project** — create project (sa-east-1), run initial Prisma migration (events, users, news, important_dates, thematic_areas, fee_tiers, registrations, sponsors, committee_members, static_pages), seed script (2 events, fee tiers, dates, areas, 3 sample avisos), auth trigger `auth.users → users`, RLS policies (§3). *1d*
8. **T0.8 SupabaseDataProvider** — news read, events read, registration create (signup + insert), auth context; flip `VITE_DATA_PROVIDER=supabase` in the Pages build (anon key is public by design — safety = RLS). *1d*
9. **T0.9 Registration flow** — form with zod validation (CPF check digits, category/modality), success page, "Minha inscrição", login page. *1d*
10. **T0.10 Admin news lite** — role-gated `/admin`, list/create/edit/publish via Supabase client; markdown preview. *1d*
11. **T0.11 CI** — `ci.yml`: install, lint, typecheck, vitest; Playwright smoke (home renders, nav works, registration form validates) against `vite preview`. *0.5d*
12. **T0.12 Polish** — responsive pass (360px→1440px), a11y pass (landmarks, labels, contrast at token level), meta/OG tags, favicon placeholder. *1d*

**Definition of done (Phase 0):** public URL on GitHub Pages; all pages navigable in pt-BR on mobile and desktop; a real person can register and see their registration after login; committee can post an aviso without touching code; CI green; design team can restyle by editing `tokens.css` + logo assets only.

---

## 5. Phase 1 — Registration + News (production hardening)

**Goal:** move from "functional-lite via Supabase client" to the real architecture: Express API as the single write path, proper admin panel, email confirmations, Vercel hosting. ~3–4 weeks.

### 5.1 Infrastructure

- Frontend: move from GitHub Pages → **Vercel** (needed for clean domain, preview deploys, headers). Keep Pages workflow as fallback until cutover. Custom domain + HTTPS.
- Backend: **Render or Railway** free tier, `@sieamb/backend` Docker or node build. Health endpoint `/api/v1/health`. Note free-tier cold starts; acceptable in Phase 1, revisit before registration crunch.
- Supabase stays as-is (Auth, Postgres, Storage).

### 5.2 Backend build-out

- Express app factory: helmet, cors (frontend origin), pino logging, rate limiting (esp. auth-adjacent + registration), zod-validated request DTOs (from `@sieamb/shared`), central error handler (problem-details JSON).
- Auth middleware: verify Supabase JWT (`jose` against Supabase JWKS / JWT secret), load `users` row, attach `req.user`; `requireRole('ADMIN'|'EDITOR'|…)` guard.
- Modules:
  - `events`: GET list/current/by-slug (public); PATCH settings (admin).
  - `news`: public GET published; admin CRUD, publish/unpublish, pin; image upload to Storage (signed upload URL).
  - `registrations`: POST create (authed), GET mine, admin list/filter/export CSV, admin manual confirm/cancel; proof-of-student upload.
  - `users`: GET/PATCH me (profile completion), admin role management.
  - `static-pages`, `important-dates`, `committee`, `sponsors`: admin CRUD (this is what makes the site committee-editable).
- Frontend `ApiDataProvider` replaces direct Supabase writes; **tighten RLS to read-only public data** (registrations no longer writable by anon/user key — API only, via service role).
- Email (Resend): registration received, registration confirmed. pt-BR templates (react-email or plain HTML).

### 5.3 Admin panel

Grow `/admin` into a real section (same SPA, role-gated): dashboard (registration counts by category/status), news manager (from P0), registrations table (search, filters, CSV export), static content editors (pages, dates, committee, sponsors, fee tiers), user roles.

### 5.4 Tasks

1. Express scaffold + middleware + health + deploy pipeline.
2. Auth verify + users module + profile completion screen (post-signup: CPF/institution if registration form didn't capture).
3. News module + migrate admin UI to API.
4. Registrations module + RLS tightening + CSV export.
5. Content modules (pages/dates/committee/sponsors/fees) + admin editors.
6. Emails + audit log writes on all admin mutations.
7. Vercel cutover + custom domain + preview deploys.
8. Test suite to targets in §9; E2E on preview.

---

## 6. Phase 2 — Paper submission

**Goal:** authors submit resumos expandidos (PDF), double-blind review, decisions, camera-ready. ~4–5 weeks. Open well before the submission deadline; freeze features two weeks before opening.

### 6.1 Workflow (state machine on `SubmissionStatus`)

```
DRAFT → SUBMITTED → UNDER_REVIEW → { ACCEPTED | ACCEPTED_WITH_CHANGES | REJECTED }
                          ↓ REVISIONS_REQUESTED → RESUBMITTED → UNDER_REVIEW
any pre-decision state → WITHDRAWN
```

Rules (ENGEMA-derived, confirm with committee):
- Resumo expandido obrigatório; artigo completo opcional later (same record, `type` + `finalFileUrl`).
- Max **3 submissions per author** (any authorship position) — enforced in service on submit, counting `submission_authors` by email per event.
- Two PDFs per submission: identified + anonymized. Server-side sanity checks on the anonymized file: size/page limits, MIME; (optional) text scan for author names as a warning.
- Reviewers see ONLY `fileAnonUrl` + title/abstract/keywords/area. Authors never see reviewer names. Enforced at query level (dedicated reviewer DTO) and Storage path policy (`submissions-anon/` bucket readable via short-lived signed URLs generated per assignment).

### 6.2 Features

- **Author side:** multi-step form (metadata + authors list + files), draft save, my-submissions dashboard with status, revision upload when requested, withdrawal.
- **Committee side:** submissions board (filter by area/status), assign 2 reviewers per submission (manual assignment UI with per-reviewer load count; conflict rule: same institution ⇒ warn), decision screen aggregating reviews, bulk decision emails.
- **Reviewer side:** invitations (accept/decline), review form (3 scores 1–5 + comments to authors + confidential comments + recommendation), deadline display.
- **Notifications (Resend):** submission received (with code), reviewer invited/reminded (T-7, T-2 via `jobs/`), review completed (to admin), decision released, revision requested.
- Storage buckets: `submissions/` (private, admin+owner), `submissions-anon/` (private, signed URLs for assigned reviewers), `camera-ready/`.

### 6.3 Tasks

1. Migration: submissions, submission_authors, review_assignments (+ ThematicArea already live).
2. Storage buckets + signed-URL upload/download endpoints.
3. Author flow (form, drafts, dashboard, withdraw).
4. Admin board + reviewer management (invite reviewers = set role REVIEWER + areas of expertise field in `users.settings`-style JSON or a join table if needed).
5. Assignment + reviewer flow + blinding enforcement tests (critical).
6. Decisions + emails + revision loop.
7. Reminder jobs (node-cron on Render or GitHub Actions scheduled hitting an internal endpoint).

---

## 7. Phase 3 — Payment

**Goal:** paid registrations via Mercado Pago (Pix / card / boleto) + manual empenho + exemptions. ~3 weeks. **Must be live before registration opens with fees.**

### 7.1 Design

- **Checkout Pro** (hosted): API creates an MP *preference* from the registration's active `FeeTier` (server-side price lookup — never trust client), stores `Payment(CREATED, mpPreferenceId)`, redirects user to MP. Back URLs → `/inscricoes/retorno?status=…`.
- **Webhook** `/api/v1/payments/webhook/mercadopago`: validate `x-signature` (HMAC with `MP_WEBHOOK_SECRET`), fetch payment by id from MP API (never trust webhook body), idempotent upsert by `mpPaymentId`, map MP status → `PaymentStatus`, on APPROVED set registration `CONFIRMED` + send confirmation email + audit log. Webhook returns 200 fast; processing in-request is fine at this scale but wrap in try/catch with `rawWebhook` stored for replay.
- **Fee tier resolution:** pick tier where `now ∈ [validFrom, validUntil]` for category+modality; lote virada handled by data, not code. Edge: preference created in lote 1, paid after expiry — honor the preference price (MP freezes it); registration keeps `feeTierId` from creation time.
- **Empenho:** registration selects "Instituição pública (empenho)" → status `AWAITING_EMPENHO`, upload empenho doc, admin marks paid manually (`Payment(EMPENHO, APPROVED)`).
- **Exemption:** admin action creating `Payment(EXEMPTION, APPROVED, amountCents=0)`.
- **Reconciliation job:** daily — query MP for payments pending >3 days, expire stale `CREATED` payments, flag mismatches to admin dashboard.
- Refund handling: admin-triggered via MP API → status `REFUNDED`, registration back to `PENDING_PAYMENT` or `CANCELLED`.

### 7.2 Tasks

1. Migration: payments. MP application setup (production + test credentials, sandbox users).
2. Preference creation endpoint + checkout redirect UI + return pages (aprovado/pendente/recusado in pt-BR).
3. Webhook with signature validation + idempotency + status mapping (unit-test the mapper against all MP statuses: approved, pending, in_process, rejected, refunded, charged_back, cancelled).
4. Empenho + exemption admin flows.
5. Admin payments dashboard (totals by method/status, per-registration payment history).
6. Reconciliation job + failure alerts (email to admin).
7. E2E with MP sandbox (Pix + card test cases).

---

## 8. Phase 4 — Certificates + Anais

**Goal:** post-event deliverables. ~2–3 weeks, can be built during the event window.

### 8.1 Certificates

- **Attendance capture:** admin check-in screen (search by name/CPF, mark `checkedInAt`) or CSV import from a sign-in sheet. Presenters derived from accepted submissions with `isPresenter`.
- **Generation:** server-side PDF (`pdf-lib` or Puppeteer-rendered HTML template — recommend HTML+Puppeteer for design fidelity; render once, store in Storage `certificates/` bucket). Batch job per kind: PARTICIPACAO (checked-in CONFIRMED registrations), APRESENTACAO (presenters of accepted work, includes paper title), AVALIADOR (completed ≥1 review), ORGANIZACAO (manual list).
- **Validation code:** `SIEAMB{edition}-XXXX-XXXX` (crypto-random, unambiguous alphabet). Printed on the PDF with URL + QR code → public page `/validar/:code` showing name, kind, event, issue date (this is the Lattes-credibility feature — no auth required).
- **Delivery:** "Meus certificados" page (list + download via signed URL) + email announcement.
- `payload` JSON freezes the rendered data so re-renders are reproducible and name fixes are auditable (fix → revoke old, issue new code).

### 8.2 Anais (proceedings)

- Committee applies for **ISSN** (via IBICT) — start the paperwork in Phase 2, it takes time. DOI optional later (Crossref via a UFCG library partnership, or skip for edition 2).
- Compilation: script in `backend/src/jobs/anais.ts` — gather ACCEPTED camera-ready PDFs ordered by thematic area, generate front matter (cover, ficha catalográfica, committee, sumário with page numbers) via HTML→PDF, merge with `pdf-lib`, output single `anais-ii-sieamb.pdf` + per-paper split with header/footer stamp (event, ISSN, page range).
- Publication: `/:event/anais` page — full PDF + browsable list (area → papers → per-paper PDF). Archived editions keep theirs (multi-event pays off here).

### 8.3 Tasks

1. Migration: certificates. Check-in UI + CSV import.
2. Certificate HTML templates (per kind, pt-BR, committee-approved wording + signatures as images).
3. Generation pipeline + batch issue + revoke/reissue.
4. Public validation page + QR.
5. "Meus certificados" + notification email.
6. Anais compiler + publication page.

---

## 9. Testing strategy

Stack: **Vitest** (unit — shared + frontend components via Testing Library + backend services), **Supertest** (API integration against the Express app factory with a test DB), **Playwright** (E2E in `packages/e2e`).

Integration DB: Supabase local (`supabase start`) or plain `postgres` Docker service in CI + `prisma migrate deploy`; truncate between suites. Never test against prod.

Per phase, the tests that matter (beyond boilerplate):

**Phase 0**
- Unit: CPF validator (valid, invalid check digits, repeated-digit CPFs, formatting), zod registration schema (CPF xor passport, category/modality enums), date/money pt-BR formatters, DataProvider factory.
- Component: RegistrationForm validation messages (pt-BR), FeeTable rendering by tier, Nav active state, NewsList pinned-first ordering.
- E2E (smoke, runs in CI on `vite preview` with static provider): home renders all sections; nav to every page; `/` redirects to current event; registration form blocks invalid CPF and submits valid data (mocked provider); news list → detail; 404.

**Phase 1**
- Integration (Supertest): auth middleware (no token/expired/wrong-audience → 401; role guard → 403); news CRUD + publish visibility (draft invisible on public GET); registration create (duplicate per event → 409; category validation), CSV export shape; RLS regression test via anon Supabase client (anon cannot INSERT registrations anymore, cannot read drafts).
- E2E: full registration journey on preview deploy (signup → form → confirmation email captured via Resend test mode or MailSlurp → "Minha inscrição"); admin publishes aviso → appears on public list.

**Phase 2 (highest-risk phase — blinding + state machine)**
- Unit: state-machine transitions (every legal/illegal transition), max-3-submissions rule, reviewer-conflict warning.
- Integration: **blinding** — reviewer DTO never contains author names/emails/identified file URL (assert on serialized JSON); reviewer can get signed URL only for own assignments; author endpoints never expose reviewer identity; submit → code assigned, files land in correct buckets; decision aggregates reviews and fires emails (mock mailer, assert payloads).
- E2E: author submits (real PDF fixture) → admin assigns two reviewers → reviewers submit reviews → admin decides → author sees decision. Revision loop. Withdrawal.

**Phase 3**
- Unit: MP status mapper (all statuses), fee-tier resolver (boundary dates, timezone America/Fortaleza — pin all deadline logic to a single TZ helper), webhook signature validator (valid, tampered, replayed).
- Integration: webhook idempotency (same `mpPaymentId` twice → one state change), APPROVED → registration CONFIRMED + email, price is server-derived (client-sent amount ignored), empenho manual approval.
- E2E: MP sandbox card approval end-to-end on preview; Pix flow to pending screen.

**Phase 4**
- Unit: validation-code generator (uniqueness, alphabet), payload freezing.
- Integration: batch issue idempotency (`@@unique(eventId,userId,kind)`), revoked cert fails validation endpoint, only checked-in confirmed registrants get PARTICIPACAO.
- E2E: user downloads certificate; public validation page confirms a real code and rejects a fake one; anais page lists papers.

CI gates: lint + typecheck + unit/integration on every PR (required check); E2E smoke on every PR (static provider, fast), full E2E nightly + before releases against preview env. Coverage: no hard % gate, but service-layer and money/blinding code paths reviewed for coverage in PR.

---

## 10. DevOps

### 10.1 Workflows

`ci.yml` (every PR + main):
```yaml
jobs:
  quality:
    - actions/checkout, setup-node (from .nvmrc, npm cache)
    - npm ci
    - npm run lint && npm run typecheck
    - npm run test            # vitest workspaces
  integration:
    services: postgres:16
    - prisma migrate deploy + seed(test)
    - npm run test:integration -w @sieamb/backend
  e2e-smoke:
    - npm run build && npx playwright install --with-deps chromium
    - npm run test:e2e -- --grep @smoke   # against vite preview, static provider
```

`deploy-pages.yml` (Phase 0, push to main): build frontend with `VITE_DATA_PROVIDER=supabase` + anon key from repo secrets (anon key is safe-public; still keep it in secrets for hygiene) → `actions/upload-pages-artifact` → `actions/deploy-pages`.

Phase 1+: Vercel handles frontend (git integration, preview per PR); `deploy-api.yml` triggers Render deploy hook on main after CI passes. `e2e.yml` runs full Playwright against the Vercel preview URL (from Vercel bot comment or `vercel pull`).

### 10.2 Database migrations

- Prisma Migrate, migrations committed. Local: `prisma migrate dev`. CI integration job: `migrate deploy` on fresh DB (validates migration chain every PR).
- Production: `migrate deploy` as a **release step** in `deploy-api.yml`, before the deploy hook (uses `DIRECT_URL`). Never `db push` outside local.
- Rule: additive migrations preferred; destructive changes require an expand/contract pair (two releases). Backups: Supabase daily (free tier: 7-day PITR on Pro — upgrade before Phase 3 goes live, payments demand it).
- Seed scripts idempotent (`upsert` by natural keys) and environment-aware (test seed ≠ prod seed; prod seed only creates events/tiers/dates).

### 10.3 Secrets & config

- GitHub repo secrets: Supabase keys, Render hook, MP tokens (test in preview, prod in main-only environment), Resend key. Use GitHub **Environments** (`preview`, `production`) with the prod environment protected (required reviewer = Rodrigo) once payments exist.
- Runtime env validated at boot with zod (`config/env.ts`) — fail fast on missing vars.

### 10.4 Observability & ops

- pino structured logs (Render log stream). Sentry free tier on frontend + backend from Phase 1 (payments and submissions must not fail silently).
- Uptime: free monitor (UptimeRobot) on `/api/v1/health` + homepage — also mitigates Render free-tier cold starts during registration/submission crunch weeks.
- Ops calendar note: before each deadline (submission close, lote virada, event week), pre-warm/upgrade dynos and freeze deploys 48h.

### 10.5 Cost trajectory

| Stage | Monthly |
|---|---|
| Phase 0 | R$0 (Pages + Supabase free) |
| Phase 1–2 | R$0 (Vercel/Render/Supabase free tiers) |
| Phase 3+ (payments live) | ~US$30–40 (Supabase Pro $25 for PITR/backups + Railway/Render paid $5–10 to kill cold starts) — budget line for the committee |

---

## 11. Milestone summary

| Phase | Duration (solo, part-time) | Ship gate |
|---|---|---|
| 0 — Prototype | 1–2 wks | Public Pages URL; registration + avisos working (Supabase-lite); tokens-only theming |
| 1 — Registration/News prod | 3–4 wks | Express API is sole write path; admin panel; emails; Vercel + domain |
| 2 — Submissions | 4–5 wks | Double-blind flow E2E-tested; opens before submission deadline |
| 3 — Payments | 3 wks | MP live (Pix/card/boleto) + empenho; recon job; Supabase Pro |
| 4 — Certificates/Anais | 2–3 wks | Validation page live; anais published under event slug |

Hard external dependencies to start early: **custom domain** decision (ufcg.edu.br subdomain requires university IT — kickoff in Phase 0), **ISSN application** (Phase 2 start), **Mercado Pago account** under the responsible institution/foundation CNPJ (Phase 2 start — institutional payment accounts are slow), design identity handoff (any time — lands in `tokens.css` + assets).
