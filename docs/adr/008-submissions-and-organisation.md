# ADR-008: Paper submissions, the organisers' panel, notifications and announcements

**Date:** 2026-11-17 · **Status:** Accepted, on dev only (same switches as ADR-007) · **Issues:** #216, #217, #219, #221, #204

## Context

The edital says submissions opened on 15/11/2026 and close on 18/01/2027. The committee had not yet answered the nine open questions of the proposal sent to them, so Rodrigo decided (2026-11-17) to build with the edital's own values and let the team test on dev before going live. This record covers slices 2 to 4 of the plan in ADR-007: sending papers, the organisation area, and notifications with announcements. Review and results (slices "Avaliação" and "Resultados" of the proposal) are not built.

## Decisions

### Submissions

1. **The rules live in one file**, `packages/frontend/src/data/submissionRules.json`, read by the page and by the server (as the fee table is, ADR-004): window 15/11/2026 to 18/01/2027, up to 5 authors per paper, 3 papers as main author and 5 as co-author per person, 12 to 15 pages for an article and 4 to 6 for an expanded abstract, 5 keywords per language, PDF or Word up to 10 MB. The server enforces all of them; the form only repeats what saves a round trip.
   **The closing date is shown, it does not lock (2026-11-17, #233).** The organisers will postpone 18/01/2027 and only announce the new schedule later, so until then the site shows the edital's date and says nothing else, and sending, changing and withdrawing keep working after it (`locksAtClose: false` in the rules file). When the new date is announced, `closesAt` changes; `locksAtClose: true` turns the lock back on.
   **The organisers close and reopen submissions with a button (2026-11-17, #236).** In the panel's papers tab, an Organizador or Administrador closes submissions for the edition (asked twice) and reopens them (one click). While closed nobody sends, changes or withdraws a paper, whatever the published date says, and the site says submissions were closed on that day. Kept on the edition (`events.submissions_closed_at`, `submissions_closed_by`), with a line in the audit log each time. Pressed twice, the first closing stands. It has no browser test: the switch is for the whole edition, and flipping it on the shared dev site would break every other test and tester while it is closed.
2. **One file, with the authors' names**, as the edital asks. There is no blind version: the committee decided the review is not blind (2026-11-17, #232).
3. **Authors are one ordered list, and any of them sends the paper (2026-11-17, #230, asked by Najara).** The first author may be a professor who will not attend and has no account, and authorises another author to send and present. So the site has no main author: whoever sends the paper lists every author, name and e-mail, in the order of the paper, and must be in the list in any place. An author needs neither account nor registration; the paper shows up in "Meus trabalhos" for whoever has, or later creates, an account with a listed address. Any listed author with an account changes or withdraws it, while it is still "enviado", and every author and organiser is told who did it. The account that sent it is kept (`submissions.user_id`) as a record only. The edital's two limits are read by place in the list, for every person listed: 3 papers as first author, 5 in any other place.
   **Suggestions of people already in the system (#231).** While a name is typed, the form suggests accounts, registrations of the edition and authors of its papers (`search_people`, without case or accents, from 3 letters, 6 at most). It is only a suggestion: nothing is picked without a click, and a new person can always be typed. A suggestion never carries an e-mail: the page gets a masked hint (`r•••@ufcg.edu.br`) and a reference sealed by the server (AES-GCM), which it sends back instead of the address. Otherwise any account could list everybody's address three letters at a time. Error answers name people, never addresses. The address is only seen by the co-authors of a saved paper, and the person is told by e-mail that they were listed. 300 searches an hour per account.
4. **Files go straight to a private Supabase Storage bucket.** The server hands the browser a one-time upload link for a path of our own (`<edition>/<account>/<random>.pdf`), so the file never passes through a Vercel function (their body limit is 4.5 MB). On save, the server reads the file back, checks that it really is a PDF or a Word document, and counts the pages. Downloads use a one-minute link asked from the server, for the authors and the organisers only. The name the author gave is kept with the paper and used for the download.
5. **Page count of a Word file** is the number Word wrote when the file was last saved. Some files carry none: those are accepted and stored with an unknown count, for the organisers to check.
6. **"One submission per paper"** is a warning, not a block: when one of the authors already sent a paper with the same title (ignoring case, accents, spacing and punctuation), the person has to confirm it is another paper.
7. **Withdrawing is a soft delete** (ADR-006): the paper keeps its row, with who and why, leaves every list and frees the author's slot.

### Organisation area

8. **Two roles open the panel**: Administrador (`ADMIN`) and Organizador (`ORGANIZER`), per edition (ADR-002). A platform administrator stands as Administrador everywhere. Avaliador (`REVIEWER`) exists as a role and has no screen yet. Someone with no role gets "not found" from the server and from the site, the same as for an edition that does not exist.
9. **What only an Administrador does**: register someone by hand; set a registration as confirmed, exempt or cancelled whatever the payment says; delete and restore; see CPF and passport; approve a request to bring a registration into an account (ADR-007); give and take any role. An Organizador sees registrations (without documents) and papers, manages reviewers and sends announcements.
10. **A decision made by hand never hides the payment.** `manual_status` sits beside the payments; the panel shows both, and who, when and why are stored with the registration and in `audit_logs`. Clearing it hands the registration back to the payment. Every panel action writes an audit line.
11. **Soft delete of registrations is built** (ADR-006, now accepted for this table): `deleted_at`, `deleted_by`, `deleted_reason`; every query of the site ignores deleted rows, so they get no more e-mails and cannot be paid; "one registration per e-mail and per account" is counted over live rows only (partial unique indexes). Deleting a paid registration needs an explicit confirmation. Restoring is refused if the person registered again meanwhile.
12. **A role can be given to an address that has no account.** It is kept in `event_member_invites` and becomes a real role the first time that address logs in with a confirmed e-mail.
13. **Nobody removes their own Administrador role**, so an edition is not left without one by accident.
14. **The spreadsheet is built in the browser** from what the panel already shows, with values that look like formulas neutralised.

### Review (#232, 2026-11-17, replaces decisions 1 and 3 of ADR-003)

14a. **The review is not blind, and a paper has one reviewer or more.** Asked by Najara: the organisers choose who reviews each paper, at least one person and as many as they want, among the people with the Avaliador role (`submission_reviewers`). The only people kept out are the paper's own authors. Reviewers see the file as it was sent and the authors by name; they are not shown the authors' e-mails.
14b. **A paper with a reviewer is "em avaliação"**, and its authors can no longer change or withdraw it; when the last reviewer is taken off it goes back to "enviado". A paper already decided keeps its state.
14c. **A reviewer has "Trabalhos para avaliar"** (`/:edition/avaliacoes`): the papers given to them, with the file to download. The reviewer is told by e-mail and in the site when chosen. Taking away the Avaliador role takes the person off every paper of the edition. The review form itself (scores, recommendation, comments) is not built.

### Notifications and announcements

15. **A general outbox** (`outbox_emails`) for every e-mail that is not about a payment, with the guarantees of ADR-005: a unique key per e-mail, claimed by compare-and-swap, retried by the background job, body cleared once sent.
16. **Notices in the site are stored as a kind plus data**, never as text, and written in the reader's language when shown. A kind this version does not know reads as "há uma novidade".
17. **Who is told of what**: a paper sent, changed or withdrawn goes to all its authors (e-mail, and the bell for those with an account) and to the organisers; a new registration goes to the organisers; a role given goes to the person.
18. **Announcements** go to one group: everyone, the registered, the authors, the reviewers or the organisers. Administrators are in no group by role alone. The screen shows how many people the group has and asks for a confirmation with that number. The announcement is recorded with the sender, the group and every address. E-mails are queued and sent by the background job, 40 per run; one sender can send 10 announcements an hour.

## Consequences

- **Resend's plan limits the e-mails**, and announcements make that real: the free plan allows about 100 e-mails a day, counting reminders and confirmations too. An announcement to more people than that will take days to go out or be refused. The plan has to be upgraded before announcements are used for real.
- Announcements have no unsubscribe link. Each one says why the person receives it. This was left open in ADR-005 and still needs a decision.
- Organisers get one e-mail per registration and per paper. If that becomes too much, a daily digest is the natural change.
- Changing a paper replaces its author rows in two steps (delete, insert). A failure between them would leave a paper without authors; it has not been seen, and the fix is a database function doing both at once.
- An announcement to a few hundred people takes up to an hour to finish going out.
- The organisers' notice e-mails and announcements are in Portuguese only. Author e-mails and everything in the site are in four languages.
- The first Administrador of an edition has to be set in the database (or invited by a platform administrator). After that, roles are managed in the panel.
- To release: migrations `20261117010000_accounts` to `20261117040000_announcements` on sieamb-prod after a backup, the two switches on Vercel Production, and the Resend plan.
