import { defineConfig } from '@playwright/test';
import { browserExecutable } from './scripts/browser-scenario.mjs';

export default defineConfig({
  testDir: './test/docs-e2e',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  outputDir: '.runtime/docs-test-results',
  reporter: [['list'], ['html', { outputFolder: '.runtime/docs-test-report', open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:4175',
    browserName: 'chromium',
    launchOptions: { executablePath: browserExecutable },
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run docs:serve -- --port 4175',
    url: 'http://127.0.0.1:4175',
    timeout: 60_000,
    reuseExistingServer: false,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
