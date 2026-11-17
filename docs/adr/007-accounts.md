# ADR-007: Accounts on Supabase Auth, tied to registrations by proof of the e-mail

**Date:** 2026-11-17 · **Status:** Accepted, on dev only (`VITE_ACCOUNTS_ENABLED` / `ACCOUNTS_ENABLED`) · **Issues:** #208, #209, #210

## Context

Sending a paper, seeing one's own registration and everything the organisers do need a login. Until now nobody had an account: a registration is a row the browser writes into `pre_registrations`, identified by its e-mail, and paid through a link (ADR-004). People had already registered when accounts were designed, some of them twice with two addresses.

Rodrigo's decisions (2026-11-16): an account is optional to register and required to submit; a person who comes back with another e-mail must be recognised ("we have a registration under this person, is that you?") and the registration brought into the account, reliably.

## Decisions

1. **Supabase Auth holds the accounts and the passwords.** Our tables never store a password. `public.users` mirrors `auth.users` through the trigger that already existed. The browser logs in directly at Supabase Auth; every other account action goes through `/api/v1/account/<action>`, which checks the access token with Supabase on each call.
2. **The password is chosen after the e-mail is confirmed, never before.** "Create account" asks for name and e-mail only. The account is created with a password nobody knows; the link in the e-mail confirms the address and opens the page where the person chooses the password. Otherwise anyone could start an account on someone else's address with a password they know, and keep access once the real owner confirms it. An account that was started earlier and never confirmed gets a new unknown password, and then a fresh link, before the e-mail is sent.
3. **Our own e-mails, not Supabase's.** The server asks Supabase for the link token (`admin/generate_link`) and sends the message through the event's sender, in the four languages. Links carry a token hash that the page exchanges for a session (`verifyOtp`); nothing is read from URL fragments.
4. **No hint of who has an account.** Create account and forgotten password answer the same for any address. An address that already has an account receives an e-mail saying so.
5. **A registration belongs to an account only after proof that the person reads its e-mail.**
   - Same e-mail: linked when the account's e-mail is confirmed (`pre_registrations.user_id`, set by the server only; a restrictive policy keeps the browser from setting it).
   - Another e-mail, same CPF, or same passport and country: offered as "is this yours?", with the address masked. Saying yes sends a link to the registration's address; the click links it. The token is stored as a hash and lasts 48 hours.
   - No access to that inbox: the request is stored for an organiser to approve (the screen comes with the organisation area).
   - A name never raises the question, and a CPF alone never links anything: CPFs are not secret, and a paid registration is worth something (it validates a paper and gives a certificate).
6. **The document is given once.** After CPF or passport is saved the person cannot change it, so an account cannot be used to try one CPF after another. Corrections go through the organisers.
7. **One registration per account per event** (unique index on `event_id, user_id`). Merging duplicates is an organiser action.
8. **The registration form keeps working without an account.** Logged in, it is filled from the account and the e-mail cannot be changed. Before saving, it asks the server whether the CPF or passport already has a registration for the event under another e-mail, and stops with the masked address if so. If that check fails, the registration goes ahead.
9. **Rate limits in the database.** `hit_rate_limit()` counts attempts per key and time window; the key is a hash, never an address or an IP. Limits: 3 per hour per address for create account and for forgotten password, 20 per hour per IP for both, 30 per hour per IP for the form's check, 5 per day per account for link requests.
10. **One Vercel function for all account actions**, reached by a rewrite in `vercel.json`. The Hobby plan caps the number of functions, and a `[action].ts` file loses to the catch-all rewrite that serves the single-page app.
11. **Switched on per deployment.** The frontend shows nothing and the server answers 503 unless both flags are `true`. Preview has them; production does not until this is released there, which also needs the migration `20261117010000_accounts` on sieamb-prod.

## Consequences

- Saving a password ends every session of the account at Supabase, so the page logs in again with the new password right after saving.
- Changing an unconfirmed account's password cancels its pending link. That is why the order in decision 2 is: link, new password, fresh link.
- The server cannot import `@sieamb/shared` (an ES module; the functions are built as CommonJS). It fails only once deployed, never in the unit tests. The server keeps its own CPF check.
- Supabase still accepts sign-ups made straight at its API with the public key, and would send its own confirmation e-mail. Such an account has no effect here until confirmed, and gets a new password when its owner uses our form. Turning public sign-ups off in the Supabase dashboard is still worth doing.
- The minimum password length (10) is enforced by our server when a password is saved. Supabase's own minimum (6) remains the floor for calls made straight to it.
- Account e-mails are sent in the request, not through the outbox (ADR-005): they are asked for by the person, who can ask again. Notices to organisers (next slice) will need the outbox.
- The form's CPF check tells an anonymous visitor that a CPF is registered and shows a masked address. It is limited per IP; revisit if it is abused.
- How long a confirmation link lasts is a Supabase project setting (one hour by default), not ours.
