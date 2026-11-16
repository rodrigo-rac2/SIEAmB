# ADR-005: E-mails through an outbox table, a background job, and payment reminders

**Date:** 2026-11-16 · **Status:** Accepted, live on sieamb.org since 2026-11-16 (reminders on since the same day) · **Issues:** #18, #185, #187, #195, #201

## Context

People registered and heard nothing back, and the ones who registered before payments existed never got a link to pay. The site runs on Vercel functions on the Hobby plan: a function has a few seconds to answer, there is no long-running process, and Vercel's own scheduled jobs run at most once a day on that plan. An e-mail sent inside the request that records a payment would be lost whenever the mail server is slow, and two paths (the webhook and the return page) can record the same status at the same moment.

## Decisions

1. **Every e-mail is first a row in `payment_emails`** (an outbox), then delivered. Kinds: `RECEIVED` (registration received, with the pay link), `PROCESSING`, `CONFIRMED`, `FAILED`, `REMINDER`.
2. **Never the same e-mail twice.** Each row has a unique `dedupe_key` (`<payment>:<kind>`, `received:<registration>`, `reminder:<registration>:<n>`, `deadline:<registration>:<date>:<days>`). Recording the same thing again is a no-op.
3. **Delivery is claimed with a compare-and-swap** on `attempts`, with a two-minute lock, so the request that recorded the status and the background job cannot both send. At most six attempts.
4. **What an e-mail says is re-checked at delivery time.** A "payment failed" for a payment that has since been approved, or a reminder for someone who paid in the meantime, is marked `SKIPPED` instead of sent.
5. **A background job every 10 minutes**, started by GitHub Actions (`email-sweep.yml`) for production and dev: `POST /api/v1/payments/emails/deliver` with `Authorization: Bearer <CRON_SECRET>`. Each run re-reads open payments at Mercado Pago, records `RECEIVED` for registrations of the last 24 hours that have none, records the reminders that are due, and delivers the outbox. The endpoint answers with counts only.
6. **`RECEIVED` is sent right after the form is submitted** (`POST /api/v1/registrations/received`), because the browser writes the registration straight to the database and the server would otherwise not know about it. The job is the safety net.
7. **Reminders** for registrations that are not paid, only between 08:00 and 20:00 in Brazil, switched by `REMINDERS_ENABLED=true`:
   - 1 day and 3 days after registering
   - 7 days and 1 day before the end of each fee lot, counted on the Brazilian calendar. The text gives the current fee, the date and the next fee, or says registration is closing when it is the last lot
   - never while a card is under Mercado Pago's review, never after payment, and never within 20 hours of another e-mail to the same person (6 hours for a date reminder, which cannot wait)
   - a boleto that was generated and not paid gets the first two with its own text, and no date reminders
   - one-off notices for other dates will be announcements from the submission system, not part of this schedule
8. **Sender: Resend, over SMTP.** `mailer.ts` uses nodemailer and reads `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`, `MAIL_REPLY_TO`, so the provider can be changed with variables only. From `II SIEAmB <inscricoes@sieamb.org>`, replies to the committee's Gmail. The domain is verified at Resend (DKIM and SPF records in Cloudflare).
9. **`inscricoes@sieamb.org` also receives**: Cloudflare Email Routing forwards it to the committee's Gmail, so an answer sent to the address itself is not lost.
10. **Texts in the four languages of the site** (`emailTemplates.ts`), in the language the person registered in. Dates are written day first in every language.
11. **Our own test registrations are never mailed**: `e2e+…@sieamb.org` and the domains reserved for examples.

## Consequences

- Up to 10 minutes can pass between a status change and its e-mail when the first attempt fails, more when GitHub starts a scheduled run late.
- The job depends on GitHub Actions and on two secrets (`CRON_SECRET_PROD`, `CRON_SECRET_DEV`) matching the Vercel variable.
- Reminder dates come from the fee table only. Dates that depend on being an author (the authors' registration deadline) are not covered until the submission system knows who the authors are.
- Resend's free plan has a daily and a monthly limit. Announcements to everyone, when they exist, must respect it or the plan changes.
- There is no automated check of a real inbox yet. A specialised service (testmail.app or MailSlurp) was chosen over Gmail for that and is not set up.
- There is no unsubscribe link. A person stops the reminders by paying or by answering the e-mail. This needs a decision before announcements to everyone exist.
