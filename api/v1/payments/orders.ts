import { handleCreateOrder } from '../../../packages/server/src/payments/orders';
import { paymentsRuntime } from '../../../packages/server/src/payments/runtime';

// Thin Vercel entry point. The logic and its tests live in packages/server.
const handle = (request: Request): Promise<Response> => {
  const { env, deps } = paymentsRuntime();
  return handleCreateOrder(request, env, deps);
};

export const GET = handle;
export const POST = handle;
