import { describe, expect, it } from 'vitest';
import { SupabaseAuthGateway, unguessablePassword } from './auth';

const NOW = new Date('2026-11-17T15:00:00.000Z');

interface Recorded {
  method: string;
  path: string;
  body: Record<string, unknown> | null;
  authorization: string | null;
}

/** A login service that answers from a queue and records what it was asked. */
function gateway(answers: { status?: number; body: unknown }[]) {
  const calls: Recorded[] = [];
  const queue = [...answers];
  const fetchImpl = (async (url: string, init: RequestInit = {}) => {
    const headers = new Headers(init.headers);
    calls.push({
      method: init.method ?? 'GET',
      path: url.replace('https://db.example/auth/v1/', ''),
      body: init.body ? (JSON.parse(init.body as string) as Record<string, unknown>) : null,
      authorization: headers.get('authorization'),
    });
    const answer = queue.shift() ?? { status: 500, body: {} };
    return new Response(JSON.stringify(answer.body), { status: answer.status ?? 200 });
  }) as typeof fetch;
  return { auth: new SupabaseAuthGateway('https://db.example/', 'service-key', fetchImpl), calls };
}

const link = (over: Record<string, unknown> = {}) => ({
  body: { id: 'user-1', created_at: NOW.toISOString(), hashed_token: 'hash-1', ...over },
});

describe('SupabaseAuthGateway.startSignup', () => {
  it('creates a new account with a password nobody knows and returns its link', async () => {
    const { auth, calls } = gateway([link()]);
    expect(await auth.startSignup('a@b.org', 'Ana', NOW)).toEqual({ kind: 'link', tokenHash: 'hash-1' });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ method: 'POST', path: 'admin/generate_link', authorization: 'Bearer service-key' });
    expect(calls[0]!.body).toMatchObject({ type: 'signup', email: 'a@b.org', data: { full_name: 'Ana' } });
    expect(String(calls[0]!.body!.password).length).toBeGreaterThanOrEqual(40);
  });

  it('replaces the password of an account started earlier, then asks for a fresh link', async () => {
    // Someone else may have started the account with a password they know.
    const old = new Date(NOW.getTime() - 3600_000).toISOString();
    const { auth, calls } = gateway([
      link({ created_at: old, hashed_token: 'cancelled-by-the-password-change' }),
      { body: {} },
      link({ created_at: old, hashed_token: 'fresh' }),
    ]);
    expect(await auth.startSignup('a@b.org', 'Ana', NOW)).toEqual({ kind: 'link', tokenHash: 'fresh' });
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      'POST admin/generate_link',
      'PUT admin/users/user-1',
      'POST admin/generate_link',
    ]);
    expect(String(calls[1]!.body!.password).length).toBeGreaterThanOrEqual(40);
  });

  it('treats an account with no creation date as an old one', async () => {
    const { auth, calls } = gateway([link({ created_at: undefined }), { body: {} }, link({ hashed_token: 'fresh' })]);
    expect(await auth.startSignup('a@b.org', 'Ana', NOW)).toEqual({ kind: 'link', tokenHash: 'fresh' });
    expect(calls).toHaveLength(3);
  });

  it('says the address already has a confirmed account', async () => {
    const { auth } = gateway([{ status: 422, body: { error_code: 'email_exists' } }]);
    expect(await auth.startSignup('a@b.org', 'Ana', NOW)).toEqual({ kind: 'exists' });
  });

  it('fails loudly on anything else, without the address in the error', async () => {
    const { auth } = gateway([{ status: 500, body: { error_code: 'unexpected_failure' } }]);
    await expect(auth.startSignup('a@b.org', 'Ana', NOW)).rejects.toThrow('auth_signup_failed: 500 unexpected_failure');
    const noToken = gateway([{ body: { id: 'user-1' } }]);
    await expect(noToken.auth.startSignup('a@b.org', 'Ana', NOW)).rejects.toThrow(/^auth_signup_failed/);
  });
});

describe('SupabaseAuthGateway, the rest', () => {
  it('returns a recovery link, or null when the address has no account', async () => {
    const found = gateway([{ body: { hashed_token: 'rec-1' } }]);
    expect(await found.auth.startRecovery('a@b.org')).toEqual({ tokenHash: 'rec-1' });
    expect(found.calls[0]!.body).toEqual({ type: 'recovery', email: 'a@b.org' });
    const missing = gateway([{ status: 404, body: { error_code: 'user_not_found' } }]);
    expect(await missing.auth.startRecovery('a@b.org')).toBeNull();
    const broken = gateway([{ status: 500, body: {} }]);
    await expect(broken.auth.startRecovery('a@b.org')).rejects.toThrow(/^auth_recovery_failed: 500/);
  });

  it('reads the person behind a token, with the token as the bearer', async () => {
    const { auth, calls } = gateway([
      { body: { id: 'user-1', email: 'Maria@UFCG.edu.br', email_confirmed_at: '2026-11-16T10:00:00Z' } },
    ]);
    expect(await auth.userFromToken('the-access-token')).toEqual({ id: 'user-1', email: 'maria@ufcg.edu.br', emailConfirmed: true });
    expect(calls[0]).toMatchObject({ method: 'GET', path: 'user', authorization: 'Bearer the-access-token' });
  });

  it.each([
    ['a token the service refuses (401)', { status: 401, body: {} }],
    ['a session that has ended (403)', { status: 403, body: { error_code: 'bad_jwt' } }],
    ['an answer with no user in it', { body: {} }],
  ])('treats %s as not logged in', async (_name, answer) => {
    expect(await gateway([answer]).auth.userFromToken('x')).toBeNull();
  });

  it('reports an unconfirmed e-mail as unconfirmed', async () => {
    const { auth } = gateway([{ body: { id: 'u', email: 'a@b.org', email_confirmed_at: null } }]);
    expect((await auth.userFromToken('x'))!.emailConfirmed).toBe(false);
  });

  it('does not mistake an outage for a logged-out person', async () => {
    await expect(gateway([{ status: 503, body: {} }]).auth.userFromToken('x')).rejects.toThrow('auth_user_failed: 503');
  });

  it('sets a password through the admin endpoint and fails loudly when refused', async () => {
    const { auth, calls } = gateway([{ body: {} }]);
    await auth.setPassword('user/1', 'uma-senha-bem-longa');
    expect(calls[0]).toMatchObject({ method: 'PUT', path: 'admin/users/user%2F1', body: { password: 'uma-senha-bem-longa' } });
    await expect(gateway([{ status: 422, body: {} }]).auth.setPassword('u', 'x')).rejects.toThrow('auth_password_failed: 422');
  });

  it('changes the e-mail, already confirmed, and says when another account has it', async () => {
    const { auth, calls } = gateway([{ body: {} }]);
    expect(await auth.setEmail('user/1', 'nova@ufcg.edu.br')).toBe('ok');
    expect(calls[0]).toMatchObject({ method: 'PUT', path: 'admin/users/user%2F1', body: { email: 'nova@ufcg.edu.br', email_confirm: true } });
    expect(await gateway([{ status: 422, body: { error_code: 'email_exists' } }]).auth.setEmail('u', 'x@y.org')).toBe('in_use');
    // What Supabase actually answered on 2026-11-18 (#289).
    expect(await gateway([{ status: 500, body: { code: '23505', message: 'duplicate key value violates unique constraint "users_email_partial_key"' } }]).auth.setEmail('u', 'x@y.org')).toBe('in_use');
    await expect(gateway([{ status: 422, body: { error_code: 'validation_failed' } }]).auth.setEmail('u', 'x')).rejects.toThrow('auth_email_failed: 422');
    await expect(gateway([{ status: 500, body: {} }]).auth.setEmail('u', 'x@y.org')).rejects.toThrow('auth_email_failed: 500');
  });

  it('makes a different unguessable password every time', () => {
    const made = new Set(Array.from({ length: 50 }, unguessablePassword));
    expect(made.size).toBe(50);
    for (const password of made) expect(password).toMatch(/^[A-Za-z0-9_-]{48}$/);
  });
});
