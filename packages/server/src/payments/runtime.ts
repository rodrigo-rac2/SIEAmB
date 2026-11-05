import type { Log } from './http';
import { SupabasePaymentStore } from './supabaseStore';
import type { PaymentStore } from './store';

/** What the Vercel entry points read from the environment, in one place. */
export interface PaymentsRuntime {
  env: { accessToken?: string; webhookSecret?: string; now: Date };
  deps: { fetch: typeof fetch; store?: PaymentStore; log: Log };
}

type Env = Record<string, string | undefined>;

/**
 * `PAYMENTS_NOW` moves the clock for the fee lookup so a lot can be tried before
 * it starts. It is ignored in production, where the real time always applies.
 */
function clock(env: Env): Date {
  const override = env.VERCEL_ENV === 'production' ? undefined : env.PAYMENTS_NOW;
  if (override) {
    const date = new Date(override);
    if (!Number.isNaN(date.getTime())) return date;
  }
  return new Date();
}

export function paymentsRuntime(env: Env = process.env): PaymentsRuntime {
  const store =
    env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY
      ? new SupabasePaymentStore(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
      : undefined;
  return {
    env: {
      accessToken: env.MP_ACCESS_TOKEN || undefined,
      webhookSecret: env.MP_WEBHOOK_SECRET || undefined,
      now: clock(env),
    },
    deps: {
      fetch,
      store,
      log: (event, data) => console.log(JSON.stringify({ event, ...data })),
    },
  };
}
