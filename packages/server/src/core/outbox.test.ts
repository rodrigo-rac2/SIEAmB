import { describe, expect, it } from 'vitest';
import type { Mailer, OutgoingMail } from '../payments/notifications';
import { FakeOutbox } from '../submissions/testing';
import { deliverDueOutbox, deliverOutboxJob, notifyUsers, sendThroughOutbox, type OutboxMail } from './outbox';

const NOW = new Date('2026-12-01T15:00:00Z');
const mail = (over: Partial<OutboxMail> = {}): OutboxMail => ({
  to: 'pessoa@ufcg.edu.br',
  subject: 'Assunto',
  text: 'texto com link',
  html: '<p>texto</p>',
  dedupeKey: 'k1',
  ...over,
});

function setup(options: { fail?: number; noMailer?: boolean } = {}) {
  const outbox = new FakeOutbox();
  const sent: OutgoingMail[] = [];
  const logs: string[] = [];
  let failures = options.fail ?? 0;
  const mailer: Mailer = {
    async send(m) {
      if (failures > 0) {
        failures -= 1;
        throw new Error('smtp down');
      }
      sent.push(m);
    },
  };
  const deps = { outbox, mailer: options.noMailer ? undefined : mailer, log: (event: string) => logs.push(event) };
  return { outbox, sent, logs, deps };
}

describe('outbox', () => {
  it('records and sends right away, then clears the body', async () => {
    const { outbox, sent, deps } = setup();
    expect(await sendThroughOutbox([mail()], deps, NOW)).toBe(1);
    expect(sent).toEqual([{ to: 'pessoa@ufcg.edu.br', subject: 'Assunto', text: 'texto com link', html: '<p>texto</p>' }]);
    expect(outbox.rows[0]).toMatchObject({ status: 'SENT', attempts: 1, text: null, html: null });
  });

  it('never owes the same e-mail twice', async () => {
    const { sent, deps } = setup();
    await sendThroughOutbox([mail(), mail(), mail({ dedupeKey: 'k2' })], deps, NOW);
    expect(await sendThroughOutbox([mail()], deps, NOW)).toBe(0);
    expect(sent).toHaveLength(2);
  });

  it('keeps an e-mail that could not be sent, and the sweep sends it later', async () => {
    const { outbox, sent, deps, logs } = setup({ fail: 1 });
    await sendThroughOutbox([mail()], deps, NOW);
    expect(sent).toEqual([]);
    expect(outbox.rows[0]).toMatchObject({ status: 'PENDING', attempts: 1, lastError: 'Error' });
    expect(outbox.rows[0]!.text).toBe('texto com link');
    expect(logs).toContain('outbox_email_failed');
    expect(await deliverDueOutbox(deps, new Date(NOW.getTime() + 60_000))).toEqual({ due: 1, sent: 1, skipped: 0, failed: 0 });
    expect(sent).toHaveLength(1);
  });

  it('gives up after six attempts', async () => {
    const { outbox, deps } = setup({ fail: 99 });
    await sendThroughOutbox([mail()], deps, NOW);
    for (let i = 1; i <= 10; i += 1) await deliverDueOutbox(deps, new Date(NOW.getTime() + i * 600_000));
    expect(outbox.rows[0]).toMatchObject({ status: 'PENDING', attempts: 6 });
    expect(await deliverDueOutbox(deps, new Date(NOW.getTime() + 99 * 600_000))).toMatchObject({ due: 0 });
  });

  it('does not send while another delivery holds the row', async () => {
    const { outbox, sent, deps } = setup();
    const job = (await outbox.enqueueOutbox(mail()))!;
    expect(await outbox.claimOutbox(job, NOW)).toBe(true);
    expect(await deliverOutboxJob(job, deps, NOW)).toBe('busy');
    expect(sent).toEqual([]);
  });

  it.each(['e2e+teste@sieamb.org', 'alguem@example.com', 'sem-arroba'])('skips %s without mailing it', async (to) => {
    const { outbox, sent, deps } = setup();
    await sendThroughOutbox([mail({ to })], deps, NOW);
    expect(sent).toEqual([]);
    expect(outbox.rows[0]).toMatchObject({ status: 'SKIPPED', text: null });
  });

  it('records but sends nothing without a mailer, and the sweep reports nothing due', async () => {
    const { outbox, deps } = setup({ noMailer: true });
    expect(await sendThroughOutbox([mail()], deps, NOW)).toBe(1);
    expect(outbox.rows[0]).toMatchObject({ status: 'PENDING', attempts: 0 });
    expect(await deliverDueOutbox(deps, NOW)).toEqual({ due: 0, sent: 0, skipped: 0, failed: 0 });
  });

  it('never throws when a notice cannot be recorded', async () => {
    const { outbox, deps, logs } = setup();
    outbox.failNotifications = true;
    await expect(notifyUsers([{ userId: 'u', eventId: null, kind: 'x', data: {} }], deps)).resolves.toBeUndefined();
    expect(logs).toContain('notifications_failed');
    outbox.failNotifications = false;
    await notifyUsers([], deps);
    expect(outbox.notifications).toEqual([]);
  });
});
