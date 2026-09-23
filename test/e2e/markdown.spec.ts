import { test } from './fixtures';
test.use({ scenarioName: 'markdown' });
test('markdown', async ({ scenarioBrowser }) => {
  const { verify } = await import('../../scripts/verify-markdown.mjs');
  await verify(scenarioBrowser);
});
