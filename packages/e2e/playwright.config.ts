import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;
// Set BASE_URL to run the suite against a deployed site (Vercel preview, dev or production).
const BASE_URL = process.env.BASE_URL;
// Secret header that matches the Vercel firewall bypass rule, so our own runs are never mitigated (#98).
// GitHub Actions secret E2E_BYPASS_TOKEN; locally from .env.local.
const BYPASS = process.env.E2E_BYPASS_TOKEN;

export default defineConfig({
  testDir: './tests',
  // Every run cleans up what it created and checks that nothing is left (#227).
  globalSetup: './global-setup.ts',
  globalTeardown: './global-teardown.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: BASE_URL ?? `http://localhost:${PORT}`,
    trace: 'on-first-retry',
    // The UI language follows the browser; tests assert the pt-BR default.
    locale: 'pt-BR',
    extraHTTPHeaders: BASE_URL && BYPASS ? { 'x-sieamb-e2e': BYPASS } : {},
  },
  projects: [
    // The three engines on a desktop, then a phone of each mobile family (#332).
    // WebKit is Safari's engine: it catches what Safari does differently, not what a real iPhone does.
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
    { name: 'mobile-safari', use: { ...devices['iPhone 14'] } },
  ],
  webServer: BASE_URL
    ? undefined
    : {
    command:
      'npm run build -w @sieamb/frontend && npm run preview -w @sieamb/frontend -- --port 4173 --strictPort',
    cwd: '../..',
    port: PORT,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: { VITE_BASE: '/' },
  },
});
