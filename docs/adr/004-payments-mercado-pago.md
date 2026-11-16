# ADR-004: Registration fees through Mercado Pago, decided and charged on the server

**Date:** 2026-11-16 · **Status:** Accepted, live on sieamb.org since 2026-11-16 · **Issues:** #16, #158, #160, #166, #182, #188, #191, #194, #198

## Context

The II SIEAmB charges a registration fee (R$ 30, 50 or 70 in the first lot, by category). The 2025 edition used Even3 for this. The money has to reach an account with a CNPJ, and the event has none of its own: the Empresa Júnior de Engenharia Florestal (UFCG) holds the account. Rodrigo is the only developer, the hosting budget is close to zero, and nobody watches the system during the day.

Until this work the repository had no server code. Registrations are written by the browser straight into `pre_registrations` (#149, described in STATUS.md).

## Decisions

1. **Mercado Pago, Checkout Pro, with the Orders API.** The buyer pays on Mercado Pago's own page, so no card data ever touches our code. The developer panel marks the older Preferences API as about to be discontinued, so orders are created with `POST /v1/orders`. The seller account belongs to the empresa júnior.
2. **Card and boleto. No Pix for now.** A Pix key could not be created on the account (2026-11-05). When it exists, Pix only needs to be allowed in the order, not built.
3. **The price is decided on the server, never taken from the browser.** `resolveFeeTier` reads the same fixture the public fee table shows (`feeTiers.json`), so the price on screen and the price charged cannot drift. No lot in force, or two overlapping lots, means no order.
4. **A payment is started with a pay token, not a login.** Every registration has a `pay_token` (uuid). `/:event/inscricoes/pagar?t=<token>` starts or resumes the payment, which is what lets an e-mail carry a "pay now" link. There are no user accounts yet.
5. **One open payment per registration**, enforced by a partial unique index. A second click returns the same open order. Our payment id is the idempotency key sent to Mercado Pago. An order older than 23 hours is checked and cancelled there before a new one is opened (orders expire after one day).
6. **Mercado Pago is the source of truth for status.** The webhook only says "something changed": after checking the `x-signature` (HMAC-SHA256), the server reads the order back with `GET /v1/orders/{id}` and records what it finds. The return page and a background job (ADR-005) re-read open orders too, so nothing depends on a notification arriving.
7. **Status mapping** (`payments/status.ts`):
   - `processed` → `APPROVED`
   - `action_required` with a boleto waiting → `PENDING` (the person has to pay it)
   - `in_review` (Mercado Pago's manual review of a card) → `PENDING`. The person cannot act, so nothing asks them to
   - a refused card (`action_required` / `waiting_retry`) → back to `CREATED`, so the same order can be tried again with another card
   - refunded → `REFUNDED`
8. **Buyer data sent with the order**: first and last name with accents folded to plain letters, and the CPF when its check digits are valid. On 2026-11-16 three real cards were refused as "high risk" with no buyer data, one with an accented name went to manual review, and the first one sent without accents was approved on the spot. Non-Latin names are omitted instead of being sent wrong.
9. **A single instalment** (`max_installments: 1`). The amounts are small and the refused attempts had 2 to 10 instalments.
10. **Server code lives in `packages/server`**, with thin Vercel functions under `/api/v1/payments/*` as entry points. The `payments` table is reachable by the service role only (RLS on, no policy).

## Consequences

- No Pix means some people will not pay online. Boleto covers part of that.
- The seller account is new, and Mercado Pago's risk rules are outside our control. Documented options not done yet: the Device ID script, item details with the event date, and the "integration quality" measurement in the panel.
- A boleto shows a due date three days ahead while the order expires in one day. What happens to a boleto paid after the order expired was never verified (#167).
- Refunds are recorded when Mercado Pago reports them. There is no screen to issue one; it is done in the Mercado Pago panel.
- The checkout answers 403 to a headless browser, so automated tests go as far as the redirect. Real payments are tried by hand.
- The fee table covers three categories. Any other category answers "no fee available".
