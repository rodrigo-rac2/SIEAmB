import type { Log } from '../payments/http';
import { isSendableEmail, type Mailer } from '../payments/notifications';

/** An e-mail the system owes (#217). The text is already rendered. */
export interface OutboxMail {
  to: string;
  subject: string;
  text: string;
  html: string;
  /** Recording the same key twice is a no-op: the e-mail is owed once. */
  dedupeKey: string;
}

export interface OutboxJob {
  id: string;
  to: string;
  subject: string;
  text: string | null;
  html: string | null;
  attempts: number;
}

export interface NewNotification {
  userId: string;
  eventId: string | null;
  /** Picks the text in the site's language, e.g. `submission.received`. */
  kind: string;
  data: Record<string, unknown>;
}

export interface OutboxStore {
  /** Null when the key was already recorded. */
  enqueueOutbox(mail: OutboxMail): Promise<OutboxJob | null>;
  /** Records many at once without trying to send them; returns how many were new. The sweep delivers them. */
  enqueueOutboxBulk(mails: OutboxMail[]): Promise<number>;
  listDueOutbox(now: Date, limit: number): Promise<OutboxJob[]>;
  /** Compare-and-swap on `attempts`: false when another delivery got there first. */
  claimOutbox(job: OutboxJob, now: Date): Promise<boolean>;
  finishOutbox(id: string, outcome: 'SENT' | 'SKIPPED', now: Date): Promise<void>;
  releaseOutbox(id: string, reason: string): Promise<void>;
  addNotifications(notifications: NewNotification[]): Promise<void>;
}

export interface OutboxDeps {
  outbox: OutboxStore;
  mailer?: Mailer;
  log: Log;
}

export const OUTBOX_LOCK_MS = 2 * 60 * 1000;
export const OUTBOX_MAX_ATTEMPTS = 6;

export type OutboxOutcome = 'sent' | 'skipped' | 'failed' | 'busy' | 'no_mailer';

/** One delivery attempt for one row. Never throws. */
export async function deliverOutboxJob(job: OutboxJob, deps: OutboxDeps, now: Date): Promise<OutboxOutcome> {
  const { outbox, mailer, log } = deps;
  if (!mailer) return 'no_mailer';
  let claimed = false;
  try {
    claimed = await outbox.claimOutbox(job, now);
    if (!claimed) return 'busy';
    // Our own test addresses and reserved domains are never mailed; a row whose body
    // was already cleared has nothing left to send.
    if (!isSendableEmail(job.to) || job.text === null || job.html === null) {
      await outbox.finishOutbox(job.id, 'SKIPPED', now);
      log('outbox_email_skipped', { emailId: job.id });
      return 'skipped';
    }
    await mailer.send({ to: job.to, subject: job.subject, text: job.text, html: job.html });
    await outbox.finishOutbox(job.id, 'SENT', now);
    log('outbox_email_sent', { emailId: job.id });
    return 'sent';
  } catch (error) {
    const reason = error instanceof Error ? error.name : 'unknown';
    log('outbox_email_failed', { emailId: job.id, error: reason });
    if (claimed) await outbox.releaseOutbox(job.id, reason).catch(() => undefined);
    return 'failed';
  }
}

/**
 * Records the e-mails and tries each one right away. Never throws: what cannot be
 * recorded is logged, and what cannot be sent now is left for the scheduled sweep.
 */
export async function sendThroughOutbox(mails: OutboxMail[], deps: OutboxDeps, now: Date): Promise<number> {
  let recorded = 0;
  for (const mail of mails) {
    try {
      const job = await deps.outbox.enqueueOutbox(mail);
      if (!job) continue;
      recorded += 1;
      await deliverOutboxJob(job, deps, now);
    } catch (error) {
      deps.log('outbox_enqueue_failed', { error: error instanceof Error ? error.message : 'unknown' });
    }
  }
  return recorded;
}

export interface OutboxSweep {
  due: number;
  sent: number;
  skipped: number;
  failed: number;
}

/** What the scheduled job does for the general outbox: deliver what is still owed. */
export async function deliverDueOutbox(deps: OutboxDeps, now: Date, limit = 20): Promise<OutboxSweep> {
  const result: OutboxSweep = { due: 0, sent: 0, skipped: 0, failed: 0 };
  if (!deps.mailer) return result;
  const jobs = await deps.outbox.listDueOutbox(now, limit);
  result.due = jobs.length;
  for (const job of jobs) {
    const outcome = await deliverOutboxJob(job, deps, now);
    if (outcome === 'sent') result.sent += 1;
    else if (outcome === 'skipped') result.skipped += 1;
    else if (outcome === 'failed') result.failed += 1;
  }
  return result;
}

/** In-site notices are a convenience: failing to record one never fails the request. */
export async function notifyUsers(notifications: NewNotification[], deps: OutboxDeps): Promise<void> {
  if (notifications.length === 0) return;
  try {
    await deps.outbox.addNotifications(notifications);
  } catch (error) {
    deps.log('notifications_failed', { error: error instanceof Error ? error.message : 'unknown' });
  }
}
