import { test } from './fixtures';
test.use({ scenarioName: 'mail-threads' });
test('mail-threads', async ({ scenarioBrowser }) => {
  const { verify } = await import('../../scripts/verify-mail-threads.mjs');
  await verify(scenarioBrowser);
});
