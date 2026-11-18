import { announceRegistration } from '../../../packages/server/src/admin/handlers';
import { adminRuntime } from '../../../packages/server/src/admin/runtime';
import { handleRegistrationReceived } from '../../../packages/server/src/payments/notifications';
import { paymentsRuntime } from '../../../packages/server/src/payments/runtime';

// Thin Vercel entry point: the form calls it right after saving a registration (#195).
// The logic and its tests live in packages/server.
export const POST = (request: Request): Promise<Response> => {
  const { env, deps, emails } = paymentsRuntime();
  return handleRegistrationReceived(
    request,
    { now: env.now },
    {
      store: emails.store,
      mailer: emails.mailer,
      siteUrl: emails.siteUrl,
      log: deps.log,
      // Where the organisation area is on, its organisers hear of each new registration (#219).
      onRegistered: async (registration) => {
        const admin = adminRuntime();
        if (admin) await announceRegistration(registration, admin, env.now);
      },
    },
  );
};
