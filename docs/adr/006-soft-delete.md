# ADR-006: Records are marked as deleted, never erased

**Date:** 2026-11-16 · **Status:** Accepted. Built on dev for registrations and papers on 2026-11-17 (#219, #216; see ADR-008); users, reviews and announcements do not have it yet · **Issue:** #204

## Context

On 2026-11-16 four test registrations had to be removed from the production database by hand, with their payments and e-mails, one of them already paid. The only trace left is a local copy of the rows and a note on #166. Rodrigo asked that the system support deleting without losing the record, for registrations today and for everything the submission system adds (users, submissions, reviews, announcements). His starting idea was a status column with Active, Inactive and Deleted.

## Decisions

1. **Deletion is a mark beside the status, not one more status.** Each table gets `deleted_at` (null while the record is alive), `deleted_by` and `deleted_reason` ("test", "duplicate", "asked by the person"). The `status` column keeps describing the life of the record (a user Active or Inactive, a submission Draft, Submitted, Accepted), so a deleted record keeps the status it had and can be restored exactly as it was. A single column would lose that.
2. **Everything ignores deleted records by default**: lists, counts, reminders, e-mails, exports. One shared query helper, so a new screen cannot forget the filter.
3. **"Only one" rules count live records only** (one registration per e-mail and event, one open payment per registration), through partial unique indexes. A person whose test was deleted can register again.
4. **Deleting a registration hides its payments and stops its e-mails.** A paid registration can only be deleted after a refund, or with an explicit confirmation.
5. **Administrators delete and restore from the admin area**, and each action is written to `audit_logs`.
6. **Really erasing stays possible, separately**, for a privacy request (LGPD): it removes the personal fields and keeps the payment record.

## Consequences

- Registrations are written by the browser straight into `pre_registrations`, so the delete has to go through the server.
- Every existing query on these tables needs the filter when this is built, and the schema test should fail for a table that has the columns and a query that does not use the helper.
- Until it exists, a manual delete keeps a local copy of the rows first, as done on 2026-11-16.
