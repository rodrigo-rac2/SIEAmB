/**
 * Browser side of accounts (#208). Logging in and keeping the session is done by
 * Supabase Auth; everything else goes through /api/v1/account, where the server
 * checks who is logged in on every call.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/** Accounts are switched on per deployment, so production stays as it is until released. */
export const accountsEnabled = (): boolean =>
  import.meta.env.VITE_ACCOUNTS_ENABLED === 'true' &&
  Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);

let client: SupabaseClient | null = null;

/** The one auth client of the page: it owns the session kept in the browser. */
export function getAuthClient(): SupabaseClient | null {
  if (!accountsEnabled()) return null;
  client ??= createClient(
    import.meta.env.VITE_SUPABASE_URL as string,
    import.meta.env.VITE_SUPABASE_ANON_KEY as string,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        // Our links carry a token hash we verify ourselves; nothing is read from the URL.
        detectSessionInUrl: false,
        storageKey: 'sieamb-auth',
      },
    },
  );
  return client;
}

export type RegistrationState = 'PAID' | 'PENDING' | 'UNPAID' | 'CANCELLED';
export type LinkRequestState = 'PENDING' | 'NEEDS_ORGANISER' | null;

export interface AccountUser {
  email: string;
  fullName: string;
  cpf: string | null;
  passport: string | null;
  country: string;
  institution: string | null;
  documentLocked: boolean;
}

export interface AccountRegistration {
  id: string;
  eventSlug: string;
  eventName: string;
  category: string;
  modality: string;
  createdAt: string;
  state: RegistrationState;
  amountCents: number | null;
  payToken: string | null;
  paymentId: string | null;
}

export interface AccountSuggestion {
  registrationId: string;
  eventSlug: string;
  eventName: string;
  maskedEmail: string;
  createdAt: string;
  request: LinkRequestState;
}

export interface Account {
  /** Where this person may open the organisation area (#219). */
  panels?: { platformAdmin: boolean; slugs: string[] };
  user: AccountUser;
  registrations: AccountRegistration[];
  suggestions: AccountSuggestion[];
}

export interface ProfileInput {
  fullName?: string;
  institution?: string;
  cpf?: string;
  passport?: string;
  country?: string;
}

/** Error codes the screens have a text for; anything else is shown as `generic`. */
const KNOWN_ERRORS = [
  'invalid_email',
  'invalid_name',
  'invalid_cpf',
  'invalid_passport',
  'invalid_country',
  'weak_password',
  'too_many_attempts',
  'not_logged_in',
  'email_not_confirmed',
  'document_locked',
  'document_in_use',
  'already_registered',
  'registration_not_found',
  'link_not_found',
  'link_expired',
  'cannot_link',
] as const;

export type AccountErrorCode = (typeof KNOWN_ERRORS)[number] | 'generic';

export class AccountError extends Error {
  constructor(readonly code: AccountErrorCode) {
    super(code);
    this.name = 'AccountError';
  }
}

async function request<T>(
  method: 'GET' | 'POST' | 'PUT',
  action: string,
  options: { body?: unknown; token?: string | null } = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/v1/account/${action}`, {
      method,
      headers: {
        ...(options.body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
      },
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
    });
  } catch {
    throw new AccountError('generic');
  }
  const data = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) {
    const code = (KNOWN_ERRORS as readonly string[]).includes(data.error ?? '')
      ? (data.error as AccountErrorCode)
      : 'generic';
    throw new AccountError(code);
  }
  return data as T;
}

export const startSignup = (input: {
  email: string;
  fullName: string;
  locale: string;
  eventSlug: string;
  /** The page the person was going to, to continue there after the e-mail link. */
  next?: string;
}): Promise<unknown> => request('POST', 'signup', { body: input });

export const startRecovery = (input: {
  email: string;
  locale: string;
  eventSlug: string;
}): Promise<unknown> => request('POST', 'recover', { body: input });

export const fetchAccount = (token: string): Promise<Account> => request('GET', 'me', { token });

export const saveProfile = (token: string, input: ProfileInput): Promise<Account> =>
  request('PUT', 'profile', { token, body: input });

export const savePassword = (token: string, password: string): Promise<unknown> =>
  request('POST', 'password', { token, body: { password } });

export const requestRegistrationLink = (
  token: string,
  registrationId: string,
  noAccess = false,
): Promise<{ request: LinkRequestState; maskedEmail?: string }> =>
  request('POST', 'link-request', { token, body: { registrationId, noAccess } });

export const confirmRegistrationLink = (linkToken: string): Promise<unknown> =>
  request('POST', 'link-confirm', { body: { token: linkToken } });

export interface SiteNotification {
  id: string;
  kind: string;
  data: Record<string, string | number>;
  eventSlug: string | null;
  readAt: string | null;
  createdAt: string;
}

/** What is under the bell (#221). */
export const fetchNotifications = (token: string): Promise<{ unread: number; items: SiteNotification[] }> =>
  request('GET', 'notifications', { token });

export const markNotificationsRead = (token: string): Promise<unknown> =>
  request('POST', 'notifications-read', { token, body: {} });

export interface DuplicateCheck {
  duplicate: boolean;
  maskedEmail?: string;
}

/** Never blocks a registration on its own failure: an error counts as "no duplicate". */
export async function checkDuplicateRegistration(input: {
  eventSlug: string;
  email: string;
  cpf?: string;
  passport?: string;
  country?: string;
}): Promise<DuplicateCheck> {
  if (!accountsEnabled()) return { duplicate: false };
  try {
    return await request<DuplicateCheck>('POST', 'registration-check', { body: input });
  } catch {
    return { duplicate: false };
  }
}

export const PASSWORD_MIN = 10;
