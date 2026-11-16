import { describe, expect, it, vi } from 'vitest';
import {
  createPaymentNotifier,
  deliverDueEmails,
  deliverEmail,
  emailKindFor,
  firstName,
  formatAmount,
  handleEmailSweep,
  isSendableEmail,
  stillApplies,
  type Mailer,
  type OutgoingMail,
} from './notifications';
import type { PaymentStatus } from './status';
import { FakeStore, NOW } from './testing';

const SITE = 'https://sieamb.org';

function setup(options: { mailer?: boolean; failSends?: number } = {}) {
  const store = new FakeStore();
  const sent: OutgoingMail[] = [];
  let failures = options.failSends ?? 0;
  const mailer: Mailer = {
    send: vi.fn(async (mail: OutgoingMail) => {
      if (failures > 0) {
        failures -= 1;
        throw new Error('smtp down');
      }
      sent.push(mail);
    }),
  };
  const log = vi.fn();
  const deps = { store, mailer: options.mailer === false ? undefined : mailer, siteUrl: SITE, log };
  const notify = createPaymentNotifier(deps, () => NOW);
  return { store, sent, mailer, log, deps, notify };
}

describe('emailKindFor', () => {
  const cases: [PaymentStatus, PaymentStatus, string | null][] = [
    ['CREATED', 'PENDING', 'PROCESSING'],
    ['CREATED', 'APPROVED', 'CONFIRMED'],
    ['PENDING', 'APPROVED', 'CONFIRMED'],
    ['CREATED', 'REJECTED', 'FAILED'],
    ['PENDING', 'REJECTED', 'FAILED'],
    ['PENDING', 'CANCELLED', 'FAILED'],
    // An order nobody tried to pay expiring is not news to the person.
    ['CREATED', 'CANCELLED', null],
    ['REJECTED', 'CANCELLED', null],
    // The same status recorded again (notification and return page) owes nothing new.
    ['PENDING', 'PENDING', null],
    ['APPROVED', 'APPROVED', null],
    ['CREATED', 'CREATED', null],
    // No refund e-mail yet.
    ['APPROVED', 'REFUNDED', null],
  ];
  it.each(cases)('%s → %s owes %s', (previous, next, kind) => {
    expect(emailKindFor(previous, next)).toBe(kind);
  });
});

describe('stillApplies', () => {
  it('a late "processing" is not sent once the payment was paid or refused', () => {
    expect(stillApplies('PROCESSING', 'PENDING')).toBe(true);
    expect(stillApplies('PROCESSING', 'APPROVED')).toBe(false);
    expect(stillApplies('PROCESSING', 'REJECTED')).toBe(false);
  });
  it('"confirmed" needs an approved payment, "failed" a refused or cancelled one', () => {
    expect(stillApplies('CONFIRMED', 'APPROVED')).toBe(true);
    expect(stillApplies('CONFIRMED', 'REFUNDED')).toBe(false);
    expect(stillApplies('FAILED', 'REJECTED')).toBe(true);
    expect(stillApplies('FAILED', 'CANCELLED')).toBe(true);
    expect(stillApplies('FAILED', 'APPROVED')).toBe(false);
  });
});

describe('small helpers', () => {
  it.each([
    ['pessoa@example.com', true],
    ['a.b+c@sub.example.org', true],
    ['', false],
    ['sem-arroba', false],
    ['a@b', false],
    ['a b@example.com', false],
    ['a@example.com\r\nBcc: x@evil.test', false],
    ['a@example.com, b@example.com', false],
    ['<a@example.com>', false],
    [`${'a'.repeat(200)}@example.com`, false],
    [null, false],
  ])('isSendableEmail(%j) is %s', (value, expected) => {
    expect(isSendableEmail(value)).toBe(expected);
  });

  it('uses the first name and drops line breaks', () => {
    expect(firstName('Maria Clara de Souza')).toBe('Maria');
    expect(firstName('  José  ')).toBe('José');
    expect(firstName('Ana\r\nBcc: x')).toBe('Ana');
    expect(firstName('')).toBe('');
    expect(firstName('x'.repeat(200))).toHaveLength(60);
  });

  it('formats reais for the language of the e-mail', () => {
    expect(formatAmount(7000, 'pt-BR').replace(/\s/g, ' ')).toBe('R$ 70,00');
    expect(formatAmount(3050, 'en')).toBe('R$30.50');
    expect(formatAmount(5000, 'fr').replace(/\s/g, ' ')).toBe('R$ 50,00');
  });
});

describe('createPaymentNotifier', () => {
  it('sends "processing" when a payment becomes pending, with the link to follow it', async () => {
    const { store, sent, notify } = setup();
    const payment = store.seed({ status: 'PENDING', amountCents: 7000 });
    await notify(payment, 'CREATED');
    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toBe('pessoa@example.com');
    expect(sent[0]!.subject).toBe('Inscrição recebida: estamos processando seu pagamento (II SIEAmB)');
    expect(sent[0]!.text).toContain('Olá, Maria.');
    expect(sent[0]!.text).toContain(`${SITE}/2027/inscricoes/pagamento?p=${payment.id}`);
    expect(store.emails[0]).toMatchObject({ kind: 'PROCESSING', status: 'SENT', attempts: 1 });
  });

  it('sends "confirmed" on approval and "failed" with the pay link on refusal', async () => {
    const { store, sent, notify } = setup();
    const paid = store.seed({ status: 'APPROVED' });
    await notify(paid, 'PENDING');
    const refused = store.seed({ status: 'REJECTED' });
    await notify(refused, 'CREATED');
    expect(sent.map((m) => m.subject)).toEqual([
      'Inscrição concluída: pagamento confirmado (II SIEAmB)',
      'Pagamento não aprovado (II SIEAmB)',
    ]);
    expect(sent[1]!.text).toContain(`${SITE}/2027/inscricoes/pagar?t=${store.contact!.payToken}`);
  });

  it('the notification and the return page recording the same change send one e-mail', async () => {
    const { store, sent, notify } = setup();
    const payment = store.seed({ status: 'APPROVED' });
    await Promise.all([notify(payment, 'PENDING'), notify(payment, 'CREATED')]);
    await notify(payment, 'PENDING');
    expect(sent).toHaveLength(1);
    expect(store.emails).toHaveLength(1);
  });

  it('writes in the language the person used on the form', async () => {
    const { store, sent, notify } = setup();
    store.contact!.locale = 'en';
    await notify(store.seed({ status: 'APPROVED' }), 'CREATED');
    expect(sent[0]!.subject).toBe('Registration complete: payment confirmed (II SIEAmB)');
  });

  it('sends nothing for a change that owes no e-mail', async () => {
    const { store, sent, notify } = setup();
    await notify(store.seed({ status: 'CANCELLED' }), 'CREATED');
    await notify(store.seed({ status: 'PENDING' }), 'PENDING');
    expect(sent).toHaveLength(0);
    expect(store.emails).toHaveLength(0);
  });

  it('keeps the e-mail owed when the mail server fails, and never throws', async () => {
    const { store, sent, notify, log } = setup({ failSends: 1 });
    await expect(notify(store.seed({ status: 'APPROVED' }), 'PENDING')).resolves.toBeUndefined();
    expect(sent).toHaveLength(0);
    expect(store.emails[0]).toMatchObject({ status: 'PENDING', attempts: 1, lockedUntil: null, lastError: 'Error' });
    expect(log).toHaveBeenCalledWith('payment_email_failed', expect.objectContaining({ kind: 'CONFIRMED' }));
  });

  it('records the e-mail without sending while no sender is configured', async () => {
    const { store, mailer, notify } = setup({ mailer: false });
    await notify(store.seed({ status: 'APPROVED' }), 'PENDING');
    expect(mailer.send).not.toHaveBeenCalled();
    expect(store.emails[0]).toMatchObject({ kind: 'CONFIRMED', status: 'PENDING', attempts: 0 });
  });

  it('a store failure while recording the e-mail does not reach the caller', async () => {
    const { store, notify, log } = setup();
    store.failNextEnqueue = true;
    await expect(notify(store.seed({ status: 'APPROVED' }), 'PENDING')).resolves.toBeUndefined();
    expect(log).toHaveBeenCalledWith('payment_email_enqueue_failed', expect.objectContaining({ kind: 'CONFIRMED' }));
  });

  it.each([
    ['an address with a line break', 'a@example.com\r\nBcc: x@evil.test'],
    ['an empty address', ''],
  ])('skips %s instead of handing it to the mail server', async (_name, email) => {
    const { store, mailer, notify } = setup();
    store.contact!.email = email;
    await notify(store.seed({ status: 'APPROVED' }), 'PENDING');
    expect(mailer.send).not.toHaveBeenCalled();
    expect(store.emails[0]!.status).toBe('SKIPPED');
  });

  it('skips when the registration can no longer be found', async () => {
    const { store, mailer, notify } = setup();
    store.contact = null;
    await notify(store.seed({ status: 'APPROVED' }), 'PENDING');
    expect(mailer.send).not.toHaveBeenCalled();
    expect(store.emails[0]!.status).toBe('SKIPPED');
  });

  it('never logs the address, the name or the pay token', async () => {
    const { store, notify, log } = setup({ failSends: 1 });
    await notify(store.seed({ status: 'APPROVED' }), 'PENDING');
    await notify(store.seed({ status: 'PENDING' }), 'CREATED');
    const logged = JSON.stringify(log.mock.calls);
    expect(logged).not.toContain('pessoa@example.com');
    expect(logged).not.toContain('Maria');
    expect(logged).not.toContain(store.contact!.payToken);
  });
});

describe('deliverDueEmails (the scheduled sweep)', () => {
  it('sends what failed before, once', async () => {
    const { store, sent, notify, deps } = setup({ failSends: 1 });
    await notify(store.seed({ status: 'APPROVED' }), 'PENDING');
    expect(sent).toHaveLength(0);
    expect(await deliverDueEmails(deps, NOW)).toEqual({ due: 1, sent: 1, skipped: 0, failed: 0 });
    expect(await deliverDueEmails(deps, NOW)).toEqual({ due: 0, sent: 0, skipped: 0, failed: 0 });
    expect(sent).toHaveLength(1);
  });

  it('sends what was recorded while no sender was configured', async () => {
    const without = setup({ mailer: false });
    await without.notify(without.store.seed({ status: 'APPROVED' }), 'PENDING');
    const sent: OutgoingMail[] = [];
    const mailer: Mailer = { send: async (mail) => void sent.push(mail) };
    const result = await deliverDueEmails({ ...without.deps, mailer }, NOW);
    expect(result.sent).toBe(1);
    expect(sent[0]!.subject).toContain('pagamento confirmado');
  });

  it('drops a "processing" e-mail that became untrue while it waited', async () => {
    const { store, sent, notify, deps } = setup({ failSends: 1 });
    const payment = store.seed({ status: 'PENDING' });
    await notify(payment, 'CREATED');
    store.payments[0]!.status = 'APPROVED';
    expect(await deliverDueEmails(deps, NOW)).toEqual({ due: 1, sent: 0, skipped: 1, failed: 0 });
    expect(sent).toHaveLength(0);
    expect(store.emails[0]!.status).toBe('SKIPPED');
  });

  it('leaves alone an e-mail another request is sending right now', async () => {
    const { store, deps, mailer } = setup();
    const payment = store.seed({ status: 'APPROVED' });
    const job = (await store.enqueueEmail(payment.id, 'CONFIRMED'))!;
    await store.claimEmail(job, NOW);
    expect(await deliverDueEmails(deps, NOW)).toEqual({ due: 0, sent: 0, skipped: 0, failed: 0 });
    // The stale copy of the row cannot be used for a second delivery either.
    expect(await deliverEmail(job, deps, NOW)).toBe('busy');
    expect(mailer.send).not.toHaveBeenCalled();
  });

  it('picks an abandoned attempt up again after the lock expires', async () => {
    const { store, deps, sent } = setup();
    const payment = store.seed({ status: 'APPROVED' });
    const job = (await store.enqueueEmail(payment.id, 'CONFIRMED'))!;
    await store.claimEmail(job, NOW);
    const later = new Date(NOW.getTime() + 3 * 60 * 1000);
    expect((await deliverDueEmails(deps, later)).sent).toBe(1);
    expect(sent).toHaveLength(1);
    expect(store.emails[0]!.attempts).toBe(2);
  });

  it('stops retrying after six failed attempts', async () => {
    const { store, deps, notify, mailer } = setup({ failSends: 99 });
    await notify(store.seed({ status: 'APPROVED' }), 'PENDING');
    for (let i = 0; i < 10; i += 1) await deliverDueEmails(deps, NOW);
    expect(store.emails[0]).toMatchObject({ status: 'PENDING', attempts: 6 });
    expect(mailer.send).toHaveBeenCalledTimes(6);
  });

  it('does nothing without a sender', async () => {
    const { store, deps, notify } = setup({ mailer: false });
    await notify(store.seed({ status: 'APPROVED' }), 'PENDING');
    expect(await deliverDueEmails(deps, NOW)).toEqual({ due: 0, sent: 0, skipped: 0, failed: 0 });
  });
});

describe('handleEmailSweep', () => {
  const call = (headers: Record<string, string> = {}, method = 'POST') =>
    new Request('https://sieamb.org/api/v1/payments/emails/deliver', { method, headers });
  const env = { cronSecret: 'sweep-secret-123', now: NOW };

  it('refuses anything but POST', async () => {
    const { deps } = setup();
    expect((await handleEmailSweep(call({}, 'GET'), env, deps)).status).toBe(405);
  });

  it.each([
    ['no header', {}],
    ['a wrong secret', { authorization: 'Bearer wrong-secret-1234' }],
    ['a prefix of the secret', { authorization: 'Bearer sweep-secret' }],
    ['the secret without Bearer', { authorization: 'sweep-secret-123' }],
    ['an empty bearer', { authorization: 'Bearer ' }],
  ])('answers 401 to %s and sends nothing', async (_name, headers) => {
    const { store, deps, notify, sent } = setup({ failSends: 1 });
    await notify(store.seed({ status: 'APPROVED' }), 'PENDING');
    const response = await handleEmailSweep(call(headers), env, deps);
    expect(response.status).toBe(401);
    expect(sent).toHaveLength(0);
  });

  it('is closed while the secret is not configured, even to an empty bearer', async () => {
    const { deps } = setup();
    const response = await handleEmailSweep(call({ authorization: 'Bearer ' }), { now: NOW }, deps);
    expect(response.status).toBe(503);
  });

  it('answers 503 without a sender', async () => {
    const { deps } = setup({ mailer: false });
    const response = await handleEmailSweep(call({ authorization: 'Bearer sweep-secret-123' }), env, deps);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'mailer_not_configured' });
  });

  it('delivers and answers with counts only', async () => {
    const { store, deps, notify } = setup({ failSends: 1 });
    await notify(store.seed({ status: 'APPROVED' }), 'PENDING');
    const response = await handleEmailSweep(call({ authorization: 'Bearer sweep-secret-123' }), env, deps);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ due: 1, sent: 1, skipped: 0, failed: 0 });
  });
});
