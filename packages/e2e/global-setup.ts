import { randomBytes } from 'node:crypto';
import { STALE_AFTER_MS, cleanupAvailable, removeTestData } from './tests/cleanup';

/**
 * Before any test (#227): give the run an id that every test address will carry,
 * and remove what runs that died left behind. Only data older than two hours is
 * touched, so a run going on elsewhere against the same database is left alone.
 */
export default async function globalSetup(): Promise<void> {
  // Workers are started after this and inherit it.
  process.env.E2E_RUN_ID ??= `r${Date.now().toString(36)}${randomBytes(2).toString('hex')}`;
  if (!cleanupAvailable()) return;
  try {
    const removed = await removeTestData({ olderThan: new Date(Date.now() - STALE_AFTER_MS) });
    if (removed.users + removed.registrations > 0) {
      console.log(`[e2e] removed stale test data: ${removed.users} accounts, ${removed.registrations} registrations`);
    }
  } catch (error) {
    // Old leftovers are a nuisance, not a reason to skip the tests.
    console.warn(`[e2e] could not remove stale test data: ${error instanceof Error ? error.message : String(error)}`);
  }
}
