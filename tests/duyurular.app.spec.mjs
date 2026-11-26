// Duyurular: yönetici paneli › Duyurular'dan gönderim (iki adımlı onay, gece uyarısı onaylanınca gönderim, gönderilenler tablosu)
// ve kullanıcı tarafında kartın bir kez çıkması, şeridin ✕ ile kapanıp bir daha çıkmaması.
import { test, expect } from '@playwright/test';
import { serveDist, seed, PW, ensureDist, ID, pickRole } from './app-helpers.mjs';
import { watchErrors } from './helpers.mjs';

const DIST = new URL('../app/dist-fake', import.meta.url).pathname;
const PORT = 8312;
let server;
test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => { test.setTimeout(300_000); await ensureDist(DIST); server = await serveDist(DIST, PORT); });
test.afterAll(() => server && server.close());
const db = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('__fakedb')));

test('yönetici: duyuru hazırlar, gece uyarısını onaylar, gönderir; tabloda görünür', async ({ page }) => {
  const errors = watchErrors(page);
  await page.addInitScript((x) => { if (!localStorage.getItem('__fakedb')) localStorage.setItem('__fakedb', JSON.stringify(x)); localStorage.setItem('__fakequiet', '1'); }, seed());
  await page.goto(`http://localhost:${PORT}/giris/yonetici`);
  await page.getByLabel('E-posta').fill('admin@ornek.com');
  await page.getByLabel('Şifre', { exact: true }).fill(PW);
  await page.getByRole('button', { name: 'Giriş yap' }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await page.getByRole('button', { name: 'Duyurular', exact: true }).first().click();
  await page.getByLabel('Başlık', { exact: true }).fill('Konsolide raporlar geldi');
  await page.getByLabel('Metin', { exact: true }).fill('Tüm mülklerinin net geliri artık tek raporda.');
  await page.getByLabel('Düğme yazısı', { exact: true }).fill('Rapora git');
  await page.getByLabel('Düğme açılacak sayfa').fill('/uygulama/rapor');
  await page.getByRole('checkbox', { name: 'Mülk sahibi' }).click();
  const send = page.getByRole('button', { name: /^Gönder · \d+ kişi$/ });
  await expect(send).toBeEnabled();
  const asked = [];
  page.on('dialog', (d) => { asked.push(d.message()); d.accept(); });
  await send.click();
  await expect(page.getByText(/Duyuru gönderiliyor: \d+ kişi/)).toBeVisible();
  expect(asked[0]).toContain('Duyuru gönderilsin mi?');
  expect(asked[1]).toContain('Gece saati: yine de gönderilsin mi?');
  await expect(page.getByText('Konsolide raporlar geldi')).toBeVisible();
  await expect(page.getByText(/Kitle \d+ · ulaşan \d+ · gören 0 · tıklayan 0/)).toBeVisible();
  const d = await db(page);
  expect(d.tables.announcements[0]).toMatchObject({ status: 'sent', view: 'card', ch_push: true });
  expect(errors).toEqual([]);
});

test('kullanıcı: kart bir kez çıkar; şerit ✕ ile kapanır ve geri gelmez', async ({ page }) => {
  const errors = watchErrors(page);
  const d = seed(), at = new Date().toISOString();
  const base = { body: '', title_en: '', body_en: '', cta: '', cta_en: '', url: '', audience: {}, ch_app: true, ch_push: false, ch_email: false, status: 'sent', recipients: 1, created_at: at, sent_at: at };
  d.tables.announcements = [{ ...base, id: 1, kind: 'feature', view: 'card', title: 'Konsolide raporlar geldi', body: 'Tek raporda.' },
                            { ...base, id: 2, kind: 'maintenance', view: 'banner', title: 'Planlı bakım 28 Kasım 02:00' }];
  d.tables.announcement_recipients = [{ announcement_id: 1, user_id: ID.landlord }, { announcement_id: 2, user_id: ID.landlord }];
  await page.addInitScript((x) => { if (!localStorage.getItem('__fakedb')) localStorage.setItem('__fakedb', JSON.stringify(x)); }, d);
  await page.goto(`http://localhost:${PORT}/giris/mulk-sahibi`);
  await page.getByLabel('E-posta').fill('ev@ornek.com');
  await page.getByLabel('Şifre', { exact: true }).fill(PW);
  await page.getByRole('button', { name: 'Giriş yap' }).click();
  await pickRole(page);
  const card = page.getByRole('alert').filter({ hasText: 'Konsolide raporlar geldi' });
  await expect(card).toBeVisible({ timeout: 15000 });
  await expect(card.getByText('Yeni özellik')).toBeVisible();
  await card.getByRole('button', { name: 'Tamam' }).click();
  await expect(card).toHaveCount(0);
  await expect(page.getByText('Planlı bakım 28 Kasım 02:00')).toBeVisible();
  await page.getByRole('button', { name: 'Duyuruyu kapat' }).click();
  await expect(page.getByText('Planlı bakım 28 Kasım 02:00')).toHaveCount(0);
  const s = await db(page);
  expect(s.tables.announcement_recipients.find((r) => r.announcement_id === 1).seen_at).toBeTruthy();
  expect(s.tables.announcement_recipients.find((r) => r.announcement_id === 2).dismissed_at).toBeTruthy();
  await page.reload();
  await expect(page).toHaveURL(/\/uygulama/);
  await page.waitForTimeout(2500);
  await expect(page.getByText('Konsolide raporlar geldi')).toHaveCount(0);
  await expect(page.getByText('Planlı bakım 28 Kasım 02:00')).toHaveCount(0);
  expect(errors).toEqual([]);
});
