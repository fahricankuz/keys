// Mülk sayfasındaki sekme şeridi (Özet … Rapor): masaüstünde sekmeler kesilmez; sığmayanlar alt satıra geçer, hepsi görünür ve tıklanır.
import { test, expect } from '@playwright/test';
import { serveDist, seed, PW, ensureDist } from './app-helpers.mjs';
import { watchErrors } from './helpers.mjs';

const DIST = new URL('../app/dist-fake', import.meta.url).pathname;
const PORT = 8249;
let server;
test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => { test.setTimeout(300_000); await ensureDist(DIST); server = await serveDist(DIST, PORT); });
test.afterAll(() => server && server.close());

for (const w of [1024, 1280, 1600]) {
  test(`masaüstü ${w} px: tüm mülk sekmeleri görünür (kesik yok), Rapor açılır`, async ({ page }) => {
    const errors = watchErrors(page);
    await page.setViewportSize({ width: w, height: 900 });
    await page.addInitScript((x) => { if (!localStorage.getItem('__fakedb')) localStorage.setItem('__fakedb', JSON.stringify(x)); }, seed());
    await page.goto(`http://localhost:${PORT}/giris/mulk-sahibi`);
    await page.getByLabel('E-posta').fill('ev@ornek.com');
    await page.getByLabel('Şifre', { exact: true }).fill(PW);
    await page.getByRole('button', { name: 'Giriş yap' }).click();
    await expect(page).toHaveURL(/uygulama/);
    await page.getByText('Moda Dairesi').first().click();
    const adlar = ['Özet', 'Ödemeler', 'Talepler', 'Mesajlar', 'Belgeler', 'Tutanak', 'Giderler', 'Rapor'];
    await expect(page.getByRole('button', { name: 'Rapor', exact: true })).toBeVisible({ timeout: 15000 });
    const kutu = await page.evaluate((adlar) => adlar.map((a) => {
      const b = [...document.querySelectorAll('[role=button]')].find((e) => e.textContent.trim() === a);
      const r = b.getBoundingClientRect();
      return { a, l: r.left, r: r.right };
    }).concat([{ a: 'vw', r: innerWidth }]), adlar);
    const vw = kutu.pop().r;
    for (const k of kutu) { expect(k.l, k.a).toBeGreaterThanOrEqual(0); expect(k.r, `${k.a} görünüm dışı`).toBeLessThanOrEqual(vw); }
    // Şeridin sağ kenarı: hiçbir sekme kardeşlerinin üst kapsayıcısından taşmaz.
    const tasan = await page.evaluate(() => {
      const b = [...document.querySelectorAll('[role=button]')].find((e) => e.textContent.trim() === 'Rapor');
      let p = b.parentElement; const rb = b.getBoundingClientRect();
      for (let i = 0; i < 4 && p; i++, p = p.parentElement) { const pr = p.getBoundingClientRect(); if (pr.width > rb.width * 2 && rb.right > pr.right + 1) return true; }
      return false;
    });
    expect(tasan, 'Rapor sekmesi şeridin dışına taşıyor').toBe(false);
    await page.getByRole('button', { name: 'Rapor', exact: true }).click();
    await expect(page.getByText('Ay ay')).toBeVisible();
    expect(errors).toEqual([]);
  });
}
