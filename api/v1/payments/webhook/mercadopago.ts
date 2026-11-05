import { handleMercadoPagoWebhook } from '../../../../packages/server/src/payments/webhook';

// Thin Vercel entry point. The logic and its tests live in packages/server.
const handle = (request: Request): Promise<Response> =>
  handleMercadoPagoWebhook(
    request,
    {
      accessToken: process.env.MP_ACCESS_TOKEN,
      webhookSecret: process.env.MP_WEBHOOK_SECRET,
    },
    {
      fetch,
      log: (event, data) => console.log(JSON.stringify({ event, ...data })),
    },
  );

export const GET = handle;
export const POST = handle;
