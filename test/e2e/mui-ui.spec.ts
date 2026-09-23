import { test } from './fixtures';
test.use({ scenarioName: 'mui-ui' });
test('mui-ui', async ({ scenarioBrowser }) => {
  const { verify } = await import('../../scripts/verify-mui-ui.mjs');
  await verify(scenarioBrowser);
});
