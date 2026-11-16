import { actionOf, handleAccount } from '../../packages/server/src/account/handlers';
import { accountRuntime } from '../../packages/server/src/account/runtime';

// Thin Vercel entry point for every account action (#208): /api/v1/account/<action>,
// sent here by a rewrite in vercel.json (a [action].ts file loses to the catch-all
// rewrite that serves the single-page app). One function on purpose, the Hobby plan
// caps how many a deployment may have.
// The logic and its tests live in packages/server.
const handle = (request: Request): Promise<Response> =>
  handleAccount(request, actionOf(request), accountRuntime());

export const GET = handle;
export const POST = handle;
export const PUT = handle;
