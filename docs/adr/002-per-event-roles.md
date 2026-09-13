# ADR-002: Roles are per-edition memberships, participation is a state

**Date:** 2026-09-13 · **Status:** Accepted (schema change for Phase 1)

## Context

The platform hosts every edition (ADR-001) and committees change yearly: a 2025 reviewer is not a 2027 reviewer, the empresa júnior handling payments may change, and one person often holds several hats (Thays: scientific committee + reviewer). The original schema had a single global `users.role` enum (ADMIN/EDITOR/REVIEWER/PARTICIPANT), which cannot express any of that, and "participant" was modelled as a role although it is a fact about registrations.

We walked every flow in the plan (registration, payment/empenho, submission, blind review, decisions, check-in, certificates, anais) and listed who performs each action.

## Decision

1. **One platform-level flag**: `users.is_platform_admin` (Rodrigo, Samuel) — creates editions, manages global config, can act in any edition.
2. **Edition roles live in `event_members(user_id, event_id, role, area_ids[])`**, one row per (user, event, role), so a person can hold several roles in one edition and none in another:

| Role | Typical holder | Scope |
|---|---|---|
| `ADMIN` | Coordenação geral | Everything in the edition, incl. members/roles and settings |
| `SCIENTIFIC_CHAIR` | Comitê científico | Whole submissions/review module: invite reviewers, assign, final decisions, review deadlines. No payments, no PII exports |
| `AREA_CHAIR` | Coordenador de área temática | Assign reviewers + recommend decisions only for submissions in `area_ids` |
| `REVIEWER` | Avaliadores | Own assignments only, blinded; accept/decline invitations |
| `EDITOR` | Comunicação / Samuel | News, static pages, dates, editais, sponsors. Never users, registrations or money |
| `FINANCE` | Empresa júnior | Confirm empenho/manual payments, exemptions, refunds, financial exports. Read-only registrations |
| `STAFF` | Voluntários no evento | Check-in, registration lookup, badge printing. Nothing else |

3. **Participation is not a role.** Every account may register and submit for any open edition. Derived states, shown as admin filters: `visitor → account → registered (PENDING_PAYMENT / CONFIRMED / exempt) → author (has authorship) → presenter → checked-in`.
4. **Conflict of interest** is enforced at assignment time: a reviewer never receives a submission where they are submitter or co-author (matched by user id or e-mail) and gets a warning for same-institution.
5. **Co-authors without accounts** are first-class for certificates: certificates are issued to an e-mail + validation code; an account with that e-mail claims them later. `Certificate.user_id` becomes nullable with `email` required.

## Consequences

- Prisma: drop `UserRole` on `User`; add `EventMember` (`@@unique([userId, eventId, role])`) and `User.isPlatformAdmin`; `Certificate.userId?` + `Certificate.email`.
- Auth middleware resolves `req.membership` for the edition in the URL; guards become `requireRole(eventId, 'SCIENTIFIC_CHAIR')`.
- Yearly rollover (skill `sieamb-new-edition`) gains one step: create the new edition's members.
- Admin panel gets a "Comissão e papéis" screen per edition (invite by e-mail → role assigned on first login).
- Reviewer invitations to people without accounts use an e-mail token that creates the membership on acceptance.
