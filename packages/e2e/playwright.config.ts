import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;
// Set BASE_URL to run the suite against a deployed site (Vercel preview, dev or production).
const BASE_URL = process.env.BASE_URL;

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: BASE_URL ?? `http://localhost:${PORT}`,
    trace: 'on-first-retry',
    // The UI language follows the browser; tests assert the pt-BR default.
    locale: 'pt-BR',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: BASE_URL
    ? undefined
    : {
    // Base must be '/' locally (production build defaults to /SIEAmB/ for Pages).
    command:
      'npm run build -w @sieamb/frontend && npm run preview -w @sieamb/frontend -- --port 4173 --strictPort',
    cwd: '../..',
    port: PORT,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: { VITE_BASE: '/' },
  },
});
