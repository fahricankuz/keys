// Site talebine fotoğraf ve video eki (uygulama): sakin talep açarken fotoğraf ve video ekler; kendi kartında ve yönetimde görünür,
// video sayfa içinde oynatılır; yazışmada dosyayla yanıt verilir. Sunucu kuralları gerçek Postgres'te ayrıca sınanır (site-talep-medya.sql).
import { test, expect } from '@playwright/test';
import { serveDist, seed, PW, ensureDist, ID } from './app-helpers.mjs';
import { watchErrors, PNG } from './helpers.mjs';

const DIST = new URL('../app/dist-fake', import.meta.url).pathname;
const PORT = 8262;
let server;
let errors;
test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => { test.setTimeout(300_000); await ensureDist(DIST); server = await serveDist(DIST, PORT); });
test.afterAll(() => server && server.close());

const VIDEO = { name: 'ariza.mp4', mimeType: 'video/mp4', buffer: Buffer.from('000000186674797069736f6d0000020069736f6d69736f32', 'hex') };

test.beforeEach(async ({ page }) => {
  errors = watchErrors(page);
  const db = seed();
  const now = new Date().toISOString();
  db.tables.organizations = [{ id: 'o1', name: 'Atakum Sitesi', sector: 'site', modules: ['aidat', 'duyuru', 'rapor'], status: 'active', units: null, created_at: now }];
  db.tables.org_roles = [];
  db.tables.org_members = [{ org_id: 'o1', user_id: ID.landlord, role_id: null, is_master: true, created_at: now }];
  db.tables.site_units = [{ id: 'u1', org_id: 'o1', block: 'A', no: '1', area: 100, share: 1, aidat: 1000, payer: 'kiraci', currency: 'TRY', created_at: now }];
  db.tables.site_residents = [{ id: 'r1', org_id: 'o1', unit_id: 'u1', user_id: ID.tenant, role: 'kiraci', name: 'Mehmet Kiracı', phone: '', email: 'kiraci@ornek.com', lives_here: true, code: 'S0000001', created_at: now }];
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
}
async function pick(page, buttonName, file) {
  const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: buttonName, exact: true }).click()]);
  await fc.setFiles(file);
}

test('sakin talebe fotoğraf ve video ekler; kendi kartında ve yönetimde görünür, video oynar', async ({ page }) => {
  await login(page, 'kiraci@ornek.com');
  await page.goto(url('/uygulama/sitem'));
  await page.getByLabel('Başlık').fill('Tavan akıtıyor');
  await page.getByLabel('Açıklama').fill('Banyonun tavanından su damlıyor.');
  await expect(page.getByText(/Fotoğraf ve video ekleyebilirsin/)).toBeVisible();
  await pick(page, 'Fotoğraf ekle', PNG);
  await expect(page.getByText('dekont.png')).toBeVisible();
  await pick(page, 'Video ekle', VIDEO);
  await expect(page.getByText('Video: ariza.mp4')).toBeVisible();
  // Eklenen dosya kaldırılabilir, sonra yeniden eklenir.
  await page.getByRole('button', { name: 'ariza.mp4 dosyasını kaldır' }).click();
  await expect(page.getByText('Video: ariza.mp4')).toHaveCount(0);
  await pick(page, 'Video ekle', VIDEO);
  await page.getByRole('button', { name: 'Talebi gönder' }).click();
  await expect(page.getByText('Talebin yönetime iletildi.')).toBeVisible();

  const q = (await db(page)).tables.site_requests.find((x) => x.title === 'Tavan akıtıyor');
  expect(q.media).toHaveLength(2);
  expect(q.media.every((m) => m.startsWith('site-o1/'))).toBe(true);
  expect(q.media.some((m) => /\.mp4$/.test(m))).toBe(true);
  expect(q.media.some((m) => /\.(webp|jpg)$/.test(m))).toBe(true);
  // Sakin kendi kartında videoyu oynatır.
  await expect(page.getByText('Tavan akıtıyor').first()).toBeVisible();
  await page.getByRole('button', { name: 'Videoyu oynat' }).click();
  await expect(page.locator('video').first()).toHaveAttribute('src', /.+/);

  // Yönetim: talepte fotoğraf ve videoyu görür; dosyayla yanıt verir.
  await login(page, 'ev@ornek.com');
  await page.goto(url('/uygulama/site/talepler'));
  await expect(page.getByText('Tavan akıtıyor')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Videoyu oynat' })).toBeVisible();
  await page.getByRole('button', { name: 'Videoyu oynat' }).click();
  await expect(page.locator('video')).toHaveCount(1);
  await pick(page, 'Fotoğraf ekle', PNG);
  await page.getByRole('button', { name: 'Mesaj gönder', exact: true }).click();                  // yalnız dosya, metin yok
  await expect.poll(async () => (await db(page)).tables.site_request_messages.length).toBe(1);
  const m = (await db(page)).tables.site_request_messages[0];
  expect(m).toMatchObject({ from_mgmt: true, body: '' });
  expect(m.media).toHaveLength(1);
});

test('40 MB üstü video eklenmez; en çok 2 video ve 6 dosya eklenir', async ({ page }) => {
  await login(page, 'kiraci@ornek.com');
  await page.goto(url('/uygulama/sitem'));
  await pick(page, 'Video ekle', { ...VIDEO, name: 'dev.mp4', buffer: Buffer.alloc(41 * 1024 * 1024) });
  await expect(page.getByText('Video: dev.mp4')).toHaveCount(0);
  await expect(page.getByText('Video çok büyük')).toBeVisible();
  await pick(page, 'Video ekle', VIDEO);
  await pick(page, 'Video ekle', { ...VIDEO, name: 'ikinci.mp4' });
  await expect(page.getByRole('button', { name: 'Video ekle', exact: true })).toBeDisabled();       // en çok 2 video
  await pick(page, 'Fotoğraf ekle', [PNG, { ...PNG, name: 'b.png' }, { ...PNG, name: 'c.png' }, { ...PNG, name: 'd.png' }]);
  await expect(page.getByRole('button', { name: 'Fotoğraf ekle', exact: true })).toBeDisabled();    // 6 dosyaya ulaşıldı
});
