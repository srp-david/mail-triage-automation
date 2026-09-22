import { test } from './fixtures';
test.use({ scenarioName: 'pre-p1-ux' });
test('pre-p1-ux', async ({ scenarioBrowser }) => {
  const { verify } = await import('../../scripts/verify-pre-p1-ux.mjs');
  await verify(scenarioBrowser);
});
