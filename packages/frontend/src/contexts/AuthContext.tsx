import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { accountsEnabled, getAuthClient } from '../services/account';

export type SignInError = 'invalid_credentials' | 'email_not_confirmed' | 'too_many_attempts' | 'generic';
export type LinkType = 'signup' | 'recovery';

export interface AuthState {
  /** False when the deployment has accounts switched off. */
  enabled: boolean;
  /** True until the stored session has been read. */
  loading: boolean;
  email: string | null;
  /** The token the server checks on every account call; null when logged out. */
  accessToken: string | null;
  signIn(email: string, password: string): Promise<SignInError | null>;
  signOut(): Promise<void>;
  /** Exchanges the token hash of an e-mail link for a session. False when it is expired or used. */
  verifyLink(tokenHash: string, type: LinkType): Promise<boolean>;
}

const OFF: AuthState = {
  enabled: false,
  loading: false,
  email: null,
  accessToken: null,
  signIn: async () => 'generic',
  signOut: async () => undefined,
  verifyLink: async () => false,
};

export const AuthContext = createContext<AuthState>(OFF);

// A link can be used once. React mounts effects twice in development, and a second
// attempt would fail, so the outcome of each token is kept for the life of the page.
const verified = new Map<string, Promise<boolean>>();

export function AuthProvider({ children }: { children: ReactNode }) {
  const client = getAuthClient();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(Boolean(client));

  useEffect(() => {
    if (!client) return;
    let active = true;
    void client.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setLoading(false);
    });
    const { data } = client.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [client]);

  const signIn = useCallback(
    async (email: string, password: string): Promise<SignInError | null> => {
      if (!client) return 'generic';
      const { error } = await client.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
      if (!error) return null;
      if (error.code === 'invalid_credentials') return 'invalid_credentials';
      if (error.code === 'email_not_confirmed') return 'email_not_confirmed';
      if (error.status === 429) return 'too_many_attempts';
      return 'generic';
    },
    [client],
  );

  const signOut = useCallback(async () => {
    await client?.auth.signOut();
  }, [client]);

  const verifyLink = useCallback(
    (tokenHash: string, type: LinkType): Promise<boolean> => {
      if (!client) return Promise.resolve(false);
      const key = `${type}:${tokenHash}`;
      let outcome = verified.get(key);
      if (!outcome) {
        outcome = (async () => {
          // Trying a link drops whatever session the browser had. Keep it, so a link
          // that is already used does not log out someone who was logged in.
          const { data: before } = await client.auth.getSession();
          const { data, error } = await client.auth.verifyOtp({ token_hash: tokenHash, type });
          if (!error && data.session) return true;
          if (before.session) {
            await client.auth.setSession({
              access_token: before.session.access_token,
              refresh_token: before.session.refresh_token,
            });
          }
          return false;
        })().catch(() => false);
        verified.set(key, outcome);
      }
      return outcome;
    },
    [client],
  );

  const value = useMemo<AuthState>(
    () => ({
      enabled: accountsEnabled(),
      loading,
      email: session?.user.email ?? null,
      accessToken: session?.access_token ?? null,
      signIn,
      signOut,
      verifyLink,
    }),
    [loading, session, signIn, signOut, verifyLink],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = (): AuthState => useContext(AuthContext);
