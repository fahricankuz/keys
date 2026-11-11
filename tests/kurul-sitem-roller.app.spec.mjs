// Genel kurul katılımı her sakine (kiracı da bildirir); telefonda "Sitem" alt çubukta Rapor'un önünde; Hesaplar'da çoklu rol rozetleri.
import { test, expect } from '@playwright/test';
import { serveDist, seed, PW, ensureDist, ID, pickRole } from './app-helpers.mjs';
import { watchErrors } from './helpers.mjs';

const DIST = new URL('../app/dist-fake', import.meta.url).pathname;
const PORT = 8291;
let server, errors;
test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => { test.setTimeout(300_000); await ensureDist(DIST); server = await serveDist(DIST, PORT); });
test.afterAll(() => server && server.close());
const url = (p) => `http://localhost:${PORT}${p}`;
const at = new Date().toISOString();

test.beforeEach(async ({ page }) => {
  errors = watchErrors(page);
  const d = seed();
  d.tables.organizations = [{ id: 'o1', name: 'Fişekhane Sitesi', sector: 'site', modules: ['aidat', 'duyuru'], status: 'active', units: null, created_at: at }];
  d.tables.org_roles = []; d.tables.org_members = [];
  d.tables.site_units = [{ id: 'u1', org_id: 'o1', block: 'A', no: '1', share: 2, created_at: at }, { id: 'u2', org_id: 'o1', block: 'A', no: '2', share: 2, created_at: at }];
  d.tables.site_residents = [
    { id: 'r1', org_id: 'o1', unit_id: 'u1', user_id: ID.landlord, role: 'malik', name: 'Ayşe Mülk', phone: '', email: '', code: 'S0000001', created_at: at },
    { id: 'r2', org_id: 'o1', unit_id: 'u2', user_id: ID.tenant, role: 'kiraci', name: 'Mehmet Kiracı', phone: '', email: '', code: 'S0000002', created_at: at }
  ];
  d.tables.site_meetings = [{ id: 'm1', org_id: 'o1', title: 'Olağan genel kurul', kind: 'olagan', held_at: new Date(Date.now() + 20 * 864e5).toISOString(), second_at: null, place: 'Otopark', agenda: ['Açılış'], minutes: '', status: 'cagrildi', created_at: at }];
  d.tables.site_meeting_replies = [];
  await page.addInitScript((x) => { if (!localStorage.getItem('__fakedb')) localStorage.setItem('__fakedb', JSON.stringify(x)); }, d);
});
test.afterEach(() => { expect(errors).toEqual([]); });

async function login(page, email, entry = '/giris', role) {
  await page.goto(url(entry));
  await page.getByLabel('E-posta').fill(email);
  await page.getByLabel('Şifre', { exact: true }).fill(PW);
  await page.getByRole('button', { name: 'Giriş yap' }).click();
  if (entry === '/giris') await pickRole(page, role);
}

test('kiracı sakin de genel kurula katılım bildirir (vekâlet seçeneği yok)', async ({ page }) => {
  await login(page, 'kiraci@ornek.com');
  await page.goto(url('/uygulama/sitem'));
  await expect(page.getByText('Olağan genel kurul')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Vekâlet verdim' })).toHaveCount(0);
  await page.getByText('Katılacağım', { exact: true }).first().click();
  await expect.poll(async () => (await page.evaluate(() => JSON.parse(localStorage.getItem('__fakedb')).tables.site_meeting_replies))
    .map((r) => [r.unit_id, r.role, r.answer])).toEqual([['u2', 'kiraci', 'katilacak']]);
});

test('telefonda mülk sahibi + site sakini: Sitem alt çubukta, Rapor’un önünde', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, 'ev@ornek.com', '/giris', /Mülk sahibi/);
  await page.goto(url('/uygulama'));
  const tabs = await page.getByRole('tab').allInnerTexts();
  const names = tabs.map((x) => x.replace(/\s+/g, ' ').trim());
  const i = names.findIndex((x) => /Sitem|Evim|Dairem/.test(x)), r = names.findIndex((x) => /Rapor/.test(x));
  expect(i).toBeGreaterThanOrEqual(0);
  expect(r).toBe(i + 1);
});

test('yönetici paneli → Hesaplar: birden çok rol rozet olarak; açılınca kurumla', async ({ page }) => {
  await login(page, 'admin@ornek.com', '/giris/yonetici');
  await page.getByRole('button', { name: 'Hesaplar', exact: true }).first().click();
  await expect(page.getByText('Site maliki').first()).toBeVisible();
  await page.getByRole('button', { name: 'Birden çok rol', exact: false }).first().click();
  await page.getByRole('button', { name: /Ayşe Mülk/ }).first().click();
  await expect(page.getByText('• Site maliki · Fişekhane Sitesi')).toBeVisible();
});
