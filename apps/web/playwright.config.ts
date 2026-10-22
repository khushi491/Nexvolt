import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests against a running stack:
 *   pnpm infra:up && pnpm --filter @nexvolt/api start   (LOCAL_DEMO_MODE=true, OTP emulator with fixed code)
 * The web portal is started automatically (or reused if already running on :3100).
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  retries: 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  globalSetup: './e2e/global-setup.ts',
  use: {
    baseURL: process.env.E2E_WEB_URL ?? 'http://localhost:3100',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'pnpm start',
    url: 'http://localhost:3100/login',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
