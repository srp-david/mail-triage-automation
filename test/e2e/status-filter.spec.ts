import { test } from './fixtures';
test.use({ scenarioName: 'status-filter' });
test('status-filter', async ({ scenarioBrowser }) => {
  const { verify } = await import('../../scripts/verify-status-filter.mjs');
  await verify(scenarioBrowser);
});
