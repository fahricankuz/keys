// Site projesi oylaması, teklif ve fatura (uygulama): yönetim projeyi oylamaya sunar; malik arsa payıyla oy verir; yönetim oylamayı bitirir,
// proje "Sakinler onayladı" olur; teklif eklenir, aşama ilerler, fatura (dosyalı) girilir; fatura gider defterine yazılır ve sakin görür.
// Sunucu kuralları gerçek Postgres'te ayrıca sınanır (site-proje-oylama.sql).
import { test, expect } from '@playwright/test';
import { serveDist, seed, PW, ensureDist, ID , pickRole } from './app-helpers.mjs';
import { watchErrors, PNG } from './helpers.mjs';

const DIST = new URL('../app/dist-fake', import.meta.url).pathname;
const PORT = 8263;
let server;
let errors;
test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => { test.setTimeout(300_000); await ensureDist(DIST); server = await serveDist(DIST, PORT); });
test.afterAll(() => server && server.close());

test.beforeEach(async ({ page }) => {
  errors = watchErrors(page);
  const db = seed();
  const now = new Date().toISOString();
  db.tables.organizations = [{ id: 'o1', name: 'Atakum Sitesi', sector: 'site', modules: ['aidat', 'duyuru', 'rapor'], status: 'active', units: null, created_at: now }];
  db.tables.org_roles = [];
  db.tables.org_members = [{ org_id: 'o1', user_id: ID.landlord, role_id: null, is_master: true, created_at: now }];
  // Arsa payları 3 ve 1: A Blok No 1'in malikinin oyu %75 ağırlıkta.
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

test('oylama, onay, teklif, aşama ve fatura: yönetimden sakine uçtan uca', async ({ page }) => {
  // 1. Yönetim: proje açar ve oylamaya sunar.
  await login(page, 'ev@ornek.com');
  await expect(page).toHaveURL(/\/uygulama\/site$/);
  await page.goto(url('/uygulama/site/projeler'));
  await page.getByRole('button', { name: 'Yeni proje' }).click();
  await page.getByLabel('Proje adı').fill('Çatı yalıtımı');
  await page.getByLabel('Açıklama').fill('Çatı membranı yenilenecek.');
  await page.getByRole('button', { name: 'Projeyi aç' }).click();
  await expect(page.getByText('Çatı yalıtımı').first()).toBeVisible();
  await expect(page.getByRole('button', { name: /^Sonraki aşama/ })).toBeVisible();
  await page.getByRole('button', { name: 'Oylamaya sun', exact: true }).click();
  await expect(page.getByText(/Kabul için tüm arsa payının %50’sinden fazlası gerekir/)).toBeVisible();
  await page.getByRole('button', { name: 'Oylamaya sun', exact: true }).last().click();
  await expect(page.getByText('Oylama: proje yapılsın mı?')).toBeVisible();
  await expect(page.getByText('Oylama sürüyor')).toBeVisible();
  await expect(page.getByRole('button', { name: /^Sonraki aşama/ })).toHaveCount(0);                 // oylama sürerken aşama ilerletilmez
  await expect(page.getByRole('button', { name: 'Teklif ekle' })).toHaveCount(0);
  let d = await db(page);
  expect(d.tables.site_projects[0]).toMatchObject({ status: 'oylama', approve_pct: 50 });
  expect(d.tables.site_polls[0]).toMatchObject({ options: ['Kabul', 'Ret'], weighted: true, voters: 'malik' });

  // 2. Malik: kendi dairesi adına Kabul oyu verir.
  await login(page, 'kiraci@ornek.com');
  await page.goto(url('/uygulama/sitem'));
  await expect(page.getByText('Oylama: proje yapılsın mı?')).toBeVisible();
  await page.getByRole('checkbox', { name: 'Kabul', exact: true }).click();
  await expect(page.getByText('Oyun kaydedildi; oylama bitene kadar değiştirebilirsin.')).toBeVisible();
  d = await db(page);
  expect(d.tables.site_votes.map((v) => [v.unit_id, v.choice])).toEqual([['u1', 0]]);
  await expect(page.getByText('%75').first()).toBeVisible();                                         // arsa payına göre kabul

  // 3. Yönetim: oylamayı bitirir; proje onaylanır; teklif ekler; aşama ilerler; fatura girer.
  await login(page, 'ev@ornek.com');
  await page.goto(url('/uygulama/site/projeler'));
  await page.getByRole('button', { name: 'Oylamayı bitir ve sonucu uygula' }).click();
  await expect(page.getByText(/proje onaylandı\. Kabul %75/)).toBeVisible();
  d = await db(page);
  expect(d.tables.site_projects[0].status).toBe('onay');
  await page.getByRole('button', { name: 'Teklif ekle' }).click();
  await page.getByLabel('Firma', { exact: true }).fill('A Yapı');
  await page.getByLabel('Tutar (₺)').fill('228500');
  await page.getByRole('checkbox', { name: 'Bu teklifi seç' }).click();
  await page.getByRole('button', { name: 'Kaydet', exact: true }).click();
  await expect(page.getByText('A Yapı · seçildi')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Fatura ekle' })).toBeVisible();                     // onaylı projede fatura girilebilir
  await page.getByRole('button', { name: 'Fatura ekle' }).click();
  await page.getByLabel('Firma / kalem').fill('A Yapı · malzeme');
  await page.getByLabel('Tutar (₺)').fill('96400');
  const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Dosya seç', exact: true }).click()]);
  await fc.setFiles(PNG);
  await expect(page.getByText('dekont.png')).toBeVisible();                                           // dosya hazırlanınca kaydedilir
  await page.getByRole('button', { name: 'Kaydet', exact: true }).click();
  await expect(page.getByText('Toplam ₺96.400')).toBeVisible();
  d = await db(page);
  expect(d.tables.site_project_costs.map((x) => [x.kind, x.vendor, x.amount, x.chosen])).toEqual([['teklif', 'A Yapı', 228500, true], ['fatura', 'A Yapı · malzeme', 96400, false]]);
  expect(d.tables.site_project_costs[1].file).toMatch(/^site-o1\//);
  expect(d.tables.site_projects[0].spent).toBe(96400);
  expect(d.tables.site_expenses.filter((e) => e.project_cost_id).map((e) => [e.cat, e.amount])).toEqual([['Onarım ve tadilat', 96400]]);

  // 4. Malik: teklifi ve faturayı şeffaf biçimde görür; yazamaz.
  await login(page, 'kiraci@ornek.com');
  await page.goto(url('/uygulama/sitem'));
  await expect(page.getByText('A Yapı · seçildi')).toBeVisible();
  await expect(page.getByText('Toplam ₺96.400')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Fatura ekle' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Teklif ekle' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Faturayı gör' })).toBeVisible();
});

test('süresi dolan oylama sakinin ekranı açılınca kendiliğinden sonuçlanır; reddedilen proje yeniden oylamaya sunulur', async ({ page }) => {
  await login(page, 'ev@ornek.com');
  await page.goto(url('/uygulama/site/projeler'));
  await page.getByRole('button', { name: 'Yeni proje' }).click();
  await page.getByLabel('Proje adı').fill('Otopark');
  await page.getByRole('button', { name: 'Projeyi aç' }).click();
  await page.getByRole('button', { name: 'Oylamaya sun', exact: true }).click();
  await page.getByRole('checkbox', { name: '%80 ve üzeri' }).click();
  await page.getByRole('button', { name: 'Oylamaya sun', exact: true }).last().click();
  await expect(page.getByText('Oylama sürüyor')).toBeVisible();
  // Malik Ret der; oylama süresi dolar.
  await login(page, 'kiraci@ornek.com');
  await page.goto(url('/uygulama/sitem'));
  await page.getByRole('checkbox', { name: 'Ret', exact: true }).click();
  await expect.poll(async () => (await db(page)).tables.site_votes.length).toBe(1);
  await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('__fakedb')); d.tables.site_polls[0].ends_at = new Date(Date.now() - 60000).toISOString(); localStorage.setItem('__fakedb', JSON.stringify(d)); });
  await page.reload();
  await expect(page.getByText('Reddedildi').first()).toBeVisible({ timeout: 15000 });
  expect((await db(page)).tables.site_projects[0].status).toBe('red');
  // Yönetim yeniden oylamaya sunabilir; ilerletemez.
  await login(page, 'ev@ornek.com');
  await page.goto(url('/uygulama/site/projeler'));
  await expect(page.getByRole('button', { name: /^Sonraki aşama/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Oylamaya sun', exact: true })).toBeVisible();
});
