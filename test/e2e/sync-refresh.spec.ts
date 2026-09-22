import { test } from './fixtures';
test.use({ scenarioName: 'sync-refresh' });
test('sync-refresh', async ({ scenarioBrowser }) => {
  const { verify } = await import('../../scripts/verify-sync-refresh.mjs');
  await verify(scenarioBrowser);
});
