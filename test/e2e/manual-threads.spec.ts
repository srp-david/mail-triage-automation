import { test } from './fixtures';
test.use({ scenarioName: 'manual-threads' });
test('manual-threads', async ({ scenarioBrowser }) => {
  const { verify } = await import('../../scripts/verify-manual-threads.mjs');
  await verify(scenarioBrowser);
});
