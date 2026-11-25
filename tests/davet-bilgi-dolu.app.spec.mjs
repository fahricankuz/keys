// Davet bağlantısıyla kayıt formu dolu gelir (migration davet_bilgi_dolu): site daveti ve mülk (kiracı) daveti.
import { test, expect } from '@playwright/test';
import { serveDist, seed, ensureDist } from './app-helpers.mjs';
import { watchErrors } from './helpers.mjs';

const DIST = new URL('../app/dist-fake', import.meta.url).pathname;
const PORT = 8310;
const ORG = '20000000-0000-4000-8000-0000000000d1';
let server;
test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => { test.setTimeout(300_000); await ensureDist(DIST); server = await serveDist(DIST, PORT); });
test.afterAll(() => server && server.close());

function veri() {
  const d = seed(), at = new Date().toISOString();
  d.tables.organizations = [{ id: ORG, name: 'Dalyan Sitesi', sector: 'site', modules: ['aidat'], status: 'active', units: 10, billing: {}, note: '', created_at: at }];
  d.tables.site_units = [{ id: 'u1', org_id: ORG, block: 'A', no: '3', aidat: 1000, payer: 'kiraci', created_at: at }];
  d.tables.site_residents = [{ id: 'r1', org_id: ORG, unit_id: 'u1', user_id: null, role: 'malik', name: 'Zeynep Kaya', phone: '0532 444 55 66', email: 'zeynep@ornek.com', lives_here: true, code: 'S12AB34C', created_at: at }];
  return d;
}

test('site daveti: bağlantıdan kayıt formunda ad, e-posta ve telefon dolu (değiştirilebilir)', async ({ page }) => {
  const errors = watchErrors(page);
  await page.addInitScript((x) => { if (!localStorage.getItem('__fakedb')) localStorage.setItem('__fakedb', JSON.stringify(x)); }, veri());
  await page.goto(`http://localhost:${PORT}/katil?kod=S12AB34C`);
  await page.getByRole('button', { name: 'Ücretsiz hesap oluştur' }).click();
  await expect(page).toHaveURL(/\/kayit\/site-sakini/);
  await expect(page.getByLabel('Ad soyad')).toHaveValue('Zeynep Kaya');
  await expect(page.getByLabel('E-posta')).toHaveValue('zeynep@ornek.com');
  await expect(page.getByLabel(/Telefon/).first()).toHaveValue('0532 444 55 66');
  await page.getByLabel('Ad soyad').fill('Zeynep K.');
  await expect(page.getByLabel('Ad soyad')).toHaveValue('Zeynep K.');
  expect(errors).toEqual([]);
});
