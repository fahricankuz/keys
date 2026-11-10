// Tek kayıt ekranı ve hesap içinden rol ekleme: kiracı ve site sakini hesabı yalnız geçerli davet koduyla açılır; kiracı hesabı
// "Rol ekle"den mülk sahibi özelliğini ekler (kiracılığı kalır, kendi mülkünü ekleyebilir); site sakini hesabı kodla başka yere bağlanır.
import { test, expect } from '@playwright/test';
import { serveDist, seed, PW, ensureDist, ID } from './app-helpers.mjs';
import { watchErrors } from './helpers.mjs';

const DIST = new URL('../app/dist-fake', import.meta.url).pathname;
const PORT = 8274;
const ORG = '20000000-0000-4000-8000-000000000031';
const url = (p) => `http://localhost:${PORT}${p}`;
let server, errors;
test.describe.configure({ mode: 'serial', timeout: 90_000 });
test.beforeAll(async () => { test.setTimeout(300_000); await ensureDist(DIST); server = await serveDist(DIST, PORT); });
test.afterAll(() => server && server.close());

/** Mülk sahibinin açık bir kiracı daveti (KIRACI01), kullanılmış bir daveti (ESKI0001) ve bir sitede kullanılmamış daire kodu (S1234567). */
function veri() {
  const d = seed();
  const at = new Date().toISOString(), later = new Date(Date.now() + 7 * 864e5).toISOString();
  d.tables.invites = [
    { code: 'KIRACI01', property_id: 'p1', created_by: ID.landlord, role: 'tenant', name: '', phone: '', email: '', created_at: at, expires_at: later, accepted_by: null },
    { code: 'ESKI0001', property_id: 'p1', created_by: ID.landlord, role: 'tenant', name: '', phone: '', email: '', created_at: at, expires_at: later, accepted_by: ID.tenant }];
  d.tables.organizations = [{ id: ORG, name: 'Atakum Sitesi', sector: 'site', modules: ['aidat', 'duyuru'], status: 'active', units: 50, billing: {}, note: '', created_at: at }];
  d.tables.org_members = []; d.tables.org_roles = []; d.tables.org_invites = [];
  d.tables.site_units = [{ id: 'u1', org_id: ORG, block: 'A', no: '1', area: 100, share: 1, aidat: 1500, payer: 'kiraci', created_at: at }];
  d.tables.site_residents = [{ id: 'r1', org_id: ORG, unit_id: 'u1', user_id: null, role: 'malik', name: 'Selin Sakin', phone: '', email: '', code: 'S1234567', lives_here: true, created_at: at }];
  return d;
}
async function ac(page, path) {
  errors = watchErrors(page);
  await page.addInitScript((x) => { if (!localStorage.getItem('__fakedb')) localStorage.setItem('__fakedb', JSON.stringify(x)); }, veri());
  await page.goto(url(path));
}
const db = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('__fakedb')));
async function doldur(page, { ad, eposta, kod }) {
  await page.getByLabel('Ad soyad').fill(ad);
  await page.getByLabel('E-posta').fill(eposta);
  await page.getByLabel('Şifre', { exact: true }).fill(PW);
  await page.getByLabel('Şifre (tekrar)').fill(PW);
  if (kod !== undefined) await page.getByLabel('Davet kodu').fill(kod);
  const onay = page.getByRole('checkbox');
  if ((await onay.getAttribute('aria-checked')) !== 'true') await onay.click({ position: { x: 10, y: 10 } });
  await page.getByRole('button', { name: 'Hesap oluştur' }).click();
}

test('kiracı kaydı: kodsuz ve geçersiz kodla hesap açılmaz; geçerli kodla açılır ve mülke bağlanır', async ({ page }) => {
  await ac(page, '/kayit');
  await page.getByRole('link', { name: 'Kiracıyım', exact: true }).click();
  await expect(page).toHaveURL(/\/kayit\/kiraci$/);
  await doldur(page, { ad: 'Deniz Kiracı', eposta: 'deniz@ornek.com' });
  await expect(page.getByText('Davet kodunu gir. Kodu mülk sahibin ya da site yönetimin verir.')).toBeVisible();
  await doldur(page, { ad: 'Deniz Kiracı', eposta: 'deniz@ornek.com', kod: 'YOKYOK12' });
  await expect(page.getByText(/Bu davet kodu geçerli değil/)).toBeVisible();
  await doldur(page, { ad: 'Deniz Kiracı', eposta: 'deniz@ornek.com', kod: 'ESKI0001' });                 // kullanılmış kod
  await expect(page.getByText(/Bu davet kodu geçerli değil/)).toBeVisible();
  expect((await db(page)).users.filter((u) => u.email === 'deniz@ornek.com')).toHaveLength(0);
  await expect(page).toHaveURL(/\/kayit\/kiraci$/);

  await doldur(page, { ad: 'Deniz Kiracı', eposta: 'deniz@ornek.com', kod: 'kiraci01' });
  await expect(page).toHaveURL(/\/uygulama/, { timeout: 20000 });
  await expect(page.getByText('Moda Dairesi').first()).toBeVisible({ timeout: 20000 });
  const d = await db(page);
  expect(d.users.find((u) => u.email === 'deniz@ornek.com').meta.invite).toBe('KIRACI01');
  expect(d.tables.memberships.filter((m) => m.display_name === 'Deniz Kiracı' && m.role === 'tenant')).toHaveLength(1);
  expect(errors).toEqual([]);
});

test('kiracı kaydı: silinmiş (artık var olmayan) kodla hesap açılmaz', async ({ page }) => {
  await ac(page, '/kayit/kiraci');
  await expect(page.getByLabel('Ad soyad')).toBeVisible();
  const n = (await db(page)).users.length;
  await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('__fakedb')); d.tables.invites = []; d.tables.site_residents = []; localStorage.setItem('__fakedb', JSON.stringify(d)); });
  await doldur(page, { ad: 'Kodsuz', eposta: 'kodsuz@ornek.com', kod: 'KIRACI01' });                       // kod artık yok
  await expect(page.getByText(/Bu davet kodu geçerli değil|Hesap oluşturulamadı/)).toBeVisible();
  expect((await db(page)).users.length).toBe(n);
});

test('site sakini kaydı: site kodu ister; kodla açılan hesap sitesine bağlanır', async ({ page }) => {
  await ac(page, '/kayit');
  await page.getByRole('link', { name: 'Sitede oturuyorum', exact: true }).click();
  await expect(page).toHaveURL(/\/kayit\/site-sakini$/);
  await expect(page.getByText('Site sakini olarak kayıt ol').first()).toBeVisible();
  await doldur(page, { ad: 'Selin Sakin', eposta: 'selin@ornek.com' });
  await expect(page.getByText('Davet kodunu gir. Kodu site yönetimin verir.')).toBeVisible();
  await doldur(page, { ad: 'Selin Sakin', eposta: 'selin@ornek.com', kod: 'S1234567' });
  await expect(page).toHaveURL(/\/uygulama/, { timeout: 20000 });
  await expect(page.getByText('Atakum Sitesi').first()).toBeVisible({ timeout: 20000 });
  await expect.poll(async () => (await db(page)).tables.site_residents[0].user_id).toBeTruthy();
  expect(errors).toEqual([]);
});

test('kayıt ekranı: site/portföy yöneticisi kurumsal başvuruya, ekip kendi kaydına gider', async ({ page }) => {
  await ac(page, '/kayit');
  await page.getByRole('link', { name: 'Site ya da portföy yönetiyorum', exact: true }).click();
  await expect(page).toHaveURL(/\/kurumsal/);
  await page.goto(url('/kayit'));
  await page.getByRole('link', { name: 'Emlakçı, muhasebeci ya da personelim', exact: true }).click();
  await expect(page).toHaveURL(/\/kayit\/ekip$/);
});

test('rol ekle: kiracı hesabı mülk sahibi özelliğini ekler; kiracılığı kalır, rol seçici çıkar, mülk ekleyebilir', async ({ page }) => {
  await ac(page, '/giris');
  await page.getByLabel('E-posta').fill('kiraci@ornek.com');
  await page.getByLabel('Şifre', { exact: true }).fill(PW);
  await page.getByRole('button', { name: 'Giriş yap' }).click();
  await expect(page).toHaveURL(/\/uygulama/, { timeout: 20000 });                                           // tek rol: seçim ekranı yok
  await expect(page.getByText('Moda Dairesi').first()).toBeVisible({ timeout: 20000 });
  await expect(page.getByRole('button', { name: /^Rol seç/ })).toHaveCount(0);

  await page.goto(url('/uygulama/ayarlar'));
  await page.getByRole('button', { name: 'Rol ekle' }).click();
  await expect(page.getByText('Kendi mülkünü ekle ve yönet')).toBeVisible();
  await page.getByRole('button', { name: 'Mülk sahibi özelliğini ekle' }).click();
  await expect(page.getByRole('button', { name: /^Rol seç: Mülk sahibi/ })).toBeVisible({ timeout: 20000 });
  const d = await db(page);
  const me = d.tables.profiles.find((p) => p.id === ID.tenant);
  expect(me.role).toBe('landlord');
  expect(me.landlord_since).toBeTruthy();
  expect(d.tables.memberships.some((m) => m.user_id === ID.tenant && m.property_id === 'p1' && m.role === 'tenant')).toBe(true);
  // Kiracı rolü duruyor: seçiciden geçilir.
  await page.getByRole('button', { name: /^Rol seç/ }).click();
  await page.getByRole('menuitem', { name: 'Kiracı, Moda Dairesi' }).click();
  await expect(page.getByRole('button', { name: /^Rol seç: Kiracı/ })).toBeVisible();
  await expect(page.getByText('Moda Dairesi').first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('rol ekle: mülk sahibi hesabı site kodunu girerek sitesine sakin olarak bağlanır; mülk sahibi özelliği yeniden sunulmaz', async ({ page }) => {
  await ac(page, '/giris');
  await page.getByLabel('E-posta').fill('ev@ornek.com');
  await page.getByLabel('Şifre', { exact: true }).fill(PW);
  await page.getByRole('button', { name: 'Giriş yap' }).click();
  await expect(page.getByText('Moda Dairesi').first()).toBeVisible({ timeout: 20000 });
  await page.goto(url('/uygulama/ayarlar'));
  await page.getByRole('button', { name: 'Rol ekle' }).click();
  await expect(page.getByText('Davet kodum var')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Mülk sahibi özelliğini ekle' })).toHaveCount(0);
  await page.getByLabel('Davet kodu').fill('YOKYOK12');
  await page.getByRole('button', { name: 'Kodla bağlan' }).click();
  await expect(page.getByText(/Davet kodu bulunamadı/)).toBeVisible();
  await page.getByLabel('Davet kodu').fill('s1234567');
  await page.getByRole('button', { name: 'Kodla bağlan' }).click();
  await expect(page.getByText(/Bağlandın\./)).toBeVisible();
  expect((await db(page)).tables.site_residents[0].user_id).toBe(ID.landlord);
  expect(errors).toEqual([]);
});
