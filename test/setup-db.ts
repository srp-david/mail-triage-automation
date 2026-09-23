// Require explicit test configuration; never fall back to the application's database.
if (!process.env.TEST_DATABASE_URL) {
  throw new Error('Use npm run test:integration, or provide a dedicated TEST_DATABASE_URL.');
}
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.HISTORY_SCHEMA = '';
process.env.NODE_ENV = 'test';
