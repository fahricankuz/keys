// Yönetici paneli: Genel bakışta kira ve aidat hacmi (bireysel + kurum); Büyüme, Gelir, Gider sayfaları; gider ekle, düzenle, sil;
// dövizli gider o günün kuruyla TL; Gelir'de net (gelir − gider); her işlem İşlem kaydı'nda.
import { test, expect } from '@playwright/test';
import { serveDist, seed, PW, ensureDist } from './app-helpers.mjs';
import { watchErrors } from './helpers.mjs';

const DIST = new URL('../app/dist-fake', import.meta.url).pathname;
const PORT = 8259;
let server, errors;
test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => { test.setTimeout(300_000); await ensureDist(DIST); server = await serveDist(DIST, PORT); });
test.afterAll(() => server && server.close());
const month = new Date().toISOString().slice(0, 7);
test.beforeEach(async ({ page }) => {
  errors = watchErrors(page);
  const d = seed();
  const at = new Date().toISOString();
  d.tables.organizations = [{ id: 'o1', name: 'Kordon AVM', sector: 'avm', modules: ['kira'], status: 'active', units: 40, created_at: at }];
  d.tables.site_units = [{ id: 'u1', org_id: 'o1', block: '', no: 'Z-1', area: 100, payer: 'kiraci', created_at: at }];
  d.tables.site_charges = [
    { id: 'c1', org_id: 'o1', unit_id: 'u1', month, kind: 'kira', title: '', amount: 80000, status: 'paid', paid_amount: 80000, created_at: at },
    { id: 'c2', org_id: 'o1', unit_id: 'u1', month, kind: 'aidat', title: '', amount: 1500, status: 'paid', paid_amount: 1500, created_at: at }
  ];
  d.tables.fx_rates = [];
  for (let i = 0; i < 70; i++) { const day = new Date(Date.now() - i * 864e5).toISOString().slice(0, 10); d.tables.fx_rates.push({ day, currency: 'USD', sell: 42 }); }
  await page.addInitScript((x) => { if (!localStorage.getItem('__fakedb')) localStorage.setItem('__fakedb', JSON.stringify(x)); }, d);
});
test.afterEach(() => { expect(errors).toEqual([]); });
const url = (p) => `http://localhost:${PORT}${p}`;
async function admin(page) {
  await page.goto(url('/giris/yonetici'));
  await page.getByLabel('E-posta').fill('admin@ornek.com');
  await page.getByLabel('Şifre', { exact: true }).fill(PW);
  await page.getByRole('button', { name: 'Giriş yap' }).click();
  await expect(page.getByText('Bu ay onaylı kira hacmi')).toBeVisible();
}

test('genel bakış: kira hacmine kurum kiraları, aidat hacmi ayrı; Büyüme ve Gelir sayfaları', async ({ page }) => {
  await admin(page);
  await expect(page.getByText('Bu ay onaylı aidat hacmi')).toBeVisible();
  await expect(page.getByText(/kurumlar ₺80\.000/)).toBeVisible();
  await expect(page.getByText(/siteler ₺1\.500/)).toBeVisible();
  await page.getByRole('button', { name: 'Büyüme' }).first().click();
  await expect(page.getByText('Sektörlere göre kurumlar')).toBeVisible();
  await expect(page.getByText('AVM').first()).toBeVisible();
  await page.getByRole('button', { name: 'Gelir' }).first().click();
  await expect(page.getByText('Gelir, gider ve net')).toBeVisible();
  await expect(page.getByText('Kordon AVM')).toBeVisible();
});

test('gider: dolar gider o günün kuruyla TL, düzenle ve sil; Gelir’de net; işlem kaydı', async ({ page }) => {
  await admin(page);
  await page.getByRole('button', { name: 'Gider' }).first().click();
  await page.getByRole('button', { name: 'Gider ekle' }).first().click();
  await page.getByLabel('Başlık').fill('Supabase Pro');
  await page.getByLabel('Tutar').fill('25');
  await page.getByRole('button', { name: '$', exact: true }).click();
  await page.getByRole('button', { name: 'KDV hariç' }).click();
  await page.getByLabel('Başlangıç (YYYY-AA-GG)').fill(month + '-01');
  await page.getByRole('button', { name: 'Gideri ekle' }).click();
  await expect(page.getByText('Gider kaydedildi.')).toBeVisible();
  await expect(page.getByText('₺1.260').first()).toBeVisible();                    // 25 × 42 × 1,20
  await page.getByRole('button', { name: 'Düzenle' }).first().click();
  await page.getByLabel('Tutar').fill('50');
  await page.getByRole('button', { name: 'Kaydet' }).click();
  await expect(page.getByText('₺2.520').first()).toBeVisible();
  await page.getByRole('button', { name: 'Gelir' }).first().click();
  await expect(page.getByText('Gelir, gider ve net')).toBeVisible();
  await expect(page.getByText('₺2.520').first()).toBeVisible();                     // dönemin gideri
  await page.getByRole('button', { name: 'Gider' }).first().click();
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Sil' }).first().click();
  await expect(page.getByText('Gider silindi.')).toBeVisible();
  const t = await page.evaluate(() => JSON.parse(localStorage.getItem('__fakedb')).tables);
  expect(t.admin_costs).toEqual([]);
  expect(t.admin_audit.filter((a) => a.action.startsWith('cost.')).map((a) => a.action)).toEqual(['cost.create', 'cost.update', 'cost.delete']);
});

test('genel bakış grafiği: tek eksende gelir, gider ve net; ayın üzerine gelince ayrıntı; tablo görünümü; yeni kayıt grafiği ayrı', async ({ page }) => {
  await page.addInitScript((m) => {
    const d = JSON.parse(localStorage.getItem('__fakedb'));
    if (!d.tables.admin_costs?.length) {
      d.tables.admin_costs = [{ id: 'k1', title: 'Sunucu', category: 'altyapi', amount: 5000, currency: 'TRY', vat_included: true, vat_rate: 20, recurrence: 'once', start_on: m + '-02', end_on: null, note: '', created_at: m + '-02T10:00:00Z' }];
      localStorage.setItem('__fakedb', JSON.stringify(d));
    }
  }, month);
  await admin(page);
  const y = new Date().getFullYear();
  await expect(page.getByText(`${y} aylık gelir, gider ve net`)).toBeVisible();
  await expect(page.getByText(`${y} aylık yeni kayıt`)).toBeVisible();
  await expect(page.getByText(/^Yıl toplamı: gelir .* · gider ₺5\.000 · net /)).toBeVisible();
  const ay = new Intl.DateTimeFormat('tr-TR', { month: 'long', year: 'numeric' }).format(new Date());
  const label = ay.charAt(0).toLocaleUpperCase('tr') + ay.slice(1);
  await page.getByRole('button', { name: label, exact: true }).first().hover();
  await expect(page.getByText(label, { exact: true }).first()).toBeVisible();          // ayrıntı kutusu: ay adı, gelir, gider, net
  await page.getByRole('button', { name: 'Tablo', exact: true }).first().click();
  await expect(page.getByText('Ay', { exact: true })).toBeVisible();
  await expect(page.getByText('₺5.000', { exact: true }).first()).toBeVisible();
});
