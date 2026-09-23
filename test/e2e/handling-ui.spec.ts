import { test } from './fixtures';
test.use({ scenarioName: 'handling-ui' });
test('handling-ui', async ({ scenarioBrowser }) => {
  const { verify } = await import('../../scripts/verify-handling-ui.mjs');
  await verify(scenarioBrowser);
});
