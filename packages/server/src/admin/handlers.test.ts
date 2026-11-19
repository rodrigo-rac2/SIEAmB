import { describe, expect, it } from 'vitest';
import { REASON_MIN, announceRegistration, handleAdmin, paymentState, type AdminDeps } from './handlers';
import { ADMIN, EVENT, NOBODY, NOW, ORGANISER, OTHER_EVENT, PLATFORM, REVIEWER, call, setup } from './testing';

interface Answer {
  announcements: Record<string, unknown>[];
  registrations: Record<string, unknown>[];
  submissions: Record<string, unknown>[];
  members: Record<string, unknown>[];
  invites: Record<string, unknown>[];
  requests: Record<string, unknown>[];
  counts: Record<string, number>;
  [key: string]: unknown;
}
const body = async (response: Response) => (await response.json()) as Answer;

const get = (deps: AdminDeps, action: string, token?: string, slug = '2027') =>
  handleAdmin(call('GET', action, { token, query: `?eventSlug=${slug}` }), action, deps);
const post = (deps: AdminDeps, action: string, token: string | undefined, data: Record<string, unknown>) =>
  handleAdmin(call('POST', action, { token, body: { eventSlug: '2027', ...data } }), action, deps);

const READS = ['registrations', 'submissions', 'members', 'link-requests'] as const;
const WRITES = [
  'registration-create',
  'registration-status',
  'registration-delete',
  'registration-restore',
  'submissions-close',
  'submissions-reopen',
  'reviewer-assign',
  'reviewer-unassign',
  'member-add',
  'member-remove',
  'link-decide',
] as const;

describe('router', () => {
  it('answers 404, 405 and 503 like the other functions', async () => {
    const { deps } = setup();
    expect((await handleAdmin(call('GET', 'nope'), 'nope', deps)).status).toBe(404);
    expect((await handleAdmin(call('POST', 'registrations', { body: {} }), 'registrations', deps)).status).toBe(405);
    expect((await handleAdmin(call('GET', 'registrations'), 'registrations', null)).status).toBe(503);
  });

  it('turns an unexpected failure into a 500 without leaking it', async () => {
    const { deps, tokens, store, logs } = setup();
    store.listRegistrations = async () => {
      throw new Error('boom: secret');
    };
    const response = await get(deps, 'registrations', tokens.admin);
    expect(response.status).toBe(500);
    expect(await body(response)).toEqual({ error: 'server_error' });
    expect(logs.at(-1)?.event).toBe('admin_request_failed');
  });
});

describe('who may open the organisation area', () => {
  it.each([...READS])('GET %s needs a login', async (action) => {
    const { deps } = setup();
    expect((await get(deps, action)).status).toBe(401);
    expect((await get(deps, action, 'forged')).status).toBe(401);
  });

  it.each([...WRITES])('POST %s needs a login', async (action) => {
    const { deps, store } = setup();
    store.seed();
    expect((await post(deps, action, undefined, {})).status).toBe(401);
    expect(store.audits).toEqual([]);
  });

  it.each([
    ['a person with no role', 'nobody'],
    ['a reviewer', 'reviewer'],
  ] as const)('%s gets "not found" everywhere, as if the edition did not exist', async (_name, who) => {
    const { deps, tokens, store } = setup();
    const registration = store.seed();
    for (const action of READS) {
      const response = await get(deps, action, tokens[who]);
      expect(response.status, action).toBe(404);
      expect(await body(response)).toEqual({ error: 'not_found' });
    }
    for (const action of WRITES) {
      const response = await post(deps, action, tokens[who], { id: registration.id, reason: 'um motivo qualquer', email: 'x@y.org', role: 'REVIEWER' });
      expect(response.status, action).toBe(404);
    }
    expect(registration).toMatchObject({ deletedAt: null, manualStatus: null });
    expect(store.audits).toEqual([]);
  });

  it('an administrator of one edition has no standing in another', async () => {
    const { deps, tokens } = setup();
    expect((await get(deps, 'registrations', tokens.admin, '2025')).status).toBe(404);
    expect((await get(deps, 'registrations', tokens.admin, 'nope')).status).toBe(404);
  });

  it('a platform administrator stands as administrator in every edition', async () => {
    const { deps, tokens } = setup();
    for (const slug of ['2027', '2025']) {
      const response = await get(deps, 'registrations', tokens.platform, slug);
      expect(response.status).toBe(200);
      expect((await body(response)).role).toBe('ADMIN');
    }
  });

  it.each(['registration-create', 'registration-status', 'registration-delete', 'registration-restore', 'link-decide'] as const)(
    'an organiser cannot %s',
    async (action) => {
      const { deps, tokens, store } = setup();
      const registration = store.seed();
      const response = await post(deps, action, tokens.organiser, { id: registration.id, status: 'CONFIRMED', reason: 'um motivo qualquer', fullName: 'Fulano de Tal', email: 'f@ufcg.edu.br', cpf: '52998224725', category: 'PROFISSIONAL' });
      expect(response.status).toBe(403);
      expect(await body(response)).toEqual({ error: 'admin_only' });
      expect(store.registrations).toHaveLength(1);
      expect(registration).toMatchObject({ deletedAt: null, manualStatus: null });
      expect(store.audits).toEqual([]);
    },
  );

  it('an organiser cannot see the requests waiting for an administrator', async () => {
    const { deps, tokens } = setup();
    expect((await get(deps, 'link-requests', tokens.organiser)).status).toBe(403);
  });
});

describe('registrations list', () => {
  it('shows payment, the decision made by hand and the totals', async () => {
    const { deps, tokens, store } = setup();
    store.seed({ fullName: 'Paga', payments: [{ status: 'REJECTED', amountCents: 5000, paidAt: null }, { status: 'APPROVED', amountCents: 5000, paidAt: '2026-11-20T12:00:00Z' }] });
    store.seed({ fullName: 'Boleto', payments: [{ status: 'PENDING', amountCents: 3000, paidAt: null }] });
    store.seed({ fullName: 'Nada' });
    store.seed({ fullName: 'Isenta', manualStatus: 'EXEMPT', manualReason: 'palestrante convidada', manualBy: ADMIN.id, manualAt: NOW.toISOString() });
    store.seed({ fullName: 'Cancelada mas paga', manualStatus: 'CANCELLED', manualReason: 'pediu para sair', payments: [{ status: 'APPROVED', amountCents: 7000, paidAt: '2026-11-21T12:00:00Z' }] });
    store.seed({ fullName: 'Apagada', deletedAt: NOW.toISOString(), deletedBy: ADMIN.id, deletedReason: 'teste' });
    store.seed({ fullName: 'De outra edição', eventId: OTHER_EVENT.id });
    const data = await body(await get(deps, 'registrations', tokens.admin));
    const byName = Object.fromEntries(data.registrations.map((r) => [r.fullName as string, r]));
    expect(data.registrations).toHaveLength(6);
    expect(byName.Paga).toMatchObject({ state: 'PAID', payment: 'PAID', paidCents: 5000, paidAt: '2026-11-20T12:00:00Z', manual: null, deleted: null });
    expect(byName.Boleto).toMatchObject({ state: 'PENDING', payment: 'PENDING', paidCents: null });
    expect(byName.Nada).toMatchObject({ state: 'UNPAID', payment: 'UNPAID' });
    expect(byName.Isenta).toMatchObject({ state: 'EXEMPT', payment: 'UNPAID', manual: { status: 'EXEMPT', reason: 'palestrante convidada', by: ADMIN.id } });
    // The payment stays visible whatever was decided by hand.
    expect(byName['Cancelada mas paga']).toMatchObject({ state: 'CANCELLED', payment: 'PAID', paidCents: 7000 });
    expect(byName.Apagada).toMatchObject({ deleted: { reason: 'teste', by: ADMIN.id } });
    expect(data.counts).toEqual({ total: 5, confirmed: 2, pending: 1, unpaid: 1, cancelled: 1, deleted: 1 });
  });

  it('gives documents to an administrator and not to an organiser', async () => {
    const { deps, tokens, store } = setup();
    store.seed({ cpf: '52998224725' });
    const asAdmin = await body(await get(deps, 'registrations', tokens.admin));
    expect(asAdmin.registrations[0]).toMatchObject({ cpf: '52998224725', country: 'BR' });
    const asOrganiser = await body(await get(deps, 'registrations', tokens.organiser));
    expect(asOrganiser.role).toBe('ORGANIZER');
    expect(asOrganiser.registrations[0]).not.toHaveProperty('cpf');
    expect(asOrganiser.registrations[0]).not.toHaveProperty('passport');
    expect(JSON.stringify(asOrganiser)).not.toContain('52998224725');
    // Who paid is still there for the organiser.
    expect(asOrganiser.registrations[0]).toHaveProperty('payment', 'UNPAID');
  });

  it('derives the payment state from every payment of the registration', () => {
    const p = (status: 'APPROVED' | 'PENDING' | 'REJECTED' | 'CREATED' | 'REFUNDED' | 'CANCELLED') => ({ status, amountCents: 1, paidAt: null });
    expect(paymentState({ payments: [] })).toBe('UNPAID');
    expect(paymentState({ payments: [p('CREATED'), p('REJECTED'), p('CANCELLED'), p('REFUNDED')] })).toBe('UNPAID');
    expect(paymentState({ payments: [p('REJECTED'), p('PENDING')] })).toBe('PENDING');
    expect(paymentState({ payments: [p('PENDING'), p('APPROVED')] })).toBe('PAID');
  });
});

describe('registering someone by hand', () => {
  const person = (over: Record<string, unknown> = {}) => ({
    fullName: '  Fulano   de Tal ',
    email: 'Fulano@UFCG.edu.br',
    cpf: '529.982.247-25',
    institution: 'UFCG',
    category: 'PROFISSIONAL',
    ...over,
  });

  it('creates the registration, unpaid, marked as made by the administrator, and logs it', async () => {
    const { deps, tokens, store } = setup();
    const response = await post(deps, 'registration-create', tokens.admin, person());
    expect(response.status).toBe(201);
    expect(store.registrations[0]).toMatchObject({
      eventId: EVENT.id,
      fullName: 'Fulano de Tal',
      email: 'fulano@ufcg.edu.br',
      cpf: '52998224725',
      passport: null,
      country: 'BR',
      category: 'PROFISSIONAL',
      createdBy: ADMIN.id,
      manualStatus: null,
    });
    expect((await body(response)).registration).toMatchObject({ state: 'UNPAID', byOrganiser: true });
    expect(store.audits).toEqual([
      { actorId: ADMIN.id, action: 'registration.create', entity: 'pre_registration', entityId: store.registrations[0]!.id, meta: { manualStatus: null, eventSlug: '2027' } },
    ]);
  });

  it('can create it already confirmed or exempt, with the reason', async () => {
    const { deps, tokens, store } = setup();
    expect((await post(deps, 'registration-create', tokens.admin, person({ manualStatus: 'EXEMPT', reason: 'palestrante convidado' }))).status).toBe(201);
    expect(store.registrations[0]).toMatchObject({ manualStatus: 'EXEMPT', manualReason: 'palestrante convidado', manualBy: ADMIN.id, manualAt: NOW.toISOString() });
  });

  it('takes a CPF and a passport together, and reads them by the rules of every other document (ADR-010)', async () => {
    const { deps, tokens, store } = setup();
    expect((await post(deps, 'registration-create', tokens.admin, person({ cpf: '529.982.247-25', passport: 'ab 123-456', country: 'us' }))).status).toBe(201);
    expect(store.registrations[0]).toMatchObject({ cpf: '52998224725', passport: 'AB123456', country: 'US' });
  });

  it.each([
    ['no document', { cpf: '', passport: '' }, 'document_required'],
    ['a passport without its country', { cpf: '', passport: 'AB123456' }, 'invalid_country'],
    ['a passport from Brazil', { cpf: '', passport: 'AB123456', country: 'BR' }, 'invalid_country'],
    ['a country that does not exist', { cpf: '', passport: 'AB123456', country: 'ZZ' }, 'invalid_country'],
    ['a passport that is too short', { cpf: '', passport: 'A1', country: 'PT' }, 'invalid_passport'],
    ['an invalid CPF next to a good passport', { cpf: '12345678900', passport: 'AB123456', country: 'PT' }, 'invalid_cpf'],
  ])('refuses a registration by hand with %s', async (_name, document, error) => {
    const { deps, tokens, store } = setup();
    const response = await post(deps, 'registration-create', tokens.admin, person(document));
    expect(response.status).toBe(400);
    expect(await body(response)).toEqual({ error });
    expect(store.registrations).toEqual([]);
  });

  it('a CPF alone is stored with no passport and BR in the country column', async () => {
    const { deps, tokens, store } = setup();
    await post(deps, 'registration-create', tokens.admin, person({ cpf: '52998224725', country: 'PT' }));
    expect(store.registrations[0]).toMatchObject({ cpf: '52998224725', passport: null, country: 'BR' });
  });

  it('takes a passport and its country for someone without a CPF', async () => {
    const { deps, tokens, store } = setup();
    expect((await post(deps, 'registration-create', tokens.admin, person({ cpf: '', passport: 'ab 123-456', country: 'pt' }))).status).toBe(201);
    expect(store.registrations[0]).toMatchObject({ cpf: null, passport: 'AB123456', country: 'PT' });
  });

  it.each([
    ['a short name', { fullName: 'Ana' }, 'invalid_name'],
    ['a bad e-mail', { email: 'fulano@' }, 'invalid_email'],
    ['an invalid CPF', { cpf: '111.111.111-11' }, 'invalid_cpf'],
    ['no document at all', { cpf: '' }, 'document_required'],
    ['a category the edition does not have', { category: 'PROFESSOR' }, 'invalid_category'],
    ['an unknown status', { manualStatus: 'VIP', reason: 'um motivo qualquer' }, 'invalid_status'],
    ['a status without a reason', { manualStatus: 'CONFIRMED' }, 'reason_required'],
    ['a status with a four-letter reason', { manualStatus: 'CONFIRMED', reason: 'pago' }, 'reason_required'],
  ])('refuses %s', async (_name, over, error) => {
    const { deps, tokens, store } = setup();
    const response = await post(deps, 'registration-create', tokens.admin, person(over));
    expect(response.status).toBe(400);
    expect(await body(response)).toEqual({ error });
    expect(store.registrations).toEqual([]);
    expect(store.audits).toEqual([]);
  });

  it('refuses a second registration for the same e-mail, but allows it once the first is deleted', async () => {
    const { deps, tokens, store } = setup();
    const first = store.seed({ email: 'fulano@ufcg.edu.br' });
    const refused = await post(deps, 'registration-create', tokens.admin, person());
    expect(refused.status).toBe(409);
    expect(await body(refused)).toEqual({ error: 'registration_exists' });
    first.deletedAt = NOW.toISOString();
    expect((await post(deps, 'registration-create', tokens.admin, person())).status).toBe(201);
  });
});

describe('changing a registration by hand', () => {
  const status = (deps: AdminDeps, token: string, data: Record<string, unknown>) => post(deps, 'registration-status', token, data);

  it.each(['CONFIRMED', 'EXEMPT', 'CANCELLED'] as const)('sets %s with who, when and why, and logs the payment as it was', async (to) => {
    const { deps, tokens, store } = setup();
    const r = store.seed({ payments: [{ status: 'PENDING', amountCents: 5000, paidAt: null }] });
    expect((await status(deps, tokens.admin, { id: r.id, status: to, reason: 'pagou por transferência' })).status).toBe(200);
    expect(r).toMatchObject({ manualStatus: to, manualReason: 'pagou por transferência', manualBy: ADMIN.id, manualAt: NOW.toISOString() });
    expect(r.payments).toHaveLength(1);
    expect(store.audits[0]).toMatchObject({ action: 'registration.status', entityId: r.id, meta: { from: null, to, reason: 'pagou por transferência', payment: 'PENDING' } });
  });

  it('hands the registration back to the payment when the status is cleared, still asking why', async () => {
    const { deps, tokens, store } = setup();
    const r = store.seed({ manualStatus: 'CONFIRMED', manualReason: 'engano', manualBy: ADMIN.id, manualAt: NOW.toISOString() });
    expect((await status(deps, tokens.admin, { id: r.id, status: null })).status).toBe(400);
    expect((await status(deps, tokens.admin, { id: r.id, status: null, reason: 'marcada por engano' })).status).toBe(200);
    expect(r).toMatchObject({ manualStatus: null, manualReason: null, manualBy: null, manualAt: null });
    expect(store.audits[0]!.meta).toMatchObject({ from: 'CONFIRMED', to: null, reason: 'marcada por engano' });
  });

  it.each([
    ['an unknown status', { status: 'PAID', reason: 'um motivo qualquer' }, 400, 'invalid_status'],
    ['no status field', { reason: 'um motivo qualquer' }, 400, 'invalid_status'],
    ['no reason', { status: 'CONFIRMED' }, 400, 'reason_required'],
    [`a reason under ${REASON_MIN} characters`, { status: 'CONFIRMED', reason: 'ok' }, 400, 'reason_required'],
  ])('refuses %s', async (_name, data, code, error) => {
    const { deps, tokens, store } = setup();
    const r = store.seed();
    const response = await status(deps, tokens.admin, { id: r.id, ...data });
    expect(response.status).toBe(code);
    expect(await body(response)).toEqual({ error });
    expect(r.manualStatus).toBeNull();
  });

  it('does not reach a registration of another edition, a deleted one or one that does not exist', async () => {
    const { deps, tokens, store } = setup();
    const elsewhere = store.seed({ eventId: OTHER_EVENT.id });
    const deleted = store.seed({ deletedAt: NOW.toISOString() });
    for (const id of [elsewhere.id, deleted.id, 'reg-none']) {
      const response = await status(deps, tokens.admin, { id, status: 'CONFIRMED', reason: 'um motivo qualquer' });
      expect(response.status).toBe(404);
    }
    expect(elsewhere.manualStatus).toBeNull();
    expect(deleted.manualStatus).toBeNull();
  });

  it('still makes the change when the audit line cannot be written, and says so in the log', async () => {
    const { deps, tokens, store, logs } = setup();
    const r = store.seed();
    store.failAudit = true;
    expect((await status(deps, tokens.admin, { id: r.id, status: 'CONFIRMED', reason: 'um motivo qualquer' })).status).toBe(200);
    expect(r.manualStatus).toBe('CONFIRMED');
    expect(logs.some((l) => l.event === 'audit_failed')).toBe(true);
  });
});

describe('deleting and restoring a registration', () => {
  it('marks it as deleted with who and why, keeps the row, and restores it as it was', async () => {
    const { deps, tokens, store } = setup();
    const r = store.seed({ manualStatus: 'EXEMPT', manualReason: 'convidada' });
    expect((await post(deps, 'registration-delete', tokens.admin, { id: r.id, reason: 'inscrição de teste' })).status).toBe(200);
    expect(store.registrations).toHaveLength(1);
    expect(r).toMatchObject({ deletedAt: NOW.toISOString(), deletedBy: ADMIN.id, deletedReason: 'inscrição de teste', manualStatus: 'EXEMPT' });
    // Deleting twice finds nothing to delete.
    expect((await post(deps, 'registration-delete', tokens.admin, { id: r.id, reason: 'inscrição de teste' })).status).toBe(404);
    expect((await post(deps, 'registration-restore', tokens.admin, { id: r.id })).status).toBe(200);
    expect(r).toMatchObject({ deletedAt: null, deletedBy: null, deletedReason: null, manualStatus: 'EXEMPT', manualReason: 'convidada' });
    expect(store.audits.map((a) => a.action)).toEqual(['registration.delete', 'registration.restore']);
  });

  it('asks for a reason', async () => {
    const { deps, tokens, store } = setup();
    const r = store.seed();
    const response = await post(deps, 'registration-delete', tokens.admin, { id: r.id, reason: 'x' });
    expect(response.status).toBe(400);
    expect(r.deletedAt).toBeNull();
  });

  it('does not delete a paid registration unless the administrator confirms it on purpose', async () => {
    const { deps, tokens, store } = setup();
    const r = store.seed({ payments: [{ status: 'APPROVED', amountCents: 5000, paidAt: '2026-11-20T12:00:00Z' }] });
    const refused = await post(deps, 'registration-delete', tokens.admin, { id: r.id, reason: 'duplicada' });
    expect(refused.status).toBe(409);
    expect(await body(refused)).toEqual({ error: 'registration_paid' });
    expect(r.deletedAt).toBeNull();
    expect((await post(deps, 'registration-delete', tokens.admin, { id: r.id, reason: 'duplicada, já reembolsada', confirmPaid: true })).status).toBe(200);
    expect(store.audits[0]!.meta).toMatchObject({ payment: 'PAID' });
  });

  it('refuses to restore when the person registered again in the meantime', async () => {
    const { deps, tokens, store } = setup();
    const old = store.seed({ email: 'mesma@ufcg.edu.br', deletedAt: NOW.toISOString() });
    store.seed({ email: 'mesma@ufcg.edu.br' });
    const response = await post(deps, 'registration-restore', tokens.admin, { id: old.id });
    expect(response.status).toBe(409);
    expect(await body(response)).toEqual({ error: 'registration_exists' });
    expect(old.deletedAt).not.toBeNull();
  });

  it('cannot restore what is not deleted', async () => {
    const { deps, tokens, store } = setup();
    expect((await post(deps, 'registration-restore', tokens.admin, { id: store.seed().id })).status).toBe(404);
  });
});

describe('papers list', () => {
  it('shows every paper of the edition, withdrawn ones marked, and whether an author is registered', async () => {
    const { deps, tokens, store } = setup();
    const base = { eventId: EVENT.id, modality: 'ARTIGO', areaRef: 'a1', status: 'SUBMITTED', fileName: 'a.pdf', filePages: 13, createdAt: NOW.toISOString(), updatedAt: NOW.toISOString(), deletedAt: null, deletedReason: null, reviewers: [] };
    store.submissions.push(
      { ...base, id: 's1', number: 1, title: 'Com autor inscrito', authors: [{ position: 1, fullName: 'A', email: 'a@x.org' }, { position: 2, fullName: 'B', email: 'paga@x.org' }] },
      { ...base, id: 's2', number: 2, title: 'Sem autor inscrito', authors: [{ position: 1, fullName: 'C', email: 'naopaga@x.org' }] },
      { ...base, id: 's3', number: 3, title: 'Retirado', deletedAt: NOW.toISOString(), deletedReason: 'withdrawn by the main author', authors: [] },
      { ...base, id: 's4', number: 4, title: 'De outra edição', eventId: OTHER_EVENT.id, authors: [] },
    );
    store.seed({ email: 'paga@x.org', payments: [{ status: 'APPROVED', amountCents: 5000, paidAt: null }] });
    store.seed({ email: 'naopaga@x.org' });
    for (const who of ['admin', 'organiser'] as const) {
      const data = await body(await get(deps, 'submissions', tokens[who]));
      expect(data.submissions.map((s) => [s.title, s.authorRegistered])).toEqual([
        ['Com autor inscrito', true],
        ['Sem autor inscrito', false],
        ['Retirado', false],
      ]);
      expect(data.counts).toEqual({ total: 2, withdrawn: 1 });
    }
  });

  describe('who each author is (ADR-010)', () => {
    const CPF = '52998224725';
    const base = { eventId: EVENT.id, modality: 'ARTIGO', areaRef: 'a1', status: 'SUBMITTED', fileName: 'a.pdf', filePages: 13, createdAt: NOW.toISOString(), updatedAt: NOW.toISOString(), deletedAt: null, deletedReason: null, reviewers: [] };
    const paid = { payments: [{ status: 'APPROVED' as const, amountCents: 5000, paidAt: null }] };

    it('sends the authors\' documents to an administrator and to nobody else', async () => {
      const { deps, tokens, store } = setup();
      store.submissions.push({
        ...base,
        id: 's1',
        number: 1,
        title: 'Com documentos',
        authors: [
          { position: 1, fullName: 'A', email: 'a@x.org', cpf: CPF, passport: null, country: null },
          { position: 2, fullName: 'B', email: 'b@uc.pt', cpf: null, passport: 'AB123456', country: 'PT' },
        ],
      });
      const asAdmin = await body(await get(deps, 'submissions', tokens.admin));
      expect((asAdmin.submissions[0]!.authors as Record<string, unknown>[]).map((a) => [a.cpf, a.passport, a.country])).toEqual([
        [CPF, null, null],
        [null, 'AB123456', 'PT'],
      ]);
      const asOrganiser = JSON.stringify(await body(await get(deps, 'submissions', tokens.organiser)));
      for (const secret of [CPF, 'AB123456', '"cpf"', '"passport"', '"country"']) expect(asOrganiser).not.toContain(secret);
    });

    it('takes an author as registered by the document, when the registration is under another e-mail', async () => {
      const { deps, tokens, store } = setup();
      store.submissions.push(
        { ...base, id: 's1', number: 1, title: 'Pelo CPF', authors: [{ position: 1, fullName: 'A', email: 'a.trabalho@x.org', cpf: CPF, passport: null, country: null }] },
        { ...base, id: 's2', number: 2, title: 'Pelo passaporte', authors: [{ position: 1, fullName: 'B', email: 'b.trabalho@uc.pt', cpf: null, passport: 'AB123456', country: 'PT' }] },
        { ...base, id: 's3', number: 3, title: 'Passaporte de outro país', authors: [{ position: 1, fullName: 'C', email: 'c@uv.es', cpf: null, passport: 'ZZ999999', country: 'ES' }] },
        { ...base, id: 's4', number: 4, title: 'Passaporte inscrito antes de haver país', authors: [{ position: 1, fullName: 'D', email: 'd.trabalho@x.org', cpf: null, passport: 'OLD12345', country: 'US' }] },
        { ...base, id: 's5', number: 5, title: 'Outro CPF', authors: [{ position: 1, fullName: 'E', email: 'e@x.org', cpf: '11144477735', passport: null, country: null }] },
      );
      store.seed({ email: 'a.inscricao@x.org', cpf: CPF, ...paid });
      store.seed({ email: 'b.inscricao@uc.pt', cpf: null, passport: 'AB123456', country: 'PT', ...paid });
      // The same number, registered from another country: another person.
      store.seed({ email: 'outra@x.org', cpf: null, passport: 'ZZ999999', country: 'PT', ...paid });
      // Registered on the public form before it asked for the country: stored as BR.
      store.seed({ email: 'd.inscricao@x.org', cpf: null, passport: 'OLD12345', country: 'BR', ...paid });
      for (const who of ['admin', 'organiser'] as const) {
        const data = await body(await get(deps, 'submissions', tokens[who]));
        expect(data.submissions.map((s) => [s.title, s.authorRegistered, (s.authors as { registration: string | null }[])[0]!.registration])).toEqual([
          ['Pelo CPF', true, 'PAID'],
          ['Pelo passaporte', true, 'PAID'],
          ['Passaporte de outro país', false, null],
          ['Passaporte inscrito antes de haver país', true, 'PAID'],
          ['Outro CPF', false, null],
        ]);
      }
    });

    it('lists for an administrator every document that appears under more than one address, among the papers that stand (#352)', async () => {
      const { deps, tokens, store } = setup();
      const a = (position: number, fullName: string, email: string, doc: { cpf?: string; passport?: string; country?: string }) => ({ position, fullName, email, cpf: doc.cpf ?? null, passport: doc.passport ?? null, country: doc.country ?? null });
      store.submissions.push(
        { ...base, id: 's1', number: 1, title: 'Um', authors: [a(1, 'Ana Reis', 'ana@ufrn.br', { cpf: CPF }), a(2, 'Joana', 'joana@uc.pt', { passport: 'AB123456', country: 'PT' })] },
        { ...base, id: 's2', number: 2, title: 'Dois', authors: [a(1, 'Ana R.', 'ana.reis@gmail.com', { cpf: CPF }), a(2, 'Joana S.', 'joana.s@gmail.com', { passport: 'AB123456', country: 'PT' })] },
        { ...base, id: 's3', number: 3, title: 'Três', authors: [a(1, 'Ana Reis', 'ana@ufrn.br', { cpf: CPF }), a(2, 'Outra pessoa', 'juana@uv.es', { passport: 'AB123456', country: 'ES' })] },
        // A withdrawn paper, and a paper of another edition, say nothing here.
        { ...base, id: 's4', number: 4, title: 'Retirado', deletedAt: NOW.toISOString(), authors: [a(1, 'Ana', 'ana.terceira@x.org', { cpf: CPF })] },
        { ...base, id: 's5', number: 5, title: 'De outra edição', eventId: OTHER_EVENT.id, authors: [a(1, 'Ana', 'ana.quarta@x.org', { cpf: CPF })] },
        // One address, one document, twice: nothing to look at.
        { ...base, id: 's6', number: 6, title: 'Seis', authors: [a(1, 'Só um e-mail', 'unico@x.org', { cpf: '11144477735' })] },
        { ...base, id: 's7', number: 7, title: 'Sete', authors: [a(1, 'Só um e-mail', 'unico@x.org', { cpf: '11144477735' }), a(2, 'De antes', 'antes@x.org', {})] },
      );
      const data = (await body(await get(deps, 'submissions', tokens.admin))) as unknown as { sameDocument: unknown[] };
      expect(data.sameDocument).toEqual([
        { cpf: CPF, passport: null, country: null, lines: [{ email: 'ana@ufrn.br', fullName: 'Ana Reis', papers: [1, 3] }, { email: 'ana.reis@gmail.com', fullName: 'Ana R.', papers: [2] }] },
        { cpf: null, passport: 'AB123456', country: 'PT', lines: [{ email: 'joana@uc.pt', fullName: 'Joana', papers: [1] }, { email: 'joana.s@gmail.com', fullName: 'Joana S.', papers: [2] }] },
      ]);
      // It is made of documents: an organiser is not sent it at all.
      expect(await body(await get(deps, 'submissions', tokens.organiser))).not.toHaveProperty('sameDocument');
    });

    it('sends an empty list when nobody is listed in two ways', async () => {
      const { deps, tokens } = setup();
      expect(((await body(await get(deps, 'submissions', tokens.admin))) as unknown as { sameDocument: unknown[] }).sameDocument).toEqual([]);
    });

    it('a registration under the author\'s own e-mail is found first, whatever the documents say', async () => {
      const { deps, tokens, store } = setup();
      store.submissions.push({ ...base, id: 's1', number: 1, title: 'x', authors: [{ position: 1, fullName: 'A', email: 'a@x.org', cpf: CPF, passport: null, country: null }] });
      store.seed({ email: 'a@x.org', cpf: '11144477735' });
      store.seed({ email: 'outra@x.org', cpf: CPF, ...paid });
      const data = await body(await get(deps, 'submissions', tokens.admin));
      expect((data.submissions[0]!.authors as { registration: string | null }[])[0]!.registration).toBe('UNPAID');
    });
  });

  it('counts an author as registered when an administrator confirmed or exempted them, not when cancelled or deleted', async () => {
    const { deps, tokens, store } = setup();
    const base = { eventId: EVENT.id, modality: 'ARTIGO', areaRef: 'a1', status: 'SUBMITTED', fileName: 'a.pdf', filePages: 13, createdAt: NOW.toISOString(), updatedAt: NOW.toISOString(), deletedAt: null, deletedReason: null, reviewers: [] };
    const paper = (n: number, email: string) => ({ ...base, id: `s${n}`, number: n, title: email, authors: [{ position: 1, fullName: 'X', email }] });
    store.submissions.push(paper(1, 'isento@x.org'), paper(2, 'cancelado@x.org'), paper(3, 'apagado@x.org'));
    store.seed({ email: 'isento@x.org', manualStatus: 'EXEMPT' });
    store.seed({ email: 'cancelado@x.org', manualStatus: 'CANCELLED', payments: [{ status: 'APPROVED', amountCents: 1, paidAt: null }] });
    store.seed({ email: 'apagado@x.org', deletedAt: NOW.toISOString(), payments: [{ status: 'APPROVED', amountCents: 1, paidAt: null }] });
    const data = await body(await get(deps, 'submissions', tokens.admin));
    expect(data.submissions.map((s) => s.authorRegistered)).toEqual([true, false, false]);
  });
});

describe('people and roles', () => {
  it('lists members and pending invitations, and says what the person may manage', async () => {
    const { deps, tokens, store } = setup();
    store.invites.push({ eventId: EVENT.id, email: 'futuro@ufpb.br', role: 'REVIEWER' });
    const asAdmin = await body(await get(deps, 'members', tokens.admin));
    // An administrator gives organisers and reviewers; only the owner gives administrators (#268).
    expect(asAdmin.canManage).toEqual(['ORGANIZER', 'REVIEWER']);
    expect(asAdmin.owner).toBe(false);
    const asOwner = await body(await get(deps, 'members', tokens.platform));
    expect(asOwner.canManage).toEqual(['ADMIN', 'ORGANIZER', 'REVIEWER']);
    expect(asOwner.owner).toBe(true);
    expect(asAdmin.members.map((m) => `${m.email as string}:${m.role as string}`)).toEqual([
      `${ADMIN.email}:ADMIN`,
      `${ORGANISER.email}:ORGANIZER`,
      `${REVIEWER.email}:REVIEWER`,
    ]);
    expect(asAdmin.invites).toEqual([{ email: 'futuro@ufpb.br', role: 'REVIEWER' }]);
    expect((await body(await get(deps, 'members', tokens.organiser))).canManage).toEqual(['REVIEWER']);
  });

  it('does not tell an organiser who the administrators are, nor who was invited to be one (#264)', async () => {
    const { deps, tokens, store } = setup();
    store.invites.push({ eventId: EVENT.id, email: 'futura-admin@ufcg.edu.br', role: 'ADMIN' });
    store.invites.push({ eventId: EVENT.id, email: 'futuro@ufpb.br', role: 'REVIEWER' });
    const asOrganiser = await body(await get(deps, 'members', tokens.organiser));
    expect(asOrganiser.members.map((m) => `${m.email as string}:${m.role as string}`)).toEqual([
      `${ORGANISER.email}:ORGANIZER`,
      `${REVIEWER.email}:REVIEWER`,
    ]);
    expect(asOrganiser.invites).toEqual([{ email: 'futuro@ufpb.br', role: 'REVIEWER' }]);
    // The administrator is in the list of accounts as anyone else, with no role that says so (#275).
    expect(JSON.stringify(asOrganiser.members)).not.toContain(ADMIN.email);
    expect(JSON.stringify(asOrganiser)).not.toContain('"ADMIN"');
    expect(JSON.stringify(asOrganiser)).not.toContain('futura-admin');
    // The administrator still sees everyone.
    const asAdmin = await body(await get(deps, 'members', tokens.admin));
    expect(asAdmin.invites).toHaveLength(2);
    expect(asAdmin.members.some((m) => m.role === 'ADMIN')).toBe(true);
  });

  it('gives a role to someone with an account, tells them, and logs it', async () => {
    const { deps, tokens, store, sent, outbox } = setup();
    const response = await post(deps, 'member-add', tokens.admin, { email: NOBODY.email.toUpperCase(), role: 'ORGANIZER' });
    expect(await body(response)).toEqual({ ok: true, invited: false });
    expect(store.members.some((m) => m.userId === NOBODY.id && m.role === 'ORGANIZER')).toBe(true);
    expect(sent[0]).toMatchObject({ to: NOBODY.email, subject: 'Você agora é Organizador no site do II SIEAmB' });
    expect(sent[0]!.text).toContain('https://dev.sieamb.org/2027/minha-area');
    expect(outbox.notifications).toEqual([{ userId: NOBODY.id, eventId: EVENT.id, kind: 'member.added', data: { role: 'ORGANIZER' } }]);
    expect(store.audits[0]).toMatchObject({ actorId: ADMIN.id, action: 'member.add', entityId: NOBODY.id, meta: { email: NOBODY.email, role: 'ORGANIZER', invited: false } });
  });

  it('keeps the role for an address without an account and tells it to create one', async () => {
    const { deps, tokens, store, sent } = setup();
    const response = await post(deps, 'member-add', tokens.admin, { email: 'novo@ufpb.br', role: 'REVIEWER' });
    expect(await body(response)).toEqual({ ok: true, invited: true });
    expect(store.invites).toEqual([{ eventId: EVENT.id, email: 'novo@ufpb.br', role: 'REVIEWER' }]);
    expect(store.members).toHaveLength(3);
    expect(sent[0]!.text).toContain('crie sua conta no site com este mesmo e-mail');
    expect(sent[0]!.text).toContain('https://dev.sieamb.org/2027/conta/criar');
  });

  it('giving the same role twice changes nothing', async () => {
    const { deps, tokens, store } = setup();
    await post(deps, 'member-add', tokens.admin, { email: REVIEWER.email, role: 'REVIEWER' });
    await post(deps, 'member-add', tokens.admin, { email: 'novo@ufpb.br', role: 'REVIEWER' });
    await post(deps, 'member-add', tokens.admin, { email: 'novo@ufpb.br', role: 'REVIEWER' });
    expect(store.members.filter((m) => m.role === 'REVIEWER')).toHaveLength(1);
    expect(store.invites).toHaveLength(1);
  });

  it('an organiser gives and removes reviewers, and nothing else', async () => {
    const { deps, tokens, store } = setup();
    expect((await post(deps, 'member-add', tokens.organiser, { email: NOBODY.email, role: 'REVIEWER' })).status).toBe(200);
    for (const role of ['ADMIN', 'ORGANIZER']) {
      const response = await post(deps, 'member-add', tokens.organiser, { email: NOBODY.email, role });
      expect(response.status).toBe(403);
      expect((await post(deps, 'member-remove', tokens.organiser, { email: ADMIN.email, role })).status).toBe(403);
    }
    expect(store.members.filter((m) => m.userId === NOBODY.id).map((m) => m.role)).toEqual(['REVIEWER']);
    expect(store.members.some((m) => m.userId === ADMIN.id && m.role === 'ADMIN')).toBe(true);
    expect((await post(deps, 'member-remove', tokens.organiser, { email: NOBODY.email, role: 'REVIEWER' })).status).toBe(200);
    expect(store.members.some((m) => m.userId === NOBODY.id)).toBe(false);
  });

  it('removes a role and an invitation, without e-mailing anyone', async () => {
    const { deps, tokens, store, sent } = setup();
    store.invites.push({ eventId: EVENT.id, email: 'futuro@ufpb.br', role: 'REVIEWER' });
    await post(deps, 'member-remove', tokens.admin, { email: ORGANISER.email, role: 'ORGANIZER' });
    await post(deps, 'member-remove', tokens.admin, { email: 'futuro@ufpb.br', role: 'REVIEWER' });
    expect(store.members.some((m) => m.userId === ORGANISER.id)).toBe(false);
    expect(store.invites).toEqual([]);
    expect(sent).toEqual([]);
    expect(store.audits.map((a) => a.action)).toEqual(['member.remove', 'member.remove']);
  });

  it('only the owner gives or takes the Administrador role (#268)', async () => {
    const { deps, tokens, store, sent } = setup();
    const refused = await post(deps, 'member-add', tokens.admin, { email: NOBODY.email, role: 'ADMIN' });
    expect(refused.status).toBe(403);
    expect(await body(refused)).toEqual({ error: 'owner_only' });
    // Nor by inviting an address that has no account yet.
    expect((await post(deps, 'member-add', tokens.admin, { email: 'nova@ufcg.edu.br', role: 'ADMIN' })).status).toBe(403);
    expect(store.invites).toEqual([]);
    expect(store.members.some((m) => m.userId === NOBODY.id)).toBe(false);
    expect(sent).toEqual([]);
    // An administrator still gives the two roles below theirs.
    expect((await post(deps, 'member-add', tokens.admin, { email: NOBODY.email, role: 'ORGANIZER' })).status).toBe(200);
    expect((await post(deps, 'member-add', tokens.admin, { email: NOBODY.email, role: 'REVIEWER' })).status).toBe(200);

    store.members.push({ eventId: EVENT.id, userId: 'user-admin-2', email: 'thays@ufcg.edu.br', fullName: 'Thays', role: 'ADMIN' });
    store.users.push({ id: 'user-admin-2', email: 'thays@ufcg.edu.br', fullName: 'Thays' });
    const takeAway = await post(deps, 'member-remove', tokens.admin, { email: 'thays@ufcg.edu.br', role: 'ADMIN' });
    expect(takeAway.status).toBe(403);
    expect(store.members.some((m) => m.userId === 'user-admin-2' && m.role === 'ADMIN')).toBe(true);

    expect((await post(deps, 'member-add', tokens.platform, { email: NOBODY.email, role: 'ADMIN' })).status).toBe(200);
    expect(store.members.some((m) => m.userId === NOBODY.id && m.role === 'ADMIN')).toBe(true);
    expect((await post(deps, 'member-remove', tokens.platform, { email: 'thays@ufcg.edu.br', role: 'ADMIN' })).status).toBe(200);
    expect(store.members.some((m) => m.userId === 'user-admin-2')).toBe(false);
  });

  it('does not let an administrator remove their own administrator role', async () => {
    const { deps, tokens, store } = setup();
    const response = await post(deps, 'member-remove', tokens.admin, { email: ADMIN.email, role: 'ADMIN' });
    expect(response.status).toBe(409);
    expect(await body(response)).toEqual({ error: 'cannot_remove_self' });
    expect(store.members.some((m) => m.userId === ADMIN.id && m.role === 'ADMIN')).toBe(true);
  });

  it('lets the owner take the administrator role off their own account, and they still open the panel (#277)', async () => {
    const { deps, tokens, store } = setup();
    store.members.push({ eventId: EVENT.id, userId: PLATFORM.id, email: PLATFORM.email, fullName: 'Rodrigo Dono', role: 'ADMIN' });
    const response = await post(deps, 'member-remove', tokens.platform, { email: PLATFORM.email, role: 'ADMIN' });
    expect(response.status).toBe(200);
    expect(store.members.some((m) => m.userId === PLATFORM.id)).toBe(false);
    const after = await body(await get(deps, 'members', tokens.platform));
    expect(after).toMatchObject({ role: 'ADMIN', owner: true, canManage: ['ADMIN', 'ORGANIZER', 'REVIEWER'] });
  });

  it.each([
    ['an unknown role', { email: 'x@y.org', role: 'OWNER' }, 'invalid_role'],
    ['a role the panel does not manage', { email: 'x@y.org', role: 'FINANCE' }, 'invalid_role'],
    ['a bad e-mail', { email: 'x@', role: 'REVIEWER' }, 'invalid_email'],
  ])('refuses %s', async (_name, data, error) => {
    const { deps, tokens, store } = setup();
    const response = await post(deps, 'member-add', tokens.admin, data);
    expect(response.status).toBe(400);
    expect(await body(response)).toEqual({ error });
    expect(store.audits).toEqual([]);
  });

  it('gives the role even when the e-mail about it cannot be sent', async () => {
    const { deps, tokens, store } = setup({ failSends: true });
    expect((await post(deps, 'member-add', tokens.admin, { email: NOBODY.email, role: 'REVIEWER' })).status).toBe(200);
    expect(store.members.some((m) => m.userId === NOBODY.id)).toBe(true);
  });
});

describe('requests to bring a registration into an account', () => {
  const start = () => {
    const ctx = setup();
    const registration = ctx.store.seed({ fullName: 'Maria Antiga', email: 'antigo@outlook.com' });
    ctx.store.links.push({
      id: 'link-1',
      eventId: EVENT.id,
      status: 'NEEDS_ORGANISER',
      createdAt: NOW.toISOString(),
      registrationId: registration.id,
      registrationName: 'Maria Antiga',
      registrationEmail: 'antigo@outlook.com',
      registrationDeleted: false,
      accountId: NOBODY.id,
      accountName: 'Pessoa Comum',
      accountEmail: NOBODY.email,
    });
    return { ...ctx, registration };
  };

  it('shows the administrator both sides of each request', async () => {
    const { deps, tokens } = start();
    const data = await body(await get(deps, 'link-requests', tokens.admin));
    expect(data.requests).toEqual([
      expect.objectContaining({ id: 'link-1', registrationName: 'Maria Antiga', registrationEmail: 'antigo@outlook.com', accountName: 'Pessoa Comum', accountEmail: NOBODY.email }),
    ]);
  });

  it('approving links the registration, closes the request, tells the person and logs who decided', async () => {
    const { deps, tokens, store, registration, outbox } = start();
    expect((await post(deps, 'link-decide', tokens.admin, { id: 'link-1', approve: true })).status).toBe(200);
    expect(registration.userId).toBe(NOBODY.id);
    expect(store.links[0]!.status).toBe('CONFIRMED');
    expect(outbox.notifications).toEqual([{ userId: NOBODY.id, eventId: EVENT.id, kind: 'link.approved', data: {} }]);
    expect(store.audits[0]).toMatchObject({ actorId: ADMIN.id, action: 'link.approve', entityId: registration.id, meta: { accountId: NOBODY.id } });
    // Decided once: it is no longer waiting.
    expect((await post(deps, 'link-decide', tokens.admin, { id: 'link-1', approve: true })).status).toBe(404);
  });

  it('refusing closes the request and links nothing', async () => {
    const { deps, tokens, store, registration, outbox } = start();
    expect((await post(deps, 'link-decide', tokens.admin, { id: 'link-1', approve: false })).status).toBe(200);
    expect(registration.userId).toBeNull();
    expect(store.links[0]!.status).toBe('REJECTED');
    expect(outbox.notifications[0]!.kind).toBe('link.rejected');
  });

  it('anything but an explicit yes is a refusal', async () => {
    const { deps, tokens, registration } = start();
    await post(deps, 'link-decide', tokens.admin, { id: 'link-1', approve: 'true' });
    expect(registration.userId).toBeNull();
  });

  it.each([
    ['the registration already has an account', (r: { userId: string | null }) => { r.userId = 'someone-else'; }],
    ['the registration was deleted', (r: { deletedAt: string | null }) => { r.deletedAt = NOW.toISOString(); }],
  ])('cannot approve when %s, and leaves the request waiting', async (_name, change) => {
    const { deps, tokens, store, registration } = start();
    change(registration);
    const response = await post(deps, 'link-decide', tokens.admin, { id: 'link-1', approve: true });
    expect(response.status).toBe(409);
    expect(await body(response)).toEqual({ error: 'cannot_link' });
    expect(store.links[0]!.status).toBe('NEEDS_ORGANISER');
  });

  it('cannot approve when the account already has a registration in the edition', async () => {
    const { deps, tokens, store, registration } = start();
    store.seed({ email: NOBODY.email, userId: NOBODY.id });
    expect((await post(deps, 'link-decide', tokens.admin, { id: 'link-1', approve: true })).status).toBe(409);
    expect(registration.userId).toBeNull();
  });

  it('does not reach a request of another edition', async () => {
    const { deps, tokens, store } = start();
    store.links[0]!.eventId = OTHER_EVENT.id;
    expect((await post(deps, 'link-decide', tokens.admin, { id: 'link-1', approve: true })).status).toBe(404);
    expect((await body(await get(deps, 'link-requests', tokens.admin))).requests).toEqual([]);
  });
});

describe('telling the organisers of a new registration', () => {
  const registration = { id: 'reg-new', eventId: EVENT.id, eventSlug: '2027', fullName: 'Nova Pessoa', category: 'ESTUDANTE_GRADUACAO' };

  it('e-mails administrators and organisers once each, not reviewers, and leaves a notice in the site', async () => {
    const { deps, sent, outbox } = setup();
    await announceRegistration(registration, deps, NOW);
    expect(sent.map((m) => m.to).sort()).toEqual([ADMIN.email, ORGANISER.email].sort());
    expect(sent[0]!.subject).toBe('Nova inscrição: Nova Pessoa');
    expect(sent[0]!.text).toContain('Categoria: Estudante de graduação.');
    expect(sent[0]!.text).toContain('https://dev.sieamb.org/2027/painel');
    expect(outbox.notifications.map((n) => n.userId).sort()).toEqual([ADMIN.id, ORGANISER.id].sort());
    expect(outbox.notifications[0]).toMatchObject({ kind: 'organiser.registration.new', data: { fullName: 'Nova Pessoa' } });
    // The form's notice can run again: nobody is e-mailed twice.
    await announceRegistration(registration, deps, NOW);
    expect(sent).toHaveLength(2);
  });

  it('e-mails someone with both roles only once', async () => {
    const { deps, store, sent } = setup();
    store.members.push({ eventId: EVENT.id, userId: ADMIN.id, email: ADMIN.email, fullName: 'Najara Escarião', role: 'ORGANIZER' });
    await announceRegistration(registration, deps, NOW);
    expect(sent.filter((m) => m.to === ADMIN.email)).toHaveLength(1);
  });

  it('does nothing for an edition with no organisers', async () => {
    const { deps, sent, outbox } = setup();
    await announceRegistration({ ...registration, eventId: OTHER_EVENT.id, eventSlug: '2025' }, deps, NOW);
    expect(sent).toEqual([]);
    expect(outbox.notifications).toEqual([]);
  });
});

/** A registered group of `count` people, for announcements bigger than one batch. */
function ctxGroups(deps: AdminDeps, count: number) {
  (deps.store as unknown as { groups: Record<string, { email: string; fullName: string }[]> }).groups = {
    registered: Array.from({ length: count }, (_, i) => ({ email: `pessoa${i}@ufcg.edu.br`, fullName: `Pessoa ${i}` })),
    authors: [],
    reviewers: [],
    organisers: [],
  };
}

describe('announcements (#221)', () => {
  const start = () => {
    const ctx = setup();
    ctx.store.groups = {
      registered: [
        { email: 'paula@outlook.com', fullName: 'Paula Nunes' },
        { email: NOBODY.email, fullName: 'Pessoa Comum' },
      ],
      authors: [
        { email: NOBODY.email, fullName: '' },
        { email: 'autora@ufrn.br', fullName: 'Autora Sem Conta' },
      ],
      reviewers: [{ email: REVIEWER.email, fullName: 'Avaliador Um' }],
      organisers: [{ email: ORGANISER.email, fullName: 'Viviane Farias' }],
    };
    const send = (token: string, data: Record<string, unknown>) =>
      post(ctx.deps, 'announce', token, { audience: 'all', subject: 'Prazo prorrogado', body: 'As submissões foram prorrogadas.\n\nNovo prazo: 15/02/2027.', ...data });
    return { ...ctx, send };
  };

  it('says how many people each group has, counting a person once', async () => {
    const { deps, tokens } = start();
    const data = await body(await get(deps, 'audiences', tokens.organiser));
    expect(data.counts).toEqual({ all: 5, registered: 2, authors: 2, reviewers: 1, organisers: 1 });
  });

  it('records it, sends one e-mail per person in the same request, and leaves a notice for accounts (#281)', async () => {
    const { send, tokens, store, outbox, sent } = start();
    const response = await send(tokens.organiser, {});
    expect(response.status).toBe(201);
    expect(await body(response)).toEqual({ ok: true, recipients: 5, sentNow: 5, waiting: 0 });
    expect(store.announcements[0]).toMatchObject({ senderId: ORGANISER.id, audience: 'all', subject: 'Prazo prorrogado', recipients: 5 });
    expect(store.announcements[0]!.emails.sort()).toEqual(['autora@ufrn.br', REVIEWER.email, 'paula@outlook.com', NOBODY.email, ORGANISER.email].sort());
    // Sent while the person waits: the background job seldom runs (#273).
    expect(sent.map((m) => m.to).sort()).toEqual(['autora@ufrn.br', REVIEWER.email, 'paula@outlook.com', NOBODY.email, ORGANISER.email].sort());
    expect(outbox.rows).toHaveLength(5);
    expect(outbox.rows.every((r) => r.status === 'SENT')).toBe(true);
    const mail = sent.find((m) => m.to === NOBODY.email)!;
    expect(mail.subject).toBe('Prazo prorrogado (II SIEAmB)');
    // The entry with a name wins over the one without.
    expect(mail.text).toContain('Olá, Pessoa.');
    expect(mail.text).toContain('As submissões foram prorrogadas.\n\nNovo prazo: 15/02/2027.');
    expect(mail.text).toContain('Você recebe este comunicado porque');
    expect(mail.text).toContain('https://dev.sieamb.org/2027/notificacoes');
    // In the site: only the people who have an account.
    expect(outbox.notifications.map((n) => n.userId).sort()).toEqual([NOBODY.id, ORGANISER.id, REVIEWER.id].sort());
    expect(outbox.notifications[0]).toMatchObject({ kind: 'announcement', eventId: EVENT.id, data: { subject: 'Prazo prorrogado' } });
    expect(store.audits[0]).toMatchObject({ actorId: ORGANISER.id, action: 'announcement.send', meta: { audience: 'all', recipients: 5 } });
  });

  it('leaves for the background job what does not fit in the time it has, and says how many (#281)', async () => {
    const { send, tokens, outbox, sent, deps } = start();
    // A clock that jumps 30 seconds each time it is read: the first batch runs, the second does not start.
    let ticks = 0;
    deps.clock = () => (ticks += 1) * 30_000;
    ctxGroups(deps, 25);
    const response = await send(tokens.organiser, { audience: 'registered' });
    const answer = await body(response);
    expect(answer).toMatchObject({ ok: true, recipients: 25, sentNow: 10, waiting: 15 });
    expect(sent).toHaveLength(10);
    expect(outbox.rows.filter((r) => r.status === 'PENDING')).toHaveLength(15);
  });

  it('gives up on sending now when the sender is down, keeps everything queued, and still records the announcement', async () => {
    const ctx = setup({ failSends: true });
    ctx.store.groups = { registered: [{ email: 'paula@outlook.com', fullName: 'Paula Nunes' }, { email: NOBODY.email, fullName: 'Pessoa Comum' }], authors: [], reviewers: [], organisers: [] };
    const response = await post(ctx.deps, 'announce', ctx.tokens.organiser, { audience: 'registered', subject: 'Prazo prorrogado', body: 'As submissões foram prorrogadas.' });
    expect(response.status).toBe(201);
    expect(await body(response)).toEqual({ ok: true, recipients: 2, sentNow: 0, waiting: 2 });
    expect(ctx.sent).toEqual([]);
    // One try each, not a loop until the attempts run out: the background job has the rest.
    expect(ctx.outbox.rows.map((r) => `${r.status}:${r.attempts}`)).toEqual(['PENDING:1', 'PENDING:1']);
    expect(ctx.store.announcements).toHaveLength(1);
  });

  it('counts an address that is never mailed as dealt with, not as waiting', async () => {
    const { send, tokens, store, sent } = start();
    store.groups.reviewers = [
      { email: REVIEWER.email, fullName: 'Avaliador Um' },
      { email: 'demo.helena@example.com', fullName: 'Helena Demo' },
    ];
    expect(await body(await send(tokens.organiser, { audience: 'reviewers' }))).toEqual({ ok: true, recipients: 2, sentNow: 1, waiting: 0 });
    expect(sent.map((m) => m.to)).toEqual([REVIEWER.email]);
  });

  it.each([
    ['registered', ['paula@outlook.com', NOBODY.email]],
    ['authors', [NOBODY.email, 'autora@ufrn.br']],
    ['reviewers', [REVIEWER.email]],
    ['organisers', [ORGANISER.email]],
  ] as const)('sends to %s only', async (audience, emails) => {
    const { send, tokens, outbox } = start();
    await send(tokens.admin, { audience });
    expect(outbox.rows.map((r) => r.to).sort()).toEqual([...emails].sort());
  });

  it('does not put the administrator in any group by role alone', async () => {
    const { send, tokens, outbox } = start();
    await send(tokens.admin, { audience: 'all' });
    expect(outbox.rows.some((r) => r.to === ADMIN.email)).toBe(false);
  });

  it('escapes what the organiser typed', async () => {
    const { send, tokens, sent } = start();
    await send(tokens.admin, { audience: 'reviewers', body: 'Vejam <script>alert(1)</script> este aviso.' });
    expect(sent[0]!.html).toContain('&lt;script&gt;');
    expect(sent[0]!.html).not.toContain('<script>');
  });

  it.each([
    ['an unknown group', { audience: 'everyone-on-earth' }, 'invalid_audience'],
    ['a four-letter subject', { subject: 'Oi!!' }, 'invalid_subject'],
    ['a subject over 150 characters', { subject: 'x'.repeat(151) }, 'invalid_subject'],
    ['a nine-character message', { body: 'curtinho.' }, 'invalid_body'],
    ['a message over 5000 characters', { body: 'x'.repeat(5001) }, 'invalid_body'],
    ['a message that is not text', { body: 42 }, 'invalid_body'],
  ])('refuses %s', async (_name, data, error) => {
    const { send, tokens, store, outbox } = start();
    const response = await send(tokens.admin, data);
    expect(response.status).toBe(400);
    expect(await body(response)).toEqual({ error });
    expect(store.announcements).toEqual([]);
    expect(outbox.rows).toEqual([]);
  });

  it('refuses to send to a group with nobody in it', async () => {
    const { send, tokens, store } = start();
    store.groups.reviewers = [];
    const response = await send(tokens.admin, { audience: 'reviewers' });
    expect(response.status).toBe(400);
    expect(await body(response)).toEqual({ error: 'no_recipients' });
  });

  it(`stops one sender after ${10} announcements in an hour`, async () => {
    const { send, tokens } = start();
    for (let i = 0; i < 10; i += 1) expect((await send(tokens.admin, { subject: `Aviso número ${i}` })).status).toBe(201);
    expect((await send(tokens.admin, {})).status).toBe(429);
    // Another sender is not held back.
    expect((await send(tokens.organiser, {})).status).toBe(201);
  });

  it('is still recorded when the e-mails cannot be queued', async () => {
    const { send, tokens, store, outbox, logs } = start();
    outbox.enqueueOutboxBulk = async () => {
      throw new Error('db down');
    };
    expect((await send(tokens.admin, {})).status).toBe(201);
    expect(store.announcements).toHaveLength(1);
    expect(logs.some((l) => l.event === 'announcement_delivery_failed')).toBe(true);
  });

  it.each(['reviewer', 'nobody'] as const)('cannot be sent or read by a %s', async (who) => {
    const { send, tokens, deps, store } = start();
    expect((await send(tokens[who], {})).status).toBe(404);
    expect((await get(deps, 'announcements', tokens[who])).status).toBe(404);
    expect((await get(deps, 'audiences', tokens[who])).status).toBe(404);
    expect(store.announcements).toEqual([]);
  });

  it('keeps the history: who sent what, to which group, to how many and when', async () => {
    const { send, tokens, deps } = start();
    await send(tokens.organiser, { audience: 'authors', subject: 'Primeiro aviso' });
    const data = await body(await get(deps, 'announcements', tokens.admin));
    expect(data.announcements).toEqual([
      { id: expect.any(String), audience: 'authors', subject: 'Primeiro aviso', body: 'As submissões foram prorrogadas.\n\nNovo prazo: 15/02/2027.', recipients: 2, senderName: 'Viviane Farias', createdAt: NOW.toISOString() },
    ]);
  });
});

describe('registration and papers side by side (#225)', () => {
  const paper = (n: number, emails: string[], over: Record<string, unknown> = {}) => ({
    eventId: EVENT.id, id: `p${n}`, number: n, title: `Trabalho ${n}`, modality: 'ARTIGO', areaRef: 'a1', status: 'SUBMITTED',
    fileName: 'a.pdf', filePages: 13, createdAt: NOW.toISOString(), updatedAt: NOW.toISOString(), deletedAt: null as string | null, deletedReason: null,
    reviewers: [] as { userId: string; fullName: string; email: string }[],
    authors: emails.map((email, i) => ({ position: i + 1, fullName: `Autor ${i + 1}`, email })),
    ...over,
  });

  it('counts the standing papers of each registered person, as main author or co-author', async () => {
    const { deps, tokens, store } = setup();
    store.seed({ email: 'duas@x.org' });
    store.seed({ email: 'uma@x.org' });
    store.seed({ email: 'nenhuma@x.org' });
    store.submissions.push(
      paper(1, ['duas@x.org', 'uma@x.org']),
      paper(2, ['outro@x.org', 'duas@x.org']),
      paper(3, ['duas@x.org'], { deletedAt: NOW.toISOString() }),
      paper(4, ['duas@x.org'], { eventId: OTHER_EVENT.id }),
    );
    const data = await body(await get(deps, 'registrations', tokens.organiser));
    expect(Object.fromEntries(data.registrations.map((r) => [r.email, r.papers]))).toEqual({ 'duas@x.org': 2, 'uma@x.org': 1, 'nenhuma@x.org': 0 });
  });

  it('shows beside each author the state of their registration, or none', async () => {
    const { deps, tokens, store } = setup();
    store.seed({ email: 'paga@x.org', payments: [{ status: 'APPROVED', amountCents: 5000, paidAt: null }] });
    store.seed({ email: 'deve@x.org' });
    store.seed({ email: 'isenta@x.org', manualStatus: 'EXEMPT' });
    store.seed({ email: 'apagada@x.org', deletedAt: NOW.toISOString() });
    store.submissions.push(paper(1, ['paga@x.org', 'deve@x.org', 'isenta@x.org', 'apagada@x.org', 'semnada@x.org']));
    const data = await body(await get(deps, 'submissions', tokens.organiser));
    const authors = data.submissions[0]!.authors as { email: string; registration: string | null }[];
    expect(Object.fromEntries(authors.map((a) => [a.email, a.registration]))).toEqual({
      'paga@x.org': 'PAID',
      'deve@x.org': 'UNPAID',
      'isenta@x.org': 'EXEMPT',
      'apagada@x.org': null,
      'semnada@x.org': null,
    });
    expect(data.submissions[0]!.authorRegistered).toBe(true);
  });
});

describe('payment reminders at the click of a button (#225)', () => {
  const remind = (deps: AdminDeps, token: string | undefined, data: Record<string, unknown> = {}) => post(deps, 'remind', token, data);

  it('needs a login and a role in the edition', async () => {
    const { deps, tokens, store, reminders } = setup();
    const r = store.seed();
    expect((await remind(deps, undefined, { id: r.id })).status).toBe(401);
    expect((await remind(deps, tokens.nobody, { id: r.id })).status).toBe(404);
    expect((await remind(deps, tokens.reviewer, { id: r.id })).status).toBe(404);
    expect(reminders).toEqual([]);
  });

  it.each(['admin', 'organiser'] as const)('lets an %s remind one unpaid person on the spot, and logs it', async (who) => {
    const { deps, tokens, store, reminders } = setup();
    const r = store.seed();
    const response = await remind(deps, tokens[who], { id: r.id });
    expect(response.status).toBe(200);
    expect(await body(response)).toEqual({ ok: true, outcome: 'sent' });
    // 2026-12-01 15:00 in Brazil: the key carries the Brazilian day.
    expect(reminders).toEqual([{ id: r.id, key: `manual:${r.id}:2026-12-01`, deliver: true }]);
    expect(store.audits[0]).toMatchObject({ action: 'registration.remind', entityId: r.id, meta: { outcome: 'sent' } });
  });

  it('reminds someone whose boleto is still waiting', async () => {
    const { deps, tokens, store, reminders } = setup();
    const r = store.seed({ payments: [{ status: 'PENDING', amountCents: 5000, paidAt: null }] });
    expect((await remind(deps, tokens.organiser, { id: r.id })).status).toBe(200);
    expect(reminders).toHaveLength(1);
  });

  it('sends only one a day to the same person, whoever clicks', async () => {
    const { deps, tokens, store, reminders } = setup();
    const r = store.seed();
    await remind(deps, tokens.admin, { id: r.id });
    const again = await remind(deps, tokens.organiser, { id: r.id });
    expect(again.status).toBe(409);
    expect(await body(again)).toEqual({ error: 'already_reminded' });
    expect(reminders).toHaveLength(1);
    // The next day in Brazil it can go again; 23:30 in Brazil is still the same day although UTC has moved on.
    deps.now = () => new Date('2026-12-01T23:30:00-03:00');
    expect((await remind(deps, tokens.admin, { id: r.id })).status).toBe(409);
    deps.now = () => new Date('2026-12-02T00:30:00-03:00');
    expect((await remind(deps, tokens.admin, { id: r.id })).status).toBe(200);
    expect(reminders.map((x) => x.key)).toEqual([`manual:${r.id}:2026-12-01`, `manual:${r.id}:2026-12-02`]);
  });

  it.each([
    ['who paid', { payments: [{ status: 'APPROVED' as const, amountCents: 5000, paidAt: null }] }, 409, 'not_remindable'],
    ['confirmed by hand', { manualStatus: 'CONFIRMED' as const }, 409, 'not_remindable'],
    ['exempt', { manualStatus: 'EXEMPT' as const }, 409, 'not_remindable'],
    ['cancelled', { manualStatus: 'CANCELLED' as const }, 409, 'not_remindable'],
    ['deleted', { deletedAt: NOW.toISOString() }, 404, 'registration_not_found'],
    ['of another edition', { eventId: OTHER_EVENT.id }, 404, 'registration_not_found'],
  ])('never reminds someone %s', async (_name, over, status, error) => {
    const { deps, tokens, store, reminders } = setup();
    const r = store.seed(over);
    const response = await remind(deps, tokens.admin, { id: r.id });
    expect(response.status).toBe(status);
    expect(await body(response)).toEqual({ error });
    expect(reminders).toEqual([]);
  });

  it('reminds everyone who still owes the fee in one go, queued for the background job', async () => {
    const { deps, tokens, store, reminders } = setup();
    const unpaid = store.seed();
    const boleto = store.seed({ payments: [{ status: 'PENDING', amountCents: 5000, paidAt: null }] });
    store.seed({ payments: [{ status: 'APPROVED', amountCents: 5000, paidAt: null }] });
    store.seed({ manualStatus: 'EXEMPT' });
    store.seed({ deletedAt: NOW.toISOString() });
    store.seed({ eventId: OTHER_EVENT.id });
    const response = await remind(deps, tokens.organiser);
    expect(await body(response)).toEqual({ ok: true, queued: 2, already: 0 });
    expect(reminders.map((r) => [r.id, r.deliver]).sort()).toEqual([[unpaid.id, false], [boleto.id, false]].sort());
    // Clicking again the same day sends nothing more.
    expect(await body(await remind(deps, tokens.admin))).toEqual({ ok: true, queued: 0, already: 2 });
    expect(reminders).toHaveLength(2);
    expect(store.audits.at(-1)).toMatchObject({ action: 'registration.remind_all', meta: { queued: 0, already: 2 } });
  });

  it('with a list, reminds only those of the list who still owe', async () => {
    const { deps, tokens, store, reminders } = setup();
    const a = store.seed();
    store.seed();
    const paid = store.seed({ payments: [{ status: 'APPROVED', amountCents: 5000, paidAt: null }] });
    expect(await body(await remind(deps, tokens.admin, { ids: [a.id, paid.id, 'reg-none'] }))).toEqual({ ok: true, queued: 1, already: 0 });
    expect(reminders.map((r) => r.id)).toEqual([a.id]);
  });

  it('says so where payments are not set up', async () => {
    const { deps, tokens, store } = setup();
    deps.remind = undefined;
    const response = await remind(deps, tokens.admin, { id: store.seed().id });
    expect(response.status).toBe(503);
    expect(await body(response)).toEqual({ error: 'reminders_unavailable' });
  });
});

/** The "taken off" notices written, as [who, kind, paper number]. */
const ctx_notices = (_store: unknown, outbox: { notifications: { userId: string; kind: string; data: Record<string, unknown> }[] }) =>
  outbox.notifications.filter((n) => n.kind === 'review.unassigned').map((n) => [n.userId, n.kind, n.data.number]);

describe('reviewers of a paper (#232)', () => {
  const ready = () => {
    const ctx = setup();
    const paper = {
      eventId: EVENT.id, id: 'p1', number: 7, title: 'Governança da água', modality: 'ARTIGO', areaRef: 'a1', status: 'SUBMITTED',
      fileName: 'a.pdf', filePages: 13, createdAt: NOW.toISOString(), updatedAt: NOW.toISOString(), deletedAt: null as string | null, deletedReason: null,
      authors: [{ position: 1, fullName: 'Maria', email: 'maria@x.org' }],
      reviewers: [] as { userId: string; fullName: string; email: string }[],
    };
    ctx.store.submissions.push(paper);
    // A second person with the Avaliador role.
    ctx.store.members.push({ eventId: EVENT.id, userId: NOBODY.id, email: NOBODY.email, fullName: 'Pessoa Comum', role: 'REVIEWER' });
    const assign = (userId: string, token = ctx.tokens.organiser, submissionId = 'p1') =>
      post(ctx.deps, 'reviewer-assign', token, { submissionId, userId });
    const unassign = (userId: string, token = ctx.tokens.organiser, submissionId = 'p1') =>
      post(ctx.deps, 'reviewer-unassign', token, { submissionId, userId });
    return { ...ctx, paper, assign, unassign };
  };

  it('lets an organiser give a paper its one reviewer: under review, the reviewer is told, the list shows it', async () => {
    const { assign, paper, sent, outbox, store, deps, tokens } = ready();
    const response = await assign(REVIEWER.id);
    expect(response.status).toBe(200);
    expect(await body(response)).toEqual({ ok: true });
    expect(paper.reviewers).toEqual([{ userId: REVIEWER.id, fullName: 'Avaliador Um', email: REVIEWER.email }]);
    // One reviewer is enough for the paper to be under review.
    expect(paper.status).toBe('UNDER_REVIEW');
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: REVIEWER.email, subject: 'Trabalho nº 7 para avaliar' });
    expect(sent[0]!.text).toContain('https://dev.sieamb.org/2027/avaliacoes');
    expect(outbox.notifications).toEqual([
      { userId: REVIEWER.id, eventId: EVENT.id, kind: 'review.assigned', data: { number: 7, title: 'Governança da água' } },
    ]);
    expect(store.audits.at(-1)).toMatchObject({ actorId: ORGANISER.id, action: 'reviewer.assign', entity: 'submission', entityId: 'p1' });
    const list = await body(await get(deps, 'submissions', tokens.admin));
    expect(list.submissions[0]).toMatchObject({ status: 'UNDER_REVIEW', reviewers: [{ userId: REVIEWER.id, fullName: 'Avaliador Um' }] });
  });

  it('takes as many reviewers as the organiser wants, and goes back to "enviado" only when the last one leaves', async () => {
    const { assign, unassign, paper, tokens, outbox } = ready();
    expect((await assign(REVIEWER.id)).status).toBe(200);
    expect((await assign(NOBODY.id, tokens.admin)).status).toBe(200);
    expect(paper.reviewers.map((r) => r.userId)).toEqual([REVIEWER.id, NOBODY.id]);
    expect((await unassign(REVIEWER.id)).status).toBe(200);
    expect(paper.reviewers.map((r) => r.userId)).toEqual([NOBODY.id]);
    expect(paper.status).toBe('UNDER_REVIEW');
    expect((await unassign(NOBODY.id)).status).toBe(200);
    expect(paper.reviewers).toEqual([]);
    expect(paper.status).toBe('SUBMITTED');
    expect(outbox.notifications.map((n) => [n.userId, n.kind])).toEqual([
      [REVIEWER.id, 'review.assigned'],
      [NOBODY.id, 'review.assigned'],
      [REVIEWER.id, 'review.unassigned'],
      [NOBODY.id, 'review.unassigned'],
    ]);
  });

  it('asked twice for the same person, keeps one reviewer and sends one e-mail', async () => {
    const { assign, paper, sent, store } = ready();
    await assign(REVIEWER.id);
    const again = await assign(REVIEWER.id);
    expect(again.status).toBe(200);
    expect(await body(again)).toEqual({ ok: true, already: true });
    expect(paper.reviewers).toHaveLength(1);
    expect(sent).toHaveLength(1);
    expect(store.audits.filter((a) => a.action === 'reviewer.assign')).toHaveLength(1);
  });

  it.each([
    ['an organiser', ORGANISER.id],
    ['an administrator', ADMIN.id],
    ['someone with no role', 'user-unknown'],
    ['nobody at all', ''],
  ])('refuses %s as a reviewer: only who holds the Avaliador role', async (_name, userId) => {
    const { assign, paper, sent } = ready();
    const response = await assign(userId);
    expect(response.status).toBe(400);
    expect(await body(response)).toEqual({ error: 'not_a_reviewer' });
    expect(paper.reviewers).toEqual([]);
    expect(paper.status).toBe('SUBMITTED');
    expect(sent).toEqual([]);
  });

  it('refuses a reviewer who is one of the paper’s authors by the document, listed under another e-mail (ADR-010)', async () => {
    const { assign, paper, store } = ready();
    const authors = paper.authors as { position: number; fullName: string; email: string; cpf?: string | null; passport?: string | null; country?: string | null }[];
    Object.assign(store.users.find((u) => u.id === REVIEWER.id)!, { cpf: '52998224725', passport: 'AB123456', country: 'PT' });
    authors.push({ position: 2, fullName: 'Avaliador, por outro endereço', email: 'outro@gmail.com', cpf: '52998224725', passport: null, country: null });
    expect(await body(await assign(REVIEWER.id))).toEqual({ error: 'reviewer_is_author' });
    // By the passport too, and only with its country.
    authors[1] = { position: 2, fullName: 'x', email: 'outro@gmail.com', cpf: null, passport: 'AB123456', country: 'PT' };
    expect(await body(await assign(REVIEWER.id))).toEqual({ error: 'reviewer_is_author' });
    authors[1] = { position: 2, fullName: 'x', email: 'outro@gmail.com', cpf: null, passport: 'AB123456', country: 'ES' };
    expect((await assign(REVIEWER.id)).status).toBe(200);
  });

  it('refuses a reviewer who is one of the paper’s authors, whatever the case of the e-mail', async () => {
    const { assign, paper, sent, store } = ready();
    paper.authors.push({ position: 2, fullName: 'Avaliador Um', email: REVIEWER.email });
    store.members.find((m) => m.userId === REVIEWER.id)!.email = REVIEWER.email.toUpperCase();
    const response = await assign(REVIEWER.id);
    expect(response.status).toBe(409);
    expect(await body(response)).toEqual({ error: 'reviewer_is_author' });
    expect(paper.reviewers).toEqual([]);
    expect(sent).toEqual([]);
  });

  it.each([
    ['a paper that does not exist', (p: { id: string }) => { p.id = 'gone'; }],
    ['a paper of another edition', (p: { eventId: string }) => { p.eventId = OTHER_EVENT.id; }],
    ['a withdrawn paper', (p: { deletedAt: string | null }) => { p.deletedAt = NOW.toISOString(); }],
  ])('does not find %s', async (_name, change) => {
    const { assign, unassign, paper } = ready();
    paper.reviewers.push({ userId: REVIEWER.id, fullName: 'Avaliador Um', email: REVIEWER.email });
    change(paper);
    for (const response of [await assign(NOBODY.id), await unassign(REVIEWER.id)]) {
      expect(response.status).toBe(404);
      expect(await body(response)).toEqual({ error: 'submission_not_found' });
    }
    expect(paper.reviewers).toHaveLength(1);
  });

  it('says so when asked to take off someone who does not review the paper', async () => {
    const { unassign, store } = ready();
    const response = await unassign(REVIEWER.id);
    expect(response.status).toBe(404);
    expect(await body(response)).toEqual({ error: 'reviewer_not_found' });
    expect(store.audits).toEqual([]);
  });

  it.each(['reviewer', 'nobody'] as const)('is not for a %s: the organisation area does not exist for them', async (who) => {
    const { assign, unassign, tokens, paper } = ready();
    expect((await assign(NOBODY.id, tokens[who])).status).toBe(404);
    paper.reviewers.push({ userId: REVIEWER.id, fullName: 'Avaliador Um', email: REVIEWER.email });
    expect((await unassign(REVIEWER.id, tokens[who])).status).toBe(404);
    expect(paper.reviewers).toHaveLength(1);
  });

  it('leaves a decided paper as it is when its reviewers change', async () => {
    const { assign, unassign, paper } = ready();
    paper.status = 'APPROVED';
    await assign(REVIEWER.id);
    expect(paper.status).toBe('APPROVED');
    await unassign(REVIEWER.id);
    expect(paper.status).toBe('APPROVED');
  });

  it('takes a person off every paper when they stop being a reviewer', async () => {
    const { assign, paper, deps, tokens, store, outbox } = ready();
    const second = { ...paper, id: 'p2', number: 8, reviewers: [] as typeof paper.reviewers, status: 'SUBMITTED' };
    const elsewhere = { ...paper, id: 'p3', number: 9, eventId: OTHER_EVENT.id, status: 'UNDER_REVIEW', reviewers: [{ userId: REVIEWER.id, fullName: 'Avaliador Um', email: REVIEWER.email }] };
    store.submissions.push(second, elsewhere);
    await assign(REVIEWER.id);
    await assign(REVIEWER.id, tokens.organiser, 'p2');
    await assign(NOBODY.id, tokens.organiser, 'p2');
    const response = await post(deps, 'member-remove', tokens.organiser, { email: REVIEWER.email, role: 'REVIEWER' });
    expect(response.status).toBe(200);
    // Alone on the first paper: it goes back to "enviado". The second keeps its other reviewer.
    expect(paper).toMatchObject({ reviewers: [], status: 'SUBMITTED' });
    expect(second.reviewers.map((r) => r.userId)).toEqual([NOBODY.id]);
    expect(second.status).toBe('UNDER_REVIEW');
    // Another edition is another matter.
    expect(elsewhere.reviewers).toHaveLength(1);
    // The person is told of each paper they no longer review (#242), and of nothing else.
    expect(ctx_notices(store, outbox)).toEqual([
      [REVIEWER.id, 'review.unassigned', 7],
      [REVIEWER.id, 'review.unassigned', 8],
    ]);
  });
});

describe('closing and reopening submissions (#236)', () => {
  it.each(['organiser', 'admin', 'platform'] as const)('lets the %s close them and reopen them, on the record', async (who) => {
    const { deps, tokens, store } = setup();
    const actor = { organiser: ORGANISER, admin: ADMIN, platform: { id: 'user-root' } }[who];
    const before = await body(await get(deps, 'submissions', tokens[who]));
    expect(before.closed).toBeNull();

    const closed = await post(deps, 'submissions-close', tokens[who], {});
    expect(closed.status).toBe(200);
    const answer = await body(closed);
    expect(answer).toMatchObject({ ok: true, changed: true, closed: { closedAt: NOW.toISOString() } });
    expect(store.closed.has(EVENT.id)).toBe(true);
    expect(store.audits.at(-1)).toMatchObject({ actorId: actor.id, action: 'submissions.close', entity: 'event', entityId: EVENT.id });
    expect((await body(await get(deps, 'submissions', tokens[who]))).closed).toEqual(answer.closed);

    const reopened = await post(deps, 'submissions-reopen', tokens[who], {});
    expect(await body(reopened)).toEqual({ ok: true, changed: true, closed: null });
    expect(store.closed.has(EVENT.id)).toBe(false);
    expect(store.audits.at(-1)).toMatchObject({ action: 'submissions.reopen' });
  });

  it('says who closed them', async () => {
    const { deps, tokens } = setup();
    await post(deps, 'submissions-close', tokens.organiser, {});
    const list = await body(await get(deps, 'submissions', tokens.admin));
    expect(list.closed).toEqual({ closedAt: NOW.toISOString(), closedBy: 'Viviane Farias' });
  });

  it('pressed twice, keeps the first closing and writes one line in the record', async () => {
    const { deps, tokens, store } = setup();
    await post(deps, 'submissions-close', tokens.organiser, {});
    const again = await post(deps, 'submissions-close', tokens.admin, {});
    expect(again.status).toBe(200);
    expect(await body(again)).toMatchObject({ changed: false, closed: { closedBy: 'Viviane Farias' } });
    expect(store.audits.filter((a) => a.action === 'submissions.close')).toHaveLength(1);
    // Reopening what is open changes nothing either.
    await post(deps, 'submissions-reopen', tokens.admin, {});
    expect(await body(await post(deps, 'submissions-reopen', tokens.admin, {}))).toEqual({ ok: true, changed: false, closed: null });
    expect(store.audits.filter((a) => a.action === 'submissions.reopen')).toHaveLength(1);
  });

  it.each(['reviewer', 'nobody'] as const)('is not for a %s', async (who) => {
    const { deps, tokens, store } = setup();
    expect((await post(deps, 'submissions-close', tokens[who], {})).status).toBe(404);
    store.closed.set(EVENT.id, { closedAt: NOW.toISOString(), closedBy: 'Viviane Farias' });
    expect((await post(deps, 'submissions-reopen', tokens[who], {})).status).toBe(404);
    expect(store.closed.has(EVENT.id)).toBe(true);
    expect(store.audits).toEqual([]);
  });

  it('closes one edition and leaves the others alone', async () => {
    const { deps, tokens, store } = setup();
    await post(deps, 'submissions-close', tokens.organiser, {});
    expect([...store.closed.keys()]).toEqual([EVENT.id]);
  });
});

describe('what is about test data stays among test accounts (#255)', () => {
  const TEST_ORG = { id: 'user-test-org', email: 'e2e+r1a1-organizadora-x1@sieamb.org' };
  const withTestOrganiser = () => {
    const ctx = setup();
    ctx.store.users.push({ id: TEST_ORG.id, email: TEST_ORG.email, fullName: 'Organizadora E2E' });
    ctx.store.members.push({ eventId: EVENT.id, userId: TEST_ORG.id, email: TEST_ORG.email, fullName: 'Organizadora E2E', role: 'ORGANIZER' });
    return ctx;
  };
  const registration = { id: 'reg-t', eventId: EVENT.id, eventSlug: '2027', fullName: 'Conta de Teste E2E', category: 'ESTUDANTE_POS' };

  it('does not tell the real organisers of a test registration, by e-mail or in the site', async () => {
    const { deps, sent, outbox } = withTestOrganiser();
    await announceRegistration({ ...registration, email: 'e2e+r1a1-inscrita-ab12@sieamb.org' }, deps, NOW);
    expect(sent).toEqual([]);
    // The test organiser still gets the notice, which is what the browser tests look for.
    expect(outbox.notifications.map((n) => n.userId)).toEqual([TEST_ORG.id]);
  });

  it.each(['maria@ufcg.edu.br', 'e2e@sieamb.org', 'e2e+x@gmail.com', undefined])(
    'tells every organiser of a real registration (%s)',
    async (email) => {
      const { deps, sent, outbox } = withTestOrganiser();
      await announceRegistration({ ...registration, ...(email ? { email } : {}) }, deps, NOW);
      expect(sent.map((m) => m.to).sort()).toEqual([ADMIN.email, ORGANISER.email].sort());
      expect(outbox.notifications.map((n) => n.userId).sort()).toEqual([ADMIN.id, ORGANISER.id, TEST_ORG.id].sort());
    },
  );

  it('keeps an announcement written by a test account among test addresses', async () => {
    const ctx = withTestOrganiser();
    ctx.store.groups = {
      registered: [{ email: 'paula@outlook.com', fullName: 'Paula Nunes' }, { email: 'e2e+r1a1-inscrita-ab12@sieamb.org', fullName: 'Conta de Teste' }],
      authors: [],
      reviewers: [{ email: REVIEWER.email, fullName: 'Avaliador Um' }, { email: 'e2e+r1a1-avaliadora-cd34@sieamb.org', fullName: 'Avaliadora E2E' }],
      organisers: [{ email: ORGANISER.email, fullName: 'Viviane Farias' }],
    };
    const token = ctx.auth.login({ id: TEST_ORG.id, email: TEST_ORG.email, emailConfirmed: true }, 'tok-test-org');
    const send = (who: string, audience: string) =>
      post(ctx.deps, 'announce', who, { audience, subject: 'Comunicado de teste', body: 'Texto de um comunicado de teste, com tamanho suficiente.' });
    const response = await send(token, 'all');
    expect(response.status).toBe(201);
    expect(ctx.store.announcements.at(-1)!.emails.sort()).toEqual(['e2e+r1a1-avaliadora-cd34@sieamb.org', 'e2e+r1a1-inscrita-ab12@sieamb.org']);
    // A group with no test address has nobody for a test sender.
    const none = await send(token, 'organisers');
    expect(none.status).toBe(400);
    expect(await body(none)).toEqual({ error: 'no_recipients' });
    // A real organiser reaches everyone, test addresses included (they are simply never mailed).
    await send(ctx.tokens.organiser, 'all');
    expect(ctx.store.announcements.at(-1)!.emails).toHaveLength(5);
  });
});

describe('every account with its roles (#268)', () => {
  const lines = (data: Record<string, unknown>) =>
    (data.accounts as { email: string; roles: string[]; owner: boolean; canEdit: boolean }[]).map(
      (a) => `${a.email} [${a.roles.join(',')}]${a.owner ? ' owner' : ''}${a.canEdit ? ' editable' : ''}`,
    );

  it('shows an administrator everyone, and lets them act on themselves and on people below them', async () => {
    const { deps, tokens, store } = setup();
    store.members.push({ eventId: EVENT.id, userId: ORGANISER.id, email: ORGANISER.email, fullName: 'Viviane Farias', role: 'REVIEWER' });
    const data = await body(await get(deps, 'members', tokens.admin));
    expect(lines(data)).toEqual([
      `${REVIEWER.email} [REVIEWER] editable`,
      `${ADMIN.email} [ADMIN] editable`,
      `${NOBODY.email} [] editable`,
      // The owner is a line like any other to an administrator, with nothing to do on it (#275).
      `${PLATFORM.email} []`,
      `${ORGANISER.email} [ORGANIZER,REVIEWER] editable`,
    ]);
    expect(JSON.stringify(data.accounts)).not.toContain('"owner":true');
    store.members.push({ eventId: EVENT.id, userId: NOBODY.id, email: NOBODY.email, fullName: 'Pessoa Comum', role: 'ADMIN' });
    const again = await body(await get(deps, 'members', tokens.admin));
    expect(lines(again)).toContain(`${NOBODY.email} [ADMIN]`);
  });

  it('lets the owner act on anyone, and shows the owner who the owner is', async () => {
    const { deps, tokens } = setup();
    const data = await body(await get(deps, 'members', tokens.platform));
    expect(lines(data)).toContain(`${PLATFORM.email} [] owner editable`);
    expect(lines(data)).toContain(`${ADMIN.email} [ADMIN] editable`);
    expect((data.accounts as { canEdit: boolean }[]).every((a) => a.canEdit)).toBe(true);
  });

  it('shows an organiser every account without any role above theirs, and nothing to edit (#275)', async () => {
    const { deps, tokens, store } = setup();
    // An administrator who also reviews: the organiser sees the reviewer, not the administrator.
    store.members.push({ eventId: EVENT.id, userId: ADMIN.id, email: ADMIN.email, fullName: 'Najara Escarião', role: 'REVIEWER' });
    store.invites.push({ eventId: EVENT.id, email: 'futura-admin@ufcg.edu.br', role: 'ADMIN' });
    const data = await body(await get(deps, 'members', tokens.organiser));
    expect(lines(data)).toEqual([
      `${REVIEWER.email} [REVIEWER]`,
      `${ADMIN.email} [REVIEWER]`,
      `${NOBODY.email} []`,
      `${PLATFORM.email} []`,
      `${ORGANISER.email} [ORGANIZER]`,
    ]);
    // Nothing in the whole answer says who is an administrator or the owner.
    const text = JSON.stringify(data);
    expect(text).not.toContain('"ADMIN"');
    expect(text).not.toContain('"owner":true');
    expect(text).not.toContain('futura-admin');
    expect(data.owner).toBe(false);
  });

  it('keeps the accounts of a test run among test accounts', async () => {
    const { deps, tokens, store, auth } = setup();
    const run = { id: 'user-run', email: 'e2e+r1a1-admin-x@sieamb.org', emailConfirmed: true };
    store.users.push({ id: run.id, email: run.email, fullName: 'Administradora E2E' });
    store.members.push({ eventId: EVENT.id, userId: run.id, email: run.email, fullName: 'Administradora E2E', role: 'ADMIN' });
    store.invites.push({ eventId: EVENT.id, email: 'e2e+r1a1-convidada@sieamb.org', role: 'REVIEWER' });
    store.users.push({ id: 'user-demo', email: 'demo.helena@example.com', fullName: 'Helena Demo' });
    const real = await body(await get(deps, 'members', tokens.admin));
    expect(JSON.stringify(real)).not.toContain('e2e+');
    // A sample person is not a run account: she stays.
    expect(JSON.stringify(real.accounts)).toContain('demo.helena@example.com');
    const test = await body(await get(deps, 'members', auth.login(run)));
    expect(JSON.stringify(test.accounts)).toContain(run.email);
    expect(JSON.stringify(test.accounts)).toContain(ADMIN.email);
    expect(test.invites).toEqual([{ email: 'e2e+r1a1-convidada@sieamb.org', role: 'REVIEWER' }]);
  });
});

describe('an administrator updates someone else\'s account (#269)', () => {
  it('corrects the name and the institution, logs it and tells the person', async () => {
    const { deps, tokens, store, outbox, sent } = setup();
    const response = await post(deps, 'account-update', tokens.admin, { userId: NOBODY.id, fullName: '  Pessoa Corrigida ', institution: 'UFRN' });
    expect(await body(response)).toEqual({ ok: true, changed: true });
    expect(store.users.find((u) => u.id === NOBODY.id)).toMatchObject({ fullName: 'Pessoa Corrigida', institution: 'UFRN', email: NOBODY.email });
    expect(store.audits[0]).toMatchObject({ actorId: ADMIN.id, action: 'account.update', entity: 'user', entityId: NOBODY.id, meta: { email: NOBODY.email, fields: ['fullName', 'institution'] } });
    expect(outbox.notifications).toEqual([{ userId: NOBODY.id, eventId: EVENT.id, kind: 'account.updated', data: {} }]);
    expect(sent).toEqual([]);
  });

  it('changes nothing, logs nothing and tells nobody when the data is the same', async () => {
    const { deps, tokens, store, outbox } = setup();
    const response = await post(deps, 'account-update', tokens.admin, { userId: NOBODY.id, fullName: 'Pessoa Comum' });
    expect(await body(response)).toEqual({ ok: true, changed: false });
    expect(store.audits).toEqual([]);
    expect(outbox.notifications).toEqual([]);
  });

  it('an administrator never touches the e-mail, the documents or the owner flag, whatever is sent', async () => {
    const { deps, tokens, store } = setup();
    const before = JSON.stringify(store.users.find((u) => u.id === NOBODY.id));
    const response = await post(deps, 'account-update', tokens.admin, { userId: NOBODY.id, email: 'tomada@ufcg.edu.br', cpf: '52998224725', owner: true, isPlatformAdmin: true });
    expect(await body(response)).toEqual({ ok: true, changed: false });
    expect(JSON.stringify(store.users.find((u) => u.id === NOBODY.id))).toBe(before);
  });

  it('refuses a name that is too short, and an account that does not exist', async () => {
    const { deps, tokens, store } = setup();
    const short = await post(deps, 'account-update', tokens.admin, { userId: NOBODY.id, fullName: 'Ab' });
    expect(short.status).toBe(400);
    expect(await body(short)).toEqual({ error: 'invalid_name' });
    for (const userId of ['user-nobody-here', '', undefined, { id: NOBODY.id }]) {
      const missing = await post(deps, 'account-update', tokens.admin, { userId, fullName: 'Alguém Qualquer' });
      expect(missing.status).toBe(404);
      expect(await body(missing)).toEqual({ error: 'account_not_found' });
    }
    expect(store.audits).toEqual([]);
  });

  it('an administrator does not change another administrator nor the owner; the owner changes anyone', async () => {
    const { deps, tokens, store } = setup();
    store.users.push({ id: 'user-admin-2', email: 'thays@ufcg.edu.br', fullName: 'Thays' });
    store.members.push({ eventId: EVENT.id, userId: 'user-admin-2', email: 'thays@ufcg.edu.br', fullName: 'Thays', role: 'ADMIN' });
    for (const userId of ['user-admin-2', PLATFORM.id]) {
      const response = await post(deps, 'account-update', tokens.admin, { userId, fullName: 'Nome Trocado' });
      expect(response.status).toBe(403);
      expect(await body(response)).toEqual({ error: 'owner_only' });
    }
    expect(store.users.some((u) => u.fullName === 'Nome Trocado')).toBe(false);
    // Themselves, yes, and without a notice to themselves.
    expect((await post(deps, 'account-update', tokens.admin, { userId: ADMIN.id, fullName: 'Najara E. Agripino' })).status).toBe(200);
    expect((await post(deps, 'account-update', tokens.platform, { userId: 'user-admin-2', fullName: 'Thays Corrigida' })).status).toBe(200);
    expect(store.users.find((u) => u.id === 'user-admin-2')!.fullName).toBe('Thays Corrigida');
  });

  it('is not for an organiser, a reviewer, someone without a role or a visitor', async () => {
    const { deps, tokens, store } = setup();
    const data = { userId: NOBODY.id, fullName: 'Nome Trocado' };
    expect((await post(deps, 'account-update', tokens.organiser, data)).status).toBe(403);
    expect((await post(deps, 'account-update', tokens.reviewer, data)).status).toBe(404);
    expect((await post(deps, 'account-update', tokens.nobody, data)).status).toBe(404);
    expect((await post(deps, 'account-update', undefined, data)).status).toBe(401);
    expect((await post(deps, 'account-password-link', tokens.organiser, data)).status).toBe(403);
    expect((await post(deps, 'account-password-link', tokens.nobody, data)).status).toBe(404);
    expect((await post(deps, 'account-password-link', undefined, data)).status).toBe(401);
    expect(store.users.find((u) => u.id === NOBODY.id)!.fullName).toBe('Pessoa Comum');
    expect(store.audits).toEqual([]);
  });
});

describe('an administrator sends someone a new-password link (#270)', () => {
  it('e-mails the link to the person only, never returns it, and logs it', async () => {
    const { deps, tokens, store, sent, auth } = setup();
    auth.accounts.set(NOBODY.email, true);
    const response = await post(deps, 'account-password-link', tokens.admin, { userId: NOBODY.id });
    const answer = await body(response);
    expect(answer).toEqual({ ok: true, queued: true });
    expect(JSON.stringify(answer)).not.toContain('recovery-for');
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: NOBODY.email, subject: 'Escolha uma nova senha (II SIEAmB)' });
    expect(sent[0]!.text).toContain(`https://dev.sieamb.org/2027/conta/nova-senha?token_hash=${encodeURIComponent(`recovery-for-${NOBODY.email}`)}&type=recovery`);
    expect(sent[0]!.text).toContain('sua senha atual continua valendo');
    expect(store.audits[0]).toMatchObject({ actorId: ADMIN.id, action: 'account.password_link', entityId: NOBODY.id, meta: { email: NOBODY.email } });
    expect(JSON.stringify(store.audits)).not.toContain('recovery-for');
    // The password itself is never set by anyone but the person.
    expect(auth.passwords).toEqual([]);
  });

  it('says so when the account has no login, and sends nothing', async () => {
    const { deps, tokens, sent, store } = setup();
    const response = await post(deps, 'account-password-link', tokens.admin, { userId: NOBODY.id });
    expect(response.status).toBe(409);
    expect(await body(response)).toEqual({ error: 'account_without_login' });
    expect(sent).toEqual([]);
    expect(store.audits).toEqual([]);
  });

  it('an administrator cannot ask it for another administrator or for the owner', async () => {
    const { deps, tokens, store, sent, auth } = setup();
    auth.accounts.set(PLATFORM.email, true);
    store.users.push({ id: 'user-admin-2', email: 'thays@ufcg.edu.br', fullName: 'Thays' });
    store.members.push({ eventId: EVENT.id, userId: 'user-admin-2', email: 'thays@ufcg.edu.br', fullName: 'Thays', role: 'ADMIN' });
    auth.accounts.set('thays@ufcg.edu.br', true);
    for (const userId of [PLATFORM.id, 'user-admin-2']) {
      const response = await post(deps, 'account-password-link', tokens.admin, { userId });
      expect(response.status).toBe(403);
    }
    expect(sent).toEqual([]);
    expect((await post(deps, 'account-password-link', tokens.platform, { userId: 'user-admin-2' })).status).toBe(200);
    expect(sent.map((m) => m.to)).toEqual(['thays@ufcg.edu.br']);
  });
});

describe('the owner changes what nobody else does: e-mail, CPF and password (#272)', () => {
  const CPF = '52998224725';

  it('changes the e-mail in the login service and in the account, logs it and tells the old address', async () => {
    const { deps, tokens, store, auth, sent } = setup();
    const response = await post(deps, 'account-update', tokens.platform, { userId: NOBODY.id, email: ' Pessoa.Nova@UFRN.br ' });
    expect(await body(response)).toEqual({ ok: true, changed: true });
    expect(auth.emails).toEqual([{ userId: NOBODY.id, email: 'pessoa.nova@ufrn.br' }]);
    expect(store.users.find((u) => u.id === NOBODY.id)!.email).toBe('pessoa.nova@ufrn.br');
    expect(store.audits[0]).toMatchObject({ action: 'account.update', entityId: NOBODY.id, meta: { email: NOBODY.email, newEmail: 'pessoa.nova@ufrn.br', fields: ['email'] } });
    expect(sent.map((m) => m.to)).toEqual([NOBODY.email]);
    expect(sent[0]!.subject).toBe('O e-mail da sua conta foi alterado (II SIEAmB)');
    expect(sent[0]!.text).toContain('pessoa.nova@ufrn.br');
  });

  it('refuses an address another account has, or one that is not an address, and changes nothing', async () => {
    const { deps, tokens, store, auth, sent } = setup();
    auth.accounts.set(ORGANISER.email, true);
    const taken = await post(deps, 'account-update', tokens.platform, { userId: NOBODY.id, email: ORGANISER.email, fullName: 'Nome Que Não Deve Ficar' });
    expect(taken.status).toBe(409);
    expect(await body(taken)).toEqual({ error: 'email_in_use' });
    const invalid = await post(deps, 'account-update', tokens.platform, { userId: NOBODY.id, email: 'sem-arroba' });
    expect(invalid.status).toBe(400);
    expect(await body(invalid)).toEqual({ error: 'invalid_email' });
    expect(store.users.find((u) => u.id === NOBODY.id)).toMatchObject({ email: NOBODY.email, fullName: 'Pessoa Comum' });
    expect(store.audits).toEqual([]);
    expect(sent).toEqual([]);
  });

  it('answers "in use" for the address of another account without asking the login service (#289)', async () => {
    const { deps, tokens, store, auth } = setup();
    const response = await post(deps, 'account-update', tokens.platform, { userId: NOBODY.id, email: REVIEWER.email.toUpperCase() });
    expect(response.status).toBe(409);
    expect(await body(response)).toEqual({ error: 'email_in_use' });
    expect(auth.emails).toEqual([]);
    expect(store.users.find((u) => u.id === NOBODY.id)!.email).toBe(NOBODY.email);
    expect(store.audits).toEqual([]);
  });

  it('puts the login back on the old address when the account cannot take the change', async () => {
    const { deps, tokens, store, auth } = setup();
    // A new address nobody has, together with a CPF another account has: the account row refuses.
    store.users.find((u) => u.id === REVIEWER.id)!.cpf = '52998224725';
    const response = await post(deps, 'account-update', tokens.platform, { userId: NOBODY.id, email: 'nova@ufcg.edu.br', cpf: '52998224725' });
    expect(response.status).toBe(409);
    expect(await body(response)).toEqual({ error: 'document_in_use' });
    expect(auth.emails).toEqual([
      { userId: NOBODY.id, email: 'nova@ufcg.edu.br' },
      { userId: NOBODY.id, email: NOBODY.email },
    ]);
    expect(store.users.find((u) => u.id === NOBODY.id)!.email).toBe(NOBODY.email);
  });

  it('sets, replaces and takes off the CPF, and refuses an invalid one or one another account has', async () => {
    const { deps, tokens, store } = setup();
    expect(await body(await post(deps, 'account-update', tokens.platform, { userId: NOBODY.id, cpf: '529.982.247-25' }))).toEqual({ ok: true, changed: true });
    expect(store.users.find((u) => u.id === NOBODY.id)!.cpf).toBe(CPF);
    // The audit line says the field changed, never the number.
    expect(JSON.stringify(store.audits)).not.toContain(CPF);
    const invalid = await post(deps, 'account-update', tokens.platform, { userId: NOBODY.id, cpf: '111.111.111-11' });
    expect(invalid.status).toBe(400);
    expect(await body(invalid)).toEqual({ error: 'invalid_cpf' });
    const taken = await post(deps, 'account-update', tokens.platform, { userId: ORGANISER.id, cpf: CPF });
    expect(taken.status).toBe(409);
    expect(await body(taken)).toEqual({ error: 'document_in_use' });
    expect(store.users.find((u) => u.id === ORGANISER.id)!.cpf ?? null).toBeNull();
    expect(await body(await post(deps, 'account-update', tokens.platform, { userId: NOBODY.id, cpf: '' }))).toEqual({ ok: true, changed: true });
    expect(store.users.find((u) => u.id === NOBODY.id)!.cpf).toBeNull();
  });

  it('sets, replaces and takes off a passport with its country (ADR-010)', async () => {
    const { deps, tokens, store } = setup();
    const user = () => store.users.find((u) => u.id === NOBODY.id)!;
    expect(await body(await post(deps, 'account-update', tokens.platform, { userId: NOBODY.id, passport: 'ab 123-456', country: 'pt' }))).toEqual({ ok: true, changed: true });
    expect(user()).toMatchObject({ passport: 'AB123456', country: 'PT' });
    // The audit line says which fields changed, never the number.
    expect(store.audits.at(-1)!.meta.fields).toEqual(['passport', 'country']);
    expect(JSON.stringify(store.audits)).not.toContain('AB123456');
    // The same again changes nothing.
    expect(await body(await post(deps, 'account-update', tokens.platform, { userId: NOBODY.id, passport: 'AB123456', country: 'PT' }))).toEqual({ ok: true, changed: false });
    // The country alone can be corrected.
    expect(await body(await post(deps, 'account-update', tokens.platform, { userId: NOBODY.id, passport: 'AB123456', country: 'ES' }))).toEqual({ ok: true, changed: true });
    expect(user()).toMatchObject({ passport: 'AB123456', country: 'ES' });
    // Empty takes it off, and the country with it.
    expect(await body(await post(deps, 'account-update', tokens.platform, { userId: NOBODY.id, passport: '' }))).toEqual({ ok: true, changed: true });
    expect(user().passport).toBeNull();
    expect(user().country).toBeUndefined();
    // Taking off what is not there changes nothing.
    expect(await body(await post(deps, 'account-update', tokens.platform, { userId: NOBODY.id, passport: '' }))).toEqual({ ok: true, changed: false });
  });

  it.each([
    ['a passport that is too short', { passport: 'A1', country: 'PT' }, 'invalid_passport'],
    ['a passport without a country', { passport: 'AB123456' }, 'invalid_country'],
    ['a passport from Brazil', { passport: 'AB123456', country: 'BR' }, 'invalid_country'],
    ['a country that does not exist', { passport: 'AB123456', country: 'ZZ' }, 'invalid_country'],
  ])('refuses %s and writes nothing', async (_name, data, error) => {
    const { deps, tokens, store } = setup();
    const response = await post(deps, 'account-update', tokens.platform, { userId: NOBODY.id, ...data });
    expect(response.status).toBe(400);
    expect(await body(response)).toEqual({ error });
    expect(store.users.find((u) => u.id === NOBODY.id)!.passport ?? null).toBeNull();
    expect(store.audits).toEqual([]);
  });

  it('refuses a passport another account has, and takes the same number from another country', async () => {
    const { deps, tokens, store } = setup();
    Object.assign(store.users.find((u) => u.id === REVIEWER.id)!, { passport: 'AB123456', country: 'PT' });
    const taken = await post(deps, 'account-update', tokens.platform, { userId: NOBODY.id, passport: 'AB123456', country: 'PT' });
    expect(taken.status).toBe(409);
    expect(await body(taken)).toEqual({ error: 'document_in_use' });
    expect((await post(deps, 'account-update', tokens.platform, { userId: NOBODY.id, passport: 'AB123456', country: 'ES' })).status).toBe(200);
  });

  it('keeps the CPF when only the passport changes, and the other way round', async () => {
    const { deps, tokens, store } = setup();
    const user = () => store.users.find((u) => u.id === NOBODY.id)!;
    await post(deps, 'account-update', tokens.platform, { userId: NOBODY.id, cpf: CPF, passport: 'AB123456', country: 'PT' });
    expect(user()).toMatchObject({ cpf: CPF, passport: 'AB123456', country: 'PT' });
    await post(deps, 'account-update', tokens.platform, { userId: NOBODY.id, passport: '' });
    expect(user()).toMatchObject({ cpf: CPF, passport: null });
    await post(deps, 'account-update', tokens.platform, { userId: NOBODY.id, passport: 'ZZ999999', country: 'US' });
    await post(deps, 'account-update', tokens.platform, { userId: NOBODY.id, cpf: '' });
    expect(user()).toMatchObject({ cpf: null, passport: 'ZZ999999', country: 'US' });
  });

  it('an administrator\'s passport and country are ignored, like the CPF', async () => {
    const { deps, tokens, store } = setup();
    const response = await post(deps, 'account-update', tokens.admin, { userId: NOBODY.id, passport: 'AB123456', country: 'PT' });
    expect(await body(response)).toEqual({ ok: true, changed: false });
    expect(store.users.find((u) => u.id === NOBODY.id)!.passport ?? null).toBeNull();
  });

  describe('the owner\'s changes reach the person\'s lines in papers (ADR-010, #352)', () => {
    const base = { eventId: EVENT.id, modality: 'ARTIGO', areaRef: 'a1', status: 'SUBMITTED', fileName: 'a.pdf', filePages: 13, createdAt: NOW.toISOString(), updatedAt: NOW.toISOString(), deletedAt: null, deletedReason: null, reviewers: [] };
    const OLD_CPF = '11144477735';
    const seed = (store: ReturnType<typeof setup>['store']) => {
      Object.assign(store.users.find((u) => u.id === NOBODY.id)!, { cpf: OLD_CPF });
      store.submissions.push(
        { ...base, id: 's1', number: 1, title: 'Dela', authors: [{ position: 1, fullName: 'Pessoa Comum', email: NOBODY.email, cpf: OLD_CPF, passport: null, country: null }, { position: 2, fullName: 'Outra', email: 'outra@x.org', cpf: '39053344705', passport: null, country: null }] },
        { ...base, id: 's2', number: 2, title: 'Em que ela é coautora', authors: [{ position: 1, fullName: 'Líder', email: 'lider@x.org', cpf: '12345678909', passport: null, country: null }, { position: 2, fullName: 'Pessoa Comum', email: NOBODY.email, cpf: OLD_CPF, passport: null, country: null }] },
      );
      return (id: string) => store.submissions.find((s) => s.id === id)!.authors;
    };

    it('a new e-mail replaces the old one on every line of that person, and touches nobody else', async () => {
      const { deps, tokens, store } = setup();
      const authors = seed(store);
      expect(await body(await post(deps, 'account-update', tokens.platform, { userId: NOBODY.id, email: 'nova@ufcg.edu.br' }))).toEqual({ ok: true, changed: true });
      expect(authors('s1').map((a) => a.email)).toEqual(['nova@ufcg.edu.br', 'outra@x.org']);
      expect(authors('s2').map((a) => a.email)).toEqual(['lider@x.org', 'nova@ufcg.edu.br']);
      // Her document went with her lines, unchanged.
      expect(authors('s2')[1]).toMatchObject({ cpf: OLD_CPF });
    });

    it('a corrected CPF replaces the old one on her lines', async () => {
      const { deps, tokens, store } = setup();
      const authors = seed(store);
      await post(deps, 'account-update', tokens.platform, { userId: NOBODY.id, cpf: CPF });
      expect(authors('s1')[0]).toMatchObject({ email: NOBODY.email, cpf: CPF });
      expect(authors('s2')[1]).toMatchObject({ cpf: CPF });
      expect(authors('s1')[1]).toMatchObject({ cpf: '39053344705' });
    });

    it('a passport given by the owner is added to her lines with its country, next to the CPF she has', async () => {
      const { deps, tokens, store } = setup();
      const authors = seed(store);
      await post(deps, 'account-update', tokens.platform, { userId: NOBODY.id, passport: 'ab 123-456', country: 'pt' });
      expect(authors('s2')[1]).toMatchObject({ cpf: OLD_CPF, passport: 'AB123456', country: 'PT' });
    });

    it('an e-mail and a document changed together both arrive', async () => {
      const { deps, tokens, store } = setup();
      const authors = seed(store);
      await post(deps, 'account-update', tokens.platform, { userId: NOBODY.id, email: 'nova@ufcg.edu.br', cpf: CPF });
      expect(authors('s1')[0]).toMatchObject({ email: 'nova@ufcg.edu.br', cpf: CPF });
    });

    it('taking the document off the account leaves her lines as they were', async () => {
      const { deps, tokens, store } = setup();
      const authors = seed(store);
      await post(deps, 'account-update', tokens.platform, { userId: NOBODY.id, cpf: '' });
      expect(authors('s1')[0]).toMatchObject({ cpf: OLD_CPF });
    });

    it('refuses an e-mail that is already another author of one of her papers, and changes nothing', async () => {
      const { deps, tokens, store, auth } = setup();
      const authors = seed(store);
      const response = await post(deps, 'account-update', tokens.platform, { userId: NOBODY.id, email: 'outra@x.org' });
      expect(response.status).toBe(409);
      expect(await body(response)).toEqual({ error: 'email_in_paper' });
      expect(store.users.find((u) => u.id === NOBODY.id)!.email).toBe(NOBODY.email);
      expect(authors('s1').map((a) => a.email)).toEqual([NOBODY.email, 'outra@x.org']);
      expect(auth.emails).toEqual([]);
    });

    it('a change of name alone touches no line', async () => {
      const { deps, tokens, store } = setup();
      const authors = seed(store);
      const before = JSON.stringify(store.submissions);
      await post(deps, 'account-update', tokens.platform, { userId: NOBODY.id, fullName: 'Pessoa Comum da Silva' });
      expect(JSON.stringify(store.submissions)).toBe(before);
      expect(authors('s1')[0]!.fullName).toBe('Pessoa Comum');
    });

    it('when the account cannot take the change, no line is touched', async () => {
      const { deps, tokens, store } = setup();
      const authors = seed(store);
      store.users.find((u) => u.id === REVIEWER.id)!.cpf = CPF;
      const response = await post(deps, 'account-update', tokens.platform, { userId: NOBODY.id, email: 'nova@ufcg.edu.br', cpf: CPF });
      expect(response.status).toBe(409);
      expect(authors('s1')[0]).toMatchObject({ email: NOBODY.email, cpf: OLD_CPF });
    });
  });

  it('shows the passport and its country in the list to the owner only', async () => {
    const { deps, tokens, store } = setup();
    Object.assign(store.users.find((u) => u.id === NOBODY.id)!, { passport: 'AB123456', country: 'PT' });
    const asOwner = (await body(await get(deps, 'members', tokens.platform))) as unknown as { accounts: Record<string, unknown>[] };
    expect(asOwner.accounts.find((a) => a.userId === NOBODY.id)).toMatchObject({ passport: 'AB123456', country: 'PT' });
    // Someone without a passport has no country to show, whatever the column holds.
    expect(asOwner.accounts.find((a) => a.userId === REVIEWER.id)).toMatchObject({ passport: null, country: null });
    for (const token of [tokens.admin, tokens.organiser]) {
      const text = JSON.stringify(await body(await get(deps, 'members', token)));
      expect(text).not.toContain('AB123456');
      expect(text).not.toContain('"passport"');
    }
  });

  it('shows the CPF in the list to the owner only', async () => {
    const { deps, tokens, store } = setup();
    store.users.find((u) => u.id === NOBODY.id)!.cpf = CPF;
    const asOwner = await body(await get(deps, 'members', tokens.platform));
    expect((asOwner.accounts as { userId: string; cpf?: string }[]).find((a) => a.userId === NOBODY.id)!.cpf).toBe(CPF);
    for (const token of [tokens.admin, tokens.organiser]) {
      expect(JSON.stringify(await body(await get(deps, 'members', token)))).not.toContain(CPF);
    }
  });

  it('sets a password, tells the person it changed without saying what it is, and logs it without the password', async () => {
    const { deps, tokens, store, auth, sent } = setup();
    const response = await post(deps, 'account-password-set', tokens.platform, { userId: NOBODY.id, password: 'uma-senha-bem-longa' });
    expect(await body(response)).toEqual({ ok: true });
    expect(auth.passwords).toEqual([{ userId: NOBODY.id, password: 'uma-senha-bem-longa' }]);
    expect(store.audits[0]).toMatchObject({ actorId: PLATFORM.id, action: 'account.password_set', entityId: NOBODY.id });
    expect(JSON.stringify(store.audits)).not.toContain('uma-senha-bem-longa');
    expect(sent.map((m) => m.to)).toEqual([NOBODY.email]);
    expect(sent[0]!.subject).toBe('A senha da sua conta foi alterada (II SIEAmB)');
    expect(`${sent[0]!.text}${sent[0]!.html}`).not.toContain('uma-senha-bem-longa');
  });

  it.each([
    ['too short', 'curta'],
    ['built on the address', 'pessoa-2027-xx'],
    ['missing', undefined],
    ['not text', 1234567890123],
  ])('refuses a password that is %s', async (_label, password) => {
    const { deps, tokens, auth, store } = setup();
    const response = await post(deps, 'account-password-set', tokens.platform, { userId: NOBODY.id, password });
    expect(response.status).toBe(400);
    expect(await body(response)).toEqual({ error: 'weak_password' });
    expect(auth.passwords).toEqual([]);
    expect(store.audits).toEqual([]);
  });

  it('is the owner\'s alone: an administrator is refused the password, and their e-mail and CPF are ignored', async () => {
    const { deps, tokens, store, auth, sent } = setup();
    const refused = await post(deps, 'account-password-set', tokens.admin, { userId: NOBODY.id, password: 'uma-senha-bem-longa' });
    expect(refused.status).toBe(403);
    expect(await body(refused)).toEqual({ error: 'owner_only' });
    // Not even for their own account by this door: Minha área has its own.
    expect((await post(deps, 'account-password-set', tokens.admin, { userId: ADMIN.id, password: 'uma-senha-bem-longa' })).status).toBe(403);
    expect((await post(deps, 'account-password-set', tokens.organiser, { userId: NOBODY.id, password: 'uma-senha-bem-longa' })).status).toBe(403);
    expect((await post(deps, 'account-password-set', tokens.nobody, { userId: NOBODY.id, password: 'uma-senha-bem-longa' })).status).toBe(404);
    expect((await post(deps, 'account-password-set', undefined, { userId: NOBODY.id, password: 'uma-senha-bem-longa' })).status).toBe(401);
    expect(await body(await post(deps, 'account-update', tokens.admin, { userId: NOBODY.id, email: 'tomada@ufcg.edu.br', cpf: CPF }))).toEqual({ ok: true, changed: false });
    expect(auth.passwords).toEqual([]);
    expect(auth.emails).toEqual([]);
    expect(store.users.find((u) => u.id === NOBODY.id)).toMatchObject({ email: NOBODY.email });
    expect(store.users.find((u) => u.id === NOBODY.id)!.cpf ?? null).toBeNull();
    expect(sent).toEqual([]);
  });
});
