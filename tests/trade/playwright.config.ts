import { defineConfig, devices } from '@playwright/test';
import { resolve } from 'node:path';

export default defineConfig({
  testDir: '.', testMatch: '**/*.spec.ts', fullyParallel: false, workers: 1,
  reporter: 'list', outputDir: '../../test-results/trade', timeout: 45000,
  use: { baseURL: 'http://127.0.0.1:3127', trace: 'retain-on-failure', launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {} },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1080 } } },
    { name: 'mobile', use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
  webServer: {
    command: process.env.TRADE_UI_PRODUCTION ? 'pnpm start --port 3127 --hostname 127.0.0.1' : 'pnpm dev --port 3127 --hostname 127.0.0.1', url: 'http://127.0.0.1:3127/trade',
    cwd: resolve(__dirname, '../..'), reuseExistingServer: false, timeout: 120000,
    // UI tests cannot authenticate to or mutate the real database. Fixtures are intercepted in the browser.
    env: { TRADING_MODE: 'paper', BROKER_PROVIDER: 'simulated', TRADE_ADMIN_EMAIL: '', TRADE_APP_ORIGIN: 'http://127.0.0.1:3127', TRADE_BUILD_ISOLATED: '1' },
  },
});
