// Site kasası: devreden + tahsilat − gider = kalan (açılıştan önceki işlem sayılmaz); kategoriyle ve faturayla gider; "Ek toplama yap"
// onay ister; Rapor'da dönemin kasası.
import { test, expect } from '@playwright/test';
import { serveDist, seed, PW, ensureDist, ID } from './app-helpers.mjs';
import { watchErrors, PNG } from './helpers.mjs';

const DIST = new URL('../app/dist-fake', import.meta.url).pathname;
const PORT = 8262;
let server, errors;
test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => { test.setTimeout(300_000); await ensureDist(DIST); server = await serveDist(DIST, PORT); });
test.afterAll(() => server && server.close());
test.beforeEach(({ page }) => { errors = watchErrors(page); });
test.afterEach(() => { expect(errors).toEqual([]); });
const url = (p) => `http://localhost:${PORT}${p}`;
const ist = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(new Date());
const month = ist.slice(0, 7);
const prevMonth = (() => { const d = new Date(month + '-15T12:00:00Z'); d.setUTCMonth(d.getUTCMonth() - 1); return d.toISOString().slice(0, 7); })();

function data() {
  const d = seed();
  const at = new Date().toISOString();
  d.tables.organizations = [{ id: 'o1', name: 'Atakum Sitesi', sector: 'site', modules: ['aidat', 'gider_dagitim', 'duyuru', 'rapor'], status: 'active', units: null, created_at: at }];
  d.tables.org_roles = [];
  d.tables.org_members = [{ org_id: 'o1', user_id: ID.landlord, role_id: null, is_master: true, created_at: at }];
  d.tables.site_units = [{ id: 'u1', org_id: 'o1', block: 'A', no: '1', area: 100, share: 1, aidat: 1500, payer: 'kiraci', created_at: at },
                         { id: 'u2', org_id: 'o1', block: 'A', no: '2', area: 100, share: 1, aidat: 1500, payer: 'kiraci', created_at: at }];
  d.tables.site_cash = [{ org_id: 'o1', opening: 10000, opening_on: prevMonth + '-01', updated_at: at }];
  d.tables.site_charges = [
    { id: 'c0', org_id: 'o1', unit_id: 'u1', month: prevMonth, kind: 'aidat', title: '', amount: 1500, status: 'paid', paid_amount: 1500, paid_on: prevMonth + '-10', created_at: at },
    { id: 'c1', org_id: 'o1', unit_id: 'u1', month, kind: 'aidat', title: '', amount: 1500, status: 'paid', paid_amount: 1500, paid_on: month + '-05', created_at: at },
    { id: 'c2', org_id: 'o1', unit_id: 'u2', month, kind: 'aidat', title: '', amount: 1500, status: 'open', paid_amount: 0, created_at: at }
  ];
  d.tables.site_expenses = [{ id: 'x0', org_id: 'o1', cat: 'Temizlik', amount: 2000, spent_on: prevMonth + '-20', note: '', created_at: at }];
  return d;
}
async function login(page) {
  await page.addInitScript((x) => { if (!localStorage.getItem('__fakedb')) localStorage.setItem('__fakedb', JSON.stringify(x)); }, data());
  await page.goto(url('/giris/mulk-sahibi'));
  await page.getByLabel('E-posta').fill('ev@ornek.com');
  await page.getByLabel('Şifre', { exact: true }).fill(PW);
  await page.getByRole('button', { name: 'Giriş yap' }).click();
  await expect(page).toHaveURL(/\/uygulama\/site$/);
}

test('kasa: devreden 9.500, tahsilat 1.500; kategoriyle ve faturayla gider eklenince kalan düşer; Ek toplama onay ister', async ({ page }) => {
  await login(page);
  await page.getByRole('link', { name: 'Giderler', exact: true }).first().click();
  // Devreden = 10.000 açılış + 1.500 geçen ay tahsilat − 2.000 geçen ay gider.
  await expect(page.getByText('₺9.500').first()).toBeVisible();
  await expect(page.getByText('₺11.000').first()).toBeVisible();                  // kalan: 9.500 + 1.500
  await page.getByRole('button', { name: 'Asansör', exact: true }).click();
  await page.getByLabel('Tutar (₺)').fill('2500');
  await page.getByLabel('Tarih (YYYY-AA-GG)').fill(ist);
  const pick = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: /Dosya seç|Fotoğraf/ }).first().click();
  await (await pick).setFiles(PNG);
  await page.getByRole('button', { name: 'Gideri ekle' }).click();
  await expect(page.getByText('₺8.500').first()).toBeVisible();                   // 11.000 − 2.500
  const x = await page.evaluate(() => JSON.parse(localStorage.getItem('__fakedb')).tables.site_expenses.find((e) => e.cat === 'Asansör'));
  expect(x.receipt_path).toMatch(/^site-o1\//);
  await page.getByRole('button', { name: 'Ek toplama yap' }).first().click();
  await expect(page.getByText('Ek toplama yapılsın mı?')).toBeVisible();
  await expect(page.getByText(/kasadan değil, dairelerden ayrıca toplanır/)).toBeVisible();
  await page.getByRole('button', { name: 'Vazgeç' }).click();
  await expect(page.getByText('Ek toplama yapılsın mı?')).toHaveCount(0);
  await expect(page).toHaveURL(/\/uygulama\/site\/giderler/);                       // vazgeçildi: dağıtıma gitmedi
  await page.goto(url('/uygulama/site/rapor'));
  await expect(page.getByText(/kasası$/).first()).toBeVisible();
  await expect(page.getByText('Kasada kalan').first()).toBeVisible();
});
