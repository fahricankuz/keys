// Ekip ekranı paketlere göre: Başlangıç'ta yalnızca "Profesyonel ve Kurumsal'da var" bilgisi ve paket önerisi (davet, roller, geçmiş yok);
// Profesyonel, Kurumsal ve denemede tam ekran.
import { test, expect } from '@playwright/test';
import { serveDist, seed, PW, ensureDist, ID } from './app-helpers.mjs';
import { watchErrors } from './helpers.mjs';

const DIST = new URL('../app/dist-fake', import.meta.url).pathname;
const PORT = 8250;
let server;
test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => { test.setTimeout(300_000); await ensureDist(DIST); server = await serveDist(DIST, PORT); });
test.afterAll(() => server && server.close());

/** pid boşsa deneme (abonelik yok). */
async function ekip(page, pid) {
  const errors = watchErrors(page);
  const d = seed();
  if (pid) d.tables.subscriptions.push({ user_id: ID.landlord, entitlement: 'pro', product_id: pid, store: 'app_store', expires_at: new Date(Date.now() + 30 * 864e5).toISOString(), active: true, will_renew: true, billing_issue: false, updated_at: new Date().toISOString() });
  await page.addInitScript((x) => { if (!localStorage.getItem('__fakedb')) localStorage.setItem('__fakedb', JSON.stringify(x)); }, d);
  await page.goto(`http://localhost:${PORT}/giris/mulk-sahibi`);
  await page.getByLabel('E-posta').fill('ev@ornek.com');
  await page.getByLabel('Şifre', { exact: true }).fill(PW);
  await page.getByRole('button', { name: 'Giriş yap' }).click();
  await expect(page).toHaveURL(/uygulama/);
  await page.getByRole('link', { name: 'Ekip', exact: true }).first().click();
  await expect(page.getByRole('heading', { name: 'Ekip', exact: true }).or(page.getByText('Ekip', { exact: true }).first()).first()).toBeVisible({ timeout: 15000 });
  return errors;
}

test('Başlangıç: ekip yok, yalnızca bilgi ve paket önerisi', async ({ page }) => {
  const errors = await ekip(page, 'tek_3_aylik');
  await expect(page.getByText(/Ekip üyeleri \(emlakçı, muhasebeci, personel\) Profesyonel ve Kurumsal paketlerinde var\./)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Paketleri gör' })).toBeVisible();
  for (const x of ['Ekip üyesi davet et', 'Roller', 'İşlem geçmişi', 'Ekip üyeleri']) await expect(page.getByText(x, { exact: true })).toHaveCount(0);
  expect(errors).toEqual([]);
});

for (const [ad, pid] of [['Profesyonel', 'bes_3_aylik'], ['Kurumsal', 'kurumsal'], ['deneme', null]]) {
  test(`${ad}: ekip ekranı tam (davet, roller)`, async ({ page }) => {
    const errors = await ekip(page, pid);
    await expect(page.getByText('Roller', { exact: true })).toBeVisible();
    await expect(page.getByText('Paketlerinde var', { exact: false })).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}
