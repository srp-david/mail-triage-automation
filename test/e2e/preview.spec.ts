import { test } from './fixtures';
test.use({ scenarioName: 'preview' });
test('preview', async ({ scenarioBrowser }) => {
  const { verify } = await import('../../scripts/verify-preview.mjs');
  await verify(scenarioBrowser);
});
