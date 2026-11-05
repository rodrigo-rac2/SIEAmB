import { handlePaymentStatus } from '../../../packages/server/src/payments/paymentStatus';
import { paymentsRuntime } from '../../../packages/server/src/payments/runtime';

// Thin Vercel entry point. The logic and its tests live in packages/server.
const handle = (request: Request): Promise<Response> => {
  const { env, deps } = paymentsRuntime();
  return handlePaymentStatus(request, env, deps);
};

export const GET = handle;
export const POST = handle;
