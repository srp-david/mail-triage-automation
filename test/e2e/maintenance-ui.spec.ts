import { test } from './fixtures';
test.use({ scenarioName: 'maintenance-ui' });
test('maintenance-ui', async ({ scenarioBrowser }) => {
  const { verify } = await import('../../scripts/verify-maintenance-ui.mjs');
  await verify(scenarioBrowser);
});
