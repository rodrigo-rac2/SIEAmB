/**
 * Removes what one browser test run created on the dev database and checks that
 * nothing is left (#248). The workflow calls it in a step that always runs, so a
 * run cancelled by a newer push, which never reaches Playwright's teardown, still
 * cleans up after itself.
 *
 *   E2E_RUN_ID=r123a1 npm run cleanup:run -w @sieamb/e2e
 */
import globalTeardown from '../global-teardown';

if (!process.env.E2E_RUN_ID) {
  console.error('[e2e] E2E_RUN_ID is not set: nothing to clean.');
  process.exit(1);
}

globalTeardown().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
