import { paymentsRuntime } from '../../../../packages/server/src/payments/runtime';
import { handleMercadoPagoWebhook } from '../../../../packages/server/src/payments/webhook';

// Thin Vercel entry point. The logic and its tests live in packages/server.
const handle = (request: Request): Promise<Response> => {
  const { env, deps } = paymentsRuntime();
  return handleMercadoPagoWebhook(request, env, deps);
};

export const GET = handle;
export const POST = handle;
