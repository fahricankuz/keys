// İşletme projesi Projeler'in içinde (uygulama): yönetim yıllık planı açar (taslak, sakin görmez), oylamaya sunar, malik oy verir, onaylanınca
// aidatları güncelleyip yürürlüğe alır; onaylı plan doğrudan değişmez; yıl ortası ek maliyet "ek ödenek" olarak oylanır ve kalemin tutarına eklenir.
// Sunucu kuralları gerçek Postgres'te ayrıca sınanır (isletme-proje.sql).
import { test, expect } from '@playwright/test';
import { serveDist, seed, PW, ensureDist, ID , pickRole } from './app-helpers.mjs';
import { watchErrors } from './helpers.mjs';

const DIST = new URL('../app/dist-fake', import.meta.url).pathname;
const PORT = 8264;
let server;
let errors;
test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => { test.setTimeout(300_000); await ensureDist(DIST); server = await serveDist(DIST, PORT); });
test.afterAll(() => server && server.close());

test.beforeEach(async ({ page }) => {
  errors = watchErrors(page);
  const db = seed();
  const now = new Date().toISOString();
  db.tables.organizations = [{ id: 'o1', name: 'Atakum Sitesi', sector: 'site', modules: ['aidat', 'duyuru', 'gider_dagitim', 'rapor'], status: 'active', units: null, created_at: now }];
  db.tables.org_roles = [];
  db.tables.org_members = [{ org_id: 'o1', user_id: ID.landlord, role_id: null, is_master: true, created_at: now }];
  db.tables.site_units = [
    { id: 'u1', org_id: 'o1', block: 'A', no: '1', area: 100, share: 3, aidat: 1000, payer: 'malik', currency: 'TRY', created_at: now },
    { id: 'u2', org_id: 'o1', block: 'A', no: '2', area: 100, share: 1, aidat: 1000, payer: 'malik', currency: 'TRY', created_at: now }
  ];
  db.tables.site_residents = [{ id: 'r1', org_id: 'o1', unit_id: 'u1', user_id: ID.tenant, role: 'malik', name: 'Mehmet Malik', phone: '', email: 'kiraci@ornek.com', lives_here: true, code: 'S0000001', created_at: now }];
  await page.addInitScript((d) => { if (!localStorage.getItem('__fakedb')) localStorage.setItem('__fakedb', JSON.stringify(d)); }, db);
});
test.afterEach(() => { expect(errors).toEqual([]); });

const url = (p) => `http://localhost:${PORT}${p}`;
const db = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('__fakedb')));
const ENTRY = { 'kiraci@ornek.com': '/giris/kiraci', 'ev@ornek.com': '/giris/mulk-sahibi' };
async function login(page, email) {
  await page.goto(url(ENTRY[email]));
  await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('__fakedb')); d.session = null; localStorage.setItem('__fakedb', JSON.stringify(d)); });
  await page.goto(url(ENTRY[email]));
  await page.getByLabel('E-posta').fill(email);
  await page.getByLabel('Şifre', { exact: true }).fill(PW);
  await page.getByRole('button', { name: 'Giriş yap' }).click();
  await pickRole(page);
}
const budget = async (page) => (await db(page)).tables.site_budgets[0];

test('işletme projesi: taslak, oylama, onay, aidat güncelleme, ek ödenek (oylanır, kalem tutarına eklenir)', async ({ page }) => {
  const year = new Date().getFullYear();
  // 1. Yönetim: yıllık planı açar; taslak.
  await login(page, 'ev@ornek.com');
  await expect(page).toHaveURL(/\/uygulama\/site$/);
  await page.getByRole('link', { name: 'Projeler', exact: true }).first().click();
  await expect(page.getByRole('link', { name: 'İşletme projesi', exact: true })).toHaveCount(0);   // eski ayrı menü yok
  await page.getByRole('button', { name: `${year} işletme projesi aç` }).click();
  await page.getByRole('button', { name: 'Personel', exact: true }).first().click();
  await page.getByLabel('Yıllık tutar (₺)').fill('90000');
  await page.getByRole('button', { name: 'Kaydet' }).click();
  await expect(page.getByText(`${year} işletme projesi`).first()).toBeVisible();
  await expect(page.getByText('₺90.000').first()).toBeVisible();
  await expect(page.getByText('Taslak').first()).toBeVisible();
  expect((await db(page)).tables.site_projects[0]).toMatchObject({ kind: 'isletme', status: 'acildi', year, budget: 90000 });

  // Sakin taslağı görmez.
  await login(page, 'kiraci@ornek.com');
  await page.goto(url('/uygulama/sitem'));
  await expect(page.getByText(`${year} işletme projesi`)).toHaveCount(0);

  // 2. Yönetim oylamaya sunar; malik Kabul der.
  await login(page, 'ev@ornek.com');
  await page.goto(url('/uygulama/site/projeler'));
  await page.getByRole('button', { name: 'Oylamaya sun', exact: true }).click();
  await page.getByRole('button', { name: 'Oylamaya sun', exact: true }).last().click();
  await expect(page.getByText('Oylama: işletme projesi onaylansın mı?')).toBeVisible();
  await login(page, 'kiraci@ornek.com');
  await page.goto(url('/uygulama/sitem'));
  await expect(page.getByText('Oylama: işletme projesi onaylansın mı?')).toBeVisible();
  await page.getByRole('checkbox', { name: 'Kabul', exact: true }).click();
  await expect(page.getByText('Oyun kaydedildi; oylama bitene kadar değiştirebilirsin.')).toBeVisible();

  // 3. Yönetim oylamayı bitirir: onaylandı, kurul onay tarihi yazıldı; aidatları güncelleyip yürürlüğe alır; plan kilitli.
  await login(page, 'ev@ornek.com');
  await page.goto(url('/uygulama/site/projeler'));
  await page.getByRole('button', { name: 'Oylamayı bitir ve sonucu uygula' }).click();
  await expect(page.getByText('İşletme projesi onaylandı. Yönetim daire aidatlarını güncelleyince yürürlüğe girer.')).toBeVisible();
  expect((await budget(page)).approved_on).toBeTruthy();
  await expect(page.getByRole('button', { name: 'Kalemleri düzenle' })).toHaveCount(0);            // onaylı plan doğrudan değişmez
  await page.getByRole('button', { name: 'Daire aidatlarını güncelle ve yürürlüğe al' }).click();
  await expect(page.getByText('Aidatlar güncellendi; işletme projesi yürürlükte.')).toBeVisible();
  let d = await db(page);
  expect(d.tables.site_units.map((u) => [u.id, u.aidat])).toEqual([['u1', 5625], ['u2', 1875]]);       // 90.000 · 3/4 / 12 ve 1/4 / 12
  expect(d.tables.site_projects.find((p) => p.kind === 'isletme').status).toBe('yapim');
  await expect(page.getByText('Yürürlükte').first()).toBeVisible();

  // 4. Yıl ortası ek maliyet: ek ödenek taslağı, oylama, onay; kalem tutarına eklenir.
  await page.getByRole('button', { name: 'Ek ödenek (yıl ortası ek maliyet)' }).click();
  await page.getByRole('button', { name: 'Personel', exact: true }).last().click();
  await page.getByLabel('Ek tutar (₺)').fill('10000');
  await page.getByRole('button', { name: 'Ek ödenek taslağı aç' }).click();
  await expect(page.getByText('Ek ödenek: Personel').first()).toBeVisible();
  d = await db(page);
  const ek = d.tables.site_projects.find((p) => p.kind === 'ek');
  expect(ek).toMatchObject({ cat: 'Personel', budget: 10000, status: 'acildi', year });
  const ekCard = page.getByText('Ek ödenek: Personel').first();
  await expect(ekCard).toBeVisible();
  await page.getByRole('button', { name: 'Oylamaya sun', exact: true }).first().click();
  await page.getByRole('button', { name: 'Oylamaya sun', exact: true }).last().click();
  await login(page, 'kiraci@ornek.com');
  await page.goto(url('/uygulama/sitem'));
  await expect(page.getByText('Oylama: ek ödenek onaylansın mı?')).toBeVisible();
  await page.getByRole('checkbox', { name: 'Kabul', exact: true }).last().click();
  await expect.poll(async () => (await db(page)).tables.site_votes.length).toBe(2);
  await login(page, 'ev@ornek.com');
  await page.goto(url('/uygulama/site/projeler'));
  await page.getByRole('button', { name: 'Oylamayı bitir ve sonucu uygula' }).click();
  await expect.poll(async () => (await budget(page)).items[0].amount).toBe(100000);                   // 90.000 + 10.000
  d = await db(page);
  expect(d.tables.site_projects.find((p) => p.kind === 'isletme').budget).toBe(100000);
  expect(d.tables.site_projects.find((p) => p.kind === 'ek').status).toBe('onay');
  await expect(page.getByText(/Ek ödenek onaylandı: Personel · ₺10\.000/)).toBeVisible();
  // Eski adres Projeler'e yönlenir.
  await page.goto(url('/uygulama/site/butce'));
  await expect(page.getByRole('button', { name: 'Yeni proje' })).toBeVisible();
});
