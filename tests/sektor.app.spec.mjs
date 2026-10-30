// Sektöre özgü kurum panelleri: yönetici girişte doğrudan kurumunun panelinde açılır (kira portföyü araya girmez);
// menü sektörün dilinde ve açık modüllere göre; Özet'te site için aidat, AVM / depo / GYO için kira tahakkuku ve tahsilatı;
// kurulum sihirbazı birimleri blok/kat düzenine göre oluşturur (katlarda farklı sayılar dahil); m² zorunlu.
import { test, expect } from '@playwright/test';
import { serveDist, seed, PW, ensureDist, ID } from './app-helpers.mjs';
import { watchErrors } from './helpers.mjs';

const DIST = new URL('../app/dist-fake', import.meta.url).pathname;
const PORT = 8238;
let server;
let errors;

test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => { test.setTimeout(300_000); await ensureDist(DIST); server = await serveDist(DIST, PORT); });
test.afterAll(() => server && server.close());
test.beforeEach(({ page }) => { errors = watchErrors(page); });
test.afterEach(() => { expect(errors).toEqual([]); });

const url = (p) => `http://localhost:${PORT}${p}`;
const db = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('__fakedb')));
const nav = (page, name) => page.getByRole('link', { name, exact: true }).first();
const month = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(new Date()).slice(0, 7);

function withOrg(sector, modules, extra = {}) {
  const d = seed();
  const now = new Date().toISOString();
  d.tables.organizations = [{ id: 'o1', name: { site: 'Dalyan Sitesi', avm: 'Kordon AVM', depo: 'Gebze Lojistik', gyo: 'Marmara GYO' }[sector], sector, modules, status: 'active', units: extra.units ?? null, created_at: now }];
  d.tables.org_roles = [];
  d.tables.org_members = [{ org_id: 'o1', user_id: ID.landlord, role_id: null, is_master: true, created_at: now }];
  Object.assign(d.tables, extra.tables || {});
  return d;
}
async function login(page, data) {
  await page.addInitScript((x) => { if (!localStorage.getItem('__fakedb')) localStorage.setItem('__fakedb', JSON.stringify(x)); }, data);
  await page.goto(url('/giris/mulk-sahibi'));
  await page.getByLabel('E-posta').fill('ev@ornek.com');
  await page.getByLabel('Şifre', { exact: true }).fill(PW);
  await page.getByRole('button', { name: 'Giriş yap' }).click();
}

test('site: girişte kurum paneli; aidat dilinde menü; sihirbazla daireler (m² zorunlu); Mülklerim kendi mülküne gider', async ({ page }) => {
  await login(page, withOrg('site', ['aidat', 'gider_dagitim', 'duyuru', 'rapor'], { units: 6 }));
  await expect(page).toHaveURL(/\/uygulama\/site$/);
  for (const n of ['Özet', 'Daireler', 'Aidat ve tahakkuk', 'Giderler', 'İşletme projesi', 'Duyurular', 'Talepler', 'Rapor', 'Mülklerim', 'Kurum']) await expect(nav(page, n)).toBeVisible();
  await expect(nav(page, 'Kira ve tahakkuk')).toHaveCount(0);
  await expect(page.getByText('Sözleşmende 6 daire var, oluşturalım.').first()).toBeVisible();

  await page.getByRole('button', { name: 'Kuruluma başla' }).click();
  await expect(page).toHaveURL(/\/uygulama\/site\/birimler$/);
  await page.getByLabel('Blok', { exact: true }).fill('A');
  await page.getByLabel('Katlardaki sayılar (isteğe bağlı)').fill('2,2,1');
  await page.getByRole('button', { name: 'Blok ekle' }).click();
  await page.getByLabel('Blok', { exact: true }).last().fill('B');
  await page.getByLabel('Kat sayısı').last().fill('1');
  await page.getByLabel('Katta daire').last().fill('1');
  await expect(page.getByText('Önizleme · 6 daire')).toBeVisible();
  await expect(page.getByRole('button', { name: '6 daire oluştur' })).toBeDisabled();       // m² girilmeden oluşturulamaz
  await page.getByLabel('Varsayılan m² (zorunlu)').fill('95');
  await page.getByLabel('Varsayılan aylık aidat (isteğe bağlı)').fill('1500');
  await page.getByRole('button', { name: '6 daire oluştur' }).click();
  await expect.poll(async () => ((await db(page)).tables.site_units || []).length).toBe(6);
  const units = (await db(page)).tables.site_units;
  expect(units.map((u) => u.block + u.no).sort()).toEqual(['A1', 'A2', 'A3', 'A4', 'A5', 'B1']);
  expect(units.every((u) => u.area === 95 && u.aidat === 1500)).toBe(true);
  await expect(page.getByText('A Blok No 5')).toBeVisible();

  await nav(page, 'Özet').click();
  await expect(page.getByText(new RegExp('aidatı$', 'i')).first()).toBeVisible();
  await nav(page, 'Mülklerim').click();
  await expect(page).toHaveURL(/\/uygulama\?mulk=1$/);
  await expect(page.getByText('Moda Dairesi').first()).toBeVisible();
});

test('site: kapalı modülün bölümü menüde yok (duyuru ve gider dağıtımı kapalı)', async ({ page }) => {
  await login(page, withOrg('site', ['aidat', 'rapor']));
  await expect(page).toHaveURL(/\/uygulama\/site$/);
  await expect(nav(page, 'Daireler')).toBeVisible();
  await expect(nav(page, 'Duyurular')).toHaveCount(0);
  await expect(nav(page, 'İşletme projesi')).toHaveCount(0);
});

test('AVM: kira tahakkuku ve tahsilatı en üstte; ciro ve kira artışları modüllere bağlı; geciken kira listesi', async ({ page }) => {
  const now = new Date().toISOString();
  const tables = {
    site_units: [
      { id: 'u1', org_id: 'o1', block: 'Zemin kat', no: 'Z-12', area: 200, rent: 2000, currency: 'USD', turnover_rate: 8, payer: 'kiraci', index_kind: 'tufe', created_at: now },
      { id: 'u2', org_id: 'o1', block: 'Zemin kat', no: 'Z-13', area: 100, rent: 50000, currency: 'TRY', payer: 'kiraci', index_kind: 'tufe', created_at: now }
    ],
    site_residents: [{ id: 'r1', org_id: 'o1', unit_id: 'u1', user_id: null, role: 'kiraci', name: 'Moda Giyim', phone: '', email: '', lives_here: true, code: 'S0000001', created_at: now }],
    site_charges: [
      { id: 'c1', org_id: 'o1', unit_id: 'u1', month, kind: 'kira', title: '', amount: 68000, currency: 'USD', fx: 34, orig_amount: 2000, status: 'open', paid_amount: 0, method: 'dekont', due_on: '2020-01-05', created_at: now },
      { id: 'c2', org_id: 'o1', unit_id: 'u2', month, kind: 'kira', title: '', amount: 50000, currency: 'TRY', status: 'paid', paid_amount: 50000, method: 'dekont', created_at: now }
    ]
  };
  await login(page, withOrg('avm', ['kira', 'ortak_gider', 'endeksleme', 'doluluk', 'rapor'], { tables }));
  await expect(page).toHaveURL(/\/uygulama\/site$/);
  await expect(page.getByText(/kira tahakkuku$/i).first()).toBeVisible();
  await expect(page.getByText('₺118.000').first()).toBeVisible();              // 68.000 + 50.000
  await expect(page.getByText('₺50.000').first()).toBeVisible();               // tahsil edilen
  await expect(page.getByText('Geciken kiralar')).toBeVisible();
  await expect(page.getByText(/\$2\.000/).first()).toBeVisible();               // dövizli sözleşmenin asıl tutarı
  await expect(page.getByText('Doluluk haritası')).toBeVisible();
  for (const n of ['Mağazalar', 'Kira ve tahakkuk', 'Kira artışları']) await expect(nav(page, n)).toBeVisible();
  await expect(nav(page, 'Ciro')).toHaveCount(0);                                 // ciro modülü kapalı
  await expect(nav(page, 'Aidat ve tahakkuk')).toHaveCount(0);
});

test('GYO: varlıklara göre kırılım, yol planı kutusu ve "Varlık / bina" alanı; m² olmadan birim eklenmez', async ({ page }) => {
  const now = new Date().toISOString();
  const soon = new Date(Date.now() + 40 * 864e5).toISOString().slice(0, 10);
  const tables = {
    site_units: [
      { id: 'u1', org_id: 'o1', block: 'Levent Ofis', no: 'K12', area: 300, rent: 90000, currency: 'TRY', payer: 'kiraci', index_kind: 'tufe', lease_end: soon, created_at: now },
      { id: 'u2', org_id: 'o1', block: 'Tuzla Lojistik', no: 'D-3', area: 2000, rent: 150000, currency: 'TRY', payer: 'kiraci', index_kind: 'tufe', created_at: now }
    ],
    site_residents: [{ id: 'r1', org_id: 'o1', unit_id: 'u1', user_id: null, role: 'kiraci', name: 'Delta', phone: '', email: '', lives_here: true, code: 'S0000002', created_at: now }],
    site_charges: [{ id: 'c1', org_id: 'o1', unit_id: 'u1', month, kind: 'kira', title: '', amount: 90000, currency: 'TRY', status: 'open', paid_amount: 0, method: 'dekont', created_at: now }]
  };
  await login(page, withOrg('gyo', ['kira', 'ortak_gider', 'endeksleme', 'doluluk', 'duyuru', 'rapor'], { tables }));
  await expect(page).toHaveURL(/\/uygulama\/site$/);
  await expect(page.getByText('Varlıklara göre')).toBeVisible();
  await expect(page.getByText('Levent Ofis').first()).toBeVisible();
  await expect(page.getByText(/Yol planında: onay akışı/)).toBeVisible();
  await nav(page, 'Birimler').click();
  await page.getByRole('button', { name: 'Birim ekle' }).click();
  await expect(page.getByLabel('Varlık / bina')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Birimi ekle' })).toBeDisabled();    // m² ve no girilmeden eklenmez
});

test('kurumu olmayan mülk sahibi: mülk eklerken m² zorunlu', async ({ page }) => {
  await page.addInitScript((x) => { if (!localStorage.getItem('__fakedb')) localStorage.setItem('__fakedb', JSON.stringify(x)); }, seed());
  await page.goto(url('/giris/mulk-sahibi'));
  await page.getByLabel('E-posta').fill('ev@ornek.com');
  await page.getByLabel('Şifre', { exact: true }).fill(PW);
  await page.getByRole('button', { name: 'Giriş yap' }).click();
  await expect(page.getByText('Moda Dairesi').first()).toBeVisible();          // kurumu yok: kira portföyü açılır
  await page.goto(url('/uygulama?s=ev-ekle'));
  await page.getByRole('button', { name: /Mülk ekle/ }).first().click().catch(() => {});
  await page.getByLabel('Mülk adı').fill('Kadıköy 2+1');
  await page.getByRole('button', { name: 'Kaydet ve davet et' }).click();
  await expect(page.getByText('Alanı (m²) yaz.')).toBeVisible();
});
