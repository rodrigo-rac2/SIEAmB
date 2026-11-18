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
