// Anahtar ekibi müşteri adına mülk ekler (Kurumlar ve Kullanıcılar bölümlerinden); kurumun sözleşme adedi dolunca uyarır.
// Sunucu kuralları gerçek Postgres'te ayrıca sınanır (org-mulk.sql.spec.mjs).
import { test, expect } from '@playwright/test';
import { serveDist, seed, PW, ensureDist, ID } from './app-helpers.mjs';
import { watchErrors } from './helpers.mjs';

const DIST = new URL('../app/dist-fake', import.meta.url).pathname;
const PORT = 8208;
const ORG = '20000000-0000-4000-8000-000000000001';
let server;
let errors;

test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => {
  test.setTimeout(300_000);
  await ensureDist(DIST);
  server = await serveDist(DIST, PORT);
});
test.afterAll(() => server && server.close());

test.beforeEach(async ({ page }) => {
  errors = watchErrors(page);
  const db = seed();
  db.tables.organizations = [{ id: ORG, name: 'Örnek AVM', sector: 'avm', modules: ['kira', 'rapor'], status: 'active', units: 2, contract_until: null, billing: {}, note: '', created_at: new Date().toISOString() }];
  db.tables.org_members = [{ org_id: ORG, user_id: ID.landlord, role_id: null, is_master: true }];
  db.tables.org_roles = []; db.tables.org_invites = [];
  db.tables.properties[0].org_id = ORG;                 // master'ın mevcut mülkü kuruma bağlı: 1/2
  await page.addInitScript((d) => { if (!localStorage.getItem('__fakedb')) localStorage.setItem('__fakedb', JSON.stringify(d)); }, db);
});
test.afterEach(() => { expect(errors).toEqual([]); });

const url = (p) => `http://localhost:${PORT}${p}`;
const db = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('__fakedb')));

async function adminLogin(page) {
  await page.goto(url('/giris/yonetici'));
  await page.getByLabel('E-posta').fill('admin@ornek.com');
  await page.getByLabel('Şifre', { exact: true }).fill(PW);
  await page.getByRole('button', { name: 'Giriş yap' }).click();
  await expect(page).toHaveURL(/\/admin/);
}

test('Kurumlar: master adına mülk eklenir; sözleşme adedi dolunca uyarır ve yine de eklenebilir', async ({ page }) => {
  await adminLogin(page);
  await page.getByRole('button', { name: 'Kurumlar', exact: true }).first().click();
  await expect(page.getByText('1 mülk ekli')).toBeVisible();
  await expect(page.getByText('2 birim (sözleşme)')).toBeVisible();
  await page.getByRole('button', { name: 'Mülk ekle' }).click();
  await expect(page.getByText('Şu an 1 mülk var; sözleşmedeki adet 2.')).toBeVisible();
  await expect(page.getByText('Sözleşmedeki adet dolu.')).toHaveCount(0);
  await page.getByLabel('Mülk adı').fill('Mağaza 12');
  await page.getByRole('checkbox', { name: 'Mağaza' }).click();
  await page.getByLabel('Aylık kira').fill('42000');
  await page.getByLabel('Ödeme günü (1-28)').fill('5');
  await page.getByRole('button', { name: 'Mülk ekle' }).last().click();
  await expect(page.getByText('Mülk eklendi.')).toBeVisible();
  await expect(page.getByText('2 mülk ekli')).toBeVisible();
  let d = await db(page);
  expect(d.tables.properties.find((p) => p.name === 'Mağaza 12')).toMatchObject({ owner_id: ID.landlord, org_id: ORG, prop_type: 'Mağaza', rent: 42000, due_day: 5 });

  // Adet doldu: uyarı çıkar, düğme "Yine de ekle" olur, ekleme yine yapılır ve aşım bildirilir.
  await page.getByRole('button', { name: 'Mülk ekle' }).click();
  await expect(page.getByText('Sözleşmedeki adet dolu.')).toBeVisible();
  await page.getByLabel('Mülk adı').fill('Depo 3');
  await page.getByRole('button', { name: 'Yine de ekle' }).click();
  await expect(page.getByText('Sözleşme / paket adedi aşıldı (3/2).')).toBeVisible();
  d = await db(page);
  expect(d.tables.properties.filter((p) => p.org_id === ORG)).toHaveLength(3);
  expect(d.tables.admin_audit.filter((a) => a.action === 'property.add')).toHaveLength(2);
});

test('Kullanıcılar: mülk sahibi hesabı adına mülk eklenir; kiracı hesabında düğme yok; ad zorunlu', async ({ page }) => {
  await adminLogin(page);
  await page.getByRole('button', { name: 'Kullanıcılar', exact: true }).first().click();
  const tenant = page.locator('div').filter({ hasText: /^Mehmet Kiracı/ }).last();
  await expect(page.getByRole('button', { name: 'Mülk ekle' })).toHaveCount(1);      // yalnız mülk sahibi (Ayşe) için
  await page.getByRole('button', { name: 'Mülk ekle' }).click();
  await expect(page.getByText('Ayşe Mülk adına mülk ekle')).toBeVisible();
  await page.getByRole('button', { name: 'Mülk ekle' }).last().click();
  await expect(page.getByText('Mülk adını yaz.')).toBeVisible();
  await page.getByLabel('Mülk adı').fill('Moda 2+1');
  await page.getByRole('button', { name: 'Mülk ekle' }).last().click();
  await expect(page.getByText('Mülk eklendi.')).toBeVisible();
  expect((await db(page)).tables.properties.some((p) => p.name === 'Moda 2+1' && p.owner_id === ID.landlord)).toBe(true);
});
