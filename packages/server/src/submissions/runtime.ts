import { SupabaseAuthGateway } from '../account/auth';
import { sha256 } from '../account/handlers';
import { SupabaseAccountStore } from '../account/supabaseStore';
import { RestClient } from '../core/rest';
import { SupabaseOutbox } from '../core/supabaseOutbox';
import type { Log } from '../payments/http';
import { createSmtpMailer, smtpSettings } from '../payments/mailer';
import { siteOrigin } from '../payments/runtime';
import type { SubmissionDeps } from './handlers';
import { RULES, submissionClock } from './rules';
import { SupabaseFileStorage, SupabaseSubmissionStore } from './supabaseStore';

type Env = Record<string, string | undefined>;

/**
 * What the submissions entry point needs, read from the environment in one place.
 * Null where the submission system is off (same switch as accounts) or the
 * database is not configured.
 */
export function submissionsRuntime(env: Env = process.env): SubmissionDeps | null {
  if (env.ACCOUNTS_ENABLED !== 'true') return null;
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  const rest = new RestClient(url, key);
  const accounts = new SupabaseAccountStore(url, key);
  const log: Log = (event, data) => console.log(JSON.stringify({ event, ...data }));
  const settings = smtpSettings(env);
  const maxMb = Math.max(...RULES.map((r) => r.maxFileMb));
  return {
    store: new SupabaseSubmissionStore(rest),
    files: new SupabaseFileStorage(rest, maxMb * 1024 * 1024),
    auth: new SupabaseAuthGateway(url, key),
    outbox: new SupabaseOutbox(rest),
    mailer: settings ? createSmtpMailer(settings) : undefined,
    hitRateLimit: (k, windowSeconds, max) => accounts.hitRateLimit(k, windowSeconds, max),
    profileName: async (userId) => (await accounts.getProfile(userId))?.fullName ?? '',
    siteUrl: siteOrigin(env),
    log,
    now: () => new Date(),
    windowNow: () => submissionClock(env, new Date()),
    pepper: sha256(`rate-limit:${key}`),
  };
}
