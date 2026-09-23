import { test } from './fixtures';
test.use({ scenarioName: 'mail-scroll' });
test('mail-scroll', async ({ scenarioBrowser }) => {
  const { verify } = await import('../../scripts/verify-mail-scroll.mjs');
  await verify(scenarioBrowser);
});
