// Yönetici → Kurumlar: askıdaki kurum "Kurumu sil" ile silinir; önce onay sorulur (Vazgeç / Evet, sil); etkin kurumda düğme yoktur.
// Sunucu kuralları gerçek Postgres'te ayrıca sınanır (org.sql.spec.mjs).
import { test, expect } from '@playwright/test';
import { serveDist, seed, PW, ensureDist, ID , pickRole } from './app-helpers.mjs';
import { watchErrors } from './helpers.mjs';

const DIST = new URL('../app/dist-fake', import.meta.url).pathname;
const PORT = 8245;
const ORG = '20000000-0000-4000-8000-000000000009';
let server, errors;

test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => { test.setTimeout(300_000); await ensureDist(DIST); server = await serveDist(DIST, PORT); });
test.afterAll(() => server && server.close());
test.beforeEach(async ({ page }) => {
  errors = watchErrors(page);
  const db = seed();
  db.tables.organizations = [{ id: ORG, name: 'Akif Aş.', sector: 'depo', modules: ['kira', 'rapor'], status: 'active', units: 2, contract_until: null, billing: {}, note: '', created_at: new Date().toISOString() }];
  db.tables.org_members = [{ org_id: ORG, user_id: ID.landlord, role_id: null, is_master: true }];
  db.tables.org_roles = []; db.tables.org_invites = [];
  db.tables.properties[0].org_id = ORG;
  await page.addInitScript((d) => { if (!localStorage.getItem('__fakedb')) localStorage.setItem('__fakedb', JSON.stringify(d)); }, db);
});
test.afterEach(() => { expect(errors).toEqual([]); });
const db = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('__fakedb')));

test('askıya aldıktan sonra silinir: onay sorulur, vazgeçilebilir, onaylayınca kurum gider ve mülk kalır', async ({ page }) => {
  await page.goto(`http://localhost:${PORT}/giris/yonetici`);
  await page.getByLabel('E-posta').fill('admin@ornek.com');
  await page.getByLabel('Şifre', { exact: true }).fill(PW);
  await page.getByRole('button', { name: 'Giriş yap' }).click();
  await pickRole(page);
  await expect(page).toHaveURL(/\/admin/);
  await page.getByRole('button', { name: 'Kurumlar', exact: true }).first().click();
  await expect(page.getByText('Akif Aş.')).toBeVisible();

  await expect(page.getByRole('button', { name: 'Kurumu sil' })).toHaveCount(0);             // etkin kurumda silme yok
  await page.getByRole('button', { name: 'Askıya al' }).click();
  await expect(page.getByText('Askıda', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Kurumu sil' }).click();
  await expect(page.getByText('Bu kurumu silmek istediğine emin misin?')).toBeVisible();
  await expect(page.getByText(/Kuruma bağlı 1 mülk silinmez/)).toBeVisible();
  await page.getByRole('button', { name: 'Vazgeç' }).click();                                // vazgeç: kurum duruyor
  await expect(page.getByText('Bu kurumu silmek istediğine emin misin?')).toHaveCount(0);
  expect((await db(page)).tables.organizations).toHaveLength(1);

  await page.getByRole('button', { name: 'Kurumu sil' }).click();
  await page.getByRole('button', { name: 'Evet, sil' }).click();
  await expect(page.getByText('Akif Aş.')).toHaveCount(0);
  const d = await db(page);
  expect(d.tables.organizations).toHaveLength(0);
  expect(d.tables.properties[0].org_id).toBeNull();                                          // mülk silinmedi
  expect(d.tables.admin_audit.some((a) => a.action === 'org.delete')).toBe(true);
});
