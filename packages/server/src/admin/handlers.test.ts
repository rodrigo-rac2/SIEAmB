import { describe, expect, it } from 'vitest';
import { REASON_MIN, announceRegistration, handleAdmin, paymentState, type AdminDeps } from './handlers';
import { ADMIN, EVENT, NOBODY, NOW, ORGANISER, OTHER_EVENT, REVIEWER, call, setup } from './testing';

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
    expect(asAdmin.canManage).toEqual(['ADMIN', 'ORGANIZER', 'REVIEWER']);
    expect(asAdmin.members.map((m) => `${m.email as string}:${m.role as string}`)).toEqual([
      `${ADMIN.email}:ADMIN`,
      `${ORGANISER.email}:ORGANIZER`,
      `${REVIEWER.email}:REVIEWER`,
    ]);
    expect(asAdmin.invites).toEqual([{ email: 'futuro@ufpb.br', role: 'REVIEWER' }]);
    expect((await body(await get(deps, 'members', tokens.organiser))).canManage).toEqual(['REVIEWER']);
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

  it('does not let an administrator remove their own administrator role', async () => {
    const { deps, tokens, store } = setup();
    const response = await post(deps, 'member-remove', tokens.admin, { email: ADMIN.email, role: 'ADMIN' });
    expect(response.status).toBe(409);
    expect(await body(response)).toEqual({ error: 'cannot_remove_self' });
    expect(store.members.some((m) => m.userId === ADMIN.id && m.role === 'ADMIN')).toBe(true);
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

  it('records it, queues one e-mail per person without sending in the request, and leaves a notice for accounts', async () => {
    const { send, tokens, store, outbox, sent } = start();
    const response = await send(tokens.organiser, {});
    expect(response.status).toBe(201);
    expect(await body(response)).toEqual({ ok: true, recipients: 5 });
    expect(store.announcements[0]).toMatchObject({ senderId: ORGANISER.id, audience: 'all', subject: 'Prazo prorrogado', recipients: 5 });
    expect(store.announcements[0]!.emails.sort()).toEqual(['autora@ufrn.br', REVIEWER.email, 'paula@outlook.com', NOBODY.email, ORGANISER.email].sort());
    // Queued for the background job: a few hundred e-mails do not fit in one request.
    expect(sent).toEqual([]);
    expect(outbox.rows).toHaveLength(5);
    expect(outbox.rows.every((r) => r.status === 'PENDING')).toBe(true);
    const mail = outbox.rows.find((r) => r.to === NOBODY.email)!;
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
    const { send, tokens, outbox } = start();
    await send(tokens.admin, { audience: 'reviewers', body: 'Vejam <script>alert(1)</script> este aviso.' });
    expect(outbox.rows[0]!.html).toContain('&lt;script&gt;');
    expect(outbox.rows[0]!.html).not.toContain('<script>');
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
    const { assign, paper, deps, tokens, store } = ready();
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
  });
});
