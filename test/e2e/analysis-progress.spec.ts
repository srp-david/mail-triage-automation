import { test } from './fixtures';
test.use({ scenarioName: 'analysis-progress' });
test('analysis-progress', async ({ scenarioBrowser }) => {
  const { verify } = await import('../../scripts/verify-analysis-progress.mjs');
  await verify(scenarioBrowser);
});
