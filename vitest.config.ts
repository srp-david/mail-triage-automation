import { defineConfig } from 'vitest/config';

const integration = [
  'history',
  'mail-search-db',
  'maintenance',
  'sync',
  'thread-links',
  'username-auth',
  'v1-directory',
  'v1-mapping',
  'v1-runs',
].map((name) => `test/${name}.test.ts`);

export default defineConfig({
  oxc: { jsx: { runtime: 'automatic' } },
  test: {
    pool: 'forks',
    maxWorkers: 4,
    testTimeout: 30_000,
    hookTimeout: 30_000,
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'node',
          include: ['test/*.test.ts'],
          exclude: [...integration, 'test/*.external.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          environment: 'node',
          include: integration,
          setupFiles: ['test/setup-db.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'ui',
          environment: 'jsdom',
          include: ['packages/ui/ui/src/**/*.test.{ts,tsx}'],
          setupFiles: ['test/setup-ui.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'external',
          environment: 'node',
          include: ['test/*.external.test.ts'],
          setupFiles: ['test/setup-db.ts'],
        },
      },
    ],
    coverage: {
      provider: 'v8',
      reportsDirectory: '.runtime/coverage',
      include: ['src/**/*.ts', 'apps/**/src/**/*.ts', 'packages/**/src/**/*.{ts,tsx}'],
      exclude: ['**/*.test.*'],
    },
  },
});
