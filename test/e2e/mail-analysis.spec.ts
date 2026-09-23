import { test } from './fixtures';
test.use({ scenarioName: 'mail-analysis' });
test('mail-analysis', async ({ scenarioBrowser }) => {
  const { verify } = await import('../../scripts/verify-mail-analysis.mjs');
  await verify(scenarioBrowser);
});
