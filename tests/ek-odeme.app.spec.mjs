// Ek ödemeler kartı (site → Aidat): özel toplama başına kaç daire ödedi, toplanan / istenen, ödemeyenler.
import { test, expect } from '@playwright/test';
import { serveDist, seed, PW, ensureDist, ID, pickRole } from './app-helpers.mjs';
import { watchErrors } from './helpers.mjs';

const DIST = new URL('../app/dist-fake', import.meta.url).pathname;
const PORT = 8311, ORG = '20000000-0000-4000-8000-0000000000e1';
let server;
test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => { test.setTimeout(300_000); await ensureDist(DIST); server = await serveDist(DIST, PORT); });
test.afterAll(() => server && server.close());

test('özel toplama: 1 / 2 daire ödedi, ₺5.000 / ₺10.000; ödemeyenler listelenir', async ({ page }) => {
  const errors = watchErrors(page);
  const d = seed(), at = new Date().toISOString(), m = at.slice(0, 7);
  d.tables.organizations = [{ id: ORG, name: 'Dalyan Sitesi', sector: 'site', modules: ['aidat', 'rapor'], status: 'active', units: 10, billing: {}, note: '', created_at: at }];
  d.tables.org_members = [{ org_id: ORG, user_id: ID.landlord, role_id: null, is_master: true }]; d.tables.org_roles = []; d.tables.org_invites = [];
  d.tables.site_units = [{ id: 'u1', org_id: ORG, block: 'A', no: '1', aidat: 1000, payer: 'kiraci', area: 100, created_at: at }, { id: 'u2', org_id: ORG, block: 'A', no: '2', aidat: 1000, payer: 'kiraci', area: 100, created_at: at }];
  d.tables.site_charges = [
    { id: 'o1', org_id: ORG, unit_id: 'u1', month: m, kind: 'ozel', title: 'Çatı onarımı', amount: 5000, status: 'paid', paid_amount: 5000, method: 'dekont', created_at: at, updated_at: at },
    { id: 'o2', org_id: ORG, unit_id: 'u2', month: m, kind: 'ozel', title: 'Çatı onarımı', amount: 5000, status: 'open', paid_amount: 0, method: 'dekont', created_at: at, updated_at: at }];
  await page.addInitScript((x) => { if (!localStorage.getItem('__fakedb')) localStorage.setItem('__fakedb', JSON.stringify(x)); }, d);
  await page.goto(`http://localhost:${PORT}/giris/mulk-sahibi`);
  await page.getByLabel('E-posta').fill('ev@ornek.com');
  await page.getByLabel('Şifre', { exact: true }).fill(PW);
  await page.getByRole('button', { name: 'Giriş yap' }).click();
  await pickRole(page);
  await page.getByRole('link', { name: 'Aidat' }).first().click();
  await expect(page.getByText('Ek ödemeler')).toBeVisible({ timeout: 15000 });
  await expect(page.getByText(/Çatı onarımı · /)).toBeVisible();
  await expect(page.getByText('1 / 2 daire ödedi')).toBeVisible();
  await expect(page.getByText('₺5.000 / ₺10.000', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Ödemeyenler (1)' }).click();
  await expect(page.getByText(/A Blok No 2 ₺5\.000/)).toBeVisible();
  expect(errors).toEqual([]);
});
