import { timingSafeEqual } from 'node:crypto';
import { emailLocale, renderEmail, type EmailData, type NotificationKind } from './emailTemplates';
import { json, type Log } from './http';
import type { PaymentStatus } from './status';
import { paymentDeadlines, resolveFeeTier, type PaymentDeadline } from './fees';
import { fetchOrder } from './mercadoPago';
import {
  isUuid,
  type EmailJob,
  type EmailKind,
  type Payment,
  type PaymentStore,
  type PreRegistrationRef,
  type ReminderCandidate,
} from './store';
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
export function emailKindFor(
  previous: PaymentStatus,
  next: PaymentStatus,
  detail: { previous?: string | null; next?: string | null } = {},
): EmailKind | null {
  // An attempt refused on the spot leaves our status where it was (not paid) while the
  // order moves to "waiting for a retry": the person must still be told (#195).
  if (next === 'CREATED' && detail.next === 'waiting_retry' && detail.previous !== 'waiting_retry') {
    return 'FAILED';
  }
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
    case 'RECEIVED':
      // Decided from all the payments of the registration, see `reminderState` and `receivedApplies`.
      return false;
  }
}

const TEMPLATE: Record<Exclude<EmailKind, 'REMINDER' | 'RECEIVED'>, NotificationKind> = {
  PROCESSING: 'processing',
  CONFIRMED: 'confirmed',
  FAILED: 'failed',
};

// ───────────────────────────── Reminders (#187) ─────────────────────────────

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/** Reminders counted from the registration: one a day after it, one two days after that (day 3). */
export const REMINDER_LIMIT = 2;
export const REMINDER_GAPS_MS = [1 * DAY, 2 * DAY];
/** Reminders counted from a date: this many days before each payment deadline (#201). */
export const DEADLINE_OFFSETS_DAYS = [7, 1];
/** A date reminder still keeps this distance from another reminder. */
export const DEADLINE_QUIET_MS = 6 * HOUR;
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

/**
 * "Registration received, the fee is still to be paid" is true until a payment is
 * approved or in flight. After that the payment e-mails say what matters.
 */
export function receivedApplies(payments: { status: PaymentStatus }[]): boolean {
  return !payments.some((p) => p.status === 'APPROVED' || p.status === 'PENDING' || p.status === 'REFUNDED');
}

const isTimed = (e: { kind: EmailKind; dedupeKey: string }) =>
  e.kind === 'REMINDER' && e.dedupeKey.startsWith('reminder:');

/** Which reminder counted from the registration (1 or 2) is due now, or null. */
export function reminderDue(candidate: ReminderCandidate, now: Date): number | null {
  if (!reminderState(candidate.payments)) return null;
  const reminders = candidate.emails.filter(isTimed);
  const sent = reminders.length;
  if (sent >= REMINDER_LIMIT) return null;

  const at = (iso: string) => Date.parse(iso);
  const lastEmail = Math.max(0, ...candidate.emails.map((e) => at(e.createdAt)));
  if (lastEmail && now.getTime() - lastEmail < QUIET_AFTER_EMAIL_MS) return null;

  const since = sent === 0 ? at(candidate.registeredAt) : Math.max(...reminders.map((e) => at(e.createdAt)));
  if (Number.isNaN(since)) return null;
  return now.getTime() - since >= REMINDER_GAPS_MS[sent]! ? sent + 1 : null;
}

/** Calendar day in Brazil (UTC-3, no daylight saving), as a day count. */
const brDay = (ms: number): number => Math.floor((ms - 3 * HOUR) / DAY);

/** The Brazilian calendar date of an instant, `YYYY-MM-DD`: what a date reminder is keyed by. */
export const brDate = (ms: number): string => new Date(ms - 3 * HOUR).toISOString().slice(0, 10);

export interface DeadlineReminder {
  key: string;
  deadline: PaymentDeadline;
  daysBefore: number;
}

/**
 * The date reminder due today for a registration, or null: exactly 7 days or 1 day
 * (on the Brazilian calendar) before the end of a lot. Only for registrations with
 * nothing paid and no boleto waiting, never on the day someone registered, and
 * once per date and distance.
 */
export function deadlineReminderDue(
  candidate: ReminderCandidate,
  now: Date,
  deadlines: PaymentDeadline[] = paymentDeadlines(candidate),
): DeadlineReminder | null {
  if (reminderState(candidate.payments)?.variant !== 'unpaid') return null;
  const today = brDay(now.getTime());
  const registered = Date.parse(candidate.registeredAt);
  if (Number.isNaN(registered) || brDay(registered) === today) return null;
  const lastReminder = Math.max(
    0,
    ...candidate.emails.filter((e) => e.kind === 'REMINDER').map((e) => Date.parse(e.createdAt)),
  );
  if (lastReminder && now.getTime() - lastReminder < DEADLINE_QUIET_MS) return null;

  for (const deadline of deadlines) {
    const end = Date.parse(deadline.date);
    if (Number.isNaN(end) || now.getTime() >= end) continue;
    const daysBefore = brDay(end) - today;
    if (!DEADLINE_OFFSETS_DAYS.includes(daysBefore)) continue;
    const key = `deadline:${candidate.preRegistrationId}:${brDate(end)}:${daysBefore}`;
    if (candidate.emails.some((e) => e.dedupeKey === key)) continue;
    return { key, deadline, daysBefore };
  }
  return null;
}

/** `deadline:<registration>:<YYYY-MM-DD>:<days>` → the date part, or null for any other key. */
export function deadlineOfKey(dedupeKey: string): string | null {
  const match = /^deadline:[^:]+:(\d{4}-\d{2}-\d{2}):\d+$/.exec(dedupeKey);
  return match ? match[1]! : null;
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
    // A date reminder comes first: it cannot wait for tomorrow.
    const dated = deadlineReminderDue(candidate, now);
    if (dated) {
      const job = await deps.store.enqueueEmail({
        preRegistrationId: candidate.preRegistrationId,
        paymentId: null,
        kind: 'REMINDER',
        dedupeKey: dated.key,
      });
      if (job) recorded += 1;
      continue;
    }
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

// Addresses our own tests register with, and domains reserved for examples: mail to them
// only bounces, and bounces hurt the sender's reputation.
const TEST_ADDRESS = /^e2e\+[^@]*@sieamb\.org$|@(?:[^@]+\.)?example\.(?:com|org|net)$|\.(?:test|invalid|example|localhost)$/i;

/** An address of our own tests or of a domain reserved for examples: never a real inbox. */
export const isTestAddress = (value: string): boolean => TEST_ADDRESS.test(value);

/**
 * Who is told about something. What is only about test people (a paper whose authors
 * are all test addresses, a test registration) stays among test accounts: on the dev
 * site real organisers share the database with the automatic tests, and were mailed
 * dozens of times per test run (#255). Real data goes to everyone, as always.
 */
export function audienceFor<T extends { email: string }>(subjectEmails: string[], recipients: T[]): T[] {
  const aboutTests = subjectEmails.length > 0 && subjectEmails.every(isTestAddress);
  return aboutTests ? recipients.filter((r) => isTestAddress(r.email)) : recipients;
}

export const isSendableEmail = (value: unknown): value is string =>
  typeof value === 'string' && value.length <= 200 && EMAIL.test(value) && !TEST_ADDRESS.test(value);

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

/** The Brazilian calendar date of a deadline, written for the reader's language (01/01/2027). */
export function formatDate(iso: string, locale: string): string {
  // Day first in every language, English included: 03/20 would be read as a wrong date here.
  const tag = emailLocale(locale) === 'en' ? 'en-GB' : emailLocale(locale);
  return new Intl.DateTimeFormat(tag, {
    timeZone: 'America/Fortaleza',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(iso));
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
    const perRegistration = job.kind === 'REMINDER' || job.kind === 'RECEIVED';
    const payments = perRegistration ? await store.listPayments(job.preRegistrationId) : [];
    const reminder =
      job.kind === 'REMINDER'
        ? reminderState(payments.map((p) => ({ id: p.id, status: p.status, mpStatus: p.mpStatus })))
        : null;
    const paymentId = reminder?.variant === 'pending' ? reminder.paymentId : job.paymentId;
    const payment: Payment | null =
      job.kind === 'RECEIVED'
        ? null
        : job.kind === 'REMINDER'
        ? (payments.find((p) => p.id === paymentId) ?? null)
        : job.paymentId
          ? await store.findPaymentById(job.paymentId)
          : null;
    const contact = await store.findContact(job.preRegistrationId);

    const dated = deadlineOfKey(job.dedupeKey);
    let template: NotificationKind | null = null;
    let extra: Partial<EmailData> = {};
    if (job.kind === 'RECEIVED') {
      if (receivedApplies(payments)) template = 'received';
    } else if (job.kind === 'REMINDER' && dated) {
      // Still unpaid, still before the date, and the lot it speaks of is the one in force.
      const deadline = contact
        ? paymentDeadlines(contact).find((d) => brDate(Date.parse(d.date)) === dated)
        : undefined;
      const tier = contact ? resolveFeeTier({ ...contact, now }) : null;
      if (reminder?.variant === 'unpaid' && deadline && tier && tier.validUntil === deadline.date) {
        template = deadline.nextAmountCents ? 'reminderPriceUp' : 'reminderClosing';
        extra = {
          amount: formatAmount(deadline.amountCents, contact!.locale),
          deadline: formatDate(deadline.date, contact!.locale),
          nextAmount: deadline.nextAmountCents
            ? formatAmount(deadline.nextAmountCents, contact!.locale)
            : '',
        };
      }
    } else if (job.kind === 'REMINDER') {
      if (reminder) template = reminder.variant === 'pending' ? 'reminderPending' : 'reminderUnpaid';
    } else if (payment && stillApplies(job.kind, payment.status)) {
      template = TEMPLATE[job.kind];
    }
    const reason = !template
      ? !perRegistration && !payment
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
      ...extra,
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
  return async (payment, previous, previousDetail) => {
    const kind = emailKindFor(previous, payment.status, {
      previous: previousDetail,
      next: payment.mpStatusDetail,
    });
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

// ───────────────────────────── Registration received (#195) ─────────────────────────────

const receivedKey = (preRegistrationId: string) => `received:${preRegistrationId}`;

/**
 * `POST /api/v1/registrations/received` with `{ token }`, called by the form right
 * after it saves a registration. The pay token is the unguessable handle the browser
 * generated, and the e-mail is owed once per registration, so calling this twice,
 * or by someone replaying it, sends nothing more.
 */
export async function handleRegistrationReceived(
  request: Request,
  env: { now: Date },
  deps: Partial<EmailDeps> & {
    log: Log;
    /** Tells the organisers of a registration seen for the first time (#219). Never fails the form. */
    onRegistered?: (registration: PreRegistrationRef) => Promise<void>;
  },
): Promise<Response> {
  if (request.method !== 'POST') return json(405, { error: 'method_not_allowed' });
  const { store, siteUrl, log } = deps;
  if (!store || !siteUrl) return json(503, { error: 'emails_not_configured' });
  let token: unknown;
  try {
    token = ((await request.json()) as { token?: unknown } | null)?.token;
  } catch {
    token = undefined;
  }
  if (!isUuid(token)) return json(400, { error: 'invalid_token' });

  try {
    const registration = await store.findPreRegistrationByToken(token);
    if (!registration) return json(404, { error: 'registration_not_found' });
    const job = await store.enqueueEmail({
      preRegistrationId: registration.id,
      paymentId: null,
      kind: 'RECEIVED',
      dedupeKey: receivedKey(registration.id),
    });
    if (job) {
      await deliverEmail(job, { store, mailer: deps.mailer, siteUrl, log }, env.now);
      await deps.onRegistered?.(registration).catch(() => log('registration_notice_failed', {}));
    }
    return json(202, { received: true });
  } catch {
    // The background job sends it for a recent registration, so the form is not failed for this.
    log('registration_received_failed', {});
    return json(202, { received: true });
  }
}

/** A registration this recent is covered by the safety net below. */
export const RECEIVED_WINDOW_MS = 24 * HOUR;
/** Give the form's own call a moment before the job steps in. */
export const RECEIVED_GRACE_MS = 2 * 60 * 1000;

/**
 * Records "registration received" for recent registrations that have none, in case
 * the form's call never arrived (closed tab, network). Older registrations are left
 * alone on purpose: writing to everyone who ever registered is a decision for a person.
 */
export async function enqueueMissingReceived(
  deps: Pick<EmailDeps, 'store' | 'log'>,
  now: Date,
  limit = 200,
): Promise<number> {
  const recent = await deps.store.listRecentRegistrations(
    new Date(now.getTime() - RECEIVED_WINDOW_MS),
    limit,
  );
  let recorded = 0;
  for (const registration of recent) {
    if (now.getTime() - Date.parse(registration.registeredAt) < RECEIVED_GRACE_MS) continue;
    if (registration.emails.some((e) => e.kind === 'RECEIVED')) continue;
    if (!receivedApplies(registration.payments)) continue;
    const job = await deps.store.enqueueEmail({
      preRegistrationId: registration.preRegistrationId,
      paymentId: null,
      kind: 'RECEIVED',
      dedupeKey: receivedKey(registration.preRegistrationId),
    });
    if (job) recorded += 1;
  }
  return recorded;
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
  /** Delivers what the general outbox still owes (#217); absent where it is not set up. */
  sweepOutbox?: (now: Date) => Promise<unknown>;
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
 * 2. record "registration received" for recent registrations that have none;
 * 3. record the reminders that are due (only when enabled, and never at night);
 * 4. send what the outbox still owes.
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
    received: 0,
    reminders: 0,
    due: 0,
    sent: 0,
    skipped: 0,
    failed: 0,
    mailer: Boolean(mailer),
    errors: [] as string[],
  };
  const extra: { outbox?: unknown } = {};

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
  try {
    result.received = await enqueueMissingReceived(emailDeps, now);
  } catch {
    result.errors.push('received');
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
  // The general outbox (#217): submissions, announcements. Counts only, like the rest.
  if (deps.sweepOutbox) {
    try {
      extra.outbox = await deps.sweepOutbox(now);
    } catch {
      result.errors.push('outbox');
    }
  }

  log('payment_email_sweep', { ...result, ...extra });
  return json(result.errors.length ? 502 : 200, { ...result, ...extra });
}
