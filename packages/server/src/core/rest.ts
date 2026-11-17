export const UNIQUE_VIOLATION = '23505';

export class RestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(`store_failed: ${status} ${code}`.trim());
    this.name = 'RestError';
  }
}

export const q = encodeURIComponent;

/**
 * Supabase's REST API with the service role key. Server only: this key bypasses
 * RLS and must never reach the browser bundle.
 */
export class RestClient {
  readonly origin: string;

  constructor(
    supabaseUrl: string,
    readonly serviceRoleKey: string,
    readonly fetchImpl: typeof fetch = fetch,
  ) {
    this.origin = supabaseUrl.replace(/\/+$/, '');
  }

  /** `path` is relative to /rest/v1. Throws RestError with the Postgres code on failure. */
  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await this.fetchImpl(`${this.origin}/rest/v1/${path}`, {
      ...init,
      headers: {
        apikey: this.serviceRoleKey,
        Authorization: `Bearer ${this.serviceRoleKey}`,
        Accept: 'application/json',
        ...(init.body ? { 'Content-Type': 'application/json', Prefer: 'return=representation' } : {}),
        ...init.headers,
      },
    });
    if (!response.ok) {
      const problem = (await response.json().catch(() => ({}))) as { code?: string };
      throw new RestError(response.status, problem.code ?? '');
    }
    const text = await response.text();
    return (text ? JSON.parse(text) : null) as T;
  }
}
