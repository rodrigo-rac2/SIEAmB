import { SupabaseAuthGateway } from '../account/auth';
import { RestClient } from '../core/rest';
import { SupabaseOutbox } from '../core/supabaseOutbox';
import type { Log } from '../payments/http';
import { createSmtpMailer, smtpSettings } from '../payments/mailer';
import { siteOrigin } from '../payments/runtime';
import type { AdminDeps } from './handlers';
import { SupabaseAdminStore } from './supabaseStore';

type Env = Record<string, string | undefined>;

/** What the organisation area needs; null where the submission system is off or the database is not set up. */
export function adminRuntime(env: Env = process.env): AdminDeps | null {
  if (env.ACCOUNTS_ENABLED !== 'true') return null;
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  const rest = new RestClient(url, key);
  const log: Log = (event, data) => console.log(JSON.stringify({ event, ...data }));
  const settings = smtpSettings(env);
  return {
    store: new SupabaseAdminStore(rest),
    auth: new SupabaseAuthGateway(url, key),
    outbox: new SupabaseOutbox(rest),
    mailer: settings ? createSmtpMailer(settings) : undefined,
    siteUrl: siteOrigin(env),
    log,
    now: () => new Date(),
  };
}
