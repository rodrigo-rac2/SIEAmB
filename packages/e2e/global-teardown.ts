import { cleanupAvailable, leftovers, removeTestData } from './tests/cleanup';

/**
 * After every test, passed or failed (#227): remove what this run created, then
 * look again. Anything still there fails the run, so a cleanup that stops working
 * is noticed the day it happens and not 148 rows later.
 */
export default async function globalTeardown(): Promise<void> {
  const runId = process.env.E2E_RUN_ID;
  if (!runId || !cleanupAvailable()) return;
  const removed = await removeTestData({ runId });
  let left = await leftovers({ runId });
  if (Object.keys(left).length > 0) {
    // Once more: a test that was still writing when it was cut short.
    await removeTestData({ runId });
    left = await leftovers({ runId });
  }
  console.log(`[e2e] run ${runId}: removed ${removed.users} accounts and ${removed.registrations} registrations`);
  if (Object.keys(left).length > 0) {
    throw new Error(`[e2e] cleanup of run ${runId} left rows behind: ${JSON.stringify(left)}`);
  }
}
