import { describe, expect, it } from 'vitest';
import { handleAccount } from './handlers';
import { accountRuntime } from './runtime';
import { call } from './testing';

const ENV = {
  ACCOUNTS_ENABLED: 'true',
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key-value',
};

describe('accountRuntime', () => {
  it('is off unless the deployment switches accounts on', async () => {
    expect(accountRuntime({ ...ENV, ACCOUNTS_ENABLED: undefined })).toBeNull();
    expect(accountRuntime({ ...ENV, ACCOUNTS_ENABLED: 'false' })).toBeNull();
    expect(accountRuntime({ ...ENV, ACCOUNTS_ENABLED: 'TRUE' })).toBeNull();
    const response = await handleAccount(call('POST', 'signup', { body: {} }), 'signup', accountRuntime({}));
    expect(response.status).toBe(503);
  });

  it('is off without the database settings', () => {
    expect(accountRuntime({ ...ENV, SUPABASE_URL: '' })).toBeNull();
    expect(accountRuntime({ ...ENV, SUPABASE_SERVICE_ROLE_KEY: undefined })).toBeNull();
  });

  it('works without a mail sender, and never puts the service key in the rate-limit pepper', () => {
    const deps = accountRuntime(ENV);
    expect(deps).not.toBeNull();
    expect(deps!.mailer).toBeUndefined();
    expect(deps!.pepper).toMatch(/^[0-9a-f]{64}$/);
    expect(deps!.pepper).not.toContain(ENV.SUPABASE_SERVICE_ROLE_KEY);
  });

  it('points the links at the public site in production and at the deployment elsewhere', () => {
    expect(accountRuntime({ ...ENV, VERCEL_ENV: 'production' })!.siteUrl).toBe('https://sieamb.org');
    expect(accountRuntime({ ...ENV, VERCEL_ENV: 'preview', VERCEL_URL: 'x.vercel.app' })!.siteUrl).toBe('https://x.vercel.app');
    expect(accountRuntime({ ...ENV, SITE_URL: 'https://dev.sieamb.org/' })!.siteUrl).toBe('https://dev.sieamb.org');
  });
});
