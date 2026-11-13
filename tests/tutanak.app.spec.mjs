// Giriş tutanağı (uygulama): her fotoğrafın kendi açıklaması; iki taraf onaylayınca kilit (düzenleme yok, sunucu da reddeder);
// "Tutanağı indir (PDF)" belgesi fotoğraf+açıklama, iki onayın tarih/saati ve kilit ifadesiyle açılır.
import { test, expect } from '@playwright/test';
import { serveDist, seed, PW, ensureDist } from './app-helpers.mjs';
import { watchErrors } from './helpers.mjs';

const DIST = new URL('../app/dist-fake', import.meta.url).pathname;
const PORT = 8261;
let server;
test.describe.configure({ mode: 'serial', timeout: 90_000 });          // CI'da ilk açılış yavaş: 30 sn'lik varsayılan kararsızdı
test.beforeAll(async () => { test.setTimeout(300_000); await ensureDist(DIST); server = await serveDist(DIST, PORT); });
test.afterAll(() => server && server.close());

// Belgeye yalnız png/jpeg/webp/gif görsel adresleri girer (safeFileUrl svg'yi reddeder): 1x1 png'ler.
const PX = (c) => `data:image/png;base64,${c}`;
const R = { red: PX('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGM4Y2wMAAMBATPEwnsTAAAAAElFTkSuQmCC'), green: PX('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGMwPmMMAAJoATO4y9g/AAAAAElFTkSuQmCC'), blue: PX('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGMwNj4DAAHPATMW+B0jAAAAAElFTkSuQmCC') };

function veri(ins) {
  const d = seed();
  d.tables.property_shared[0].inspect = {
    tenantOk: false, landlordOk: false,
    rooms: [{ n: 'Salon', photos: 0, note: 'Genel durum iyi', shots: [R.red, R.green], caps: ['Sol duvarda çizik', 'Parke temiz'] },
            { n: 'Mutfak', photos: 0, note: '', shots: [R.blue], caps: ['Evye sağlam'] }], ...ins
  };
  return d;
}
async function ac(page, d) {
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.addInitScript((x) => { if (!localStorage.getItem('__fakedb')) localStorage.setItem('__fakedb', JSON.stringify(x)); }, d);
  await page.goto(`http://localhost:${PORT}/giris/mulk-sahibi`);
  await page.getByLabel('E-posta').fill('ev@ornek.com');
  await page.getByLabel('Şifre', { exact: true }).fill(PW);
  await page.getByRole('button', { name: 'Giriş yap' }).click();
  await expect(page).toHaveURL(/uygulama/);
  await expect(page.getByText('Moda Dairesi').first()).toBeVisible({ timeout: 30_000 });
  await page.getByText('Moda Dairesi').first().click();
  await expect(page.getByRole('button', { name: 'Tutanak', exact: true })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Tutanak', exact: true }).click();
  await expect(page.getByText('Salon').first()).toBeVisible({ timeout: 15000 });
  return errors;
}
const db = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('__fakedb')));
const inspect = async (page) => (await db(page)).tables.property_shared[0].inspect;

test('her fotoğrafın kendi açıklaması var; yazılan açıklama o fotoğrafa kaydolur, fotoğraf silinince açıklamalar kaymaz', async ({ page }) => {
  const errors = await ac(page, veri());
  const cap1 = page.getByLabel('Fotoğraf 1 açıklaması');
  await expect(cap1).toHaveCount(2);                                        // Salon ve Mutfak'ın ilk fotoğrafı
  await expect(cap1.first()).toHaveValue('Sol duvarda çizik');
  await expect(page.getByLabel('Fotoğraf 2 açıklaması')).toHaveValue('Parke temiz');
  await page.getByLabel('Fotoğraf 2 açıklaması').fill('Parke temiz, çizik yok');
  await expect.poll(async () => (await inspect(page)).rooms[0].caps).toEqual(['Sol duvarda çizik', 'Parke temiz, çizik yok']);
  // Salon'un ilk fotoğrafını sil: ikincisinin açıklaması ona bağlı kalır.
  page.once('dialog', (x) => x.accept());
  await page.getByLabel('Fotoğrafı sil').first().click();
  // (Görseller yüklenince "sb:" yoluna döner; eşleşme açıklama ve sayıdan doğrulanır.)
  await expect.poll(async () => (await inspect(page)).rooms[0].caps).toEqual(['Parke temiz, çizik yok']);
  const r = (await inspect(page)).rooms;
  expect(r[0].shots).toHaveLength(1);
  expect(r[1].shots).toHaveLength(1); expect(r[1].caps).toEqual(['Evye sağlam']);
  expect(errors).toEqual([]);
});

test('iki taraf onaylayınca tutanak kilitlenir: düzenleme yok, yenilemede de kilitli; onay zamanları ve özet yazılır', async ({ page }) => {
  const errors = await ac(page, veri({ tenantOk: true }));
  await expect(page.getByRole('button', { name: 'Tutanağı onayla' })).toBeVisible();
  await page.getByRole('button', { name: 'Tutanağı onayla' }).click();
  await expect(page.getByText(/artık değiştirilemez/)).toBeVisible();
  await expect(page.getByText('Tutanak tamamlandı ve kilitlendi.')).toBeVisible();
  await expect.poll(async () => (await inspect(page)).landlordOk, { timeout: 15000 }).toBe(true);      // kayıt sunucuya eşitlenir
  const i = await inspect(page);
  expect(i).toMatchObject({ tenantOk: true, landlordOk: true });
  expect(i.landlordAt).toBeTruthy(); expect(i.lockedAt).toBeTruthy(); expect(i.hash).toMatch(/^[0-9a-f]{64}$/);
  // Arayüzde düzenleme denetimleri yok.
  await expect(page.getByLabel(/açıklaması$/)).toHaveCount(0);
  await expect(page.getByLabel('Fotoğrafı sil')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Tutanağı onayla' })).toHaveCount(0);
  await expect(page.getByText('Sol duvarda çizik')).toBeVisible();          // açıklamalar okunur halde
  // Yenileyince de kilitli kalır (kayıt sunucudan okunur).
  await page.reload();
  await page.getByRole('button', { name: 'Tutanak', exact: true }).click().catch(() => {});
  await expect(page.getByText('Tutanak tamamlandı ve kilitlendi.')).toBeVisible({ timeout: 15000 });
  await expect(page.getByLabel(/açıklaması$/)).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('Tutanağı indir (PDF): fotoğraflar kendi açıklamalarıyla, iki onayın tarihi/saati ve kilit ifadesi belgede', async ({ page }) => {
  const errors = await ac(page, veri({ tenantOk: true, landlordOk: true, tenantAt: '2026-11-07T11:32:05Z', landlordAt: '2026-11-07T09:10:44Z',
    tenantBy: 'Test Kiracı', landlordBy: 'Ayşe Mülk', lockedAt: '2026-11-07T11:32:05Z', hash: 'ab'.repeat(32) }));
  await page.addInitScript(() => { window.__printed = 0; });
  const [pop] = await Promise.all([page.waitForEvent('popup'), page.getByRole('button', { name: 'Tutanağı indir (PDF)' }).click()]);
  await pop.waitForSelector('figure', { timeout: 15000 });
  const html = await pop.content();
  expect(await pop.locator('figure').count()).toBe(3);
  // Salon'un iki fotoğrafı ve Mutfak'ın fotoğrafı: her figürde kendi açıklaması.
  const fig = await pop.locator('figure').evaluateAll((els) => els.map((e) => ({ src: e.querySelector('img')?.getAttribute('src'), text: e.innerText })));
  expect(fig.every((f) => f.src)).toBe(true);
  expect(fig[0].text).toContain('Salon · Fotoğraf 1'); expect(fig[0].text).toContain('Sol duvarda çizik'); expect(fig[0].text).not.toContain('Parke');
  expect(fig[1].text).toContain('Salon · Fotoğraf 2'); expect(fig[1].text).toContain('Parke temiz'); expect(fig[1].text).not.toContain('Sol duvarda');
  expect(fig[2].text).toContain('Mutfak · Fotoğraf 1'); expect(fig[2].text).toContain('Evye sağlam');
  const text = await pop.locator('body').innerText();
  expect(text).toContain('12:10:44'); expect(text).toContain('14:32:05');
  expect(text).toContain('Ayşe Mülk'); expect(text).toContain('Test Kiracı');
  expect(text).toContain('Bu giriş tutanağı, her iki tarafın onayıyla 7 Kasım 2026 tarihinde 14:32:05 itibarıyla onaylanmış ve kilitlenmiştir.');
  expect(html).not.toContain('<script');
  expect(errors).toEqual([]);
});
