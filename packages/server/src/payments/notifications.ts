import { timingSafeEqual } from 'node:crypto';
import { emailLocale, renderEmail, type NotificationKind } from './emailTemplates';
import { json, type Log } from './http';
import type { PaymentStatus } from './status';
import type { EmailJob, EmailKind, PaymentStore } from './store';
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
      return status === 'REJECTED' || status === 'CANCELLED';
  }
}

const TEMPLATE: Record<EmailKind, NotificationKind> = {
  PROCESSING: 'processing',
  CONFIRMED: 'confirmed',
  FAILED: 'failed',
};

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

    const payment = await store.findPaymentById(job.paymentId);
    const contact = payment ? await store.findContact(payment.preRegistrationId) : null;
    const reason = !payment
      ? 'no_payment'
      : !stillApplies(job.kind, payment.status)
        ? 'outdated'
        : !contact
          ? 'no_contact'
          : !isSendableEmail(contact.email)
            ? 'invalid_address'
            : null;
    if (reason || !payment || !contact) {
      await store.finishEmail(job.id, 'SKIPPED', now);
      log('payment_email_skipped', { emailId: job.id, paymentId: job.paymentId, kind: job.kind, reason });
      return 'skipped';
    }

    const site = deps.siteUrl.replace(/\/+$/, '');
    const slug = encodeURIComponent(contact.eventSlug);
    const mail = renderEmail(TEMPLATE[job.kind], contact.locale, {
      firstName: firstName(contact.fullName),
      eventName: contact.eventName,
      amount: formatAmount(payment.amountCents, contact.locale),
      statusUrl: `${site}/${slug}/inscricoes/pagamento?p=${payment.id}`,
      payUrl: `${site}/${slug}/inscricoes/pagar?t=${contact.payToken}`,
    });
    await mailer.send({ to: contact.email, ...mail });
    await store.finishEmail(job.id, 'SENT', now);
    log('payment_email_sent', { emailId: job.id, paymentId: payment.id, kind: job.kind });
    return 'sent';
  } catch (error) {
    const reason = error instanceof Error ? error.name : 'unknown';
    log('payment_email_failed', { emailId: job.id, paymentId: job.paymentId, kind: job.kind, reason });
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
      const job = await deps.store.enqueueEmail(payment.id, kind);
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

export interface SweepEnv {
  cronSecret?: string;
  now: Date;
}

function sameSecret(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * `POST /api/v1/payments/emails/deliver`, called on a schedule with
 * `Authorization: Bearer <CRON_SECRET>`. The answer carries counts only.
 */
export async function handleEmailSweep(
  request: Request,
  env: SweepEnv,
  deps: Partial<EmailDeps> & { log: Log },
): Promise<Response> {
  if (request.method !== 'POST') return json(405, { error: 'method_not_allowed' });
  const { cronSecret } = env;
  if (!cronSecret || !deps.store || !deps.siteUrl) return json(503, { error: 'emails_not_configured' });
  const header = request.headers.get('authorization') ?? '';
  const given = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!given || !sameSecret(given, cronSecret)) return json(401, { error: 'unauthorized' });
  if (!deps.mailer) return json(503, { error: 'mailer_not_configured' });

  try {
    const result = await deliverDueEmails(deps as EmailDeps, env.now);
    deps.log('payment_email_sweep', { ...result });
    return json(200, { ...result });
  } catch {
    deps.log('payment_email_sweep_failed', {});
    return json(502, { error: 'sweep_failed' });
  }
}
