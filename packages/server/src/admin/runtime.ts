import { SupabaseAuthGateway } from '../account/auth';
import { RestClient } from '../core/rest';
import { SupabaseOutbox } from '../core/supabaseOutbox';
import type { Log } from '../payments/http';
import { createSmtpMailer, smtpSettings } from '../payments/mailer';
import { siteOrigin } from '../payments/runtime';
import { deliverEmail } from '../payments/notifications';
import { SupabasePaymentStore } from '../payments/supabaseStore';
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
  const mailer = settings ? createSmtpMailer(settings) : undefined;
  const siteUrl = siteOrigin(env);
  const payments = new SupabasePaymentStore(url, key);
  return {
    // A reminder by hand is an ordinary payment reminder under its own key: the same
    // text and the same checks at delivery (nothing is sent to someone who paid meanwhile).
    remind: async (registrationId, dedupeKey, now, deliver) => {
      const job = await payments.enqueueEmail({ preRegistrationId: registrationId, paymentId: null, kind: 'REMINDER', dedupeKey });
      if (!job) return 'duplicate';
      if (!deliver) return 'queued';
      const outcome = await deliverEmail(job, { store: payments, mailer, siteUrl, log }, now);
      return outcome === 'sent' || outcome === 'skipped' || outcome === 'failed' ? outcome : 'queued';
    },
    store: new SupabaseAdminStore(rest),
    auth: new SupabaseAuthGateway(url, key),
    outbox: new SupabaseOutbox(rest),
    mailer,
    siteUrl,
    log,
    now: () => new Date(),
  };
}
