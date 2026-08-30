import type { DataProvider } from './DataProvider';
import { StaticDataProvider } from './StaticDataProvider';

let provider: DataProvider | null = null;

/**
 * Provider factory. Phase 0 defaults to 'static'.
 * 'supabase' is wired when the Supabase project exists (lazy import keeps the
 * bundle clean until then); 'api' arrives in Phase 1.
 */
export function getDataProvider(): DataProvider {
  if (provider) return provider;
  const kind = import.meta.env.VITE_DATA_PROVIDER ?? 'static';
  switch (kind) {
    case 'static':
      provider = new StaticDataProvider();
      break;
    default:
      // Fallback keeps the site alive if env is misconfigured.
      console.warn(`Unknown data provider "${kind}", falling back to static`);
      provider = new StaticDataProvider();
  }
  return provider;
}

export { DuplicateRegistrationError } from './DataProvider';
export type { DataProvider } from './DataProvider';
