// Hız iyileştirmeleri, uygulama tarafı: yazışmada son 200 mesaj yüklenir, eskileri "Daha eski mesajlar" ile gelir;
// yüklenen görselin küçük kopyası da saklanır; yönetici panelinde uzun listeler 100'er kayıt çizilir ve ödemeler son 12 ay
// gelir ("Daha eski ödemeleri yükle"); oturumu olmayan ziyaretçi ana sayfada sunucu kütüphanesini yüklemez.
import { test, expect } from '@playwright/test';
import { serveDist, seed, PW, ensureDist, ID } from './app-helpers.mjs';
import { watchErrors, PNG } from './helpers.mjs';

const DIST = new URL('../app/dist-fake', import.meta.url).pathname;
const PORT = 8236;
let server;
let errors;

test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => { test.setTimeout(300_000); await ensureDist(DIST); server = await serveDist(DIST, PORT); });
test.afterAll(() => server && server.close());
test.beforeEach(({ page }) => { errors = watchErrors(page); });
test.afterEach(() => { expect(errors).toEqual([]); });
const url = (p) => `http://localhost:${PORT}${p}`;
const db = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('__fakedb')));
const ENTRY = { 'kiraci@ornek.com': '/giris/kiraci', 'ev@ornek.com': '/giris/mulk-sahibi', 'admin@ornek.com': '/giris/yonetici' };
async function login(page, email) {
  await page.goto(url(ENTRY[email]));
  await page.getByLabel('E-posta').fill(email);
  await page.getByLabel('Şifre', { exact: true }).fill(PW);
  await page.getByRole('button', { name: 'Giriş yap' }).click();
}
const withSeed = (page, d) => page.addInitScript((x) => { if (!localStorage.getItem('__fakedb')) localStorage.setItem('__fakedb', JSON.stringify(x)); }, d);

test('yazışma: son 200 mesaj yüklenir, "Daha eski mesajlar" kalanları getirir', async ({ page }) => {
  const d = seed();
  for (let i = 0; i < 250; i++) d.tables.messages.push({ id: 'b' + i, property_id: 'p1', from_role: i % 2 ? 'tenant' : 'landlord', by_user: i % 2 ? ID.tenant : ID.landlord,
    body: 'Mesaj ' + i, at: new Date(Date.now() - (300 - i) * 60000).toISOString() });
  await withSeed(page, d);
  await login(page, 'kiraci@ornek.com');
  await expect(page.getByText('Moda Dairesi').first()).toBeVisible();
  await page.goto(url('/uygulama/mesajlar'));
  await expect(page.getByText('Mesaj 249', { exact: true })).toBeVisible();
  await expect(page.getByText('Mesaj 49', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Daha eski mesajlar' }).click();
  await expect(page.getByText('Mesaj 0', { exact: true })).toBeAttached();
  await expect(page.getByRole('button', { name: 'Daha eski mesajlar' })).toHaveCount(0);
  // Yüklenen eski mesajlar yeniden gönderilmez.
  await page.waitForTimeout(1500);
  expect((await db(page)).tables.messages.length).toBe(250);
});

test('dekont görseli küçük kopyasıyla saklanır; denetim asıl dosyaya bağlıdır', async ({ page }) => {
  const d = seed();
  Object.assign(d.tables.properties[0], { aidat: 2000, aidat_payer: 'Kiracı' });
  await withSeed(page, d);
  await login(page, 'kiraci@ornek.com');
  await expect(page.getByText('Moda Dairesi').first()).toBeVisible();
  await page.goto(url('/uygulama/odemeler'));
  await page.getByRole('button', { name: /aidat dekontunu yükle$/ }).first().click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Dosya seç' }).click();
  await (await chooser).setFiles(PNG);
  await expect(page.getByText('dekont.png')).toBeVisible();
  await page.getByRole('button', { name: 'Gönder' }).click();
  await expect.poll(async () => (await db(page)).tables.reviews.length, { timeout: 15000 }).toBe(1);
  const s = await db(page);
  const main = Object.keys(s.storage).find((k) => /^p1\/k_[^/]+$/.test(k) && !k.endsWith('.k'));
  expect(main).toBeTruthy();
  expect(Object.keys(s.storage)).toContain(main + '.k');
  expect(s.tables.reviews[0].path).toBe(main);
});

test('yönetici: uzun listeler 100\'er kayıt; ödemeler son 12 ay, daha eskisi düğmeyle', async ({ page }) => {
  const d = seed();
  const old = new Date(); old.setMonth(old.getMonth() - 14);
  const oldKey = old.toISOString().slice(0, 7);
  d.tables.payments.push({ property_id: 'p1', month: oldKey, kind: 'kira', status: 'approved', amount: 30000, method: 'dekont', updated_at: old.toISOString() });
  for (let i = 0; i < 130; i++) {
    const id = '00000000-0000-0000-0000-1' + String(i).padStart(11, '0');
    d.users.push({ id, email: `k${i}@ornek.com`, password: PW, meta: { name: 'Toplu ' + i, role: 'tenant' } });
    d.tables.profiles.push({ id, role: 'tenant', name: 'Toplu ' + i, phone: '', lang: 'tr', settings: {}, created_at: new Date().toISOString() });
  }
  await withSeed(page, d);
  await login(page, 'admin@ornek.com');
  await page.getByRole('button', { name: /^Kullanıcılar/ }).click();
  await expect(page.getByRole('button', { name: /^Daha fazla göster \(\d+ kaldı\)$/ })).toBeVisible();
  await page.getByRole('button', { name: /^Ödemeler/ }).click();
  await expect(page.getByText('0 kayıt', { exact: false }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Daha eski ödemeleri yükle' }).click();
  await expect(page.getByText(/^1 kayıt/).first()).toBeVisible();
});
