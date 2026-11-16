import { handleEmailSweep } from '../../../../packages/server/src/payments/notifications';
import { paymentsRuntime } from '../../../../packages/server/src/payments/runtime';

// Thin Vercel entry point for the background job, called on a schedule.
// The logic and its tests live in packages/server.
export const POST = (request: Request): Promise<Response> => {
  const { env, deps, emails } = paymentsRuntime();
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
    },
  );
};
