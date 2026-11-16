import { randomBytes } from 'node:crypto';

/** The person behind an access token, as Supabase Auth reports it. */
export interface AuthUser {
  id: string;
  email: string;
  emailConfirmed: boolean;
}

export type SignupStart =
  /** A confirmation link can be sent: the account is new, or was never confirmed. */
  | { kind: 'link'; tokenHash: string }
  /** The address already has a confirmed account. */
  | { kind: 'exists' };

/**
 * What the account handlers need from the login service. Passwords live there
 * and only there: our tables never hold one (#208).
 */
export interface AuthGateway {
  startSignup(email: string, fullName: string): Promise<SignupStart>;
  /** Null when the address has no account. */
  startRecovery(email: string): Promise<{ tokenHash: string } | null>;
  /** Null for a missing, expired or forged token. */
  userFromToken(accessToken: string): Promise<AuthUser | null>;
  setPassword(userId: string, password: string): Promise<void>;
}

/** A password nobody knows, for the time between creating an account and its owner choosing one. */
export const unguessablePassword = (): string => randomBytes(36).toString('base64url');

interface GenerateLinkAnswer {
  id?: string;
  hashed_token?: string;
  error_code?: string;
  code?: number | string;
}

/**
 * Supabase Auth over its REST API with the service role key. Server only.
 *
 * Accounts are created without a usable password: the person chooses it after
 * clicking the link in the e-mail. If the password were set before the address
 * is confirmed, anyone could prepare an account on someone else's address and
 * keep the password once the real owner confirms it.
 */
export class SupabaseAuthGateway implements AuthGateway {
  private readonly base: string;

  constructor(
    supabaseUrl: string,
    private readonly serviceRoleKey: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    this.base = `${supabaseUrl.replace(/\/+$/, '')}/auth/v1`;
  }

  private call(path: string, init: RequestInit & { token?: string } = {}): Promise<Response> {
    const { token, ...rest } = init;
    return this.fetchImpl(`${this.base}/${path}`, {
      ...rest,
      headers: {
        apikey: this.serviceRoleKey,
        Authorization: `Bearer ${token ?? this.serviceRoleKey}`,
        Accept: 'application/json',
        ...(rest.body ? { 'Content-Type': 'application/json' } : {}),
      },
    });
  }

  async startSignup(email: string, fullName: string): Promise<SignupStart> {
    const response = await this.call('admin/generate_link', {
      method: 'POST',
      body: JSON.stringify({
        type: 'signup',
        email,
        password: unguessablePassword(),
        data: { full_name: fullName },
      }),
    });
    const answer = (await response.json().catch(() => ({}))) as GenerateLinkAnswer;
    if (response.status === 422 && answer.error_code === 'email_exists') return { kind: 'exists' };
    if (!response.ok || !answer.hashed_token || !answer.id) {
      throw new Error(`auth_signup_failed: ${response.status} ${answer.error_code ?? ''}`.trim());
    }
    // An account that was started earlier and never confirmed keeps the password it
    // was started with, which may have been chosen by someone else. Replace it.
    await this.setPassword(answer.id, unguessablePassword());
    return { kind: 'link', tokenHash: answer.hashed_token };
  }

  async startRecovery(email: string): Promise<{ tokenHash: string } | null> {
    const response = await this.call('admin/generate_link', {
      method: 'POST',
      body: JSON.stringify({ type: 'recovery', email }),
    });
    const answer = (await response.json().catch(() => ({}))) as GenerateLinkAnswer;
    if (response.status === 404) return null;
    if (!response.ok || !answer.hashed_token) {
      throw new Error(`auth_recovery_failed: ${response.status} ${answer.error_code ?? ''}`.trim());
    }
    return { tokenHash: answer.hashed_token };
  }

  async userFromToken(accessToken: string): Promise<AuthUser | null> {
    const response = await this.call('user', { token: accessToken });
    if (response.status === 401 || response.status === 403) return null;
    if (!response.ok) throw new Error(`auth_user_failed: ${response.status}`);
    const user = (await response.json()) as {
      id?: string;
      email?: string;
      email_confirmed_at?: string | null;
    };
    if (!user.id || !user.email) return null;
    return {
      id: user.id,
      email: user.email.toLowerCase(),
      emailConfirmed: Boolean(user.email_confirmed_at),
    };
  }

  async setPassword(userId: string, password: string): Promise<void> {
    const response = await this.call(`admin/users/${encodeURIComponent(userId)}`, {
      method: 'PUT',
      body: JSON.stringify({ password }),
    });
    if (!response.ok) throw new Error(`auth_password_failed: ${response.status}`);
  }
}
