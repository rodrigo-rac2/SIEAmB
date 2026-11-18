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
  /** Changes the address an account logs in with, already confirmed. `in_use` when another account has it. */
  setEmail(userId: string, email: string): Promise<'ok' | 'in_use'>;
}

/** A password nobody knows, for the time between creating an account and its owner choosing one. */
export const unguessablePassword = (): string => randomBytes(36).toString('base64url');

/** An account created less than this long ago was created by the call that is asking. */
export const NEW_ACCOUNT_MS = 30_000;

interface GenerateLinkAnswer {
  id?: string;
  created_at?: string;
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

  private async signupLink(email: string, fullName: string): Promise<GenerateLinkAnswer | 'exists'> {
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
    if (response.status === 422 && answer.error_code === 'email_exists') return 'exists';
    if (!response.ok || !answer.hashed_token || !answer.id) {
      throw new Error(`auth_signup_failed: ${response.status} ${answer.error_code ?? ''}`.trim());
    }
    return answer;
  }

  async startSignup(email: string, fullName: string, now: Date = new Date()): Promise<SignupStart> {
    const first = await this.signupLink(email, fullName);
    if (first === 'exists') return { kind: 'exists' };
    const createdAt = Date.parse(first.created_at ?? '');
    const isNew = !Number.isNaN(createdAt) && now.getTime() - createdAt < NEW_ACCOUNT_MS;
    if (isNew) return { kind: 'link', tokenHash: first.hashed_token! };

    // The account was started earlier and never confirmed. It keeps the password it
    // was started with, which someone else may have chosen, so replace it. Changing
    // the password cancels the link just issued: ask for a fresh one afterwards.
    await this.setPassword(first.id!, unguessablePassword());
    const second = await this.signupLink(email, fullName);
    if (second === 'exists') return { kind: 'exists' };
    return { kind: 'link', tokenHash: second.hashed_token! };
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

  async setEmail(userId: string, email: string): Promise<'ok' | 'in_use'> {
    const response = await this.call(`admin/users/${encodeURIComponent(userId)}`, {
      method: 'PUT',
      body: JSON.stringify({ email, email_confirm: true }),
    });
    // In use: documented as 422 `email_exists`; seen on 2026-11-18 as 500 with the database's
    // unique-violation code 23505 (#289).
    if (response.status === 422 || response.status === 500) {
      const answer = (await response.json().catch(() => ({}))) as { error_code?: string; code?: string };
      if (answer.error_code === 'email_exists' || answer.code === '23505') return 'in_use';
    }
    if (!response.ok) throw new Error(`auth_email_failed: ${response.status}`);
    return 'ok';
  }
}
