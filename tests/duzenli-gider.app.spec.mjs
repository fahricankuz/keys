// Düzenli gider ve sakinlere kasa özeti: yönetim düzenli gider ekler ve durdurur; şeffaflık kapalıyken sakin kasa görmez,
// açınca Sitem'de aylık özeti ve kategori toplamlarını görür.
import { test, expect } from '@playwright/test';
import { serveDist, seed, PW, ensureDist, ID , pickRole } from './app-helpers.mjs';
import { watchErrors } from './helpers.mjs';

const DIST = new URL('../app/dist-fake', import.meta.url).pathname;
const PORT = 8263;
let server, errors;
test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => { test.setTimeout(300_000); await ensureDist(DIST); server = await serveDist(DIST, PORT); });
test.afterAll(() => server && server.close());
test.beforeEach(({ page }) => { errors = watchErrors(page); });
test.afterEach(() => { expect(errors).toEqual([]); });
const url = (p) => `http://localhost:${PORT}${p}`;
const ENTRY = { 'kiraci@ornek.com': '/giris/kiraci', 'ev@ornek.com': '/giris/mulk-sahibi' };
const month = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(new Date()).slice(0, 7);

function data(share) {
  const d = seed();
  const at = new Date().toISOString();
  d.tables.organizations = [{ id: 'o1', name: 'Atakum Sitesi', sector: 'site', modules: ['aidat', 'gider_dagitim', 'duyuru', 'rapor'], status: 'active', units: null, created_at: at }];
  d.tables.org_roles = [];
  d.tables.org_members = [{ org_id: 'o1', user_id: ID.landlord, role_id: null, is_master: true, created_at: at }];
  d.tables.memberships = d.tables.memberships.filter((x) => x.user_id !== ID.tenant);
  d.tables.site_units = [{ id: 'u1', org_id: 'o1', block: 'A', no: '1', area: 100, share: 1, aidat: 1500, payer: 'kiraci', created_at: at }];
  d.tables.site_residents = [{ id: 'r1', org_id: 'o1', unit_id: 'u1', user_id: ID.tenant, role: 'kiraci', name: 'Mehmet', code: 'S1111111', created_at: at }];
  d.tables.site_cash = [{ org_id: 'o1', opening: 5000, opening_on: month + '-01', share_summary: share, share_receipts: false, updated_at: at }];
  d.tables.site_charges = [{ id: 'c1', org_id: 'o1', unit_id: 'u1', month, kind: 'aidat', title: '', amount: 1500, status: 'paid', paid_amount: 1500, paid_on: month + '-02', created_at: at }];
  d.tables.site_expenses = [{ id: 'x1', org_id: 'o1', cat: 'Temizlik', amount: 800, spent_on: month + '-03', note: '', created_at: at }];
  return d;
}
async function login(page, email, share) {
  await page.addInitScript((x) => { if (!localStorage.getItem('__fakedb')) localStorage.setItem('__fakedb', JSON.stringify(x)); }, data(share));
  await page.goto(url(ENTRY[email]));
  await page.getByLabel('E-posta').fill(email);
  await page.getByLabel('Şifre', { exact: true }).fill(PW);
  await page.getByRole('button', { name: 'Giriş yap' }).click();
  await pickRole(page);
}

test('yönetim düzenli gider ekler ve durdurur; şeffaflığı açar', async ({ page }) => {
  await login(page, 'ev@ornek.com', false);
  await page.getByRole('link', { name: 'Giderler', exact: true }).first().click();
  await page.getByRole('button', { name: 'Düzenli gider ekle' }).click();

  await page.getByRole('button', { name: 'Personel', exact: true }).first().click();
  await page.getByLabel('Aylık tutar (₺)').fill('25000');
  await page.getByLabel('Ayın günü (1–28)').fill('5');
  await page.getByLabel('Açıklama (isteğe bağlı)').fill('Kapıcı maaşı');
  await page.getByRole('button', { name: 'Kaydet' }).first().click();
  await expect(page.getByText('Personel · Kapıcı maaşı')).toBeVisible();
  await expect(page.getByText(/Her ayın 5’i/)).toBeVisible();
  await page.getByRole('button', { name: 'Durdur' }).click();
  await expect(page.getByText(/Durduruldu/)).toBeVisible();
  const r = await page.evaluate(() => JSON.parse(localStorage.getItem('__fakedb')).tables.site_recurring_expenses[0]);
  expect(r).toMatchObject({ cat: 'Personel', amount: 25000, day: 5, note: 'Kapıcı maaşı', active: false });
  await page.getByRole('checkbox', { name: 'Sakinler kasa ve gider özetini görsün' }).click();
  await expect(page.getByText('Sakinler Sitem ekranında aylık kasa özetini ve kategori toplamlarını görür.')).toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'Faturaları da görsün' })).toBeVisible();

});

test('şeffaflık kapalıyken sakin kasa görmez', async ({ page }) => {
  await login(page, 'kiraci@ornek.com', false);
  await page.goto(url('/uygulama'));
  await expect(page.getByText('A Blok No 1').first()).toBeVisible();
  await expect(page.getByText('Site kasası')).toHaveCount(0);
});

test('şeffaflık açıkken sakin aylık kasa özetini ve kategorileri görür', async ({ page }) => {
  await login(page, 'kiraci@ornek.com', true);
  await page.goto(url('/uygulama'));
  await expect(page.getByText('Site kasası')).toBeVisible();
  await expect(page.getByText('₺5.700').first()).toBeVisible();                    // 5.000 + 1.500 − 800
  await expect(page.getByText('Temizlik').first()).toBeVisible();
  await expect(page.getByText('Faturalar')).toHaveCount(0);
});
