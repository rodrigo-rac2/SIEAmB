/** A CPF with valid check digits, different on every run. */
export function randomCpf(): string {
  const digits = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));
  if (new Set(digits).size === 1) digits[0] = (digits[0]! + 1) % 10;
  const check = (base: number[]) => {
    const sum = base.reduce((acc, d, i) => acc + d * (base.length + 1 - i), 0);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  const d1 = check(digits);
  const d2 = check([...digits, d1]);
  return [...digits, d1, d2].join('');
}

// ───────────────────────────── Dev database and login service ─────────────────────────────
// Used by the tests that need an account (#208, #216). Our own test addresses
// (e2e+…@sieamb.org) are never mailed, so accounts are made through the admin API.

export const SUPABASE_URL = process.env.SUPABASE_DEV_URL?.replace(/\/+$/, '');
export const SERVICE_KEY = process.env.SUPABASE_DEV_SERVICE_ROLE_KEY;
export const EVENT = '2027';
export const PASSWORD = 'e2e-Senha-comprida-2027';

export async function admin<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY!,
      Authorization: `Bearer ${SERVICE_KEY!}`,
      'content-type': 'application/json',
      Prefer: 'return=representation',
      ...init.headers,
    },
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`admin ${init.method ?? 'GET'} ${path}: ${response.status} ${text.slice(0, 200)}`);
  return (text ? JSON.parse(text) : null) as T;
}

export const unique = (label: string) =>
  `e2e+${label}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}@sieamb.org`;

/** A confirmed account with a known password. */
export async function createAccount(email: string, fullName: string): Promise<string> {
  const user = await admin<{ id: string }>('/auth/v1/admin/users', {
    method: 'POST',
    body: JSON.stringify({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: fullName } }),
  });
  return user.id;
}

/** Removes everything a test address left behind: papers and their files, registrations, the account. */
export async function cleanupAccounts(emails: string[]): Promise<void> {
  for (const email of emails) {
    const q = encodeURIComponent(email);
    await admin(`/rest/v1/pre_registrations?email=eq.${q}`, { method: 'DELETE' }).catch(() => undefined);
    const users = await admin<{ id: string }[]>(`/rest/v1/users?email=eq.${q}&select=id`).catch(() => []);
    for (const user of users) {
      const papers = await admin<{ file_path: string }[]>(`/rest/v1/submissions?user_id=eq.${user.id}&select=file_path`).catch(() => []);
      if (papers.length > 0) {
        await admin('/storage/v1/object/submissions', {
          method: 'DELETE',
          body: JSON.stringify({ prefixes: papers.map((p) => p.file_path) }),
        }).catch(() => undefined);
      }
      await admin(`/rest/v1/submissions?user_id=eq.${user.id}`, { method: 'DELETE' }).catch(() => undefined);
      await admin(`/rest/v1/event_members?user_id=eq.${user.id}`, { method: 'DELETE' }).catch(() => undefined);
      await admin(`/rest/v1/pre_registrations?user_id=eq.${user.id}`, { method: 'DELETE' }).catch(() => undefined);
      await admin(`/auth/v1/admin/users/${user.id}`, { method: 'DELETE' }).catch(() => undefined);
      await admin(`/rest/v1/users?id=eq.${user.id}`, { method: 'DELETE' }).catch(() => undefined);
    }
  }
}

/** True for the deployments these tests may write to: dev and previews, never production or a local build. */
export const isTestDeployment = (baseURL?: string): boolean =>
  Boolean(baseURL) && !/\/\/(www\.)?sieamb\.org/.test(baseURL!) && !baseURL!.includes('localhost');
