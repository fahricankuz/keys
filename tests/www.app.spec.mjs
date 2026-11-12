// www.<alan adı> ile açılan sayfa aynı adrese www'siz geçer (Hostinger CDN www'yi sunucuya iletmediği için tarayıcı tarafında).
import { test, expect } from '@playwright/test';
import { serveDist, ensureDist } from './app-helpers.mjs';

const DIST = new URL('../app/dist-fake', import.meta.url).pathname;
const PORT = 8292;
let server;
test.beforeAll(async () => { test.setTimeout(300_000); await ensureDist(DIST); server = await serveDist(DIST, PORT); });
test.afterAll(() => server && server.close());

test('www ile açılan sayfa aynı yol ve sorguyla www’siz adrese geçer', async ({ page }) => {
  await page.goto(`http://www.localhost:${PORT}/kira-artis-hesaplama?x=1`);
  await expect(page).toHaveURL(`http://localhost:${PORT}/kira-artis-hesaplama?x=1`, { timeout: 15000 });
});
