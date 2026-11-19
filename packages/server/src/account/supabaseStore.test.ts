import { describe, expect, it, vi } from 'vitest';
import { SupabaseAccountStore } from './supabaseStore';

/** A store whose database answers are given by path, and which records what it asked. */
function storeWith(answers: (path: string) => unknown) {
  const asked: string[] = [];
  const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
    const path = String(input).split('/rest/v1/')[1]!;
    asked.push(path);
    return new Response(JSON.stringify(answers(path)), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as unknown as typeof fetch;
  return { store: new SupabaseAccountStore('https://db.example', 'service-key', fetchImpl), asked };
}

describe('listPanels', () => {
  const member = (role: string, slug: string | null) => ({ role, event: slug ? { slug } : null });

  it('separates the editions the person organises from those where they review (#315)', async () => {
    const { store, asked } = storeWith((path) =>
      path.startsWith('users?')
        ? [{ is_platform_admin: false }]
        : [member('ADMIN', '2027'), member('ORGANIZER', '2027'), member('REVIEWER', '2027'), member('REVIEWER', '2029'), member('ORGANIZER', '2025')],
    );
    expect(await store.listPanels('user-1')).toEqual({
      platformAdmin: false,
      slugs: ['2027', '2025'],
      reviewing: ['2027', '2029'],
    });
    // Only this person's roles are read.
    expect(asked.filter((p) => p.startsWith('event_members?'))).toEqual(['event_members?user_id=eq.user-1&select=role,event:events(slug)']);
  });

  it('a reviewer alone opens no organisation area; an unknown role or a removed edition counts for nothing', async () => {
    const { store } = storeWith((path) =>
      path.startsWith('users?') ? [{ is_platform_admin: false }] : [member('REVIEWER', '2027'), member('SOMETHING', '2027'), member('ADMIN', null)],
    );
    expect(await store.listPanels('user-1')).toEqual({ platformAdmin: false, slugs: [], reviewing: ['2027'] });
  });

  it('knows the owner, who has no role in any edition', async () => {
    const { store } = storeWith((path) => (path.startsWith('users?') ? [{ is_platform_admin: true }] : []));
    expect(await store.listPanels('user-1')).toEqual({ platformAdmin: true, slugs: [], reviewing: [] });
  });

  it('someone the users table does not know is nobody', async () => {
    const { store } = storeWith(() => []);
    expect(await store.listPanels('user-1')).toEqual({ platformAdmin: false, slugs: [], reviewing: [] });
  });
});

/** As above, also keeping the method, headers and body of each request. */
function recording(answers: (path: string) => unknown = () => []) {
  const requests: { path: string; method: string; prefer: string | null; body: unknown }[] = [];
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const path = String(input).split('/rest/v1/')[1]!;
    requests.push({
      path,
      method: init.method ?? 'GET',
      prefer: new Headers(init.headers).get('Prefer'),
      body: init.body ? JSON.parse(String(init.body)) : null,
    });
    return new Response(JSON.stringify(answers(path)), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as unknown as typeof fetch;
  return { store: new SupabaseAccountStore('https://db.example', 'service-key', fetchImpl), requests };
}

describe('who holds a document (ADR-010)', () => {
  it('asks for the CPF, or the passport together with its country, in one query', async () => {
    const holder = { id: 'u1', email: 'a@x.org', cpf: '52998224725', passport: null, country: 'BR' };
    const { store, requests } = recording(() => [holder]);
    expect(await store.findAccountsByDocument({ cpf: '52998224725', passport: 'AB123456', country: 'PT' })).toEqual([holder]);
    expect(requests.map((r) => r.path)).toEqual([
      'users?or=(cpf.eq.52998224725,and(passport.eq.AB123456,country.eq.PT))&select=id,email,cpf,passport,country&limit=5',
    ]);
  });

  it('asks by CPF alone, or by passport alone', async () => {
    const { store, requests } = recording();
    await store.findAccountsByDocument({ cpf: '52998224725', passport: null, country: null });
    await store.findAccountsByDocument({ cpf: null, passport: 'AB123456', country: 'PT' });
    expect(requests.map((r) => r.path.split('&select')[0])).toEqual([
      'users?or=(cpf.eq.52998224725)',
      'users?or=(and(passport.eq.AB123456,country.eq.PT))',
    ]);
  });

  it('never asks with an empty document, which would match every account without one', async () => {
    const { store, requests } = recording();
    expect(await store.findAccountsByDocument({ cpf: null, passport: null, country: null })).toEqual([]);
    // A passport with no country is not a document either.
    expect(await store.findAccountsByDocument({ cpf: null, passport: 'AB123456', country: null })).toEqual([]);
    expect(requests).toEqual([]);
  });
});

describe('the document that waits for a confirmed e-mail (ADR-010)', () => {
  it('is kept by the lower-cased address, replacing the one before', async () => {
    const { store, requests } = recording();
    await store.saveSignupDocument('Nova@UFCG.edu.br', { cpf: '52998224725', passport: null, country: null });
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      path: 'signup_documents?on_conflict=email&select=email',
      method: 'POST',
      prefer: 'resolution=merge-duplicates,return=representation',
      body: { email: 'nova@ufcg.edu.br', cpf: '52998224725', passport: null, country: null },
    });
  });

  it('keeps a country only next to a passport, as the table demands', async () => {
    const { store, requests } = recording();
    await store.saveSignupDocument('a@x.org', { cpf: '52998224725', passport: null, country: 'PT' });
    await store.saveSignupDocument('b@x.org', { cpf: null, passport: 'AB123456', country: 'PT' });
    expect(requests.map((r) => r.body)).toMatchObject([
      { cpf: '52998224725', passport: null, country: null },
      { cpf: null, passport: 'AB123456', country: 'PT' },
    ]);
  });

  it('is read and removed by the lower-cased address', async () => {
    const waiting = { cpf: null, passport: 'AB123456', country: 'PT' };
    const { store, requests } = recording((path) => (path.includes('select=cpf') ? [waiting] : []));
    expect(await store.getSignupDocument('Nova+1@UFCG.edu.br')).toEqual(waiting);
    await store.deleteSignupDocument('Nova+1@UFCG.edu.br');
    expect(requests.map((r) => [r.method, r.path])).toEqual([
      ['GET', 'signup_documents?email=eq.nova%2B1%40ufcg.edu.br&select=cpf,passport,country&limit=1'],
      ['DELETE', 'signup_documents?email=eq.nova%2B1%40ufcg.edu.br'],
    ]);
  });

  it('answers null when nothing waits', async () => {
    const { store } = recording();
    expect(await store.getSignupDocument('ninguem@x.org')).toBeNull();
  });
});
