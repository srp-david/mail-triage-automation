import { expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { generateKeyPair, exportJWK } from 'jose';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { test } from './fixtures';
import { testDatabase } from '../../scripts/test-database.mjs';

test.use({ scenarioName: 'auth-database' });
test('browser login, password change and logout use real API and PostgreSQL', async ({
  scenarioBrowser,
}) => {
  const db = await testDatabase();
  process.env.DATABASE_URL = db.url;
  process.env.HISTORY_SCHEMA = '';
  process.env.NODE_ENV = 'test';
  delete process.env.PGOPTIONS;
  const { pool } = await import('../../apps/history-api/src/db.js');
  const servers: import('node:http').Server[] = [];
  try {
    const { migrateVersioned } = await import('../../apps/history-api/src/migrations.js');
    await migrateVersioned();
    const { UsernameAuth } = await import('../../apps/history-api/src/username-auth.js');
    const { createUsernameApp } = await import('../../apps/history-api/src/username-app.js');
    const { UsernameLogin } = await import('../../apps/local-app/src/username-login.js');
    const { LocalSession } = await import('../../apps/local-app/src/session.js');
    const { createBrowserApp } = await import('../../apps/local-app/src/browser-app.js');
    const { localUiRoutes } = await import('../../apps/local-app/src/ui-routes.js');
    const { HistoryClient } = await import('../../packages/history-client/src/index.js');
    const team = randomUUID();
    await pool.query('INSERT INTO team VALUES($1,$2)', [team, 'Synthetic E2E team']);
    const { privateKey } = await generateKeyPair('ES256', { extractable: true });
    const auth = await UsernameAuth.create(
      'https://auth.fixture/',
      'triage',
      team,
      await exportJWK(privateKey),
    );
    const user = await auth.createUser(null, {
      username: 'test.admin',
      displayName: '합성 관리자',
      role: 'admin',
    });
    const upstream = createUsernameApp(auth).listen(0, '127.0.0.1');
    servers.push(upstream);
    await new Promise<void>((r) => upstream.once('listening', r));
    const upstreamUrl = `http://127.0.0.1:${(upstream.address() as import('node:net').AddressInfo).port}`;
    const driver = new UsernameLogin(upstreamUrl, 'https://auth.fixture/', 'triage');
    const saved = new Map<string, unknown>();
    const session = new LocalSession(
      driver,
      {
        async read(key) {
          if (!saved.has(key)) throw Object.assign(new Error(), { code: 'ENOENT' });
          return saved.get(key);
        },
        async write(key, value) {
          saved.set(key, structuredClone(value));
        },
      },
      (token) => driver.identify(token),
    );
    const history = new HistoryClient(upstreamUrl, () => session.token());
    const probe = createServer().listen(0, '127.0.0.1');
    await new Promise<void>((r) => probe.once('listening', r));
    const port = (probe.address() as import('node:net').AddressInfo).port;
    await new Promise<void>((r) => probe.close(() => r()));
    const controlToken = 'synthetic-e2e-control-'.repeat(3);
    const local = createBrowserApp(session, {
      port,
      controlToken,
      staticRoot: resolve('public'),
      features: (app) =>
        localUiRoutes(app, history, {
          async selection() {
            return { sourceId: '', agent: 'codex' };
          },
          async configure() {
            throw new Error('Not used by authentication scenario');
          },
          async registerSource(input) {
            return history.request('/sources', input);
          },
          async registerRunner(input) {
            return history.request('/runners', input);
          },
          async status() {
            return { storeId: '', sync: null, worker: null, originalAvailable: false };
          },
        }),
    }).listen(port, '127.0.0.1');
    servers.push(local);
    await new Promise<void>((r) => local.once('listening', r));
    const page = await scenarioBrowser.newPage();
    let updateInstalls = 0;
    await page.route('**/api/updates', (route) =>
      route.fulfill({
        json: {
          status: 'offered',
          update: {
            releaseId: 'v0.3.0-candidate.8',
            version: '0.3.0-candidate.8',
            assetSha256: 'a'.repeat(64),
            releaseNotesUrl:
              'https://github.com/srp-david/mail-triage-automation/releases/tag/v0.3.0-candidate.8',
          },
        },
      }),
    );
    await page.route('**/api/updates/install', (route) => {
      updateInstalls += 1;
      return route.fulfill({ status: 202, json: { accepted: true } });
    });
    const ticket = await fetch(`http://127.0.0.1:${port}/api/browser-ticket`, {
      method: 'POST',
      headers: { authorization: 'Bearer ' + controlToken, 'x-local-client': '1' },
    });
    expect(ticket.status).toBe(200);
    await page.goto((await ticket.json()).url);
    await page.getByLabel('사용자명', { exact: true }).fill('test.admin');
    await page.getByLabel('비밀번호', { exact: true }).fill(user.temporaryPassword);
    await page.getByRole('button', { name: '로그인', exact: true }).click();
    await expect(page.getByRole('heading', { name: '비밀번호 변경', exact: true })).toBeVisible();
    const password = 'Synthetic changed password 123!';
    await page.getByLabel('현재 비밀번호').fill(user.temporaryPassword);
    await page.getByLabel('새 비밀번호').fill(password);
    await page.getByRole('button', { name: '비밀번호 변경', exact: true }).click();
    await page.getByLabel('사용자명', { exact: true }).fill('test.admin');
    await page.getByLabel('비밀번호', { exact: true }).fill(password);
    await page.getByRole('button', { name: '로그인', exact: true }).click();
    await expect(page.getByRole('button', { name: '로그아웃', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '0.3.0-candidate.8 설치' })).toBeVisible();
    await page.getByRole('button', { name: '0.3.0-candidate.8 설치' }).click();
    expect(updateInstalls).toBe(1);
    const token = await session.token();
    expect((await auth.authenticate(token)).userId).toBe(user.id);
    await page.locator('#notice').getByRole('button').click();
    await page.getByRole('button', { name: '로그아웃', exact: true }).click();
    await expect(page.getByRole('button', { name: '로그인', exact: true })).toBeVisible();
    await expect(auth.authenticate(token)).rejects.toThrow();
  } finally {
    await scenarioBrowser.close();
    for (const server of servers.reverse()) await new Promise<void>((r) => server.close(() => r()));
    await pool.end();
    await db.close();
  }
});
