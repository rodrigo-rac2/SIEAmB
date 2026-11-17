import {
  OUTBOX_LOCK_MS,
  OUTBOX_MAX_ATTEMPTS,
  type NewNotification,
  type OutboxJob,
  type OutboxMail,
  type OutboxStore,
} from './outbox';
import { RestError, UNIQUE_VIOLATION, q, type RestClient } from './rest';

interface Row {
  id: string;
  to_email: string;
  subject: string;
  body_text: string | null;
  body_html: string | null;
  attempts: number;
}

const COLUMNS = 'id,to_email,subject,body_text,body_html,attempts';

const toJob = (row: Row): OutboxJob => ({
  id: row.id,
  to: row.to_email,
  subject: row.subject,
  text: row.body_text,
  html: row.body_html,
  attempts: row.attempts,
});

export class SupabaseOutbox implements OutboxStore {
  constructor(private readonly rest: RestClient) {}

  async enqueueOutbox(mail: OutboxMail): Promise<OutboxJob | null> {
    try {
      const rows = await this.rest.request<Row[]>(`outbox_emails?select=${COLUMNS}`, {
        method: 'POST',
        body: JSON.stringify({
          to_email: mail.to,
          subject: mail.subject,
          body_text: mail.text,
          body_html: mail.html,
          dedupe_key: mail.dedupeKey,
        }),
      });
      return rows[0] ? toJob(rows[0]) : null;
    } catch (error) {
      if (error instanceof RestError && error.code === UNIQUE_VIOLATION) return null;
      throw error;
    }
  }

  async listDueOutbox(now: Date, limit: number): Promise<OutboxJob[]> {
    const iso = q(now.toISOString());
    const rows = await this.rest.request<Row[]>(
      `outbox_emails?status=eq.PENDING&attempts=lt.${OUTBOX_MAX_ATTEMPTS}&or=(locked_until.is.null,locked_until.lt.${iso})&select=${COLUMNS}&order=created_at.asc&limit=${limit}`,
    );
    return rows.map(toJob);
  }

  async claimOutbox(job: OutboxJob, now: Date): Promise<boolean> {
    const iso = q(now.toISOString());
    const rows = await this.rest.request<{ id: string }[]>(
      `outbox_emails?id=eq.${q(job.id)}&status=eq.PENDING&attempts=eq.${job.attempts}&or=(locked_until.is.null,locked_until.lt.${iso})&select=id`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          attempts: job.attempts + 1,
          locked_until: new Date(now.getTime() + OUTBOX_LOCK_MS).toISOString(),
        }),
      },
    );
    return rows.length === 1;
  }

  async finishOutbox(id: string, outcome: 'SENT' | 'SKIPPED', now: Date): Promise<void> {
    await this.rest.request<unknown[]>(`outbox_emails?id=eq.${q(id)}&select=id`, {
      method: 'PATCH',
      body: JSON.stringify({
        status: outcome,
        sent_at: outcome === 'SENT' ? now.toISOString() : null,
        locked_until: null,
        last_error: null,
        // Nothing to resend, and the text may carry a link or a name: do not keep it.
        body_text: null,
        body_html: null,
      }),
    });
  }

  async releaseOutbox(id: string, reason: string): Promise<void> {
    await this.rest.request<unknown[]>(`outbox_emails?id=eq.${q(id)}&select=id`, {
      method: 'PATCH',
      body: JSON.stringify({ locked_until: null, last_error: reason.slice(0, 100) }),
    });
  }

  async addNotifications(notifications: NewNotification[]): Promise<void> {
    if (notifications.length === 0) return;
    await this.rest.request<unknown[]>('notifications?select=id', {
      method: 'POST',
      body: JSON.stringify(
        notifications.map((n) => ({
          user_id: n.userId,
          event_id: n.eventId,
          kind: n.kind,
          data: n.data,
        })),
      ),
    });
  }
}
