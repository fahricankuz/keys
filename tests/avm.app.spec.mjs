// Ticari portföy (kurumsal yol planı Faz 3), uygulama üzerinde uçtan uca: AVM yönetimi mağaza ekler ve sözleşmesini girer
// (USD kira, KDV, ciro %8, sabit %25 artış); kiracı davetle bağlanır; döviz kuruyla kira tahakkuk edilir; kiracı "Mağazam"da
// kirayı görür ve cirosunu bildirir; yönetim ciroyu onaylar (ciro farkı tahakkuku), kira artışını uygular; doluluk özeti.
// Sunucu kuralları gerçek Postgres'te ayrıca sınanır (avm.sql.spec.mjs).
import { test, expect } from '@playwright/test';
import { serveDist, seed, PW, ensureDist, ID } from './app-helpers.mjs';
import { watchErrors } from './helpers.mjs';

const DIST = new URL('../app/dist-fake', import.meta.url).pathname;
const PORT = 8211;
let server;
let errors;

test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => { test.setTimeout(300_000); await ensureDist(DIST); server = await serveDist(DIST, PORT); });
test.afterAll(() => server && server.close());

test.beforeEach(async ({ page }) => {
  errors = watchErrors(page);
  const db = seed();
  db.tables.organizations = [{ id: 'o1', name: 'Merkez AVM', sector: 'avm', modules: ['kira', 'ortak_gider', 'ciro_kira'], status: 'active', units: null, created_at: new Date().toISOString() }];
  db.tables.org_roles = [];
  db.tables.org_members = [{ org_id: 'o1', user_id: ID.landlord, role_id: null, is_master: true, created_at: new Date().toISOString() }];
  await page.addInitScript(d => { if (!localStorage.getItem('__fakedb')) localStorage.setItem('__fakedb', JSON.stringify(d)); }, db);
});
test.afterEach(() => { expect(errors).toEqual([]); });

const url = p => `http://localhost:${PORT}${p}`;
const db = page => page.evaluate(() => JSON.parse(localStorage.getItem('__fakedb')));
const ENTRY = { 'kiraci@ornek.com': '/giris/kiraci', 'ev@ornek.com': '/giris/mulk-sahibi' };
async function login(page, email) {
  await page.goto(url(ENTRY[email]));
  await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('__fakedb')); d.session = null; localStorage.setItem('__fakedb', JSON.stringify(d)); });
  await page.goto(url(ENTRY[email]));
  await page.getByLabel('E-posta').fill(email);
  await page.getByLabel('Şifre', { exact: true }).fill(PW);
  await page.getByRole('button', { name: 'Giriş yap' }).click();
}
const iso = d => d.toISOString().slice(0, 10);
const now = new Date();
const start = iso(new Date(now.getFullYear() - 1, now.getMonth(), now.getDate() - 10, 12));   // yıldönümü 10 gün önce geçti
const month = iso(now).slice(0, 7);
const prev = (() => { const x = new Date(); x.setDate(1); x.setMonth(x.getMonth() - 1); return x.toISOString().slice(0, 7); })();

test('AVM: mağaza ve sözleşme, döviz kira tahakkuku, ciro bildirimi ve farkı, kira artışı, doluluk', async ({ page }) => {
  await login(page, 'ev@ornek.com');
  await expect(page.getByText('Moda Dairesi').first()).toBeVisible();
  await page.getByRole('link', { name: 'Portföy yönetimi' }).first().click();
  await expect(page).toHaveURL(/\/uygulama\/site/);
  await page.getByRole('button', { name: 'Mağazalar' }).click();
  await page.getByRole('button', { name: 'Birim ekle' }).click();
  await page.getByLabel('Kat / bölüm').fill('Zemin kat');
  await page.getByLabel('Birim no').fill('Z-12');
  await page.getByLabel('m²').fill('200');
  await page.getByLabel('Aylık kira').fill('2000');
  await page.getByRole('checkbox', { name: '$ USD' }).click();
  await page.getByRole('button', { name: 'Birimi ekle' }).click();
  await expect(page.getByText('Birim eklendi.')).toBeVisible();
  await expect(page.getByText('Zemin kat · Z-12')).toBeVisible();
  await page.getByRole('button', { name: 'Sözleşmeyi düzenle' }).click();
  await page.getByLabel('Ciro kirası (%)').fill('8');
  await page.getByLabel('Ödeme günü').fill('5');
  await page.getByLabel('Sözleşme başlangıcı (YYYY-AA-GG)').fill(start);
  await page.getByRole('checkbox', { name: 'Sabit oran' }).click();
  await page.getByLabel('Yıllık artış oranı (%)').fill('25');
  await page.getByRole('checkbox', { name: 'KDV eklenir (%20)' }).click();
  await page.getByRole('button', { name: 'Sözleşmeyi kaydet' }).click();
  await expect(page.getByText(/Kira \$2\.000 · Ciro %8/)).toBeVisible();
  await page.getByRole('button', { name: 'Kiracı ekle' }).click();
  await page.getByLabel('Kiracı firma ya da ad soyad').fill('Moda Giyim A.Ş.');
  await page.getByRole('button', { name: 'Kişiyi ekle' }).click();
  await expect(page.getByText('Moda Giyim A.Ş.')).toBeVisible();
  const code = (await db(page)).tables.site_residents[0].code;

  // Kira tahakkuku: USD kuru girilir; 2.000 × 34 × 1,20 (KDV) = 81.600; vade sözleşmedeki ödeme günü.
  await page.getByRole('button', { name: 'Tahakkuk' }).click();
  await expect(page.getByText('Döviz kirası olan birimler için kuru yaz.')).toBeVisible();
  await page.getByLabel('USD kuru (₺)').fill('34');
  await expect(page.getByText('1 birime toplam ₺81.600')).toBeVisible();
  await page.getByRole('button', { name: 'Tahakkuk et' }).click();
  await expect(page.getByText('1 birime tahakkuk edildi.')).toBeVisible();
  let d = await db(page);
  expect(d.tables.site_charges[0]).toMatchObject({ kind: 'kira', amount: 81600, currency: 'USD', fx: 34, orig_amount: 2000, due_on: month + '-05' });

  // Kiracı: davetle bağlanır, "Mağazam"da kirayı görür, geçen ayın cirosunu bildirir.
  await login(page, 'kiraci@ornek.com');
  await expect(page.getByText('Moda Dairesi').first()).toBeVisible();
  await page.goto(url('/katil?kod=' + code));
  await expect(page).toHaveURL(/\/uygulama\/?$/);
  await page.goto(url('/uygulama/sitem'));
  await expect(page.getByText('Mağazam').first()).toBeVisible();
  await expect(page.getByText('Zemin kat · Z-12')).toBeVisible();
  await expect(page.getByText(/Kira \$2\.000 \/ ay/)).toBeVisible();
  await expect(page.getByText('₺81.600').first()).toBeVisible();
  await page.getByLabel('Ciro (₺, KDV hariç)').fill('1200000');
  await page.getByRole('button', { name: 'Ciroyu bildir' }).click();
  await expect(page.getByText('Ciron yönetime iletildi.')).toBeVisible();

  // Yönetim: ciroyu onaylar → 1.200.000 × %8 = 96.000; sabit kira 2.000 × 34 = 68.000; fark 28.000.
  await login(page, 'ev@ornek.com');
  await expect(page.getByText('Moda Dairesi').first()).toBeVisible();
  await page.goto(url('/uygulama/site'));
  await expect(page.getByText('100%').first()).toBeVisible();          // doluluk: 1 / 1 birim
  await page.getByRole('button', { name: 'Ciro (1)' }).click();
  await page.getByLabel('USD kuru (₺)').fill('34');
  await expect(page.getByText('Ciro farkı: ₺28.000')).toBeVisible();
  await page.getByRole('button', { name: 'Onayla', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Ciro (0)' })).toBeVisible();
  d = await db(page);
  expect(d.tables.site_charges.find(x => x.kind === 'ciro')).toMatchObject({ month: prev, amount: 28000 });
  expect(d.tables.site_turnovers[0].status).toBe('approved');

  // Kira artışı: sabit %25 → 2.500 USD.
  await page.getByRole('button', { name: 'Kira artışları' }).click();
  await expect(page.getByText('Uygulanmadı')).toBeVisible();
  await expect(page.getByLabel('Yeni kira (USD)')).toHaveValue('2500');
  await page.getByRole('button', { name: 'Artışı uygula' }).click();
  await expect(page.getByText('Artış geçmişi')).toBeVisible();
  d = await db(page);
  expect(d.tables.site_units[0].rent).toBe(2500);
  expect(d.tables.site_rent_changes[0]).toMatchObject({ old_amount: 2000, new_amount: 2500, currency: 'USD' });
});
