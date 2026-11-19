import { describe, expect, it } from 'vitest';
import { renderAccountEmail, maskEmail } from './emails';
import { EMAIL_LOCALES } from '../payments/emailTemplates';
import {
  LIMITS,
  PASSWORD_MIN,
  actionOf,
  clientIp,
  handleAccount,
  registrationState,
  sha256,
  type AccountDeps,
} from './handlers';
import type { PaymentStatus } from '../payments/status';
import { CPF, EVENT, NOW, OLD_EVENT, OTHER_CPF, USER, call, cpfFrom, setup } from './testing';

/** A third CPF with valid check digits: the one a new person signs up with. */
const NEW_CPF = '39053344705';
const OTHER_USER = { id: 'user-2', email: 'outra@ufcg.edu.br', emailConfirmed: true };

interface Answer {
  user: Record<string, unknown>;
  registrations: Record<string, unknown>[];
  suggestions: Record<string, unknown>[];
  [key: string]: unknown;
}

const body = async (response: Response) => (await response.json()) as Answer;

describe('router', () => {
  it('reads the action from the path', () => {
    expect(actionOf(new Request('https://x.org/api/v1/account/me'))).toBe('me');
    expect(actionOf(new Request('https://x.org/api/v1/account/link-confirm/?a=1'))).toBe('link-confirm');
    // What the rewrite in vercel.json produces.
    expect(actionOf(new Request('https://x.org/api/v1/account?action=signup'))).toBe('signup');
    expect(actionOf(new Request('https://x.org/api/v1/account'))).toBe('');
  });

  it('answers 404 to an unknown action and 405 to a wrong method', async () => {
    const { deps } = setup();
    expect((await handleAccount(call('GET', 'nope'), 'nope', deps)).status).toBe(404);
    expect((await handleAccount(call('GET', 'signup'), 'signup', deps)).status).toBe(405);
    expect((await handleAccount(call('POST', 'me'), 'me', deps)).status).toBe(405);
  });

  it('answers 503 when the deployment has no database', async () => {
    expect((await handleAccount(call('GET', 'me'), 'me', null)).status).toBe(503);
  });

  it('turns an unexpected failure into a 500 without leaking it', async () => {
    const { deps, store, auth, logs } = setup();
    const token = auth.login(USER);
    store.addProfile(USER);
    store.listRegistrations = async () => {
      throw new Error('boom: secret detail');
    };
    const response = await handleAccount(call('GET', 'me', { token }), 'me', deps);
    expect(response.status).toBe(500);
    expect(await body(response)).toEqual({ error: 'server_error' });
    expect(logs.at(-1)?.event).toBe('account_request_failed');
  });

  it('takes the first forwarded address as the caller', () => {
    const request = new Request('https://x.org', { headers: { 'x-forwarded-for': '198.51.100.4, 10.0.0.1' } });
    expect(clientIp(request)).toBe('198.51.100.4');
    expect(clientIp(new Request('https://x.org'))).toBe('unknown');
  });
});

describe('signup', () => {
  const signup = (over: Record<string, unknown> = {}, ip?: string) =>
    call('POST', 'signup', {
      body: {
        email: 'Nova.Pessoa@UFCG.edu.br ',
        fullName: '  Nova   Pessoa ',
        cpf: '390.533.447-05',
        locale: 'pt-BR',
        eventSlug: '2027',
        ...over,
      },
      ip,
    });

  it('e-mails a confirmation link to a new address, lower-cased, with the token in the link', async () => {
    const { deps, auth, sent } = setup();
    const response = await handleAccount(signup(), 'signup', deps);
    expect(response.status).toBe(202);
    expect(await body(response)).toEqual({ ok: true });
    expect(auth.signups).toEqual(['nova.pessoa@ufcg.edu.br']);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toBe('nova.pessoa@ufcg.edu.br');
    expect(sent[0]!.subject).toContain('Confirme seu e-mail');
    expect(sent[0]!.text).toContain('Olá, Nova.');
    expect(sent[0]!.text).toContain(
      'https://dev.sieamb.org/2027/conta/confirmar?token_hash=hash-for-nova.pessoa%40ufcg.edu.br&type=signup',
    );
  });

  it('carries the page the person was going to inside the link, so another browser or phone still gets there (#246)', async () => {
    const { deps, sent } = setup();
    await handleAccount(signup({ next: '/2027/meus-trabalhos/novo' }), 'signup', deps);
    expect(sent[0]!.text).toContain(
      'https://dev.sieamb.org/2027/conta/confirmar?token_hash=hash-for-nova.pessoa%40ufcg.edu.br&type=signup&next=%2F2027%2Fmeus-trabalhos%2Fnovo',
    );
  });

  it.each([
    ['another site', 'https://evil.example/2027/x'],
    ['a protocol-relative address', '//evil.example/2027/x'],
    ['a page of another edition', '/2025/meus-trabalhos/novo'],
    ['a path that climbs out', '/2027/../admin'],
    ['a path with a query', '/2027/meus-trabalhos?x=1'],
    ['a path with a line break', '/2027/meus-trabalhos\nBcc: x'],
    ['the edition alone', '/2027'],
    ['something that is not text', { path: '/2027/x' }],
    ['a very long path', `/2027/${'a'.repeat(250)}`],
  ])('leaves %s out of the link', async (_name, next) => {
    const { deps, sent } = setup();
    await handleAccount(signup({ next }), 'signup', deps);
    expect(sent[0]!.text).toContain('type=signup');
    expect(sent[0]!.text).not.toContain('next=');
    expect(sent[0]!.text).not.toContain('evil');
  });

  it('never asks for or forwards a password', async () => {
    const { deps, auth } = setup();
    await handleAccount(signup({ password: 'chosen-by-someone-else' }), 'signup', deps);
    expect(auth.passwords).toEqual([]);
  });

  it('answers the same for an address that already has an account, and mails the owner instead', async () => {
    const { deps, auth, sent } = setup();
    auth.accounts.set('nova.pessoa@ufcg.edu.br', true);
    const response = await handleAccount(signup(), 'signup', deps);
    expect(response.status).toBe(202);
    expect(await body(response)).toEqual({ ok: true });
    expect(sent[0]!.subject).toContain('Você já tem uma conta');
    expect(sent[0]!.text).toContain('https://dev.sieamb.org/2027/conta/entrar');
    expect(sent[0]!.text).not.toContain('token_hash');
  });

  it('answers the same when the login service or the mail server fails', async () => {
    const broken = setup();
    broken.auth.fail = true;
    expect((await handleAccount(signup(), 'signup', broken.deps)).status).toBe(202);
    expect(broken.logs.some((l) => l.event === 'account_signup_failed')).toBe(true);

    const noMail = setup({ failSends: true });
    expect((await handleAccount(signup(), 'signup', noMail.deps)).status).toBe(202);
    expect(noMail.logs.some((l) => l.event === 'account_email_failed')).toBe(true);
  });

  it.each([
    ['no e-mail', { email: '' }, 'invalid_email'],
    ['an e-mail with a space', { email: 'a b@c.com' }, 'invalid_email'],
    ['an e-mail with a line break', { email: 'a@b.com\nbcc: x@y.com' }, 'invalid_email'],
    ['a two-letter name', { fullName: 'Jo' }, 'invalid_name'],
    ['a name that is not text', { fullName: 42 }, 'invalid_name'],
  ])('rejects %s', async (_name, over, error) => {
    const { deps, auth, sent } = setup();
    const response = await handleAccount(signup(over), 'signup', deps);
    expect(response.status).toBe(400);
    expect(await body(response)).toEqual({ error });
    expect(auth.signups).toEqual([]);
    expect(sent).toEqual([]);
  });

  it('writes in the language of the form and falls back to Portuguese', async () => {
    const { deps, sent } = setup();
    await handleAccount(signup({ locale: 'en', email: 'a@ufcg.edu.br' }), 'signup', deps);
    await handleAccount(signup({ locale: 'klingon', email: 'b@ufcg.edu.br' }), 'signup', deps);
    expect(sent[0]!.subject).toContain('Confirm your e-mail');
    expect(sent[1]!.subject).toContain('Confirme seu e-mail');
  });

  it('uses the current event when the slug is unknown, never the text that was sent', async () => {
    const { deps, sent } = setup();
    await handleAccount(signup({ eventSlug: 'evil.example/phish' }), 'signup', deps);
    expect(sent[0]!.text).toContain('https://dev.sieamb.org/2027/conta/confirmar?');
    expect(sent[0]!.text).not.toContain('evil');
  });

  it('creates the account but mails nothing to our own test addresses', async () => {
    const { deps, auth, sent, logs } = setup();
    await handleAccount(signup({ email: 'e2e+conta1@sieamb.org' }), 'signup', deps);
    expect(auth.signups).toEqual(['e2e+conta1@sieamb.org']);
    expect(sent).toEqual([]);
    expect(logs.some((l) => l.data.reason === 'test_address')).toBe(true);
  });

  it(`stops after ${LIMITS.signupPerEmail.max} attempts for one address in an hour`, async () => {
    const { deps, auth } = setup();
    for (let i = 0; i < LIMITS.signupPerEmail.max; i += 1) {
      expect((await handleAccount(signup({}, `198.51.100.${i}`), 'signup', deps)).status).toBe(202);
    }
    const blocked = await handleAccount(signup({}, '198.51.100.99'), 'signup', deps);
    expect(blocked.status).toBe(429);
    expect(await body(blocked)).toEqual({ error: 'too_many_attempts' });
    expect(auth.signups).toHaveLength(LIMITS.signupPerEmail.max);
  });

  it(`stops after ${LIMITS.perIp.max} attempts from one address, whatever the e-mails`, async () => {
    const { deps } = setup();
    for (let i = 0; i < LIMITS.perIp.max; i += 1) {
      await handleAccount(signup({ email: `p${i}@ufcg.edu.br` }), 'signup', deps);
    }
    expect((await handleAccount(signup({ email: 'outra@ufcg.edu.br' }), 'signup', deps)).status).toBe(429);
  });

  it('keeps no address and no IP in the rate-limit keys', async () => {
    const { deps, store } = setup();
    await handleAccount(signup(), 'signup', deps);
    for (const key of store.hits.keys()) {
      expect(key).toMatch(/^[0-9a-f]{64}$/);
    }
    expect([...store.hits.keys()]).toContain(sha256('test-pepper:signup:nova.pessoa@ufcg.edu.br'));
  });
});

describe('test CPFs', () => {
  it('cpfFrom makes the known examples and only valid numbers', async () => {
    const { isValidCpf } = await import('../core/document');
    expect(cpfFrom('529982247')).toBe(CPF);
    expect(cpfFrom('111444777')).toBe(OTHER_CPF);
    expect(cpfFrom('390533447')).toBe(NEW_CPF);
    for (let i = 0; i < 200; i += 1) expect(isValidCpf(cpfFrom(String(100000000 + i * 4391)))).toBe(true);
  });
});

describe('signup: who the person is (ADR-010)', () => {
  const signup = (over: Record<string, unknown> = {}, ip?: string) =>
    call('POST', 'signup', {
      body: { email: 'nova@ufcg.edu.br', fullName: 'Nova Pessoa', locale: 'pt-BR', eventSlug: '2027', ...over },
      ip,
    });

  it.each([
    ['no document at all', {}, 'document_required'],
    ['empty fields', { cpf: ' ', passport: '', country: 'PT' }, 'document_required'],
    ['a CPF with wrong check digits', { cpf: '529.982.247-26' }, 'invalid_cpf'],
    ['a CPF of repeated digits', { cpf: '000.000.000-00' }, 'invalid_cpf'],
    ['a CPF that is not text', { cpf: 39053344705 }, 'document_required'],
    ['a passport without a country', { passport: 'AB123456' }, 'invalid_country'],
    ['a passport with Brazil as its country', { passport: 'AB123456', country: 'BR' }, 'invalid_country'],
    ['a passport with a country that does not exist', { passport: 'AB123456', country: 'ZZ' }, 'invalid_country'],
    ['a passport that is too short', { passport: 'A1', country: 'PT' }, 'invalid_passport'],
    ['a good CPF next to a bad passport', { cpf: NEW_CPF, passport: 'A1', country: 'PT' }, 'invalid_passport'],
    ['a good passport next to a bad CPF', { cpf: '12345678900', passport: 'AB123456', country: 'PT' }, 'invalid_cpf'],
  ])('refuses %s, creates nothing and mails nothing', async (_name, document, error) => {
    const { deps, auth, sent, store } = setup();
    const response = await handleAccount(signup(document), 'signup', deps);
    expect(response.status).toBe(400);
    expect(await body(response)).toEqual({ error });
    expect(auth.signups).toEqual([]);
    expect(sent).toEqual([]);
    expect(store.signupDocuments.size).toBe(0);
  });

  it.each([
    ['a CPF', { cpf: '390.533.447-05' }, { cpf: NEW_CPF, passport: null, country: null }],
    ['a passport with its country', { passport: 'ab 123-456', country: 'pt' }, { cpf: null, passport: 'AB123456', country: 'PT' }],
    ['both', { cpf: NEW_CPF, passport: 'AB123456', country: 'US' }, { cpf: NEW_CPF, passport: 'AB123456', country: 'US' }],
    ['a CPF with a country nobody asked for', { cpf: NEW_CPF, country: 'PT' }, { cpf: NEW_CPF, passport: null, country: null }],
  ])('accepts %s and keeps it waiting under the address, in its stored shape', async (_name, document, waiting) => {
    const { deps, auth, sent, store } = setup();
    const response = await handleAccount(signup(document), 'signup', deps);
    expect(response.status).toBe(202);
    expect(auth.signups).toEqual(['nova@ufcg.edu.br']);
    expect(sent).toHaveLength(1);
    expect(store.signupDocuments.get('nova@ufcg.edu.br')).toEqual(waiting);
    // It is not anybody's yet: no account holds it.
    expect(await store.findAccountsByDocument(waiting)).toEqual([]);
  });

  it('says "CPF already registered", with the masked address, when another account holds the CPF', async () => {
    const { deps, auth, sent, store } = setup();
    store.addProfile(OTHER_USER).cpf = NEW_CPF;
    const response = await handleAccount(signup({ cpf: NEW_CPF }), 'signup', deps);
    expect(response.status).toBe(409);
    expect(await body(response)).toEqual({ error: 'cpf_in_use', maskedEmail: maskEmail(OTHER_USER.email) });
    expect(JSON.stringify(await body(await handleAccount(signup({ cpf: NEW_CPF }), 'signup', deps)))).not.toContain(OTHER_USER.email);
    expect(auth.signups).toEqual([]);
    expect(sent).toEqual([]);
    expect(store.signupDocuments.size).toBe(0);
  });

  it('says "passport already registered" only for the same number AND country', async () => {
    const { deps, store } = setup();
    const other = store.addProfile(OTHER_USER);
    other.passport = 'AB123456';
    other.country = 'PT';
    const same = await handleAccount(signup({ passport: 'ab-123456', country: 'pt' }), 'signup', deps);
    expect(same.status).toBe(409);
    expect(await body(same)).toEqual({ error: 'passport_in_use', maskedEmail: maskEmail(OTHER_USER.email) });
    // The same number issued by another country is another person.
    expect((await handleAccount(signup({ passport: 'AB123456', country: 'ES' }), 'signup', deps)).status).toBe(202);
  });

  it('names the CPF when both the CPF and the passport are held by others', async () => {
    const { deps, store } = setup();
    store.addProfile(OTHER_USER).cpf = NEW_CPF;
    const third = store.addProfile({ id: 'user-3', email: 'terceira@ufcg.edu.br', emailConfirmed: true });
    third.passport = 'AB123456';
    third.country = 'PT';
    const response = await handleAccount(signup({ cpf: NEW_CPF, passport: 'AB123456', country: 'PT' }), 'signup', deps);
    expect(await body(response)).toEqual({ error: 'cpf_in_use', maskedEmail: maskEmail(OTHER_USER.email) });
  });

  it('is not in the way of the same person asking again with the address of their own account', async () => {
    const { deps, auth, sent, store } = setup();
    auth.accounts.set(USER.email, true);
    store.addProfile(USER).cpf = CPF;
    const response = await handleAccount(signup({ email: USER.email, cpf: CPF }), 'signup', deps);
    // The quiet answer of always, and the "you already have an account" e-mail.
    expect(response.status).toBe(202);
    expect(await body(response)).toEqual({ ok: true });
    expect(sent[0]!.subject).not.toContain('Confirme');
    // An account that exists keeps its own document: nothing is left waiting for it.
    expect(store.signupDocuments.size).toBe(0);
  });

  it('a document that only waits under an unconfirmed address blocks nobody', async () => {
    const { deps, store } = setup();
    expect((await handleAccount(signup({ email: 'primeira@ufcg.edu.br', cpf: NEW_CPF }), 'signup', deps)).status).toBe(202);
    // Someone else asks with the same CPF: nobody has confirmed it, so nobody holds it.
    expect((await handleAccount(signup({ email: 'segunda@ufcg.edu.br', cpf: NEW_CPF }), 'signup', deps)).status).toBe(202);
    expect([...store.signupDocuments.keys()]).toEqual(['primeira@ufcg.edu.br', 'segunda@ufcg.edu.br']);
  });

  it('the last request for an address replaces the document that was waiting', async () => {
    const { deps, store } = setup();
    await handleAccount(signup({ cpf: NEW_CPF }, '198.51.100.1'), 'signup', deps);
    await handleAccount(signup({ cpf: OTHER_CPF }, '198.51.100.2'), 'signup', deps);
    expect(store.signupDocuments.get('nova@ufcg.edu.br')).toEqual({ cpf: OTHER_CPF, passport: null, country: null });
  });

  it(`gives the masked address ${LIMITS.documentHintPerIp.max} times an hour to one caller, then only the refusal`, async () => {
    const { deps, store } = setup();
    // A different held CPF each time, so that only the limit per caller is reached.
    const held = Array.from({ length: 11 }, (_, i) => cpfFrom(String(100200300 + i * 1111)));
    held.forEach((cpf, i) => {
      store.addProfile({ id: `holder-${i}`, email: `dona${i}@ufcg.edu.br`, emailConfirmed: true }).cpf = cpf;
    });
    for (let i = 0; i < LIMITS.documentHintPerIp.max; i += 1) {
      const answer = await body(await handleAccount(signup({ email: `n${i}@ufcg.edu.br`, cpf: held[i] }), 'signup', deps));
      expect(answer).toEqual({ error: 'cpf_in_use', maskedEmail: maskEmail(`dona${i}@ufcg.edu.br`) });
    }
    const after = await handleAccount(signup({ email: 'n99@ufcg.edu.br', cpf: held[10] }), 'signup', deps);
    expect(after.status).toBe(409);
    expect(await body(after)).toEqual({ error: 'cpf_in_use' });
    // Another caller still gets it.
    const elsewhere = await handleAccount(signup({ email: 'n98@ufcg.edu.br', cpf: held[10] }, '198.51.100.50'), 'signup', deps);
    expect(await body(elsewhere)).toEqual({ error: 'cpf_in_use', maskedEmail: maskEmail('dona10@ufcg.edu.br') });
  });

  it(`gives the masked address of one document ${LIMITS.documentHintPerDocument.max} times a day, whoever asks`, async () => {
    const { deps, store } = setup();
    store.addProfile(OTHER_USER).cpf = NEW_CPF;
    for (let i = 0; i < LIMITS.documentHintPerDocument.max; i += 1) {
      const answer = await body(await handleAccount(signup({ email: `n${i}@ufcg.edu.br`, cpf: NEW_CPF }, `198.51.100.${i}`), 'signup', deps));
      expect(answer.maskedEmail).toBe(maskEmail(OTHER_USER.email));
    }
    const after = await handleAccount(signup({ email: 'n99@ufcg.edu.br', cpf: NEW_CPF }, '198.51.100.99'), 'signup', deps);
    expect(await body(after)).toEqual({ error: 'cpf_in_use' });
  });

  it('keeps no document in the rate-limit keys', async () => {
    const { deps, store } = setup();
    store.addProfile(OTHER_USER).cpf = NEW_CPF;
    await handleAccount(signup({ cpf: NEW_CPF }), 'signup', deps);
    for (const key of store.hits.keys()) {
      expect(key).toMatch(/^[0-9a-f]{64}$/);
      expect(key).not.toContain(NEW_CPF);
    }
    expect([...store.hits.keys()]).toContain(sha256(`test-pepper:document-hint:cpf:${NEW_CPF}`));
  });

  it('the answer does not depend on whether the address has an account, only on the document', async () => {
    const { deps, auth, store } = setup();
    auth.accounts.set('conhecida@ufcg.edu.br', true);
    store.addProfile({ id: 'user-9', email: 'conhecida@ufcg.edu.br', emailConfirmed: true });
    const known = await handleAccount(signup({ email: 'conhecida@ufcg.edu.br', cpf: NEW_CPF }), 'signup', deps);
    const unknown = await handleAccount(signup({ email: 'desconhecida@ufcg.edu.br', cpf: NEW_CPF }, '198.51.100.9'), 'signup', deps);
    expect([known.status, await body(known)]).toEqual([unknown.status, await body(unknown)]);
  });
});

describe('recover', () => {
  const recover = (email: string) => call('POST', 'recover', { body: { email, eventSlug: '2027', locale: 'es' } });

  it('mails a link to choose a new password when the address has an account', async () => {
    const { deps, auth, sent } = setup();
    auth.accounts.set('maria@ufcg.edu.br', true);
    const response = await handleAccount(recover('Maria@ufcg.edu.br'), 'recover', deps);
    expect(response.status).toBe(202);
    expect(sent[0]!.subject).toContain('Cree una nueva contraseña');
    expect(sent[0]!.text).toContain(
      'https://dev.sieamb.org/2027/conta/nova-senha?token_hash=recovery-for-maria%40ufcg.edu.br&type=recovery',
    );
  });

  it('answers the same and mails nothing when the address has no account', async () => {
    const { deps, sent } = setup();
    const response = await handleAccount(recover('ninguem@ufcg.edu.br'), 'recover', deps);
    expect(response.status).toBe(202);
    expect(await body(response)).toEqual({ ok: true });
    expect(sent).toEqual([]);
  });

  it(`stops after ${LIMITS.recoverPerEmail.max} attempts for one address`, async () => {
    const { deps, auth } = setup();
    auth.accounts.set('maria@ufcg.edu.br', true);
    for (let i = 0; i < LIMITS.recoverPerEmail.max; i += 1) await handleAccount(recover('maria@ufcg.edu.br'), 'recover', deps);
    expect((await handleAccount(recover('maria@ufcg.edu.br'), 'recover', deps)).status).toBe(429);
  });
});

describe('who is logged in', () => {
  it.each([
    ['no token', undefined],
    ['a token nobody issued', 'forged'],
  ])('answers 401 with %s', async (_name, token) => {
    const { deps } = setup();
    for (const [method, action] of [['GET', 'me'], ['PUT', 'profile'], ['POST', 'password'], ['POST', 'link-request']] as const) {
      const options = method === 'GET' ? { token } : { token, body: {} };
      const response = await handleAccount(call(method, action, options), action, deps);
      expect(response.status, action).toBe(401);
    }
  });

  it('shows nothing to an account whose e-mail is not confirmed, and links nothing', async () => {
    const { deps, auth, store } = setup();
    const unconfirmed = { ...USER, emailConfirmed: false };
    const token = auth.login(unconfirmed);
    store.addProfile(unconfirmed);
    const registration = store.addRegistration({ email: USER.email });
    const response = await handleAccount(call('GET', 'me', { token }), 'me', deps);
    expect(response.status).toBe(403);
    expect(await body(response)).toEqual({ error: 'email_not_confirmed' });
    expect(registration.userId).toBeNull();
  });
});

describe('me', () => {
  it('says where the person organises and where they review, so the site can offer those pages (#252, #315)', async () => {
    const { deps, auth, store } = setup();
    const token = auth.login(USER);
    store.addProfile(USER);
    store.panels = { platformAdmin: false, slugs: ['2027'], reviewing: ['2027', '2029'] };
    const data = await body(await handleAccount(call('GET', 'me', { token }), 'me', deps));
    expect(data.panels).toEqual({ platformAdmin: false, slugs: ['2027'], reviewing: ['2027', '2029'] });
  });

  it('links a registration made with the same e-mail and shows it with the pay link', async () => {
    const { deps, auth, store } = setup();
    const token = auth.login(USER);
    store.addProfile(USER);
    const registration = store.addRegistration({ email: USER.email });
    const data = await body(await handleAccount(call('GET', 'me', { token }), 'me', deps));
    expect(registration.userId).toBe(USER.id);
    expect(data.user).toMatchObject({ email: USER.email, fullName: 'Maria Clara de Souza', documentLocked: false });
    expect(data.registrations).toEqual([
      expect.objectContaining({ eventSlug: '2027', state: 'UNPAID', payToken: `pay-${registration.id}`, paymentId: null }),
    ]);
    expect(data.suggestions).toEqual([]);
  });

  it('never takes a registration that already belongs to another account', async () => {
    const { deps, auth, store } = setup();
    const token = auth.login(USER);
    store.addProfile(USER);
    const registration = store.addRegistration({ email: USER.email, userId: 'someone-else' });
    const data = await body(await handleAccount(call('GET', 'me', { token }), 'me', deps));
    expect(registration.userId).toBe('someone-else');
    expect(data.registrations).toEqual([]);
  });

  it('does not show someone else’s registration', async () => {
    const { deps, auth, store } = setup();
    const token = auth.login(USER);
    store.addProfile(USER);
    store.addRegistration({ email: 'outra@ufcg.edu.br' });
    const data = await body(await handleAccount(call('GET', 'me', { token }), 'me', deps));
    expect(data.registrations).toEqual([]);
    expect(data.suggestions).toEqual([]);
  });

  it('hides the pay link once paid, and while a boleto or a review is pending', async () => {
    const { deps, auth, store } = setup();
    const token = auth.login(USER);
    store.addProfile(USER);
    store.addRegistration({
      email: USER.email,
      payments: [
        { id: 'p1', status: 'CANCELLED', mpStatus: 'cancelled', amountCents: 5000 },
        { id: 'p2', status: 'APPROVED', mpStatus: 'processed', amountCents: 5000 },
      ],
    });
    store.addRegistration({
      email: USER.email,
      eventId: OLD_EVENT.id,
      eventSlug: OLD_EVENT.slug,
      eventName: OLD_EVENT.name,
      payments: [{ id: 'p3', status: 'PENDING', mpStatus: 'action_required', amountCents: 3000 }],
    });
    const data = await body(await handleAccount(call('GET', 'me', { token }), 'me', deps));
    const byEvent = Object.fromEntries(data.registrations.map((r) => [r.eventSlug as string, r]));
    expect(byEvent['2027']).toMatchObject({ state: 'PAID', payToken: null, paymentId: 'p2', amountCents: 5000 });
    expect(byEvent['2025']).toMatchObject({ state: 'PENDING', payToken: null, paymentId: 'p3', amountCents: 3000 });
  });

  it('derives the state from every payment of the registration', () => {
    const base = { id: 'r', eventSlug: '2027', eventName: 'x', category: 'c', modality: 'm', createdAt: '', payToken: 't', manualStatus: null };
    const payment = (status: PaymentStatus) => ({ id: status, status, mpStatus: null, amountCents: 1 });
    expect(registrationState({ ...base, payments: [] })).toBe('UNPAID');
    expect(registrationState({ ...base, payments: [payment('CREATED'), payment('REJECTED')] })).toBe('UNPAID');
    expect(registrationState({ ...base, payments: [payment('REFUNDED')] })).toBe('UNPAID');
    expect(registrationState({ ...base, payments: [payment('PENDING')] })).toBe('PENDING');
    expect(registrationState({ ...base, payments: [payment('PENDING'), payment('APPROVED')] })).toBe('PAID');
    // An administrator's decision wins over whatever was paid (#219).
    expect(registrationState({ ...base, manualStatus: 'CONFIRMED', payments: [] })).toBe('PAID');
    expect(registrationState({ ...base, manualStatus: 'EXEMPT', payments: [payment('REJECTED')] })).toBe('PAID');
    expect(registrationState({ ...base, manualStatus: 'CANCELLED', payments: [payment('APPROVED')] })).toBe('CANCELLED');
  });
});

describe('profile', () => {
  const start = () => {
    const ctx = setup();
    const token = ctx.auth.login(USER);
    ctx.store.addProfile(USER);
    const put = (data: Record<string, unknown>) =>
      handleAccount(call('PUT', 'profile', { token, body: data }), 'profile', ctx.deps);
    return { ...ctx, token, put };
  };

  it('saves name, institution and a valid CPF, digits only', async () => {
    const { put, store } = start();
    const response = await put({ fullName: ' Maria  Clara ', institution: 'UFCG', cpf: '529.982.247-25' });
    expect(response.status).toBe(200);
    expect(store.profiles.get(USER.id)).toMatchObject({ fullName: 'Maria Clara', institution: 'UFCG', cpf: CPF, country: 'BR' });
    expect((await body(response)).user).toMatchObject({ documentLocked: true, cpfLocked: true, passportLocked: false, documentMissing: false });
  });

  it.each([
    ['a CPF with wrong check digits', { cpf: '529.982.247-26' }, 'invalid_cpf'],
    ['a CPF of repeated digits', { cpf: '111.111.111-11' }, 'invalid_cpf'],
    ['a passport without a country', { passport: 'AB123456' }, 'invalid_country'],
    ['a passport with Brazil as the country', { passport: 'AB123456', country: 'BR' }, 'invalid_country'],
    ['a passport that is too short', { passport: 'A1', country: 'PT' }, 'invalid_passport'],
    ['a short name', { fullName: 'Al' }, 'invalid_name'],
  ])('rejects %s', async (_name, data, error) => {
    const { put, store } = start();
    const response = await put(data);
    expect(response.status).toBe(400);
    expect(await body(response)).toEqual({ error });
    expect(store.profiles.get(USER.id)).toMatchObject({ cpf: null, passport: null });
  });

  it('saves a passport with its country, upper-cased and without separators', async () => {
    const { put, store } = start();
    expect((await put({ passport: 'ab-123 456', country: 'pt' })).status).toBe(200);
    expect(store.profiles.get(USER.id)).toMatchObject({ passport: 'AB123456', country: 'PT', cpf: null });
  });

  it('each kind of document is given once: a saved CPF cannot be changed', async () => {
    const { put, store } = start();
    await put({ cpf: CPF });
    const changed = await put({ cpf: OTHER_CPF });
    expect(changed.status).toBe(409);
    expect(await body(changed)).toEqual({ error: 'document_locked' });
    expect(store.profiles.get(USER.id)).toMatchObject({ cpf: CPF, passport: null });
    // Sending the same document again with other fields is fine.
    expect((await put({ cpf: CPF, institution: 'UFPB' })).status).toBe(200);
    expect(store.profiles.get(USER.id)?.institution).toBe('UFPB');
  });

  it('someone with a CPF can still add a passport, once', async () => {
    const { put, store } = start();
    await put({ cpf: CPF });
    const added = await put({ passport: 'ab 123-456', country: 'pt' });
    expect(added.status).toBe(200);
    expect(store.profiles.get(USER.id)).toMatchObject({ cpf: CPF, passport: 'AB123456', country: 'PT' });
    expect((await body(added)).user).toMatchObject({ cpfLocked: true, passportLocked: true });
    // And then neither changes: not the number, not the country.
    expect(await body(await put({ passport: 'ZZ999999', country: 'PT' }))).toEqual({ error: 'document_locked' });
    expect(await body(await put({ passport: 'AB123456', country: 'ES' }))).toEqual({ error: 'document_locked' });
    expect(store.profiles.get(USER.id)).toMatchObject({ cpf: CPF, passport: 'AB123456', country: 'PT' });
    // The same ones again are fine.
    expect((await put({ cpf: CPF, passport: 'AB123456', country: 'PT' })).status).toBe(200);
  });

  it('someone with a passport can still add a CPF, once, and keeps the country of the passport', async () => {
    const { put, store } = start();
    await put({ passport: 'AB123456', country: 'PT' });
    expect((await put({ cpf: CPF })).status).toBe(200);
    expect(store.profiles.get(USER.id)).toMatchObject({ cpf: CPF, passport: 'AB123456', country: 'PT' });
    expect(await body(await put({ cpf: OTHER_CPF }))).toEqual({ error: 'document_locked' });
  });

  it('takes a CPF and a passport together', async () => {
    const { put, store } = start();
    expect((await put({ cpf: CPF, passport: 'AB123456', country: 'US' })).status).toBe(200);
    expect(store.profiles.get(USER.id)).toMatchObject({ cpf: CPF, passport: 'AB123456', country: 'US' });
  });

  it('writes nothing when one of the two is wrong', async () => {
    const { put, store } = start();
    expect(await body(await put({ cpf: CPF, passport: 'A1', country: 'PT' }))).toEqual({ error: 'invalid_passport' });
    expect(await body(await put({ cpf: '12345678900', passport: 'AB123456', country: 'PT' }))).toEqual({ error: 'invalid_cpf' });
    expect(store.profiles.get(USER.id)).toMatchObject({ cpf: null, passport: null });
  });

  it('refuses a CPF that another account already has, with that account’s masked address', async () => {
    const { put, store } = start();
    store.addProfile(OTHER_USER).cpf = CPF;
    const response = await put({ cpf: CPF });
    expect(response.status).toBe(409);
    expect(await body(response)).toEqual({ error: 'cpf_in_use', maskedEmail: maskEmail(OTHER_USER.email) });
    expect(store.profiles.get(USER.id)?.cpf).toBeNull();
  });

  it('refuses a passport that another account already has, and takes the same number from another country', async () => {
    const { put, store } = start();
    const other = store.addProfile(OTHER_USER);
    other.passport = 'AB123456';
    other.country = 'PT';
    const response = await put({ passport: 'AB123456', country: 'PT' });
    expect(response.status).toBe(409);
    expect(await body(response)).toEqual({ error: 'passport_in_use', maskedEmail: maskEmail(OTHER_USER.email) });
    expect(store.profiles.get(USER.id)?.passport).toBeNull();
    expect((await put({ passport: 'AB123456', country: 'ES' })).status).toBe(200);
  });

  it('a document taken between the look and the write is still refused, by the database', async () => {
    const { put, store } = start();
    // Nobody holds it when it is looked up...
    const lookups = store.findAccountsByDocument.bind(store);
    let first = true;
    store.findAccountsByDocument = async (document) => {
      if (first) {
        first = false;
        return [];
      }
      return lookups(document);
    };
    // ...and another account has it by the time it is written.
    store.addProfile(OTHER_USER).cpf = CPF;
    const response = await put({ cpf: CPF });
    expect(response.status).toBe(409);
    expect(await body(response)).toEqual({ error: 'cpf_in_use', maskedEmail: maskEmail(OTHER_USER.email) });
    expect(store.profiles.get(USER.id)?.cpf).toBeNull();
  });

  it('says a document is missing on an account from before, and shows what waits for it', async () => {
    const { put, store, token, deps } = start();
    await store.saveSignupDocument(USER.email, { cpf: CPF, passport: null, country: null });
    const before = await body(await handleAccount(call('GET', 'me', { token }), 'me', deps));
    expect(before.user).toMatchObject({
      documentMissing: true,
      documentLocked: false,
      pendingDocument: { cpf: CPF, passport: null, country: null },
    });
    // Once given, nothing waits any more, and the waiting line is gone.
    const after = await body(await put({ cpf: CPF }));
    expect(after.user).toMatchObject({ documentMissing: false, pendingDocument: null, cpf: CPF });
    expect(store.signupDocuments.size).toBe(0);
  });

  it('never shows the waiting document of another address', async () => {
    const { store, token, deps } = start();
    await store.saveSignupDocument(OTHER_USER.email, { cpf: OTHER_CPF, passport: null, country: null });
    const answer = await body(await handleAccount(call('GET', 'me', { token }), 'me', deps));
    expect(answer.user.pendingDocument).toBeNull();
    expect(JSON.stringify(answer)).not.toContain(OTHER_CPF);
  });
});

describe('password', () => {
  const start = () => {
    const ctx = setup();
    const token = ctx.auth.login(USER);
    const post = (password: unknown) =>
      handleAccount(call('POST', 'password', { token, body: { password } }), 'password', ctx.deps);
    return { ...ctx, post };
  };

  it('sets the password of the logged-in account', async () => {
    const { post, auth, logs } = start();
    expect((await post('uma-senha-bem-longa')).status).toBe(200);
    expect(auth.passwords).toEqual([{ userId: USER.id, password: 'uma-senha-bem-longa' }]);
    expect(JSON.stringify(logs)).not.toContain('uma-senha-bem-longa');
  });

  it.each([
    [`shorter than ${PASSWORD_MIN} characters`, 'a'.repeat(PASSWORD_MIN - 1)],
    ['longer than 200 characters', 'a'.repeat(201)],
    ['not text', 1234567890123],
    ['built on the person’s own address', 'Maria-2027-xx'],
  ])('rejects a password %s', async (_name, password) => {
    const { post, auth } = start();
    const response = await post(password);
    expect(response.status).toBe(400);
    expect(await body(response)).toEqual({ error: 'weak_password' });
    expect(auth.passwords).toEqual([]);
  });

  it('accepts exactly the minimum length', async () => {
    const { post } = start();
    expect((await post('x'.repeat(PASSWORD_MIN))).status).toBe(200);
  });
});

describe('password, on the screen that follows the confirmation link (ADR-010)', () => {
  const GOOD = 'uma-senha-bem-longa';
  const start = () => {
    const ctx = setup();
    const token = ctx.auth.login(USER);
    ctx.store.addProfile(USER);
    const post = (data: Record<string, unknown>) =>
      handleAccount(call('POST', 'password', { token, body: data }), 'password', ctx.deps);
    return { ...ctx, post };
  };

  it('takes the confirmed document with the password, and nothing waits any more', async () => {
    const { post, store, auth } = start();
    await store.saveSignupDocument(USER.email, { cpf: CPF, passport: null, country: null });
    expect((await post({ password: GOOD, cpf: '529.982.247-25' })).status).toBe(200);
    expect(store.profiles.get(USER.id)).toMatchObject({ cpf: CPF, passport: null });
    expect(auth.passwords).toEqual([{ userId: USER.id, password: GOOD }]);
    expect(store.signupDocuments.size).toBe(0);
  });

  it('takes a corrected document over the one that was waiting', async () => {
    const { post, store } = start();
    // Typed by whoever asked for the account, which may not be who confirmed the e-mail.
    await store.saveSignupDocument(USER.email, { cpf: OTHER_CPF, passport: null, country: null });
    expect((await post({ password: GOOD, cpf: CPF })).status).toBe(200);
    expect(store.profiles.get(USER.id)?.cpf).toBe(CPF);
  });

  it('takes a passport with its country, or both kinds', async () => {
    const { post, store } = start();
    expect((await post({ password: GOOD, cpf: CPF, passport: 'ab 123-456', country: 'pt' })).status).toBe(200);
    expect(store.profiles.get(USER.id)).toMatchObject({ cpf: CPF, passport: 'AB123456', country: 'PT' });
  });

  it.each([
    ['an invalid CPF', { cpf: '529.982.247-26' }, 400, 'invalid_cpf'],
    ['a passport without a country', { passport: 'AB123456' }, 400, 'invalid_country'],
    ['a passport from Brazil', { passport: 'AB123456', country: 'BR' }, 400, 'invalid_country'],
  ])('with %s, sets no password and writes no document', async (_name, document, status, error) => {
    const { post, store, auth } = start();
    const response = await post({ password: GOOD, ...document });
    expect(response.status).toBe(status);
    expect(await body(response)).toEqual({ error });
    expect(auth.passwords).toEqual([]);
    expect(store.profiles.get(USER.id)).toMatchObject({ cpf: null, passport: null });
  });

  it('a weak password is refused before any document is written', async () => {
    const { post, store } = start();
    expect(await body(await post({ password: 'curta', cpf: CPF }))).toEqual({ error: 'weak_password' });
    expect(store.profiles.get(USER.id)?.cpf).toBeNull();
  });

  it('a document that another account confirmed first is refused, and the password is not set', async () => {
    const { post, store, auth } = start();
    store.addProfile(OTHER_USER).cpf = CPF;
    const response = await post({ password: GOOD, cpf: CPF });
    expect(response.status).toBe(409);
    expect(await body(response)).toEqual({ error: 'cpf_in_use', maskedEmail: maskEmail(OTHER_USER.email) });
    expect(auth.passwords).toEqual([]);
    expect(store.profiles.get(USER.id)?.cpf).toBeNull();
  });

  it('asking for an account in someone else’s name locks nothing onto them', async () => {
    const { deps, store, auth } = start();
    // Somebody asks for an account for Maria's address with a CPF of their choosing...
    await handleAccount(
      call('POST', 'signup', { body: { email: USER.email, fullName: 'Não Sou Eu', cpf: OTHER_CPF, eventSlug: '2027' } }),
      'signup',
      deps,
    );
    // ...and until Maria says so herself, her account has no document.
    expect(store.profiles.get(USER.id)).toMatchObject({ cpf: null, passport: null });
    const token = auth.login(USER);
    const seen = await body(await handleAccount(call('GET', 'me', { token }), 'me', deps));
    expect(seen.user).toMatchObject({ documentMissing: true, pendingDocument: { cpf: OTHER_CPF } });
    // She corrects it on the screen, and that is what is kept.
    await handleAccount(call('POST', 'password', { token, body: { password: GOOD, cpf: CPF } }), 'password', deps);
    expect(store.profiles.get(USER.id)?.cpf).toBe(CPF);
  });

  it('a recovery link sets a new password without touching the document', async () => {
    const { post, store, auth } = start();
    store.profiles.get(USER.id)!.cpf = CPF;
    expect((await post({ password: GOOD })).status).toBe(200);
    expect(store.profiles.get(USER.id)?.cpf).toBe(CPF);
    expect(auth.passwords).toHaveLength(1);
    // And a document sent along that is not the account's is refused, not swapped in.
    expect(await body(await post({ password: GOOD, cpf: OTHER_CPF }))).toEqual({ error: 'document_locked' });
    expect(auth.passwords).toHaveLength(1);
  });

  it('still sets the password of an account whose profile row is missing', async () => {
    const ctx = setup();
    const token = ctx.auth.login(USER);
    const response = await handleAccount(call('POST', 'password', { token, body: { password: GOOD } }), 'password', ctx.deps);
    expect(response.status).toBe(200);
  });
});

describe('a registration under another e-mail', () => {
  const start = () => {
    const ctx = setup();
    const token = ctx.auth.login(USER);
    ctx.store.addProfile(USER).cpf = CPF;
    const other = ctx.store.addRegistration({ email: 'antigo@outlook.com', cpf: CPF, locale: 'en', fullName: 'Maria C. Souza' });
    const ask = (data: Record<string, unknown>) =>
      handleAccount(call('POST', 'link-request', { token, body: data }), 'link-request', ctx.deps);
    const confirm = (linkToken: string, ip?: string) =>
      handleAccount(call('POST', 'link-confirm', { body: { token: linkToken }, ip }), 'link-confirm', ctx.deps);
    const tokenIn = (mailText: string) => decodeURIComponent(/vincular\?t=([^\s]+)/.exec(mailText)![1]!);
    return { ...ctx, token, other, ask, confirm, tokenIn };
  };

  it('offers a registration with the same CPF, with the address masked', async () => {
    const { deps, token, other } = start();
    const data = await body(await handleAccount(call('GET', 'me', { token }), 'me', deps));
    expect(data.suggestions).toEqual([
      { registrationId: other.id, eventSlug: '2027', eventName: 'II SIEAmB', maskedEmail: 'a•••@outlook.com', createdAt: other.createdAt, request: null },
    ]);
    expect(JSON.stringify(data)).not.toContain('antigo@outlook.com');
    expect(other.userId).toBeNull();
  });

  it('never offers a match by name alone, nor a registration that already has an account', async () => {
    const { deps, token, store, other } = start();
    other.cpf = null; // same name, no document
    store.addRegistration({ email: 'x@outlook.com', cpf: CPF, userId: 'someone-else' });
    const data = await body(await handleAccount(call('GET', 'me', { token }), 'me', deps));
    expect(data.suggestions).toEqual([]);
  });

  it('matches a passport only together with its country', async () => {
    const { deps, token, store } = start();
    const profile = store.profiles.get(USER.id)!;
    Object.assign(profile, { cpf: null, passport: 'AB123456', country: 'PT' });
    store.addRegistration({ email: 'pt@outlook.com', passport: 'AB123456', country: 'PT' });
    store.addRegistration({ email: 'es@outlook.com', passport: 'AB123456', country: 'ES', eventId: OLD_EVENT.id, eventSlug: '2025' });
    const data = await body(await handleAccount(call('GET', 'me', { token }), 'me', deps));
    expect(data.suggestions.map((s) => s.maskedEmail)).toEqual(['p•••@outlook.com']);
  });

  it('sends the confirmation link to the registration’s address, never to the account’s', async () => {
    const { ask, other, sent, store } = start();
    const response = await ask({ registrationId: other.id });
    expect(response.status).toBe(202);
    expect(await body(response)).toEqual({ ok: true, request: 'PENDING', maskedEmail: 'a•••@outlook.com' });
    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toBe('antigo@outlook.com');
    expect(sent[0]!.subject).toContain('Is this registration yours?');
    expect(sent[0]!.text).toContain('m•••@ufcg.edu.br');
    expect(sent[0]!.text).not.toContain(USER.email);
    expect(other.userId).toBeNull();
    // Only the hash of the token is kept.
    const token = /vincular\?t=([^\s]+)/.exec(sent[0]!.text)![1]!;
    expect(store.links[0]!.tokenHash).toBe(sha256(decodeURIComponent(token)));
    expect(JSON.stringify(store.links)).not.toContain(token);
    expect(store.links[0]!.expiresAt).toBe(new Date(NOW.getTime() + 48 * 3600 * 1000).toISOString());
  });

  it('links the registration when the link is clicked, once', async () => {
    const { ask, confirm, tokenIn, other, sent, store, deps, token } = start();
    await ask({ registrationId: other.id });
    const linkToken = tokenIn(sent[0]!.text);
    const response = await confirm(linkToken);
    expect(response.status).toBe(200);
    expect(other.userId).toBe(USER.id);
    expect(store.links[0]!.status).toBe('CONFIRMED');
    expect(await body(await confirm(linkToken))).toEqual({ ok: true, already: true });
    const data = await body(await handleAccount(call('GET', 'me', { token }), 'me', deps));
    expect(data.registrations).toHaveLength(1);
    expect(data.suggestions).toEqual([]);
  });

  it('shows the request as pending until the link is clicked', async () => {
    const { ask, other, deps, token } = start();
    await ask({ registrationId: other.id });
    const data = await body(await handleAccount(call('GET', 'me', { token }), 'me', deps));
    expect(data.suggestions[0]!.request).toBe('PENDING');
  });

  it.each([
    ['a token nobody issued', 'not-a-real-token', 404, 'link_not_found'],
    ['no token', '', 400, 'invalid_token'],
  ])('refuses %s', async (_name, linkToken, status, error) => {
    const { confirm, other } = start();
    const response = await confirm(linkToken);
    expect(response.status).toBe(status);
    expect(await body(response)).toEqual({ error });
    expect(other.userId).toBeNull();
  });

  it('refuses a link after 48 hours', async () => {
    const { ask, confirm, tokenIn, other, sent, store, deps } = start();
    await ask({ registrationId: other.id });
    deps.now = () => new Date(NOW.getTime() + 48 * 3600 * 1000);
    const response = await confirm(tokenIn(sent[0]!.text));
    expect(response.status).toBe(410);
    expect(await body(response)).toEqual({ error: 'link_expired' });
    expect(other.userId).toBeNull();
    expect(store.links[0]!.status).toBe('EXPIRED');
  });

  it('accepts the link one second before the 48 hours', async () => {
    const { ask, confirm, tokenIn, other, sent, deps } = start();
    await ask({ registrationId: other.id });
    deps.now = () => new Date(NOW.getTime() + 48 * 3600 * 1000 - 1000);
    expect((await confirm(tokenIn(sent[0]!.text))).status).toBe(200);
    expect(other.userId).toBe(USER.id);
  });

  it('does not link when someone else got the registration in the meantime', async () => {
    const { ask, confirm, tokenIn, other, sent, store } = start();
    await ask({ registrationId: other.id });
    other.userId = 'someone-else';
    const response = await confirm(tokenIn(sent[0]!.text));
    expect(response.status).toBe(409);
    expect(await body(response)).toEqual({ error: 'cannot_link' });
    expect(other.userId).toBe('someone-else');
    expect(store.links[0]!.status).toBe('REJECTED');
  });

  it('cannot ask for a registration its own document does not point to', async () => {
    const { ask, store, sent } = start();
    const stranger = store.addRegistration({ email: 'estranho@outlook.com', cpf: OTHER_CPF });
    const response = await ask({ registrationId: stranger.id });
    expect(response.status).toBe(404);
    expect(await body(response)).toEqual({ error: 'registration_not_found' });
    expect(sent).toEqual([]);
    expect(store.links).toEqual([]);
  });

  it('cannot ask without a document on the account', async () => {
    const { ask, other, store } = start();
    store.profiles.get(USER.id)!.cpf = null;
    expect((await ask({ registrationId: other.id })).status).toBe(404);
  });

  it('refuses a second registration for the same event', async () => {
    const { ask, other, store } = start();
    store.addRegistration({ email: USER.email, userId: USER.id });
    const response = await ask({ registrationId: other.id });
    expect(response.status).toBe(409);
    expect(await body(response)).toEqual({ error: 'already_registered' });
  });

  it('stores the request for the organisers when the person cannot read that inbox', async () => {
    const { ask, other, sent, store, deps, token } = start();
    const response = await ask({ registrationId: other.id, noAccess: true });
    expect(response.status).toBe(202);
    expect(await body(response)).toEqual({ ok: true, request: 'NEEDS_ORGANISER' });
    expect(sent).toEqual([]);
    expect(store.links[0]!.status).toBe('NEEDS_ORGANISER');
    expect(other.userId).toBeNull();
    const data = await body(await handleAccount(call('GET', 'me', { token }), 'me', deps));
    expect(data.suggestions[0]!.request).toBe('NEEDS_ORGANISER');
  });

  it(`stops after ${LIMITS.linkPerUser.max} requests in a day`, async () => {
    const { ask, other } = start();
    for (let i = 0; i < LIMITS.linkPerUser.max; i += 1) expect((await ask({ registrationId: other.id })).status).toBe(202);
    expect((await ask({ registrationId: other.id })).status).toBe(429);
  });
});

describe('registration form: document already registered', () => {
  const check = (data: Record<string, unknown>, deps: AccountDeps) =>
    handleAccount(call('POST', 'registration-check', { body: { eventSlug: '2027', ...data } }), 'registration-check', deps);

  it('says so, with the address masked, when the CPF has a registration under another e-mail', async () => {
    const { deps, store } = setup();
    store.addRegistration({ email: 'antigo@outlook.com', cpf: CPF });
    const response = await check({ cpf: '529.982.247-25', email: 'novo@gmail.com' }, deps);
    expect(await body(response)).toEqual({ duplicate: true, maskedEmail: 'a•••@outlook.com' });
  });

  it('says nothing when it is the same e-mail, another event, an invalid CPF or no document', async () => {
    const { deps, store } = setup();
    store.addRegistration({ email: 'antigo@outlook.com', cpf: CPF });
    store.addRegistration({ email: 'velho@outlook.com', cpf: OTHER_CPF, eventId: OLD_EVENT.id, eventSlug: '2025' });
    expect(await body(await check({ cpf: CPF, email: 'ANTIGO@outlook.com' }, deps))).toEqual({ duplicate: false });
    expect(await body(await check({ cpf: OTHER_CPF, email: 'novo@gmail.com' }, deps))).toEqual({ duplicate: false });
    expect(await body(await check({ cpf: '123', email: 'novo@gmail.com' }, deps))).toEqual({ duplicate: false });
    expect(await body(await check({ email: 'novo@gmail.com' }, deps))).toEqual({ duplicate: false });
  });

  it('finds a registration by the passport with its country, typed in any shape (ADR-010)', async () => {
    const { deps, store } = setup();
    store.addRegistration({ email: 'joana@uc.pt', passport: 'AB123456', country: 'PT' });
    expect(await body(await check({ passport: 'ab 123-456', country: 'pt', email: 'joana.silva@gmail.com' }, deps))).toEqual({ duplicate: true, maskedEmail: 'j•••@uc.pt' });
    // The same number from another country is another person; a passport without a country is not asked about.
    expect(await body(await check({ passport: 'AB123456', country: 'ES', email: 'x@gmail.com' }, deps))).toEqual({ duplicate: false });
    expect(await body(await check({ passport: 'AB123456', email: 'x@gmail.com' }, deps))).toEqual({ duplicate: false });
  });

  it('finds a passport registered before the form asked for its country, stored as BR', async () => {
    const { deps, store } = setup();
    store.addRegistration({ email: 'antiga@uc.pt', passport: 'OLD12345', country: 'BR' });
    expect(await body(await check({ passport: 'OLD12345', country: 'PT', email: 'nova@gmail.com' }, deps))).toEqual({ duplicate: true, maskedEmail: 'a•••@uc.pt' });
  });

  it('asks by both documents when both are typed: either one is enough', async () => {
    const { deps, store } = setup();
    store.addRegistration({ email: 'pelo.passaporte@uc.pt', passport: 'AB123456', country: 'PT' });
    // The CPF is new; the passport already has a registration.
    expect(await body(await check({ cpf: CPF, passport: 'AB123456', country: 'PT', email: 'nova@gmail.com' }, deps))).toEqual({ duplicate: true, maskedEmail: 'p•••@uc.pt' });
    // An invalid CPF next to a good passport does not hide the passport.
    expect(await body(await check({ cpf: '123', passport: 'AB123456', country: 'PT', email: 'nova@gmail.com' }, deps))).toEqual({ duplicate: true, maskedEmail: 'p•••@uc.pt' });
  });

  it('answers 404 for an unknown event', async () => {
    const { deps } = setup();
    expect((await check({ eventSlug: '1999', cpf: CPF }, deps)).status).toBe(404);
  });

  it(`stops after ${LIMITS.checkPerIp.max} checks from one address in an hour`, async () => {
    const { deps } = setup();
    for (let i = 0; i < LIMITS.checkPerIp.max; i += 1) await check({ cpf: CPF }, deps);
    expect((await check({ cpf: CPF }, deps)).status).toBe(429);
  });

  it('is scoped to the event of the form', () => {
    expect(EVENT.id).not.toBe(OLD_EVENT.id);
  });
});

describe('account e-mails', () => {
  const kinds = ['confirm', 'exists', 'recovery', 'link'] as const;

  it.each(EMAIL_LOCALES.flatMap((locale) => kinds.map((kind) => [locale, kind] as const)))(
    '%s / %s has a subject, the link and no placeholder left',
    (locale, kind) => {
      const mail = renderAccountEmail(kind, locale, {
        firstName: 'Maria',
        eventName: 'II SIEAmB',
        url: 'https://sieamb.org/2027/conta/x?t=1',
        accountEmail: 'm•••@ufcg.edu.br',
      });
      expect(mail.subject.length).toBeGreaterThan(5);
      expect(mail.subject).toContain('II SIEAmB');
      expect(mail.text).toContain('https://sieamb.org/2027/conta/x?t=1');
      expect(mail.html).toContain('href="https://sieamb.org/2027/conta/x?t=1"');
      expect(mail.text + mail.html + mail.subject).not.toMatch(/undefined|\$\{|\[object/);
    },
  );

  it('greets without a name when there is none, and escapes a name that looks like markup', () => {
    expect(renderAccountEmail('recovery', 'pt-BR', { firstName: '', eventName: 'X', url: 'u' }).text).toMatch(/^Olá\./);
    const mail = renderAccountEmail('confirm', 'pt-BR', { firstName: '<b>x</b>', eventName: 'X', url: 'u' });
    expect(mail.html).toContain('&lt;b&gt;x&lt;/b&gt;');
    expect(mail.html).not.toContain('<b>x</b>');
  });

  it('masks an address down to its first letter and domain', () => {
    expect(maskEmail('paula.nunes@outlook.com')).toBe('p•••@outlook.com');
    expect(maskEmail('a@b.co')).toBe('a•••@b.co');
    expect(maskEmail('not-an-address')).toBe('•••');
    expect(maskEmail('@x.com')).toBe('•••');
  });
});

describe('notifications under the bell (#221)', () => {
  const notice = (over: Record<string, unknown> = {}) => ({
    id: `n-${Math.random()}`,
    userId: USER.id,
    kind: 'submission.received',
    data: { number: 12, title: 'Trabalho' },
    eventSlug: '2027',
    readAt: null as string | null,
    createdAt: '2026-11-17T12:00:00.000Z',
    ...over,
  });

  it('needs a login', async () => {
    const { deps } = setup();
    expect((await handleAccount(call('GET', 'notifications'), 'notifications', deps)).status).toBe(401);
    expect((await handleAccount(call('POST', 'notifications-read', { body: {} }), 'notifications-read', deps)).status).toBe(401);
  });

  it('shows a person their own notices, newest first, with how many are unread', async () => {
    const { deps, auth, store } = setup();
    const token = auth.login(USER);
    store.notices.push(
      notice({ id: 'old', createdAt: '2026-11-16T12:00:00.000Z', readAt: '2026-11-16T13:00:00.000Z' }),
      notice({ id: 'new', kind: 'announcement', data: { subject: 'Prazo', body: 'Texto' }, createdAt: '2026-11-17T15:00:00.000Z' }),
      notice({ id: 'mid' }),
      notice({ id: 'not-mine', userId: 'someone-else' }),
    );
    const data = await body(await handleAccount(call('GET', 'notifications', { token }), 'notifications', deps));
    expect(data.unread).toBe(2);
    expect((data.items as { id: string }[]).map((n) => n.id)).toEqual(['new', 'mid', 'old']);
    expect((data.items as Record<string, unknown>[])[0]).toEqual({ id: 'new', kind: 'announcement', data: { subject: 'Prazo', body: 'Texto' }, eventSlug: '2027', readAt: null, createdAt: '2026-11-17T15:00:00.000Z' });
    expect(JSON.stringify(data)).not.toContain('not-mine');
  });

  it('marks only that person’s notices as read', async () => {
    const { deps, auth, store } = setup();
    const token = auth.login(USER);
    store.notices.push(notice({ id: 'a' }), notice({ id: 'b' }), notice({ id: 'other', userId: 'someone-else' }));
    expect((await handleAccount(call('POST', 'notifications-read', { token, body: {} }), 'notifications-read', deps)).status).toBe(200);
    expect(store.notices.filter((n) => n.userId === USER.id).every((n) => n.readAt === NOW.toISOString())).toBe(true);
    expect(store.notices.find((n) => n.id === 'other')!.readAt).toBeNull();
    const data = await body(await handleAccount(call('GET', 'notifications', { token }), 'notifications', deps));
    expect(data.unread).toBe(0);
  });
});
