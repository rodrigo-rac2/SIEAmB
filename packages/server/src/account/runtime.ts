import type { Log } from '../payments/http';
import { createSmtpMailer, smtpSettings } from '../payments/mailer';
import { siteOrigin } from '../payments/runtime';
import { SupabaseAuthGateway } from './auth';
import { sha256, type AccountDeps } from './handlers';
import { SupabaseAccountStore } from './supabaseStore';

type Env = Record<string, string | undefined>;

/**
 * What the account entry point needs, read from the environment in one place.
 * Null when the database is not configured for this deployment.
 */
export function accountRuntime(env: Env = process.env): AccountDeps | null {
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  const log: Log = (event, data) => console.log(JSON.stringify({ event, ...data }));
  const settings = smtpSettings(env);
  return {
    store: new SupabaseAccountStore(url, key),
    auth: new SupabaseAuthGateway(url, key),
    mailer: settings ? createSmtpMailer(settings) : undefined,
    siteUrl: siteOrigin(env),
    log,
    now: () => new Date(),
    // Derived from a secret the deployment already has; never the secret itself.
    pepper: sha256(`rate-limit:${key}`),
  };
}
