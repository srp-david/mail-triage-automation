import { execFileSync } from 'node:child_process';
import { access } from 'node:fs/promises';

export default async function setup() {
  await access('public/react/index.html');
  await access('public/preview/index.html');
  execFileSync(process.env.PYTHON || 'python', ['scripts/create-preview-fixtures.py'], {
    stdio: 'pipe',
  });
  // All regression scenarios must run against their own synthetic server.
  process.env.PREVIEW_BASE_URL = '';
}
