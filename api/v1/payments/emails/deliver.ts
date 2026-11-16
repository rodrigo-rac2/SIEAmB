import { handleEmailSweep } from '../../../../packages/server/src/payments/notifications';
import { paymentsRuntime } from '../../../../packages/server/src/payments/runtime';

// Thin Vercel entry point, called on a schedule. The logic and its tests live in packages/server.
export const POST = (request: Request): Promise<Response> => {
  const { env, deps, emails } = paymentsRuntime();
  return handleEmailSweep(request, { cronSecret: emails.cronSecret, now: env.now }, { ...emails, log: deps.log });
};
