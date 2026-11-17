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
import { CPF, EVENT, NOW, OLD_EVENT, OTHER_CPF, USER, call, setup } from './testing';

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
      body: { email: 'Nova.Pessoa@UFCG.edu.br ', fullName: '  Nova   Pessoa ', locale: 'pt-BR', eventSlug: '2027', ...over },
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
    expect((await body(response)).user.documentLocked).toBe(true);
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

  it('does not let the person change the document once it is saved', async () => {
    const { put, store } = start();
    await put({ cpf: CPF });
    const changed = await put({ cpf: OTHER_CPF });
    expect(changed.status).toBe(409);
    expect(await body(changed)).toEqual({ error: 'document_locked' });
    const swapped = await put({ passport: 'AB123456', country: 'PT' });
    expect(swapped.status).toBe(409);
    expect(store.profiles.get(USER.id)).toMatchObject({ cpf: CPF, passport: null });
    // Sending the same document again with other fields is fine.
    expect((await put({ cpf: CPF, institution: 'UFPB' })).status).toBe(200);
    expect(store.profiles.get(USER.id)?.institution).toBe('UFPB');
  });

  it('refuses a CPF that another account already has, without saying whose', async () => {
    const { put, store } = start();
    store.addProfile({ id: 'user-2', email: 'outra@ufcg.edu.br', emailConfirmed: true }).cpf = CPF;
    const response = await put({ cpf: CPF });
    expect(response.status).toBe(409);
    expect(await body(response)).toEqual({ error: 'document_in_use' });
    expect(store.profiles.get(USER.id)?.cpf).toBeNull();
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
