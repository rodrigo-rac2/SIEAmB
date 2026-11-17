import { actionOf } from '../../packages/server/src/account/handlers';
import { handleAdmin } from '../../packages/server/src/admin/handlers';
import { adminRuntime } from '../../packages/server/src/admin/runtime';

// Thin Vercel entry point for the organisation area (#219): /api/v1/admin/<action>,
// sent here by a rewrite in vercel.json. The logic and its tests live in packages/server.
const handle = (request: Request): Promise<Response> =>
  handleAdmin(request, actionOf(request, 'admin'), adminRuntime());

export const GET = handle;
export const POST = handle;
