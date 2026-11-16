import { describe, expect, it } from 'vitest';
import { feeClock, paymentsRuntime, siteOrigin } from './runtime';

const REAL = new Date('2026-11-05T20:00:00-03:00');
const OVERRIDE = '2026-11-12T12:00:00-03:00';

describe('feeClock', () => {
  it('uses the override outside production', () => {
    expect(feeClock({ VERCEL_ENV: 'preview', PAYMENTS_NOW: OVERRIDE }, REAL)).toEqual(
      new Date(OVERRIDE),
    );
    expect(feeClock({ PAYMENTS_NOW: OVERRIDE }, REAL)).toEqual(new Date(OVERRIDE));
  });

  it('ignores the override in production, where it could change what people are charged', () => {
    expect(feeClock({ VERCEL_ENV: 'production', PAYMENTS_NOW: OVERRIDE }, REAL)).toBe(REAL);
  });

  it.each(['', 'soon', '2026-13-45'])(
    'falls back to the real time for the invalid value "%s"',
    (value) => {
      expect(feeClock({ VERCEL_ENV: 'preview', PAYMENTS_NOW: value }, REAL)).toBe(REAL);
    },
  );
});

describe('paymentsRuntime', () => {
  it('moves only the fee clock: order ages and payment dates stay on real time', () => {
    const { env } = paymentsRuntime({ VERCEL_ENV: 'preview', PAYMENTS_NOW: OVERRIDE }, REAL);
    expect(env.now).toBe(REAL);
    expect(env.feeNow).toEqual(new Date(OVERRIDE));
  });

  it('has no store and no credentials when the variables are missing or empty', () => {
    const { env, deps } = paymentsRuntime(
      { MP_ACCESS_TOKEN: '', SUPABASE_URL: 'https://x.supabase.co' },
      REAL,
    );
    expect(env.accessToken).toBeUndefined();
    expect(env.webhookSecret).toBeUndefined();
    expect(deps.store).toBeUndefined();
  });

  it('builds the store when both Supabase variables are present', () => {
    const { deps } = paymentsRuntime(
      { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'k' },
      REAL,
    );
    expect(deps.store).toBeDefined();
  });
});

describe('siteOrigin (where e-mail links point)', () => {
  it('is the public address in production', () => {
    expect(siteOrigin({ VERCEL_ENV: 'production', VERCEL_URL: 'sieamb-abc.vercel.app' })).toBe('https://sieamb.org');
    expect(siteOrigin({})).toBe('https://sieamb.org');
  });
  it('is the deployment itself on a preview', () => {
    expect(siteOrigin({ VERCEL_ENV: 'preview', VERCEL_URL: 'sieamb-abc.vercel.app' })).toBe('https://sieamb-abc.vercel.app');
  });
  it('lets SITE_URL win, without a trailing slash, and ignores a value that is not a URL', () => {
    expect(siteOrigin({ VERCEL_ENV: 'preview', SITE_URL: 'https://dev.sieamb.org/' })).toBe('https://dev.sieamb.org');
    expect(siteOrigin({ SITE_URL: 'javascript:alert(1)' })).toBe('https://sieamb.org');
  });
});

describe('paymentsRuntime e-mails (#185)', () => {
  const BASE = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'k' };
  it('records e-mails as soon as there is a database, with or without a sender', () => {
    expect(paymentsRuntime(BASE, REAL).deps.notify).toBeTypeOf('function');
    expect(paymentsRuntime(BASE, REAL).emails.mailer).toBeUndefined();
    expect(paymentsRuntime({}, REAL).deps.notify).toBeUndefined();
  });
  it('has a sender once the SMTP user and password are set, and a sweep secret only when given', () => {
    const { emails } = paymentsRuntime({ ...BASE, SMTP_USER: 'a@gmail.com', SMTP_PASS: 'abcd', CRON_SECRET: '' }, REAL);
    expect(emails.mailer).toBeDefined();
    expect(emails.cronSecret).toBeUndefined();
    expect(paymentsRuntime({ ...BASE, CRON_SECRET: 's3' }, REAL).emails.cronSecret).toBe('s3');
  });
});
