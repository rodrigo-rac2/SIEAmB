import { describe, expect, it, vi } from 'vitest';
import {
  createPaymentNotifier,
  deliverDueEmails,
  deliverEmail,
  emailKindFor,
  enqueueMissingReceived,
  enqueueReminders,
  deadlineOfKey,
  deadlineReminderDue,
  brDate,
  formatDate,
  handleRegistrationReceived,
  receivedApplies,
  refreshOpenPayments,
  reminderDue,
  reminderState,
  withinSendingHours,
  firstName,
  formatAmount,
  handleEmailSweep,
  isSendableEmail,
  stillApplies,
  type Mailer,
  type OutgoingMail,
} from './notifications';
import type { PaymentStatus } from './status';
import type { ReminderCandidate } from './store';
import { FakeStore, NOW, ORDER_ID, PAY_TOKEN, REGISTRATION, TOKEN, answer, mercadoPago, order } from './testing';

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
    // Refused after a review, order open for another try (#188).
    ['PENDING', 'CREATED', 'FAILED'],
    // An order nobody tried to pay expiring is not news to the person.
    ['CREATED', 'CANCELLED', null],
    ['REJECTED', 'CANCELLED', null],
    // The same status recorded again (notification and return page) owes nothing new.
    ['PENDING', 'PENDING', null],
    ['APPROVED', 'APPROVED', null],
    ['CREATED', 'CREATED', null],
    ['REJECTED', 'CREATED', null],
    // No refund e-mail yet.
    ['APPROVED', 'REFUNDED', null],
  ];
  it.each(cases)('%s → %s owes %s', (previous, next, kind) => {
    expect(emailKindFor(previous, next)).toBe(kind);
  });

  it('a card refused on the spot owes "not approved" although our status does not change (#195)', () => {
    expect(emailKindFor('CREATED', 'CREATED', { previous: 'created', next: 'waiting_retry' })).toBe('FAILED');
    expect(emailKindFor('CREATED', 'CREATED', { previous: null, next: 'waiting_retry' })).toBe('FAILED');
    expect(emailKindFor('PENDING', 'CREATED', { previous: 'pending_review_manual', next: 'waiting_retry' })).toBe('FAILED');
  });
  it('the same refusal seen again owes nothing', () => {
    expect(emailKindFor('CREATED', 'CREATED', { previous: 'waiting_retry', next: 'waiting_retry' })).toBeNull();
    expect(emailKindFor('CREATED', 'CREATED', { previous: 'created', next: 'created' })).toBeNull();
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
    expect(stillApplies('FAILED', 'CREATED')).toBe(true);
    expect(stillApplies('FAILED', 'APPROVED')).toBe(false);
  });
});

describe('small helpers', () => {
  it.each([
    ['pessoa@ufcg.edu.br', true],
    ['a.b+c@sub.gmail.com', true],
    // Never mailed: our own test registrations and domains reserved for examples.
    ['e2e+1794846696000@sieamb.org', false],
    ['pessoa@example.com', false],
    ['a@sub.example.org', false],
    ['a@host.test', false],
    ['a@x.invalid', false],
    ['contato@sieamb.org', true],
    ['', false],
    ['sem-arroba', false],
    ['a@b', false],
    ['a b@gmail.com', false],
    ['a@gmail.com\r\nBcc: x@evil.org', false],
    ['a@gmail.com, b@gmail.com', false],
    ['<a@gmail.com>', false],
    [`${'a'.repeat(200)}@gmail.com`, false],
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
    expect(sent[0]!.to).toBe('pessoa@ufcg.edu.br');
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
    ['an address with a line break', 'a@gmail.com\r\nBcc: x@evil.org'],
    ['one of our own test registrations', 'e2e+123@sieamb.org'],
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
    expect(logged).not.toContain('pessoa@ufcg.edu.br');
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
    const job = (await store.enqueueEmail({ preRegistrationId: payment.preRegistrationId, paymentId: payment.id, kind: 'CONFIRMED', dedupeKey: `${payment.id}:CONFIRMED` }))!;
    await store.claimEmail(job, NOW);
    expect(await deliverDueEmails(deps, NOW)).toEqual({ due: 0, sent: 0, skipped: 0, failed: 0 });
    // The stale copy of the row cannot be used for a second delivery either.
    expect(await deliverEmail(job, deps, NOW)).toBe('busy');
    expect(mailer.send).not.toHaveBeenCalled();
  });

  it('picks an abandoned attempt up again after the lock expires', async () => {
    const { store, deps, sent } = setup();
    const payment = store.seed({ status: 'APPROVED' });
    const job = (await store.enqueueEmail({ preRegistrationId: payment.preRegistrationId, paymentId: payment.id, kind: 'CONFIRMED', dedupeKey: `${payment.id}:CONFIRMED` }))!;
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

  it('without a sender it still answers 200, records nothing sent, and says so', async () => {
    const { store, deps, notify } = setup({ mailer: false });
    await notify(store.seed({ status: 'APPROVED' }), 'PENDING');
    const response = await handleEmailSweep(call({ authorization: 'Bearer sweep-secret-123' }), env, deps);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ mailer: false, sent: 0, due: 0 });
    expect(store.emails[0]!.status).toBe('PENDING');
  });

  it('delivers and answers with counts only', async () => {
    const { store, deps, notify } = setup({ failSends: 1 });
    await notify(store.seed({ status: 'APPROVED' }), 'PENDING');
    const response = await handleEmailSweep(call({ authorization: 'Bearer sweep-secret-123' }), env, deps);
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toEqual({
      refreshed: 0,
      received: 0,
      reminders: 0,
      due: 1,
      sent: 1,
      skipped: 0,
      failed: 0,
      mailer: true,
      errors: [],
    });
    expect(JSON.stringify(body)).not.toMatch(/ufcg|Maria/);
  });
});

// ───────────────────────────── Reminders and the background job (#187) ─────────────────────────────

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();

describe('reminderState', () => {
  const p = (status: PaymentStatus, mpStatus: string | null = null, id = 'p1') => ({ id, status, mpStatus });
  it('someone who never started a payment, or whose attempts all ended, is unpaid', () => {
    expect(reminderState([])).toEqual({ variant: 'unpaid' });
    expect(reminderState([p('CREATED', 'created')])).toEqual({ variant: 'unpaid' });
    expect(reminderState([p('REJECTED'), p('CANCELLED')])).toEqual({ variant: 'unpaid' });
  });
  it('a boleto waiting for the person is pending, pointing at that payment', () => {
    expect(reminderState([p('CANCELLED'), p('PENDING', 'action_required', 'p2')])).toEqual({
      variant: 'pending',
      paymentId: 'p2',
    });
  });
  it.each(['in_review', 'processing', null])(
    'nothing to remind while Mercado Pago holds the payment (%s): the person cannot act',
    (mpStatus) => {
      expect(reminderState([p('PENDING', mpStatus)])).toBeNull();
    },
  );
  it('nothing to remind once paid, even with older failed attempts, or after a refund', () => {
    expect(reminderState([p('REJECTED'), p('APPROVED')])).toBeNull();
    expect(reminderState([p('REFUNDED')])).toBeNull();
    expect(reminderState([p('PENDING', 'action_required'), p('APPROVED')])).toBeNull();
  });
});

describe('reminderDue', () => {
  const candidate = (over: Partial<ReminderCandidate> = {}): ReminderCandidate => ({
    preRegistrationId: REGISTRATION.id,
    registeredAt: ago(2 * DAY),
    eventSlug: '2027',
    category: 'ESTUDANTE_POS',
    modality: 'ONLINE',
    payments: [],
    emails: [],
    ...over,
  });
  const reminder = (ms: number) => ({ kind: 'REMINDER' as const, dedupeKey: 'reminder:r:n', createdAt: ago(ms) });

  it('the first is due a day after registering, not before', () => {
    expect(reminderDue(candidate({ registeredAt: ago(DAY) }), NOW)).toBe(1);
    expect(reminderDue(candidate({ registeredAt: ago(DAY - 1000) }), NOW)).toBeNull();
  });
  it('the second is due two days after the first, which is day 3', () => {
    expect(reminderDue(candidate({ emails: [reminder(2 * DAY)] }), NOW)).toBe(2);
    expect(reminderDue(candidate({ emails: [reminder(2 * DAY - 1000)] }), NOW)).toBeNull();
  });
  it('never a third counted from the registration', () => {
    const emails = [reminder(30 * DAY), reminder(20 * DAY)];
    expect(reminderDue(candidate({ registeredAt: ago(40 * DAY), emails }), NOW)).toBeNull();
  });
  it('a date reminder already sent does not use up the two', () => {
    const dated = { kind: 'REMINDER' as const, dedupeKey: 'deadline:r:2027-01-01:7', createdAt: ago(3 * DAY) };
    expect(reminderDue(candidate({ registeredAt: ago(10 * DAY), emails: [dated] }), NOW)).toBe(1);
  });
  it('someone who registered weeks ago gets one reminder now, not two at once', () => {
    const old = candidate({ registeredAt: ago(20 * DAY) });
    expect(reminderDue(old, NOW)).toBe(1);
    expect(reminderDue({ ...old, emails: [reminder(1000)] }, NOW)).toBeNull();
  });
  it('waits 20 hours after any other e-mail to the same person', () => {
    const recent = [{ kind: 'FAILED' as const, dedupeKey: 'p:FAILED', createdAt: ago(19 * HOUR) }];
    expect(reminderDue(candidate({ payments: [{ id: 'p', status: 'REJECTED', mpStatus: 'failed' }], emails: recent }), NOW)).toBeNull();
    const older = [{ kind: 'FAILED' as const, dedupeKey: 'p:FAILED', createdAt: ago(21 * HOUR) }];
    expect(reminderDue(candidate({ payments: [{ id: 'p', status: 'REJECTED', mpStatus: 'failed' }], emails: older }), NOW)).toBe(1);
  });
  it('nothing for someone who paid, or whose card is under review', () => {
    expect(reminderDue(candidate({ payments: [{ id: 'p', status: 'APPROVED', mpStatus: 'processed' }] }), NOW)).toBeNull();
    expect(reminderDue(candidate({ payments: [{ id: 'p', status: 'PENDING', mpStatus: 'in_review' }] }), NOW)).toBeNull();
  });
  it('a broken date never produces a reminder', () => {
    expect(reminderDue(candidate({ registeredAt: 'not a date' }), NOW)).toBeNull();
  });
});

describe('withinSendingHours', () => {
  it.each([
    ['2026-11-16T10:59:00Z', false], // 07:59 in Brazil
    ['2026-11-16T11:00:00Z', true], // 08:00
    ['2026-11-16T22:59:00Z', true], // 19:59
    ['2026-11-16T23:00:00Z', false], // 20:00
    ['2026-11-16T02:30:00Z', false], // 23:30 the day before
    ['2026-11-16T06:00:00Z', false], // 03:00
  ])('%s → %s', (iso, expected) => {
    expect(withinSendingHours(new Date(iso))).toBe(expected);
  });
});

describe('enqueueReminders and their delivery', () => {
  it('reminds someone who registered and never paid, with the link to pay and no amount', async () => {
    const { store, deps, sent } = setup();
    store.registeredAt = ago(2 * DAY);
    expect(await enqueueReminders(deps, NOW)).toBe(1);
    expect(await enqueueReminders(deps, NOW)).toBe(0);
    await deliverDueEmails(deps, NOW);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.subject).toBe('Sua inscrição no II SIEAmB aguarda o pagamento');
    expect(sent[0]!.text).toContain(`${SITE}/2027/inscricoes/pagar?t=${store.contact!.payToken}`);
    expect(sent[0]!.text).not.toMatch(/R\$|undefined/);
    expect(store.emails[0]).toMatchObject({ kind: 'REMINDER', paymentId: null, status: 'SENT' });
  });

  it('reminds about a boleto that is still waiting, with the amount and the link to follow it', async () => {
    const { store, deps, sent } = setup();
    store.registeredAt = ago(3 * DAY);
    const boleto = store.seed({ status: 'PENDING', mpStatus: 'action_required', amountCents: 5000 });
    await enqueueReminders(deps, NOW);
    await deliverDueEmails(deps, NOW);
    expect(sent[0]!.subject).toBe('Seu pagamento no II SIEAmB ainda está pendente');
    expect(sent[0]!.text.replace(/\s/g, ' ')).toContain('R$ 50,00');
    expect(sent[0]!.text).toContain(`${SITE}/2027/inscricoes/pagamento?p=${boleto.id}`);
  });

  it('records nothing for someone who registered less than a day ago', async () => {
    const { store, deps } = setup();
    store.registeredAt = ago(23 * HOUR);
    expect(await enqueueReminders(deps, NOW)).toBe(0);
    expect(store.emails).toHaveLength(0);
  });

  it('drops a reminder if the person paid between recording and sending', async () => {
    const { store, deps, sent } = setup({ failSends: 1 });
    store.registeredAt = ago(2 * DAY);
    await enqueueReminders(deps, NOW);
    await deliverDueEmails(deps, NOW); // mail server down: stays owed
    store.seed({ status: 'APPROVED' });
    expect(await deliverDueEmails(deps, NOW)).toMatchObject({ sent: 0, skipped: 1 });
    expect(sent).toHaveLength(0);
  });

  it('sends two reminders, on day 1 and day 3, and then stops', async () => {
    const { store, deps, sent } = setup();
    // A second past the first day, so the first run already finds it.
    store.registeredAt = ago(DAY + 1000);
    for (let day = 0; day <= 30; day += 1) {
      const now = new Date(NOW.getTime() + day * DAY);
      store.clock = now;
      await enqueueReminders(deps, now);
      await deliverDueEmails(deps, now);
    }
    expect(sent).toHaveLength(2);
    const days = store.emails.map((e) => Math.round((Date.parse(e.createdAt) - NOW.getTime()) / DAY));
    expect(days).toEqual([0, 2]);
  });
});

describe('refreshOpenPayments (a notification that never arrived)', () => {
  function refreshSetup(...responses: Response[]) {
    const base = setup();
    const fetchMock = mercadoPago(...responses);
    const refresh = {
      store: base.store,
      fetch: fetchMock as unknown as typeof fetch,
      accessToken: TOKEN,
      notify: base.notify,
      log: base.log,
    };
    return { ...base, fetchMock, refresh };
  }
  const later = new Date(NOW.getTime() + HOUR);

  it('records the approval from Mercado Pago and e-mails the person', async () => {
    const { store, sent, refresh } = refreshSetup();
    store.seed({ status: 'PENDING', mpStatus: 'action_required', mpOrderId: ORDER_ID });
    expect(await refreshOpenPayments(refresh, later)).toBe(1);
    expect(store.payments[0]!.status).toBe('APPROVED');
    expect(sent.map((m) => m.subject)).toEqual(['Inscrição concluída: pagamento confirmado (II SIEAmB)']);
  });

  it('leaves alone a payment that was looked at in the last 15 minutes', async () => {
    const { store, fetchMock, refresh } = refreshSetup();
    store.seed({ status: 'PENDING', mpOrderId: ORDER_ID });
    expect(await refreshOpenPayments(refresh, new Date(NOW.getTime() + 14 * 60 * 1000))).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('skips payments that are closed or have no order yet', async () => {
    const { store, fetchMock, refresh } = refreshSetup();
    store.seed({ status: 'APPROVED', mpOrderId: ORDER_ID });
    store.seed({ status: 'CREATED', mpOrderId: null });
    expect(await refreshOpenPayments(refresh, later)).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('counts nothing and e-mails nothing when the status is the same', async () => {
    const { store, sent, refresh } = refreshSetup(
      answer(order({ status: 'action_required', status_detail: 'waiting_payment' })),
    );
    store.seed({ status: 'PENDING', mpStatus: 'action_required', mpOrderId: ORDER_ID });
    expect(await refreshOpenPayments(refresh, later)).toBe(0);
    expect(sent).toHaveLength(0);
  });

  it('one payment failing at Mercado Pago does not stop the next', async () => {
    const { store, refresh, log } = refreshSetup(new Response('{}', { status: 500 }), answer(order()));
    store.seed({ status: 'PENDING', mpOrderId: 'ORDTST01AAAAAAAAAAAAAAAAAAAAAAAAAA' });
    store.seed({ status: 'PENDING', mpOrderId: ORDER_ID });
    expect(await refreshOpenPayments(refresh, later)).toBe(1);
    expect(log).toHaveBeenCalledWith('payment_refresh_failed', expect.any(Object));
    expect(store.payments.map((p) => p.status)).toEqual(['PENDING', 'APPROVED']);
  });
});

describe('handleEmailSweep as the background job', () => {
  const call = () =>
    new Request('https://sieamb.org/api/v1/payments/emails/deliver', {
      method: 'POST',
      headers: { authorization: 'Bearer sweep-secret-123' },
    });
  // 12:00 in Brazil: inside sending hours.
  const NOON = new Date('2026-11-20T15:00:00Z');
  const NIGHT = new Date('2026-11-20T05:00:00Z');
  const env = (over: object = {}) => ({ cronSecret: 'sweep-secret-123', accessToken: TOKEN, now: NOON, ...over });

  function jobSetup(...responses: Response[]) {
    const base = setup();
    base.store.clock = NOON;
    base.store.registeredAt = new Date(NOON.getTime() - 3 * DAY).toISOString();
    const fetchMock = mercadoPago(...responses);
    return { ...base, fetchMock, deps: { ...base.deps, fetch: fetchMock as unknown as typeof fetch, notify: base.notify } };
  }

  it('re-checks an open payment, e-mails the approval, and sends no reminder to someone who just paid', async () => {
    const { store, deps, sent } = jobSetup();
    store.seed({ status: 'PENDING', mpStatus: 'action_required', mpOrderId: ORDER_ID, createdAt: new Date(NOON.getTime() - DAY).toISOString() });
    const response = await handleEmailSweep(call(), env({ remindersEnabled: true }), deps);
    expect(await response.json()).toMatchObject({ refreshed: 1, reminders: 0, errors: [] });
    expect(sent.map((m) => m.subject)).toEqual(['Inscrição concluída: pagamento confirmado (II SIEAmB)']);
  });

  it('sends no reminder unless reminders are turned on', async () => {
    const { store, deps, sent } = jobSetup();
    const response = await handleEmailSweep(call(), env(), deps);
    expect(await response.json()).toMatchObject({ reminders: 0, sent: 0 });
    expect(sent).toHaveLength(0);
    expect(store.emails).toHaveLength(0);
  });

  it('with reminders on, reminds the unpaid registration during the day', async () => {
    const { deps, sent } = jobSetup();
    const response = await handleEmailSweep(call(), env({ remindersEnabled: true }), deps);
    expect(await response.json()).toMatchObject({ reminders: 1, sent: 1 });
    expect(sent[0]!.subject).toBe('Sua inscrição no II SIEAmB aguarda o pagamento');
  });

  it('records no reminder at night, but still re-checks payments', async () => {
    const { store, deps, sent } = jobSetup();
    store.clock = NIGHT;
    store.seed({ status: 'PENDING', mpOrderId: ORDER_ID, createdAt: new Date(NIGHT.getTime() - DAY).toISOString() });
    const response = await handleEmailSweep(call(), env({ remindersEnabled: true, now: NIGHT }), deps);
    expect(await response.json()).toMatchObject({ refreshed: 1, reminders: 0 });
    expect(sent.map((m) => m.subject)).toEqual(['Inscrição concluída: pagamento confirmado (II SIEAmB)']);
  });

  it('does not call Mercado Pago without its token, and still sends what is owed', async () => {
    const { store, deps, fetchMock, notify, sent } = jobSetup();
    store.seed({ status: 'PENDING', mpOrderId: ORDER_ID, createdAt: new Date(NOON.getTime() - DAY).toISOString() });
    await notify(store.seed({ status: 'REJECTED' }), 'CREATED');
    sent.length = 0;
    store.emails[0]!.status = 'PENDING';
    store.emails[0]!.attempts = 0;
    const response = await handleEmailSweep(call(), env({ accessToken: undefined }), deps);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await response.json()).toMatchObject({ refreshed: 0, sent: 1 });
  });

  it('answers 502 naming the step that broke, after running the others', async () => {
    const { store, deps, sent, notify } = jobSetup();
    await notify(store.seed({ status: 'REJECTED' }), 'CREATED');
    sent.length = 0;
    store.emails[0]!.status = 'PENDING';
    store.emails[0]!.attempts = 0;
    store.listOpenPayments = async () => {
      throw new Error('db down');
    };
    const response = await handleEmailSweep(call(), env(), deps);
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ errors: ['refresh'], sent: 1 });
  });
});

// ───────────────────────────── Registration received (#195) ─────────────────────────────

describe('receivedApplies', () => {
  const p = (status: PaymentStatus) => ({ status });
  it('is true until a payment is approved or in flight', () => {
    expect(receivedApplies([])).toBe(true);
    expect(receivedApplies([p('CREATED'), p('REJECTED'), p('CANCELLED')])).toBe(true);
    expect(receivedApplies([p('PENDING')])).toBe(false);
    expect(receivedApplies([p('APPROVED')])).toBe(false);
    expect(receivedApplies([p('REFUNDED')])).toBe(false);
  });
});

describe('handleRegistrationReceived (the form says a registration was saved)', () => {
  const call = (body: unknown, method = 'POST') =>
    new Request('https://sieamb.org/api/v1/registrations/received', {
      method,
      headers: { 'content-type': 'application/json' },
      body: method === 'POST' ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
    });
  const env = { now: NOW };

  it('e-mails "registration received" with the pay link, before any payment exists', async () => {
    const { store, deps, sent } = setup();
    const response = await handleRegistrationReceived(call({ token: PAY_TOKEN }), env, deps);
    expect(response.status).toBe(202);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toBe('pessoa@ufcg.edu.br');
    expect(sent[0]!.subject).toBe('Inscrição recebida (II SIEAmB)');
    expect(sent[0]!.text).toContain(`${SITE}/2027/inscricoes/pagar?t=${store.contact!.payToken}`);
    expect(sent[0]!.text).not.toMatch(/R\$|undefined|pagamento\?p=/);
    expect(store.emails[0]).toMatchObject({ kind: 'RECEIVED', paymentId: null, status: 'SENT' });
  });

  it('sends it once, however many times it is called', async () => {
    const { deps, sent } = setup();
    await handleRegistrationReceived(call({ token: PAY_TOKEN }), env, deps);
    await Promise.all([
      handleRegistrationReceived(call({ token: PAY_TOKEN }), env, deps),
      handleRegistrationReceived(call({ token: PAY_TOKEN }), env, deps),
    ]);
    expect(sent).toHaveLength(1);
  });

  it.each([
    ['no token', {}],
    ['a token that is not a uuid', { token: 'abc' }],
    ['a filter injection', { token: "3f2b8c1e-9a4d-4e7f-8b21-6c5d4e3f2a10&select=*" }],
    ['a number', { token: 42 }],
    ['an array body', [PAY_TOKEN]],
    ['invalid JSON', '{not json'],
  ])('answers 400 to %s and sends nothing', async (_name, body) => {
    const { deps, sent } = setup();
    const response = await handleRegistrationReceived(call(body), env, deps);
    expect(response.status).toBe(400);
    expect(sent).toHaveLength(0);
  });

  it('answers 404 to a well-formed token nobody has', async () => {
    const { deps, sent } = setup();
    const response = await handleRegistrationReceived(call({ token: '11111111-2222-4333-8444-555555555555' }), env, deps);
    expect(response.status).toBe(404);
    expect(sent).toHaveLength(0);
  });

  it('refuses GET, and is closed while there is no database', async () => {
    const { deps } = setup();
    expect((await handleRegistrationReceived(call({}, 'GET'), env, deps)).status).toBe(405);
    expect((await handleRegistrationReceived(call({ token: PAY_TOKEN }), env, { log: deps.log })).status).toBe(503);
  });

  it('still answers 202 when the mail server is down, and the job sends it later', async () => {
    const { store, deps, sent } = setup({ failSends: 1 });
    const response = await handleRegistrationReceived(call({ token: PAY_TOKEN }), env, deps);
    expect(response.status).toBe(202);
    expect(sent).toHaveLength(0);
    expect(store.emails[0]).toMatchObject({ kind: 'RECEIVED', status: 'PENDING' });
    await deliverDueEmails(deps, NOW);
    expect(sent).toHaveLength(1);
  });

  it('records it without a sender, so nothing is lost before one is configured', async () => {
    const { store, deps } = setup({ mailer: false });
    const response = await handleRegistrationReceived(call({ token: PAY_TOKEN }), env, deps);
    expect(response.status).toBe(202);
    expect(store.emails[0]).toMatchObject({ kind: 'RECEIVED', status: 'PENDING', attempts: 0 });
  });

  it('a store failure does not fail the form', async () => {
    const { store, deps } = setup();
    store.failNextEnqueue = true;
    expect((await handleRegistrationReceived(call({ token: PAY_TOKEN }), env, deps)).status).toBe(202);
  });

  it('is dropped if the person paid before it could be sent', async () => {
    const { store, deps, sent } = setup({ failSends: 1 });
    await handleRegistrationReceived(call({ token: PAY_TOKEN }), env, deps);
    store.seed({ status: 'APPROVED' });
    expect(await deliverDueEmails(deps, NOW)).toMatchObject({ sent: 0, skipped: 1 });
    expect(sent).toHaveLength(0);
  });
});

describe('enqueueMissingReceived (the form\'s call never arrived)', () => {
  it('records it for a registration made a few minutes ago', async () => {
    const { store, deps, sent } = setup();
    store.registeredAt = ago(5 * 60 * 1000);
    expect(await enqueueMissingReceived(deps, NOW)).toBe(1);
    expect(await enqueueMissingReceived(deps, NOW)).toBe(0);
    await deliverDueEmails(deps, NOW);
    expect(sent.map((m) => m.subject)).toEqual(['Inscrição recebida (II SIEAmB)']);
  });
  it('gives the form two minutes before stepping in', async () => {
    const { store, deps } = setup();
    store.registeredAt = ago(60 * 1000);
    expect(await enqueueMissingReceived(deps, NOW)).toBe(0);
  });
  it('leaves older registrations alone: writing to everyone is a decision for a person', async () => {
    const { store, deps } = setup();
    store.registeredAt = ago(25 * HOUR);
    expect(await enqueueMissingReceived(deps, NOW)).toBe(0);
  });
  it('skips a registration that already has a payment approved or in flight', async () => {
    const { store, deps } = setup();
    store.registeredAt = ago(10 * 60 * 1000);
    store.seed({ status: 'PENDING', mpStatus: 'action_required' });
    expect(await enqueueMissingReceived(deps, NOW)).toBe(0);
  });
});

describe('a card refused on the spot (#195)', () => {
  it('e-mails "not approved" once, with the pay link', async () => {
    const { store, sent, notify } = setup();
    const payment = store.seed({ status: 'CREATED', mpStatus: 'action_required', mpStatusDetail: 'waiting_retry' });
    await notify(payment, 'CREATED', 'created');
    await notify(payment, 'CREATED', 'waiting_retry');
    expect(sent.map((m) => m.subject)).toEqual(['Pagamento não aprovado (II SIEAmB)']);
    expect(sent[0]!.text).toContain('/2027/inscricoes/pagar?t=');
  });
});

// ───────────────────────────── Date reminders (#201) ─────────────────────────────

describe('date reminders: 7 days and 1 day before a payment date', () => {
  // Fee table shipped with the site, ESTUDANTE_POS: lot 1 (R$ 50) until 01/01/2027 23:59,
  // lot 2 (R$ 70) until 20/03/2027 23:59.
  const at = (iso: string) => new Date(iso);
  const candidate = (over: Partial<ReminderCandidate> = {}): ReminderCandidate => ({
    preRegistrationId: REGISTRATION.id,
    registeredAt: '2026-11-20T15:00:00.000Z',
    eventSlug: '2027',
    category: 'ESTUDANTE_POS',
    modality: 'ONLINE',
    payments: [],
    emails: [],
    ...over,
  });

  it.each([
    ['7 days before the fee goes up', '2026-12-25T15:00:00Z', 'deadline:' + REGISTRATION.id + ':2027-01-01:7'],
    ['the day before the fee goes up', '2026-12-31T15:00:00Z', 'deadline:' + REGISTRATION.id + ':2027-01-01:1'],
    ['7 days before registration closes', '2027-03-13T15:00:00Z', 'deadline:' + REGISTRATION.id + ':2027-03-20:7'],
    ['the day before registration closes', '2027-03-19T15:00:00Z', 'deadline:' + REGISTRATION.id + ':2027-03-20:1'],
  ])('is due %s', (_name, now, key) => {
    expect(deadlineReminderDue(candidate(), at(now))?.key).toBe(key);
  });

  it.each([
    ['8 days before', '2026-12-24T15:00:00Z'],
    ['6 days before', '2026-12-26T15:00:00Z'],
    ['2 days before', '2026-12-30T15:00:00Z'],
    ['on the last day itself', '2027-01-01T15:00:00Z'],
    ['the day after', '2027-01-02T15:00:00Z'],
    ['after registration closed', '2027-03-21T15:00:00Z'],
  ])('is not due %s', (_name, now) => {
    expect(deadlineReminderDue(candidate(), at(now))).toBeNull();
  });

  it('counts days on the Brazilian calendar, not in UTC', () => {
    // 31/12 22:30 in Brazil is already 01/01 in UTC: still "the day before".
    expect(deadlineReminderDue(candidate(), at('2027-01-01T01:30:00Z'))?.daysBefore).toBe(1);
    // 24/12 23:30 in Brazil is 25/12 in UTC: still 8 days before, not 7.
    expect(deadlineReminderDue(candidate(), at('2026-12-25T02:30:00Z'))).toBeNull();
  });

  it('is not repeated for the same date and distance', () => {
    const sentAlready = [{ kind: 'REMINDER' as const, dedupeKey: 'deadline:' + REGISTRATION.id + ':2027-01-01:7', createdAt: '2026-12-25T12:00:00.000Z' }];
    expect(deadlineReminderDue(candidate({ emails: sentAlready }), at('2026-12-25T21:00:00Z'))).toBeNull();
  });

  it.each([
    ['who paid', [{ id: 'p', status: 'APPROVED' as const, mpStatus: 'processed' }]],
    ['with a boleto waiting', [{ id: 'p', status: 'PENDING' as const, mpStatus: 'action_required' }]],
    ['whose card is under review', [{ id: 'p', status: 'PENDING' as const, mpStatus: 'in_review' }]],
  ])('is not due for someone %s', (_name, payments) => {
    expect(deadlineReminderDue(candidate({ payments }), at('2026-12-25T15:00:00Z'))).toBeNull();
  });

  it('is not due on the day someone registered, nor within 6 hours of another reminder', () => {
    expect(deadlineReminderDue(candidate({ registeredAt: '2026-12-25T12:00:00.000Z' }), at('2026-12-25T15:00:00Z'))).toBeNull();
    const justReminded = [{ kind: 'REMINDER' as const, dedupeKey: 'reminder:r:1', createdAt: '2026-12-25T12:00:00.000Z' }];
    expect(deadlineReminderDue(candidate({ registeredAt: '2026-12-24T11:00:00.000Z', emails: justReminded }), at('2026-12-25T15:00:00Z'))).toBeNull();
  });

  it('has no dates for a category without a fee, or an unknown event', () => {
    expect(deadlineReminderDue(candidate({ category: 'COMUNIDADE_UFCG' }), at('2026-12-25T15:00:00Z'))).toBeNull();
    expect(deadlineReminderDue(candidate({ eventSlug: '1999' }), at('2026-12-25T15:00:00Z'))).toBeNull();
  });

  it('reads the date back from its key, and nothing from other keys', () => {
    expect(deadlineOfKey('deadline:abc:2027-01-01:7')).toBe('2027-01-01');
    expect(deadlineOfKey('reminder:abc:1')).toBeNull();
    expect(deadlineOfKey('received:abc')).toBeNull();
    expect(deadlineOfKey('deadline:abc:2027-01-01:7:extra')).toBeNull();
  });

  it('formats the date as the Brazilian calendar day in each language', () => {
    expect(brDate(Date.parse('2027-01-01T23:59:00-03:00'))).toBe('2027-01-01');
    expect(formatDate('2027-01-01T23:59:00-03:00', 'pt-BR')).toBe('01/01/2027');
    expect(formatDate('2027-01-01T23:59:00-03:00', 'en')).toBe('01/01/2027');
    expect(formatDate('2027-03-20T23:59:00-03:00', 'es')).toBe('20/03/2027');
    // Day first in English too, so 20 March is never read as an impossible month.
    expect(formatDate('2027-03-20T23:59:00-03:00', 'en')).toBe('20/03/2027');
    expect(formatDate('2027-03-20T23:59:00-03:00', 'zh-CN')).toMatch(/2027.*0?3.*20/);
  });

  it('e-mails the current fee, the date and the next fee a week before the price goes up', async () => {
    const { store, deps, sent } = setup();
    const now = at('2026-12-25T15:00:00Z');
    store.clock = now;
    store.registeredAt = '2026-12-10T15:00:00.000Z';
    // Both reminders counted from the registration already went out.
    await store.enqueueEmail({ preRegistrationId: REGISTRATION.id, paymentId: null, kind: 'REMINDER', dedupeKey: 'reminder:x:1' });
    await store.enqueueEmail({ preRegistrationId: REGISTRATION.id, paymentId: null, kind: 'REMINDER', dedupeKey: 'reminder:x:2' });
    store.emails.forEach((e) => { e.status = 'SENT'; e.createdAt = '2026-12-13T15:00:00.000Z'; });
    expect(await enqueueReminders(deps, now)).toBe(1);
    await deliverDueEmails(deps, now);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.subject).toBe('O valor da inscrição no II SIEAmB vale até 01/01/2027');
    const text = sent[0]!.text.replace(/\s/g, ' ');
    expect(text).toContain('R$ 50,00');
    expect(text).toContain('R$ 70,00');
    expect(text).toContain('01/01/2027');
    expect(text).toContain('/2027/inscricoes/pagar?t=');
    expect(text).not.toMatch(/undefined/);
  });

  it('says registration is closing, with no next fee, before the last lot ends', async () => {
    const { store, deps, sent } = setup();
    const now = at('2027-03-19T15:00:00Z');
    store.clock = now;
    store.registeredAt = '2027-03-01T15:00:00.000Z';
    await store.enqueueEmail({ preRegistrationId: REGISTRATION.id, paymentId: null, kind: 'REMINDER', dedupeKey: 'reminder:x:1' });
    await store.enqueueEmail({ preRegistrationId: REGISTRATION.id, paymentId: null, kind: 'REMINDER', dedupeKey: 'reminder:x:2' });
    store.emails.forEach((e) => { e.status = 'SENT'; e.createdAt = '2027-03-04T15:00:00.000Z'; });
    await enqueueReminders(deps, now);
    await deliverDueEmails(deps, now);
    expect(sent[0]!.subject).toBe('As inscrições do II SIEAmB encerram em 20/03/2027');
    expect(sent[0]!.text.replace(/\s/g, ' ')).toContain('R$ 70,00');
    expect(sent[0]!.text).not.toMatch(/passa a custar|undefined/);
  });

  it('drops a date reminder that is delivered after its date, or after the person paid', async () => {
    const late = setup({ failSends: 1 });
    const now = at('2026-12-31T15:00:00Z');
    late.store.clock = now;
    late.store.registeredAt = '2026-12-29T10:00:00.000Z';
    await late.store.enqueueEmail({ preRegistrationId: REGISTRATION.id, paymentId: null, kind: 'REMINDER', dedupeKey: 'deadline:' + REGISTRATION.id + ':2027-01-01:1' });
    await deliverDueEmails(late.deps, now); // mail server down
    expect(await deliverDueEmails(late.deps, at('2027-01-02T15:00:00Z'))).toMatchObject({ sent: 0, skipped: 1 });

    const paid = setup();
    paid.store.clock = now;
    await paid.store.enqueueEmail({ preRegistrationId: REGISTRATION.id, paymentId: null, kind: 'REMINDER', dedupeKey: 'deadline:' + REGISTRATION.id + ':2027-01-01:1' });
    paid.store.seed({ status: 'APPROVED' });
    expect(await deliverDueEmails(paid.deps, now)).toMatchObject({ sent: 0, skipped: 1 });
  });
});
