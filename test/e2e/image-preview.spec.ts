import { test } from './fixtures';
test.use({ scenarioName: 'image-preview' });
test('image-preview', async ({ scenarioBrowser }) => {
  const { verify } = await import('../../scripts/verify-image-preview.mjs');
  await verify(scenarioBrowser);
});
