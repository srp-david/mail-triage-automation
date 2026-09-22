import { test } from './fixtures';
test.use({ scenarioName: 'history-ui' });
test('history-ui', async ({ scenarioBrowser }) => {
  const { verify } = await import('../../scripts/verify-history-ui.mjs');
  await verify(scenarioBrowser);
});
