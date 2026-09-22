import { test } from './fixtures';
test.use({ scenarioName: 'related-mails' });
test('related-mails', async ({ scenarioBrowser }) => {
  const { verify } = await import('../../scripts/verify-related-mails.mjs');
  await verify(scenarioBrowser);
});
