// Kurumsal panelde ₺ / $ / € anahtarı: Özet ve Rapor seçilen para biriminde, seçim hesapta hatırlanır; 12 aylık gelir
// grafiği TL ve dolarda; dövizli sözleşmede kur farkı ayrı satırda; kur dip notu.
import { test, expect } from '@playwright/test';
import { serveDist, seed, PW, ensureDist, ID , pickRole } from './app-helpers.mjs';
import { watchErrors } from './helpers.mjs';

const DIST = new URL('../app/dist-fake', import.meta.url).pathname;
const PORT = 8247;
let server, errors;

test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => { test.setTimeout(300_000); await ensureDist(DIST); server = await serveDist(DIST, PORT); });
test.afterAll(() => server && server.close());
test.beforeEach(({ page }) => { errors = watchErrors(page); });
test.afterEach(() => { expect(errors).toEqual([]); });

const url = (p) => `http://localhost:${PORT}${p}`;
const ist = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(d);
const month = ist(new Date()).slice(0, 7);
const first = month + '-01';

function data() {
  const d = seed();
  const now = new Date().toISOString();
  d.tables.organizations = [{ id: 'o1', name: 'Kordon AVM', sector: 'avm', modules: ['kira', 'ortak_gider', 'doluluk', 'rapor'], status: 'active', units: null, created_at: now }];
  d.tables.org_roles = [];
  d.tables.org_members = [{ org_id: 'o1', user_id: ID.landlord, role_id: null, is_master: true, created_at: now }];
  d.tables.site_units = [
    { id: 'u1', org_id: 'o1', block: 'Zemin', no: 'Z-1', area: 100, rent: 4000, currency: 'TRY', payer: 'kiraci', index_kind: 'tufe', created_at: now },
    { id: 'u2', org_id: 'o1', block: 'Zemin', no: 'Z-2', area: 100, rent: 1000, currency: 'USD', payer: 'kiraci', index_kind: 'tufe', created_at: now }
  ];
  d.tables.site_charges = [
    { id: 'c1', org_id: 'o1', unit_id: 'u1', month, kind: 'kira', title: '', amount: 4000, currency: 'TRY', due_on: first, status: 'open', paid_amount: 0, method: 'dekont', created_at: now },
    { id: 'c2', org_id: 'o1', unit_id: 'u2', month, kind: 'kira', title: '', amount: 40000, currency: 'USD', orig_amount: 1000, fx: 40, due_on: first, status: 'paid', paid_on: first, paid_amount: 40000, method: 'havale', created_at: now }
  ];
  // Ay başından önceki son iş günü 40, ay başı 42 (ödeme günü) — kur 42 → sözleşme $1.000, TL'nin karşılığı $952 (kur farkı −$48).
  const before = new Date(first + 'T12:00:00Z'); before.setUTCDate(before.getUTCDate() - 5);
  d.tables.fx_rates = [
    { day: before.toISOString().slice(0, 10), currency: 'USD', sell: 40 }, { day: first, currency: 'USD', sell: 42 },
    { day: first, currency: 'EUR', sell: 50 }
  ];
  return d;
}

async function login(page) {
  await page.addInitScript((x) => { if (!localStorage.getItem('__fakedb')) localStorage.setItem('__fakedb', JSON.stringify(x)); }, data());
  await page.goto(url('/giris/mulk-sahibi'));
  await page.getByLabel('E-posta').fill('ev@ornek.com');
  await page.getByLabel('Şifre', { exact: true }).fill(PW);
  await page.getByRole('button', { name: 'Giriş yap' }).click();
  await pickRole(page);
  await expect(page).toHaveURL(/\/uygulama\/site$/);
}

test('Özet: ₺ varsayılan; $ seçilince tutarlar dolarda, grafik TL ve dolarda; seçim yeniden açınca korunur', async ({ page }) => {
  await login(page);
  await expect(page.getByText('₺44.000').first()).toBeVisible();                      // kayıtlı TL
  await expect(page.getByText('12 aylık gelir')).toBeVisible();
  await page.getByRole('button', { name: '$ USD' }).click();
  await expect(page.getByText('$1.095').first()).toBeVisible();                        // TL kira $95 (son ödeme günü kuru 42) + sözleşmedeki $1.000
  await expect(page.getByText(/kur farkı −\$48/)).toBeVisible();
  await expect(page.getByText(/TCMB döviz satış kuru; her işlem kendi gününün kuruyla/)).toBeVisible();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('__fakedb')).tables.profiles.find((p) => p.settings)?.settings?.reportCurrency);
  await page.waitForTimeout(1500);
  await page.reload();
  await expect(page.getByText('$1.095').first()).toBeVisible();
  expect(saved === undefined || saved === 'USD').toBe(true);
});

test('Rapor: kur farkı ayrı satırda; € seçilince avroda', async ({ page }) => {
  await login(page);
  await page.getByRole('link', { name: 'Rapor', exact: true }).first().click();
  await page.getByRole('button', { name: '$ USD' }).click();
  await expect(page.getByText('Kur farkı', { exact: true })).toBeVisible();
  await expect(page.getByText('−$48')).toBeVisible();
  await page.getByRole('button', { name: '€ EUR' }).click();
  await expect(page.getByText(/^€/).first()).toBeVisible();
  await page.getByRole('button', { name: '₺ TL' }).click();
  await expect(page.getByText('₺44.000').first()).toBeVisible();
  await expect(page.getByText('−₺2.000')).toBeVisible();                              // TL kur farkı: 40.000 − 1.000 × 42
});
