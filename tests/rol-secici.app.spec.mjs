// Rol seçici: aynı e-posta mülk sahibi + başka mülkte kiracı + site yöneticisi olabilir. Giriş sonrası menünün üstündeki seçici rolleri
// (paket/yer yanında yazılı) listeler; seçim paneli ve menüyü günceller, kalıcıdır; tek rolü olanda seçici görünmez.
import { test, expect } from '@playwright/test';
import { serveDist, seed, PW, ensureDist, ID } from './app-helpers.mjs';
import { watchErrors } from './helpers.mjs';

const DIST = new URL('../app/dist-fake', import.meta.url).pathname;
const PORT = 8248;
const VELI = '00000000-0000-0000-0000-0000000000c9';
const ORG = '20000000-0000-4000-8000-000000000021';
let server, errors;
test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => { test.setTimeout(300_000); await ensureDist(DIST); server = await serveDist(DIST, PORT); });
test.afterAll(() => server && server.close());
test.beforeEach(() => { errors = null; });

/** Ayşe: p1 sahibi (Moda), p2'de kiracı (Veli'nin Bebek Dairesi), Atakum Sitesi yöneticisi. cok=false → yalnız mülk sahibi. */
function veri(cok) {
  const d = seed();
  if (!cok) return d;
  d.users.push({ id: VELI, email: 'veli@ornek.com', password: PW, meta: { name: 'Veli Mülk', role: 'landlord' } });
  d.tables.profiles.push({ id: VELI, role: 'landlord', name: 'Veli Mülk', phone: '', lang: 'tr', settings: {}, created_at: new Date().toISOString() });
  d.tables.properties.push({ ...d.tables.properties[0], id: 'p2', owner_id: VELI, name: 'Bebek Dairesi', addr: 'Bebek' });
  d.tables.property_shared.push({ property_id: 'p2', inspect: { tenantOk: false, landlordOk: false, rooms: [] }, move_out: null, renewal: null });
  d.tables.memberships.push({ property_id: 'p2', user_id: VELI, role: 'landlord', display_name: 'Veli Mülk', phone: '', email: '' },
    { property_id: 'p2', user_id: ID.landlord, role: 'tenant', display_name: 'Ayşe Mülk', phone: '', email: 'ev@ornek.com' });
  d.tables.organizations = [{ id: ORG, name: 'Atakum Sitesi', sector: 'site', modules: ['aidat', 'duyuru', 'rapor'], status: 'active', units: 120, billing: {}, note: '', created_at: new Date().toISOString() }];
  d.tables.org_members = [{ org_id: ORG, user_id: ID.landlord, role_id: null, is_master: true }]; d.tables.org_roles = []; d.tables.org_invites = [];
  return d;
}
async function giris(page, d, email, entry) {
  errors = watchErrors(page);
  await page.addInitScript((x) => { if (!localStorage.getItem('__fakedb')) localStorage.setItem('__fakedb', JSON.stringify(x)); }, d);
  await page.goto(`http://localhost:${PORT}${entry}`);
  await page.getByLabel('E-posta').fill(email);
  await page.getByLabel('Şifre', { exact: true }).fill(PW);
  await page.getByRole('button', { name: 'Giriş yap' }).click();
  await expect(page).toHaveURL(/uygulama/);
}
const secici = (page) => page.getByRole('button', { name: /^Rol seç/ });

test('üç rol listelenir (rolün yanında paket/yer yazar); seçim paneli günceller; seçim yenilemede kalır', async ({ page }) => {
  await giris(page, veri(true), 'ev@ornek.com', '/giris/mulk-sahibi');
  await expect(secici(page)).toBeVisible({ timeout: 15000 });
  await expect(secici(page)).toHaveAccessibleName('Rol seç: Site yöneticisi');          // kurum yöneticisinin varsayılanı (eski davranış)
  await secici(page).click();
  const mulk = page.getByRole('menuitem', { name: /^Mülk sahibi,/ });
  await expect(mulk).toBeVisible();
  await expect(mulk).toHaveAccessibleName(/Deneme · \d+ gün/);                          // paket rolün yanında
  await expect(page.getByRole('menuitem', { name: 'Kiracı, Bebek Dairesi' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Site yöneticisi, Atakum Sitesi' })).toBeVisible();

  // Mülk sahibi: yalnızca kendi mülkü portföyde; kiracı olduğu ev portföyde görünmez.
  await mulk.click();
  await expect(page.getByRole('heading', { name: 'Portföyüm' }).or(page.getByText('Portföyüm')).first()).toBeVisible();
  await expect(page.getByText('Moda Dairesi').first()).toBeVisible();
  await expect(page.getByText('Bebek Dairesi')).toHaveCount(0);
  await expect(secici(page)).toHaveAccessibleName(/^Rol seç: Mülk sahibi/);

  // Kiracı: kiracı paneli, o evin bilgisi.
  await secici(page).click();
  await page.getByRole('menuitem', { name: 'Kiracı, Bebek Dairesi' }).click();
  await expect(page.getByText('Bebek Dairesi').first()).toBeVisible();
  await expect(page.getByRole('link', { name: /Ödemeler/ }).first()).toBeVisible();
  await expect(secici(page)).toHaveAccessibleName(/^Rol seç: Kiracı/);

  // Yenileyince seçim kalır.
  await page.reload();
  await expect(secici(page)).toHaveAccessibleName(/^Rol seç: Kiracı/, { timeout: 15000 });
  expect(errors).toEqual([]);
});

test('tek rolü olan hesapta seçici görünmez (mülk sahibi ve kiracı)', async ({ browser }) => {
  const page = await (await browser.newContext()).newPage();
  await giris(page, veri(false), 'ev@ornek.com', '/giris/mulk-sahibi');
  await expect(page.getByText('Moda Dairesi').first()).toBeVisible({ timeout: 15000 });
  await expect(secici(page)).toHaveCount(0);
  const p2 = await (await browser.newContext()).newPage();
  await giris(p2, veri(false), 'kiraci@ornek.com', '/giris/kiraci');
  await expect(p2.getByText('Moda Dairesi').first()).toBeVisible({ timeout: 15000 });
  await expect(secici(p2)).toHaveCount(0);
});

test('mülk sahibi rolündeyken Site adresi "yönetici değilsin" demez: yönetici rolüne geçiş sunar; aramada B Blok bulunur', async ({ page }) => {
  const d = veri(true);
  const at = new Date().toISOString();
  d.tables.site_units = [
    { id: 'u1', org_id: ORG, block: 'A', no: '1', area: 100, share: 1, aidat: 1500, payer: 'kiraci', created_at: at },
    { id: 'u15', org_id: ORG, block: 'B', no: '15', area: 100, share: 1, aidat: 1500, payer: 'kiraci', created_at: at }];
  d.tables.site_requests = [{ id: 'r1', org_id: ORG, unit_id: 'u15', cat: 'ariza', title: 'Asansör arızalı', body: '', status: 0, reply: '', created_at: at, updated_at: at }];
  await giris(page, d, 'ev@ornek.com', '/giris/mulk-sahibi');
  await expect(secici(page)).toBeVisible({ timeout: 15000 });
  await secici(page).click();
  await page.getByRole('menuitem', { name: /^Mülk sahibi,/ }).click();
  await expect(page.getByText('Moda Dairesi').first()).toBeVisible();

  await page.goto(`http://localhost:${PORT}/uygulama/site`);
  await expect(page.getByText('Bir site yönetiminin yöneticisi değilsin.')).toHaveCount(0);
  await page.getByRole('button', { name: /Site yöneticisi rolüne geç/ }).click();
  await expect(secici(page)).toHaveAccessibleName(/^Rol seç: Site yöneticisi/, { timeout: 15000 });

  await page.getByRole('button', { name: 'Ara', exact: true }).click();
  await page.getByLabel('Daire, kişi, talep ya da duyuru ara').fill('B Blok');
  await expect(page.getByText('B Blok No 15').first()).toBeVisible({ timeout: 15000 });
  await expect(page.getByText('Sonuç yok.')).toHaveCount(0);
  await page.getByLabel('Daire, kişi, talep ya da duyuru ara').fill('asansör');
  await expect(page.getByRole('button', { name: 'Asansör arızalı B Blok No 15' })).toBeVisible();
  expect(errors).toEqual([]);
});
