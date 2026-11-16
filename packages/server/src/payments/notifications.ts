import { timingSafeEqual } from 'node:crypto';
import { emailLocale, renderEmail, type NotificationKind } from './emailTemplates';
import { json, type Log } from './http';
import type { PaymentStatus } from './status';
import { fetchOrder } from './mercadoPago';
import type { EmailJob, EmailKind, Payment, PaymentStore, ReminderCandidate } from './store';
import { applyOrderToPayment } from './sync';
import type { PaymentNotifier } from './sync';

export interface OutgoingMail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface Mailer {
  send(mail: OutgoingMail): Promise<void>;
}

export interface EmailDeps {
  store: PaymentStore;
  /** Absent while no sender is configured: e-mails are still recorded and go out later. */
  mailer?: Mailer;
  /** Origin the links in the e-mail point to, e.g. https://sieamb.org. */
  siteUrl: string;
  log: Log;
}

/**
 * Which e-mail a status change deserves.
 *
 * - pending: "registration received, we are processing your payment"
 * - approved: "registration complete, payment confirmed"
 * - refused: "payment not approved"
 * - cancelled: only when it was pending. An order that expired without anyone
 *   trying to pay it is not news to the person.
 * - back to "not paid" after being pending: the attempt was refused and the order
 *   waits for another try (#188), which is "payment not approved" too.
 */
export function emailKindFor(previous: PaymentStatus, next: PaymentStatus): EmailKind | null {
  if (previous === next) return null;
  switch (next) {
    case 'PENDING':
      return 'PROCESSING';
    case 'APPROVED':
      return 'CONFIRMED';
    case 'REJECTED':
      return 'FAILED';
    case 'CANCELLED':
    case 'CREATED':
      return previous === 'PENDING' ? 'FAILED' : null;
    default:
      return null;
  }
}

/** An e-mail delivered late must still be true: "processing" is not sent once the payment is paid. */
export function stillApplies(kind: EmailKind, status: PaymentStatus): boolean {
  switch (kind) {
    case 'PROCESSING':
      return status === 'PENDING';
    case 'CONFIRMED':
      return status === 'APPROVED';
    case 'FAILED':
      // CREATED: refused, and nothing paid since.
      return status === 'REJECTED' || status === 'CANCELLED' || status === 'CREATED';
    case 'REMINDER':
      // Decided from all the payments of the registration, see `reminderState`.
      return false;
  }
}

const TEMPLATE: Record<Exclude<EmailKind, 'REMINDER'>, NotificationKind> = {
  PROCESSING: 'processing',
  CONFIRMED: 'confirmed',
  FAILED: 'failed',
};

// ───────────────────────────── Reminders (#187) ─────────────────────────────

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/** At most this many reminders per registration. */
export const REMINDER_LIMIT = 3;
/** First reminder a day after registering, then two and four days after the previous one. */
export const REMINDER_GAPS_MS = [1 * DAY, 2 * DAY, 4 * DAY];
/** No reminder within this long of any other e-mail to the same person. */
export const QUIET_AFTER_EMAIL_MS = 20 * HOUR;

type PaymentGlimpse = { id: string; status: PaymentStatus; mpStatus: string | null };

/**
 * What a reminder would say about a registration right now, or null when there is
 * nothing to remind:
 * - paid (or paid and refunded): nothing
 * - Mercado Pago is processing or reviewing a payment: nothing, the person cannot act on it
 * - a boleto or similar waiting for the person (`action_required`): "your payment is still pending"
 * - otherwise: "your registration is waiting for payment"
 */
export function reminderState(
  payments: PaymentGlimpse[],
): { variant: 'unpaid' } | { variant: 'pending'; paymentId: string } | null {
  if (payments.some((p) => p.status === 'APPROVED' || p.status === 'REFUNDED')) return null;
  const pending = payments.filter((p) => p.status === 'PENDING');
  if (pending.length === 0) return { variant: 'unpaid' };
  const waitingOnPerson = pending.find((p) => p.mpStatus === 'action_required');
  if (pending.some((p) => p.mpStatus !== 'action_required') || !waitingOnPerson) return null;
  return { variant: 'pending', paymentId: waitingOnPerson.id };
}

/** Which reminder (1, 2 or 3) is due for a registration now, or null. */
export function reminderDue(candidate: ReminderCandidate, now: Date): number | null {
  if (!reminderState(candidate.payments)) return null;
  const reminders = candidate.emails.filter((e) => e.kind === 'REMINDER');
  const sent = reminders.length;
  if (sent >= REMINDER_LIMIT) return null;

  const at = (iso: string) => Date.parse(iso);
  const lastEmail = Math.max(0, ...candidate.emails.map((e) => at(e.createdAt)));
  if (lastEmail && now.getTime() - lastEmail < QUIET_AFTER_EMAIL_MS) return null;

  const since = sent === 0 ? at(candidate.registeredAt) : Math.max(...reminders.map((e) => at(e.createdAt)));
  if (Number.isNaN(since)) return null;
  return now.getTime() - since >= REMINDER_GAPS_MS[sent]! ? sent + 1 : null;
}

/** Reminders go out between 08:00 and 20:00 in Brazil (UTC-3, no daylight saving). */
export function withinSendingHours(now: Date): boolean {
  const hour = (now.getUTCHours() + 24 - 3) % 24;
  return hour >= 8 && hour < 20;
}

/** Records the reminders that are due. Delivery happens with the rest of the outbox. */
export async function enqueueReminders(
  deps: Pick<EmailDeps, 'store' | 'log'>,
  now: Date,
  limit = 500,
): Promise<number> {
  const candidates = await deps.store.listReminderCandidates(
    new Date(now.getTime() - REMINDER_GAPS_MS[0]!),
    limit,
  );
  let recorded = 0;
  for (const candidate of candidates) {
    const number = reminderDue(candidate, now);
    if (!number) continue;
    const state = reminderState(candidate.payments);
    const job = await deps.store.enqueueEmail({
      preRegistrationId: candidate.preRegistrationId,
      paymentId: state?.variant === 'pending' ? state.paymentId : null,
      kind: 'REMINDER',
      dedupeKey: `reminder:${candidate.preRegistrationId}:${number}`,
    });
    if (job) recorded += 1;
  }
  if (candidates.length === limit) deps.log('payment_reminders_truncated', { limit });
  return recorded;
}

// One address, no spaces or line breaks: the row is written by the browser, not by our form checks.
const EMAIL = /^[^\s@<>,;"]+@[^\s@<>,;"]+\.[^\s@<>,;"]+$/;

export const isSendableEmail = (value: unknown): value is string =>
  typeof value === 'string' && value.length <= 200 && EMAIL.test(value);

/** First word of the name, without anything that could break a line. */
export function firstName(fullName: string): string {
  const cleaned = fullName.replace(/[\r\n\t]+/g, ' ').trim();
  return (cleaned.split(/\s+/)[0] ?? '').slice(0, 60);
}

export function formatAmount(amountCents: number, locale: string): string {
  return new Intl.NumberFormat(emailLocale(locale), { style: 'currency', currency: 'BRL' }).format(
    amountCents / 100,
  );
}

export type DeliveryOutcome = 'sent' | 'skipped' | 'failed' | 'busy' | 'no_mailer';

/**
 * One delivery attempt for one outbox row. Never throws.
 * The claim is a compare-and-swap, so the request that recorded the status and
 * the scheduled sweep cannot both send the same e-mail.
 */
export async function deliverEmail(
  job: EmailJob,
  deps: EmailDeps,
  now: Date,
): Promise<DeliveryOutcome> {
  const { store, mailer, log } = deps;
  if (!mailer) return 'no_mailer';
  let claimed = false;
  try {
    claimed = await store.claimEmail(job, now);
    if (!claimed) return 'busy';

    // A reminder is decided from every payment of the registration; a status e-mail from its own.
    const payments = job.kind === 'REMINDER' ? await store.listPayments(job.preRegistrationId) : [];
    const reminder =
      job.kind === 'REMINDER'
        ? reminderState(payments.map((p) => ({ id: p.id, status: p.status, mpStatus: p.mpStatus })))
        : null;
    const paymentId = reminder?.variant === 'pending' ? reminder.paymentId : job.paymentId;
    const payment: Payment | null =
      job.kind === 'REMINDER'
        ? (payments.find((p) => p.id === paymentId) ?? null)
        : job.paymentId
          ? await store.findPaymentById(job.paymentId)
          : null;
    const contact = await store.findContact(job.preRegistrationId);

    let template: NotificationKind | null = null;
    if (job.kind === 'REMINDER') {
      if (reminder) template = reminder.variant === 'pending' ? 'reminderPending' : 'reminderUnpaid';
    } else if (payment && stillApplies(job.kind, payment.status)) {
      template = TEMPLATE[job.kind];
    }
    const reason = !template
      ? job.kind !== 'REMINDER' && !payment
        ? 'no_payment'
        : 'outdated'
      : !contact
        ? 'no_contact'
        : !isSendableEmail(contact.email)
          ? 'invalid_address'
          : null;
    if (reason || !template || !contact) {
      await store.finishEmail(job.id, 'SKIPPED', now);
      log('payment_email_skipped', { emailId: job.id, kind: job.kind, reason });
      return 'skipped';
    }

    const site = deps.siteUrl.replace(/\/+$/, '');
    const slug = encodeURIComponent(contact.eventSlug);
    const mail = renderEmail(template, contact.locale, {
      firstName: firstName(contact.fullName),
      eventName: contact.eventName,
      amount: payment ? formatAmount(payment.amountCents, contact.locale) : '',
      statusUrl: payment ? `${site}/${slug}/inscricoes/pagamento?p=${payment.id}` : '',
      payUrl: `${site}/${slug}/inscricoes/pagar?t=${contact.payToken}`,
    });
    await mailer.send({ to: contact.email, ...mail });
    await store.finishEmail(job.id, 'SENT', now);
    log('payment_email_sent', { emailId: job.id, kind: job.kind, template });
    return 'sent';
  } catch (error) {
    const reason = error instanceof Error ? error.name : 'unknown';
    log('payment_email_failed', { emailId: job.id, kind: job.kind, reason });
    // Give it back so the sweep tries again; the attempt stays counted.
    if (claimed) await store.releaseEmail(job.id, reason).catch(() => undefined);
    return 'failed';
  }
}

/**
 * What the handlers call after recording a status: note the e-mail that is owed
 * and try to send it right away. Nothing here throws, because an e-mail problem
 * must never make Mercado Pago retry a notification we already recorded.
 */
export function createPaymentNotifier(deps: EmailDeps, now: () => Date = () => new Date()): PaymentNotifier {
  return async (payment, previous) => {
    const kind = emailKindFor(previous, payment.status);
    if (!kind) return;
    try {
      const job = await deps.store.enqueueEmail({
        preRegistrationId: payment.preRegistrationId,
        paymentId: payment.id,
        kind,
        dedupeKey: `${payment.id}:${kind}`,
      });
      if (job) await deliverEmail(job, deps, now());
    } catch (error) {
      deps.log('payment_email_enqueue_failed', {
        paymentId: payment.id,
        kind,
        reason: error instanceof Error ? error.name : 'unknown',
      });
    }
  };
}

export interface SweepResult {
  due: number;
  sent: number;
  skipped: number;
  failed: number;
}

/** Sends what is still pending: failed attempts and e-mails recorded while no sender was configured. */
export async function deliverDueEmails(deps: EmailDeps, now: Date, limit = 20): Promise<SweepResult> {
  const result: SweepResult = { due: 0, sent: 0, skipped: 0, failed: 0 };
  if (!deps.mailer) return result;
  const jobs = await deps.store.listDueEmails(now, limit);
  result.due = jobs.length;
  for (const job of jobs) {
    const outcome = await deliverEmail(job, deps, now);
    if (outcome === 'sent') result.sent += 1;
    else if (outcome === 'skipped') result.skipped += 1;
    else if (outcome === 'failed') result.failed += 1;
  }
  return result;
}

// ───────────────────────────── Background job (#187) ─────────────────────────────

/** A payment is re-checked at Mercado Pago when nothing touched it for this long. */
export const REFRESH_AFTER_MS = 15 * 60 * 1000;

export interface RefreshDeps {
  store: PaymentStore;
  fetch: typeof fetch;
  accessToken: string;
  notify?: PaymentNotifier;
  log: Log;
}

/**
 * Re-reads open payments from Mercado Pago, so a notification that never arrived
 * (or arrived while we were down) is still recorded, and its e-mail owed.
 */
export async function refreshOpenPayments(deps: RefreshDeps, now: Date, limit = 20): Promise<number> {
  const stale = await deps.store.listOpenPayments(new Date(now.getTime() - REFRESH_AFTER_MS), limit);
  let changed = 0;
  for (const payment of stale) {
    if (!payment.mpOrderId) continue;
    try {
      const order = await fetchOrder(payment.mpOrderId, deps.accessToken, deps.fetch);
      const updated = await applyOrderToPayment(payment, order, deps.store, now, deps.notify);
      if (updated.status !== payment.status) changed += 1;
    } catch {
      deps.log('payment_refresh_failed', { paymentId: payment.id });
    }
  }
  return changed;
}

export interface SweepEnv {
  cronSecret?: string;
  accessToken?: string;
  remindersEnabled?: boolean;
  now: Date;
}

export interface SweepDeps extends Partial<EmailDeps> {
  fetch?: typeof fetch;
  notify?: PaymentNotifier;
  log: Log;
}

function sameSecret(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * `POST /api/v1/payments/emails/deliver`, called on a schedule with
 * `Authorization: Bearer <CRON_SECRET>`. In order:
 *
 * 1. re-check open payments at Mercado Pago;
 * 2. record the reminders that are due (only when enabled, and never at night);
 * 3. send what the outbox still owes.
 *
 * One step failing does not stop the others. The answer carries counts only.
 */
export async function handleEmailSweep(
  request: Request,
  env: SweepEnv,
  deps: SweepDeps,
): Promise<Response> {
  if (request.method !== 'POST') return json(405, { error: 'method_not_allowed' });
  const { cronSecret, accessToken, now } = env;
  const { store, mailer, siteUrl, log } = deps;
  if (!cronSecret || !store || !siteUrl) return json(503, { error: 'emails_not_configured' });
  const header = request.headers.get('authorization') ?? '';
  const given = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!given || !sameSecret(given, cronSecret)) return json(401, { error: 'unauthorized' });

  const emailDeps: EmailDeps = { store, mailer, siteUrl, log };
  const result = {
    refreshed: 0,
    reminders: 0,
    due: 0,
    sent: 0,
    skipped: 0,
    failed: 0,
    mailer: Boolean(mailer),
    errors: [] as string[],
  };

  if (accessToken && deps.fetch) {
    try {
      result.refreshed = await refreshOpenPayments(
        { store, fetch: deps.fetch, accessToken, notify: deps.notify, log },
        now,
      );
    } catch {
      result.errors.push('refresh');
    }
  }
  if (mailer && env.remindersEnabled && withinSendingHours(now)) {
    try {
      result.reminders = await enqueueReminders(emailDeps, now);
    } catch {
      result.errors.push('reminders');
    }
  }
  try {
    Object.assign(result, await deliverDueEmails(emailDeps, now));
  } catch {
    result.errors.push('deliver');
  }

  log('payment_email_sweep', { ...result });
  return json(result.errors.length ? 502 : 200, { ...result });
}
