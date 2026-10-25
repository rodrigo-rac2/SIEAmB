import type { DataProvider } from './DataProvider';
import { StaticDataProvider } from './StaticDataProvider';
import { SupabaseDataProvider } from './SupabaseDataProvider';

let provider: DataProvider | null = null;

/**
 * Provider factory. 'static' is the fixture-only prototype; 'supabase' persists
 * pre-registrations (#149) and keeps public content on the fixtures; 'api'
 * arrives with the Express backend.
 */
export function getDataProvider(): DataProvider {
  if (provider) return provider;
  const kind = import.meta.env.VITE_DATA_PROVIDER ?? 'static';
  switch (kind) {
    case 'static':
      provider = new StaticDataProvider();
      break;
    case 'supabase': {
      const supabase = SupabaseDataProvider.fromEnv();
      if (supabase) {
        provider = supabase;
      } else {
        // Public pages keep working, but the form must NOT pretend to save (that
        // was the bug behind #149), so registrations fail instead of faking success.
        console.error('VITE_DATA_PROVIDER=supabase but VITE_SUPABASE_URL/ANON_KEY are missing');
        provider = new StaticDataProvider({ failRegistrations: true });
      }
      break;
    }
    default:
      // Fallback keeps the site alive if env is misconfigured.
      console.warn(`Unknown data provider "${kind}", falling back to static`);
      provider = new StaticDataProvider();
  }
  return provider;
}

/** Test seam: forget the cached provider. */
export function resetDataProvider(): void {
  provider = null;
}

export { DuplicateRegistrationError } from './DataProvider';
export { RegistrationClosedError } from './SupabaseDataProvider';
export type { DataProvider } from './DataProvider';
