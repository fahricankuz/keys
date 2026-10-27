import { test, expect } from '@playwright/test';
import { watchErrors, open, sheet, PNG } from './helpers.mjs';

let errors;
test.beforeEach(({ page }) => { errors = watchErrors(page); });
test.afterEach(() => { expect(errors).toEqual([]); });

test('rol değişimi ve tarayıcı geri tuşu', async ({ page }) => {
  await open(page, '#/kiraci');
  await page.click('.rolepill');
  await expect(page).toHaveURL(/#\/mulk-sahibi$/);
  await expect(page.locator('#screen h1')).toHaveText('Portföyüm');
  await page.goBack();
  await expect(page.locator('#screen h1')).toHaveText('Moda’daki ev');
});

test('sheet adres taşır, Esc ile kapanır', async ({ page }) => {
  await open(page, '#/kiraci/odemeler');
  await page.click('.hero button:has-text("Dekont yükle")');
  await expect(page).toHaveURL(/s=odeme/);
  await expect(sheet(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page).not.toHaveURL(/s=odeme/);
  await expect(sheet(page)).toHaveCount(0);
});

test('kısmi ödeme bakiyeyi gösterir', async ({ page }) => {
  await open(page, '#/kiraci/odemeler');
  await page.click('.hero button:has-text("Dekont yükle")');
  await sheet(page).locator('input[name=amount]').fill('10000');
  await sheet(page).locator('input[type=file]').setInputFiles(PNG);
  await sheet(page).locator('button:has-text("Gönder")').click();
  await expect(page.locator('#screen .hero')).toContainText('bakiye');
});

test('kiracı talep açar ve detayına link ile gider', async ({ page }) => {
  await open(page, '#/kiraci/talepler');
  await page.click('button:has-text("Yeni talep aç")');
  await sheet(page).locator('input[name=title]').fill('Test musluk arızası');
  await sheet(page).locator('button:has-text("Talebi gönder")').click();
  await expect(page.locator('#screen')).toContainText('Test musluk');
  await page.click('.card:has-text("Test musluk")');
  await expect(page).toHaveURL(/s=talep/);
  await expect(sheet(page)).toContainText('Test musluk');
});

test('ev sahibi talebi ilerletir', async ({ page }) => {
  await open(page, '#/mulk-sahibi/mulk/moda/talep');
  await page.click('.card:has-text("Kombi")');
  await sheet(page).locator('button:has-text("Durumu ilerlet")').click();
  // Çözülen talep "Tamamlanan" sekmesine geçer.
  await expect(page.locator('#screen .seg')).toContainText('Tamamlanan (1)');
  await expect(sheet(page)).not.toContainText('Durumu ilerlet');
});

test('ev sahibi dekontu onaylar ve ekranda kalır', async ({ page }) => {
  await open(page, '#/mulk-sahibi/mulk/cihangir/odeme');
  await page.click('.hero button:has-text("Onayla")');
  await expect(page).toHaveURL(/cihangir\/odeme$/);
  await expect(page.locator('#screen .hero')).not.toContainText('Onay bekliyor');
});

test('arama sonuç bulur ve sonuca gider', async ({ page }) => {
  await open(page, '#/mulk-sahibi');
  await page.click('[aria-label="Ara"]');
  await page.fill('#searchIn', 'kombi');
  await expect(sheet(page)).toContainText('Kombi');
  await sheet(page).locator('.li').first().click();
  await expect(page).toHaveURL(/talep/);
});

test('rehberli tur adımları', async ({ page }) => {
  await open(page, '#/kiraci');
  await page.click('.shell button:has-text("Rehberli tura başla")');
  await expect(page.locator('.tourbar')).toBeVisible();
  for (let i = 0; i < 3; i++) await page.click('.tourbar button:has-text("İleri")');
  await expect(page.locator('.tourbar')).toContainText('4 /');
  await page.click('.tourbar button:has-text("Çık")');
  await expect(page.locator('.tourbar')).toHaveCount(0);
});

test('tema seçimi yenilemede korunur', async ({ page }) => {
  await open(page, '#/kiraci');
  await page.click('.shell button:has-text("Koyu")');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('yenileme teklifi iki tarafta da görünür', async ({ page }) => {
  await open(page, '#/mulk-sahibi/mulk/moda/odeme?s=yenileme');
  await page.fill('[data-input=cpi]', '50');
  await expect(page.locator('#maxOut')).toContainText('48.750');
  await page.click('button:has-text("Teklifi kiracıya gönder")');
  await expect(page.locator('#screen')).toContainText('Yenileme teklifi gönderildi');
  await open(page, '#/kiraci/odemeler');
  await expect(page.locator('#screen')).toContainText('Yenileme teklifi geldi');
  await page.click('button:has-text("Kabul et")');
  await expect(page.locator('#screen')).toContainText('Anlaşıldı');
});

test('mobilde sekme çubuğu ile gezinme @mobil', async ({ page }) => {
  await open(page, '#/kiraci');
  await page.click('.tab:has-text("Talepler")');
  await expect(page).toHaveURL(/#\/kiraci\/talepler$/);
  await expect(page.locator('#screen h1')).toHaveText('Talepler');
});

test('talep derin linki açılır ve kapanınca listeye döner', async ({ page }) => {
  await open(page, '#/kiraci/talepler/r1');
  await expect(sheet(page)).toContainText('Kombi');
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/#\/kiraci\/talepler$/);
  await expect(sheet(page)).toHaveCount(0);
});
