import { actionOf } from '../../packages/server/src/account/handlers';
import { handleSubmissions } from '../../packages/server/src/submissions/handlers';
import { submissionsRuntime } from '../../packages/server/src/submissions/runtime';

// Thin Vercel entry point for every submission action (#216): /api/v1/submissions/<action>,
// sent here by a rewrite in vercel.json. The logic and its tests live in packages/server.
const handle = (request: Request): Promise<Response> =>
  handleSubmissions(request, actionOf(request, 'submissions'), submissionsRuntime());

export const GET = handle;
export const POST = handle;
