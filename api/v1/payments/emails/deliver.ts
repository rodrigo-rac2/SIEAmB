import { deliverDueOutbox } from '../../../../packages/server/src/core/outbox';
import { RestClient } from '../../../../packages/server/src/core/rest';
import { SupabaseOutbox } from '../../../../packages/server/src/core/supabaseOutbox';
import { handleEmailSweep } from '../../../../packages/server/src/payments/notifications';
import { paymentsRuntime } from '../../../../packages/server/src/payments/runtime';

// Thin Vercel entry point for the background job, called on a schedule.
// The logic and its tests live in packages/server.
export const POST = (request: Request): Promise<Response> => {
  const { env, deps, emails } = paymentsRuntime();
  const { SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: key, ACCOUNTS_ENABLED: on } = process.env;
  // The general outbox only exists where the submission system is switched on.
  const outbox = on === 'true' && url && key ? new SupabaseOutbox(new RestClient(url, key)) : null;
  return handleEmailSweep(
    request,
    {
      cronSecret: emails.cronSecret,
      accessToken: env.accessToken,
      remindersEnabled: emails.remindersEnabled,
      now: env.now,
    },
    {
      store: emails.store,
      mailer: emails.mailer,
      siteUrl: emails.siteUrl,
      fetch: deps.fetch,
      notify: deps.notify,
      log: deps.log,
      sweepOutbox: outbox
        ? // 40 per run, every 10 minutes (the database starts it, #273): what an announcement could not send
          // in its own request (#281) is out within the hour.
          (now) => deliverDueOutbox({ outbox, mailer: emails.mailer, log: deps.log }, now, 40)
        : undefined,
    },
  );
};
