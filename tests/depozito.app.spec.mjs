// AVM'de depozito ve otomatik kira: yönetim sözleşmeye teminat mektubu girer; Özet'te toplam depozito ve süresi yaklaşan mektup;
// kiracı Mağazam'da kendi depozitosunu görür; Kira ekranında otomatik kira ve ortak gider kartı.
import { test, expect } from '@playwright/test';
import { serveDist, seed, PW, ensureDist, ID , pickRole } from './app-helpers.mjs';
import { watchErrors } from './helpers.mjs';

const DIST = new URL('../app/dist-fake', import.meta.url).pathname;
const PORT = 8261;
let server, errors;
test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => { test.setTimeout(300_000); await ensureDist(DIST); server = await serveDist(DIST, PORT); });
test.afterAll(() => server && server.close());
test.beforeEach(({ page }) => { errors = watchErrors(page); });
test.afterEach(() => { expect(errors).toEqual([]); });
const url = (p) => `http://localhost:${PORT}${p}`;
const ENTRY = { 'kiraci@ornek.com': '/giris/kiraci', 'ev@ornek.com': '/giris/mulk-sahibi' };
const soon = new Date(Date.now() + 25 * 864e5).toISOString().slice(0, 10);

function data() {
  const d = seed();
  const at = new Date().toISOString();
  d.tables.organizations = [{ id: 'o1', name: 'Kordon AVM', sector: 'avm', modules: ['kira', 'ortak_gider', 'doluluk', 'rapor'], status: 'active', units: null, created_at: at }];
  d.tables.org_roles = [];
  d.tables.org_members = [{ org_id: 'o1', user_id: ID.landlord, role_id: null, is_master: true, created_at: at }];
  d.tables.memberships = d.tables.memberships.filter((x) => x.user_id !== ID.tenant);
  d.tables.site_units = [{ id: 'u1', org_id: 'o1', block: 'Zemin', no: 'Z-1', area: 200, rent: 2000, currency: 'USD', payer: 'kiraci', index_kind: 'tufe', lease_end: '2029-12-31', created_at: at }];
  d.tables.site_residents = [{ id: 'r1', org_id: 'o1', unit_id: 'u1', user_id: ID.tenant, role: 'kiraci', name: 'Moda Giyim', code: 'S1111111', created_at: at }];
  return d;
}
async function login(page, email) {
  await page.addInitScript((x) => { if (!localStorage.getItem('__fakedb')) localStorage.setItem('__fakedb', JSON.stringify(x)); }, data());
  await page.goto(url(ENTRY[email]));
  await page.getByLabel('E-posta').fill(email);
  await page.getByLabel('Şifre', { exact: true }).fill(PW);
  await page.getByRole('button', { name: 'Giriş yap' }).click();
  await pickRole(page);
}

test('yönetim teminat mektubu girer; Özet’te depozito ve süresi yaklaşan mektup; kiracı kendi depozitosunu görür; otomatik kira kartı', async ({ page }) => {
  await login(page, 'ev@ornek.com');
  await expect(page).toHaveURL(/\/uygulama\/site$/);
  await page.getByRole('link', { name: 'Mağazalar', exact: true }).first().click();
  await page.getByRole('button', { name: /Zemin · Z-1/ }).first().click();
  await page.getByRole('button', { name: 'Sözleşmeyi düzenle' }).click();
  await page.getByRole('button', { name: 'Depozito ekle' }).click();
  await page.getByLabel('Depozito tutarı').fill('6000');
  await page.getByRole('checkbox', { name: 'Teminat mektubu' }).click();
  await page.getByLabel('Banka').fill('Garanti BBVA');
  await page.getByLabel('Mektubun bitişi (YYYY-AA-GG)').fill(soon);
  await expect(page.getByText('Bitişe 30 ve 7 gün kala sana hatırlatma gider.')).toBeVisible();
  await page.getByRole('button', { name: 'Sözleşmeyi kaydet' }).click();
  await expect.poll(async () => page.evaluate(() => JSON.parse(localStorage.getItem('__fakedb')).tables.site_units[0].deposit_kind)).toBe('teminat');
  const u = await page.evaluate(() => JSON.parse(localStorage.getItem('__fakedb')).tables.site_units[0]);
  expect(u).toMatchObject({ deposit_amount: 6000, deposit_currency: 'TRY', deposit_bank: 'Garanti BBVA', deposit_until: expect.any(String) });
  await page.getByRole('link', { name: 'Özet', exact: true }).first().click();
  await expect(page.getByText('Toplam depozito')).toBeVisible();
  await expect(page.getByText('Süresi yaklaşıyor')).toBeVisible();
  await page.getByRole('link', { name: 'Kira', exact: true }).first().click();
  await expect(page.getByText('Aylık kira ve ortak gider')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Otomatik kirayı aç' })).toBeVisible();
});

test('kiracı Mağazam’da depozitosunu görür', async ({ page }) => {
  await page.addInitScript(() => {
    const d = JSON.parse(localStorage.getItem('__fakedb') || 'null');
    if (!d || d.__dep) return;
    Object.assign(d.tables.site_units[0], { deposit_amount: 6000, deposit_currency: 'USD', deposit_kind: 'nakit' });
    d.__dep = true; localStorage.setItem('__fakedb', JSON.stringify(d));
  });
  await login(page, 'kiraci@ornek.com');
  await page.goto(url('/uygulama/odemeler'));
  await expect(page.getByText(/Depozito \$6\.000 \(Nakit\)/).first()).toBeVisible();
});
