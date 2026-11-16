import type { Log } from './http';
import { createSmtpMailer, smtpSettings } from './mailer';
import { createPaymentNotifier, type Mailer } from './notifications';
import type { PaymentNotifier } from './sync';
import { SupabasePaymentStore } from './supabaseStore';
import type { PaymentStore } from './store';

/** What the Vercel entry points read from the environment, in one place. */
export interface PaymentsRuntime {
  env: { accessToken?: string; webhookSecret?: string; now: Date; feeNow: Date };
  deps: { fetch: typeof fetch; store?: PaymentStore; log: Log; notify?: PaymentNotifier };
  /** What the e-mail sweep needs (#185). */
  emails: {
    store?: PaymentStore;
    mailer?: Mailer;
    siteUrl: string;
    cronSecret?: string;
    /** Reminders (#187) stay off until someone turns them on for the environment. */
    remindersEnabled: boolean;
  };
}

type Env = Record<string, string | undefined>;

/**
 * `PAYMENTS_NOW` moves the clock of the fee lookup, and only that clock, so a
 * lot can be tried before it starts. It is ignored in production, where the
 * real time always applies. Order ages and payment dates always use real time.
 */
export function feeClock(env: Env, now: Date): Date {
  const override = env.VERCEL_ENV === 'production' ? undefined : env.PAYMENTS_NOW;
  if (override) {
    const date = new Date(override);
    if (!Number.isNaN(date.getTime())) return date;
  }
  return now;
}

/**
 * Where the links in an e-mail point. `SITE_URL` wins; production falls back to the
 * public address and any other deployment to its own Vercel address.
 */
export function siteOrigin(env: Env): string {
  const explicit = env.SITE_URL?.trim().replace(/\/+$/, '');
  if (explicit && /^https?:\/\//.test(explicit)) return explicit;
  if (env.VERCEL_ENV !== 'production' && env.VERCEL_URL) return `https://${env.VERCEL_URL}`;
  return 'https://sieamb.org';
}

export function paymentsRuntime(env: Env = process.env, now: Date = new Date()): PaymentsRuntime {
  const store =
    env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY
      ? new SupabasePaymentStore(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
      : undefined;
  const log: Log = (event, data) => console.log(JSON.stringify({ event, ...data }));
  const settings = smtpSettings(env);
  const mailer = settings ? createSmtpMailer(settings) : undefined;
  const siteUrl = siteOrigin(env);
  return {
    env: {
      accessToken: env.MP_ACCESS_TOKEN || undefined,
      webhookSecret: env.MP_WEBHOOK_SECRET || undefined,
      now,
      feeNow: feeClock(env, now),
    },
    deps: {
      fetch,
      store,
      log,
      // Without a sender the e-mails are still recorded, and go out once one is configured.
      notify: store ? createPaymentNotifier({ store, mailer, siteUrl, log }) : undefined,
    },
    emails: {
      store,
      mailer,
      siteUrl,
      cronSecret: env.CRON_SECRET || undefined,
      remindersEnabled: env.REMINDERS_ENABLED === 'true',
    },
  };
}
