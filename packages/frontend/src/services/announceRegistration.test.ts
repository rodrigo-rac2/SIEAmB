import { describe, expect, it, vi } from 'vitest';
import { announceRegistration } from './payments';

const TOKEN = '3f2b8c1e-9a4d-4e7f-8b21-6c5d4e3f2a10';

describe('announceRegistration (#195)', () => {
  it('posts the pay token to the server, in a request that survives leaving the page', () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 202 }));
    announceRegistration(TOKEN, fetchMock as unknown as typeof fetch);
    const [url, init] = fetchMock.mock.calls[0]! as unknown as [string, RequestInit];
    expect(url).toBe('/api/v1/registrations/received');
    expect(init.method).toBe('POST');
    expect(init.keepalive).toBe(true);
    expect(JSON.parse(String(init.body))).toEqual({ token: TOKEN });
  });

  it('never throws or rejects when the server cannot be reached: the form must not fail for an e-mail', async () => {
    const fetchMock = vi.fn(async () => {
      throw new TypeError('network down');
    });
    expect(() => announceRegistration(TOKEN, fetchMock as unknown as typeof fetch)).not.toThrow();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
});
