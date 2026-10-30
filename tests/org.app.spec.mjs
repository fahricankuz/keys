// Kurumlar (yol planı Faz 0), uygulama üzerinde uçtan uca: yönetici kurumsal başvuruyu kuruma çevirir ve
// master yöneticiyi atar; master rolün yetkisini düzenleyip yönetici davet eder; davetle gelen kişi kurumu
// rolü ve yetkileriyle görür. Sunucu kuralları gerçek Postgres'te ayrıca sınanır (org.sql.spec.mjs).
import { test, expect } from '@playwright/test';
import { serveDist, seed, PW, ensureDist } from './app-helpers.mjs';
import { watchErrors } from './helpers.mjs';

const DIST = new URL('../app/dist-fake', import.meta.url).pathname;
const PORT = 8207;
let server;
let errors;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  test.setTimeout(300_000);
  await ensureDist(DIST);
  server = await serveDist(DIST, PORT);
});
test.afterAll(() => server && server.close());

const LEAD = { id: '11111111-2222-4333-8444-555555555555', user_id: null, kind: 'kurumsal', units: 240, name: 'Selin Yönetici', email: 'yonetim@atakum.com',
  phone: '0532 000 00 00', message: '', company: 'Atakum Sitesi', source: 'web', details: { types: ['Konut'], role: 'Site / bina yönetimi', city: 'Samsun', timeline: 'Hemen' },
  status: 'open', created_at: new Date().toISOString() };

test.beforeEach(async ({ page }) => {
  errors = watchErrors(page);
  const db = seed();
  db.tables.support_requests = [LEAD];
  await page.addInitScript(d => { if (!localStorage.getItem('__fakedb')) localStorage.setItem('__fakedb', JSON.stringify(d)); }, db);
});
test.afterEach(() => { expect(errors).toEqual([]); });

const url = p => `http://localhost:${PORT}${p}`;
const ENTRY = { 'kiraci@ornek.com': '/giris/kiraci', 'ev@ornek.com': '/giris/mulk-sahibi', 'admin@ornek.com': '/giris/yonetici' };
async function login(page, email) {
  await page.goto(url(ENTRY[email]));
  await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('__fakedb')); d.session = null; localStorage.setItem('__fakedb', JSON.stringify(d)); });
  await page.goto(url(ENTRY[email]));
  await page.getByLabel('E-posta').fill(email);
  await page.getByLabel('Şifre', { exact: true }).fill(PW);
  await page.getByRole('button', { name: 'Giriş yap' }).click();
}

test('kurumsal başvurudan kurum açılır, master atanır; master rolü düzenleyip davet eder; davetli yönetici rolüyle katılır', async ({ page }) => {
  // 1. anahtar yöneticisi: başvuru → kurum → master.
  await login(page, 'admin@ornek.com');
  await page.getByRole('button', { name: 'Talepler' }).first().click();
  await expect(page.getByText('Selin Yönetici · Atakum Sitesi')).toBeVisible();
  await page.getByRole('button', { name: 'Kuruma çevir' }).click();
  await expect(page.getByLabel('Kurum adı')).toHaveValue('Atakum Sitesi');
  await expect(page.getByRole('checkbox', { name: 'Site ve bina yönetimi' })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('checkbox', { name: /^Aidat takibi/ })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByLabel('Birim sayısı (sözleşme)')).toHaveValue('240');
  await page.getByRole('button', { name: 'Kurumu aç' }).click();
  await expect(page.getByText('Master yönetici yok')).toBeVisible();
  await page.getByRole('button', { name: 'Master belirle' }).click();
  await page.getByLabel('Master yöneticinin e-postası').fill('ev@ornek.com');
  await page.getByRole('button', { name: 'Ata', exact: true }).click();
  await expect(page.getByText('Master: Ayşe Mülk · ev@ornek.com')).toBeVisible();
  // Başvuru kapandı.
  await page.getByRole('button', { name: 'Talepler' }).first().click();
  await expect(page.getByText('Talep yok.')).toBeVisible();

  // 2. Master: Kurum ekranı, rol yetkisi düzenleme, davet kodu.
  await login(page, 'ev@ornek.com');
  await expect(page).toHaveURL(/\/uygulama\/site$/);            // kurum yöneticisi girişte kendi panelinde açılır
  await page.getByRole('link', { name: 'Kurum' }).first().click();
  await expect(page).toHaveURL(/\/uygulama\/kurum/);
  await expect(page.getByText('Atakum Sitesi').first()).toBeVisible();
  await expect(page.getByText('Master yönetici').first()).toBeVisible();
  await page.getByRole('button', { name: 'Muhasebe rolünü düzenle' }).click();
  await page.getByRole('checkbox', { name: 'Duyurular' }).click();
  await page.getByRole('button', { name: 'Kaydet' }).click();
  await expect(page.getByRole('button', { name: 'Muhasebe rolünü düzenle' })).toBeVisible();
  await page.getByRole('checkbox', { name: 'Muhasebe' }).click();
  await page.getByRole('button', { name: 'Davet kodu oluştur' }).click();
  const code = (await page.getByText(/^K[0-9A-F]{7}$/).first().textContent()).trim();
  expect(code).toMatch(/^K[0-9A-F]{7}$/);

  // 3. Davetli: bağlantıyla katılır, kurumu rolü ve yetkileriyle görür; rolleri düzenleyemez.
  await login(page, 'kiraci@ornek.com');
  await expect(page.getByText('Moda Dairesi').first()).toBeVisible();
  await page.goto(url('/katil?kod=' + code));
  await expect(page).toHaveURL(/\/uygulama(\/site)?\/?$/);         // site yöneticisi olunca kurum paneline gider
  await page.goto(url('/uygulama/kurum'));
  await expect(page.getByText('Atakum Sitesi').first()).toBeVisible();
  await expect(page.getByText('Rolleri ve yetkileri master yönetici düzenler.')).toBeVisible();
  await expect(page.getByText('Duyurular').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Muhasebe rolünü düzenle' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Davet kodu oluştur' })).toHaveCount(0);
  const fake = await page.evaluate(() => JSON.parse(localStorage.getItem('__fakedb')).tables.org_members);
  expect(fake.map(m => m.is_master).sort()).toEqual([false, true]);
});
