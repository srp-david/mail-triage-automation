import { defineConfig } from '@playwright/test';
import { browserExecutable } from './scripts/browser-scenario.mjs';

export default defineConfig({
  testDir: './test/e2e',
  timeout: 180_000,
  expect: { timeout: 10_000 },
  workers: 1,
  retries: 0,
  forbidOnly: Boolean(process.env.CI),
  outputDir: '.runtime/playwright-results',
  reporter: [['list'], ['html', { outputFolder: '.runtime/playwright-report', open: 'never' }]],
  globalSetup: './test/e2e/setup.ts',
  use: { browserName: 'chromium', launchOptions: { executablePath: browserExecutable } },
});
