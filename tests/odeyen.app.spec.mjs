// Ödeyen kuralı ve rol etiketi: evde kiracı yokken malik "Dekont yükle"yi görür ve açıklama yazar; yönetimin daire listesinde
// uyarı; yalnız siteye bağlı kişinin etiketi dairedeki rolünden; bildirim ayarları role göre gruplu.
import { test, expect } from '@playwright/test';
import { serveDist, seed, PW, ensureDist, ID } from './app-helpers.mjs';
import { watchErrors } from './helpers.mjs';

const DIST = new URL('../app/dist-fake', import.meta.url).pathname;
const PORT = 8256;
let server, errors;

test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => { test.setTimeout(300_000); await ensureDist(DIST); server = await serveDist(DIST, PORT); });
test.afterAll(() => server && server.close());
test.beforeEach(({ page }) => { errors = watchErrors(page); });
test.afterEach(() => { expect(errors).toEqual([]); });

const url = (p) => `http://localhost:${PORT}${p}`;
const ENTRY = { 'kiraci@ornek.com': '/giris/kiraci', 'ev@ornek.com': '/giris/mulk-sahibi' };

/** Site: A1'de yalnız malik (kiraci@ hesabı, mülkü yok) oturuyor, "aidatı kiracı öder" seçili; A2'de malik ve kiracı kayıtlı ama hesapsız. */
function data() {
  const d = seed();
  const at = new Date().toISOString(), m = at.slice(0, 7);
  d.tables.organizations = [{ id: 'o1', name: 'Atakum Sitesi', sector: 'site', modules: ['aidat', 'duyuru', 'rapor'], status: 'active', units: null, created_at: at }];
  d.tables.org_roles = [];
  d.tables.org_members = [{ org_id: 'o1', user_id: ID.landlord, role_id: null, is_master: true, created_at: at }];
  d.tables.memberships = d.tables.memberships.filter((x) => x.user_id !== ID.tenant);
  d.tables.site_units = [
    { id: 'u1', org_id: 'o1', block: 'A', no: '1', area: 100, share: 1, aidat: 1500, payer: 'kiraci', created_at: at },
    { id: 'u2', org_id: 'o1', block: 'A', no: '2', area: 100, share: 1, aidat: 1500, payer: 'kiraci', created_at: at }
  ];
  d.tables.site_residents = [
    { id: 'r1', org_id: 'o1', unit_id: 'u1', user_id: ID.tenant, role: 'malik', name: 'Ayşe Malik', code: 'S1111111', created_at: at },
    { id: 'r2', org_id: 'o1', unit_id: 'u2', user_id: null, role: 'kiraci', name: 'Veli Kiracı', code: 'S2222222', created_at: at }
  ];
  d.tables.site_charges = [{ id: 'c1', org_id: 'o1', unit_id: 'u1', month: m, kind: 'aidat', title: '', amount: 1500, status: 'open', paid_amount: 0, created_at: at }];
  return d;
}
/** Ayarlar → Bildirimler sekmesi (sayfa hazır olana kadar yeniden dener). */
async function openNotifTab(page) {
  await expect(async () => {
    await page.getByRole('button', { name: 'Bildirimler', exact: true }).first().click();
    await expect(page.getByText('Hangi durumlarda haber almak istediğini seç.')).toBeVisible({ timeout: 1500 });
  }).toPass({ timeout: 15000 });
}
async function login(page, email) {
  await page.addInitScript((x) => { if (!localStorage.getItem('__fakedb')) localStorage.setItem('__fakedb', JSON.stringify(x)); }, data());
  await page.goto(url(ENTRY[email]));
  await page.getByLabel('E-posta').fill(email);
  await page.getByLabel('Şifre', { exact: true }).fill(PW);
  await page.getByRole('button', { name: 'Giriş yap' }).click();
}

test('kiracısı olmayan dairede malik dekont yükler; açıklama ve etiket "Malik · A Blok No 1"; bildirim ayarlarında yalnız site aidatı', async ({ page }) => {
  await login(page, 'kiraci@ornek.com');
  await page.goto(url('/uygulama/odemeler'));
  await expect(page.getByText(/Kiracı olmadığı için aidatı malik öder/).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Dekont yükle' }).first()).toBeVisible();
  await expect(page.getByText('Malik · A Blok No 1').first()).toBeVisible();          // hesap kartı: "Kiracı" değil
  await page.goto(url('/uygulama/ayarlar'));
  await openNotifTab(page);
  await expect(page.getByText('Site aidatı hatırlatmaları')).toBeVisible();
  await expect(page.getByText('Kira günü yaklaşırken')).toHaveCount(0);               // mülkü yok: kira grubu yok
  await expect(page.getByText('Dekont geldiğinde')).toHaveCount(0);                    // yönetici değil
});

test('yönetim: daire listesinde "kiracı yok / katılmadı" uyarısı; bildirimlerde site yönetimi grubu', async ({ page }) => {
  await login(page, 'ev@ornek.com');
  await expect(page).toHaveURL(/\/uygulama\/site$/);
  await page.getByRole('link', { name: 'Daireler', exact: true }).first().click();
  await expect(page.getByText('Kiracı yok · malik öder')).toBeVisible();              // A1: kiracı kaydı yok, malik bağlı
  await expect(page.getByText('Kiracı katılmadı · malik öder')).toHaveCount(0);        // A2: kimsenin hesabı yok → kural değişmez
  await page.goto(url('/uygulama/ayarlar'));
  await openNotifTab(page);
  for (const x of ['Kira günü yaklaşırken', 'Dekont geldiğinde', 'Yeni talep açıldığında', 'Aidatı geciken daireler (haftalık özet)']) await expect(page.getByText(x)).toBeVisible();
  await page.getByText('Dekont geldiğinde').click();
  await expect.poll(async () => page.evaluate(() => JSON.parse(localStorage.getItem('__fakedb')).tables.profiles.find((p) => p.settings && 'siteReceipt' in p.settings)?.settings.siteReceipt), { timeout: 8000 }).toBe(false);
});

test('mülkü olmayan site yöneticisi: bildirimlerde Kira ve portföy rapor e-postası yok, Site yönetimi var', async ({ page }) => {
  await page.addInitScript(([L]) => {
    const d = JSON.parse(localStorage.getItem('__fakedb') || 'null');
    if (!d || d.__noProps) return;
    const own = d.tables.properties.filter((p) => p.owner_id === L).map((p) => p.id);
    d.tables.properties = d.tables.properties.filter((p) => !own.includes(p.id));
    d.tables.memberships = d.tables.memberships.filter((m) => !own.includes(m.property_id));
    d.__noProps = true;
    localStorage.setItem('__fakedb', JSON.stringify(d));
  }, [ID.landlord]);
  await login(page, 'ev@ornek.com');
  await expect(page).toHaveURL(/\/uygulama\/site$/);
  await page.goto(url('/uygulama/ayarlar'));
  await openNotifTab(page);
  await expect(page.getByText('Dekont geldiğinde')).toBeVisible();
  await expect(page.getByText('Kira günü yaklaşırken')).toHaveCount(0);
  await expect(page.getByText('Rapor e-postası', { exact: true })).toHaveCount(0);
});
