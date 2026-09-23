import { test, expect } from '@playwright/test';

test('문서 탐색, Mermaid, 한국어 검색 및 모바일 메뉴', async ({ page, request }, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '문서 안내', exact: true })).toBeVisible();
  const readmeUrl = await page
    .getByRole('link', { name: '프로젝트 README', exact: true })
    .getAttribute('href');
  const readme = await request.get(readmeUrl!);
  expect(readme.ok()).toBe(true);
  expect(await readme.text()).toContain('# 메일 분석실');
  await page.locator('main').getByRole('link', { name: '아키텍처', exact: true }).click();
  await expect(page).toHaveURL(/\/architecture\//);
  await expect(page.locator('.docusaurus-mermaid-container svg').first()).toBeVisible();
  await page.screenshot({ path: info.outputPath('architecture.png'), fullPage: true });
  const search = page.getByLabel('Search', { exact: true });
  await search.fill('아키텍처');
  await expect(page.getByRole('listbox')).toBeVisible();
  await expect(page.getByRole('listbox')).toContainText('아키텍처');
  // The search widget selects the first result automatically.
  await search.press('Enter');
  await expect(page).toHaveURL(/\/architecture\//);
  await expect(page.getByRole('heading', { name: /아키텍처/ }).first()).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: '사이드바 펼치거나 접기' }).click();
  await expect(page.locator('.navbar-sidebar')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('mobile.png'), animations: 'disabled' });
  await page
    .locator('.navbar-sidebar')
    .getByRole('link', { name: '현재 아키텍처', exact: true })
    .click();
  await expect(page.getByRole('heading', { name: '현재 아키텍처', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

for (const [route, count] of [
  ['/implementation-plan/', 2],
  ['/workflows/', 3],
  ['/reference/data-model/', 1],
  ['/archive/implementation-plan-history-2026-09-21-v2.1/', 2],
  ['/archive/team-deployment-proposal-2026-09-17/', 1],
] as const) {
  test(`Mermaid 도표: ${route}`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(route);
    await expect(page.locator('.docusaurus-mermaid-container svg')).toHaveCount(count);
    expect(errors).toEqual([]);
  });
}
