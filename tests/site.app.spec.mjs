// Site yönetimi (kurumsal yol planı Faz 2), uygulama üzerinde uçtan uca: yönetim daireleri toplu ekler, kiracıyı
// davet eder, aidat tahakkuk eder, duyuru yapar, gideri arsa payına göre dağıtır; kiracı davet bağlantısıyla bağlanır,
// "Sitem"de yalnız kendi dairesini görür, dekont yükler ve talep açar; yönetim onaylar ve yanıtlar.
// Sunucu kuralları gerçek Postgres'te ayrıca sınanır (site.sql.spec.mjs).
import { test, expect } from '@playwright/test';
import { serveDist, seed, PW, ensureDist, ID } from './app-helpers.mjs';
import { watchErrors, PNG } from './helpers.mjs';

const DIST = new URL('../app/dist-fake', import.meta.url).pathname;
const PORT = 8209;
let server;
let errors;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  test.setTimeout(300_000);
  await ensureDist(DIST);
  server = await serveDist(DIST, PORT);
});
test.afterAll(() => server && server.close());

test.beforeEach(async ({ page }) => {
  errors = watchErrors(page);
  const db = seed();
  // Mülk sahibi hesabı aynı zamanda Atakum Sitesi'nin master yöneticisi.
  db.tables.organizations = [{ id: 'o1', name: 'Atakum Sitesi', sector: 'site', modules: ['aidat', 'duyuru', 'gider_dagitim', 'rapor'], status: 'active', units: null, created_at: new Date().toISOString() }];
  db.tables.org_roles = [];
  db.tables.org_members = [{ org_id: 'o1', user_id: ID.landlord, role_id: null, is_master: true, created_at: new Date().toISOString() }];
  await page.addInitScript(d => { if (!localStorage.getItem('__fakedb')) localStorage.setItem('__fakedb', JSON.stringify(d)); }, db);
});
test.afterEach(() => { expect(errors).toEqual([]); });

const url = p => `http://localhost:${PORT}${p}`;
const db = page => page.evaluate(() => JSON.parse(localStorage.getItem('__fakedb')));
const ENTRY = { 'kiraci@ornek.com': '/giris/kiraci', 'ev@ornek.com': '/giris/mulk-sahibi' };
async function login(page, email) {
  await page.goto(url(ENTRY[email]));
  await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('__fakedb')); d.session = null; localStorage.setItem('__fakedb', JSON.stringify(d)); });
  await page.goto(url(ENTRY[email]));
  await page.getByLabel('E-posta').fill(email);
  await page.getByLabel('Şifre', { exact: true }).fill(PW);
  await page.getByRole('button', { name: 'Giriş yap' }).click();
}
/** Tarayıcı Europe/Istanbul saatinde çalışır (playwright.config); beklenen ay ve günler de o saat dilimiyle hesaplanır. */
const istDay = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(d);
const month = istDay().slice(0, 7);

test('site yönetimi ve sakin: daireler, davet, tahakkuk, duyuru, dekont, talep, onay ve gider dağıtımı', async ({ page }) => {
  // 1. Yönetim: daireleri toplu ekler, kiracı ekler, aidat tahakkuk eder, duyuru yapar.
  await login(page, 'ev@ornek.com');
  await expect(page.getByText('Moda Dairesi').first()).toBeVisible();
  await page.getByRole('link', { name: 'Site', exact: true }).first().click();
  await expect(page).toHaveURL(/\/uygulama\/site/);
  await page.getByRole('button', { name: 'Daireler' }).click();
  await page.getByRole('button', { name: 'Toplu ekle' }).click();
  await page.getByLabel('Daire listesi').fill('Blok;No;m2;Arsa payı;Aidat;Malik\nA;1;120;2;1500;Ali Malik;05320000000\nA;2;80;1;1000;Veli Malik');
  await expect(page.getByText('2 daire okundu')).toBeVisible();
  await page.getByRole('button', { name: 'Daireleri ekle' }).click();
  await expect(page.getByText('2 daire eklendi.')).toBeVisible();
  await expect(page.getByText('Ali Malik')).toBeVisible();
  await page.getByRole('button', { name: 'Malik ya da kiracı ekle' }).first().click();
  await page.getByLabel('Ad soyad').fill('Mehmet Kiracı');
  await page.getByRole('button', { name: 'Kişiyi ekle' }).click();
  await expect(page.getByText('Mehmet Kiracı')).toBeVisible();
  const code = (await db(page)).tables.site_residents.find(r => r.role === 'kiraci').code;

  await page.getByRole('button', { name: 'Tahakkuk' }).click();
  await expect(page.getByText('2 daireye toplam ₺2.500')).toBeVisible();
  await page.getByRole('button', { name: 'Tahakkuk et' }).click();
  await expect(page.getByText('2 daireye tahakkuk edildi.')).toBeVisible();
  await page.getByRole('button', { name: 'Duyurular' }).click();
  await page.getByLabel('Başlık').fill('Su kesintisi');
  await page.getByLabel('Duyuru metni').fill('Yarın 10-14 arası su kesilecek.');
  await page.getByRole('button', { name: 'Duyur', exact: true }).click();
  await expect(page.getByText('Yarın 10-14 arası su kesilecek.')).toBeVisible();

  // 2. Kiracı: davet bağlantısıyla bağlanır; yalnız kendi dairesini görür; dekont yükler, talep açar.
  await login(page, 'kiraci@ornek.com');
  await expect(page.getByText('Moda Dairesi').first()).toBeVisible();
  await page.goto(url('/katil?kod=' + code));
  await expect(page).toHaveURL(/\/uygulama\/?$/);
  await page.getByText('Aidat, duyurular ve yönetime talep').first().click();
  await expect(page).toHaveURL(/\/uygulama\/sitem/);
  await expect(page.getByText('A Blok No 1')).toBeVisible();
  await expect(page.getByText('A Blok No 2')).toHaveCount(0);
  await expect(page.getByText('Su kesintisi')).toBeVisible();
  await page.getByRole('button', { name: 'Dekont yükle' }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Dosya seç' }).click();
  await (await chooser).setFiles(PNG);
  await expect(page.getByText('dekont.png')).toBeVisible();
  await page.getByRole('button', { name: 'Yönetime gönder' }).click();
  await expect(page.getByText('Onay bekliyor').first()).toBeVisible();
  await page.getByRole('checkbox', { name: 'Aidat' }).click();
  await page.getByLabel('Başlık').fill('Aidatı malik ödesin');
  await page.getByRole('button', { name: 'Talebi gönder' }).click();
  await expect(page.getByText('Talebin yönetime iletildi.')).toBeVisible();
  let d = await db(page);
  const ch = d.tables.site_charges.find(x => x.status === 'review');
  expect(ch).toMatchObject({ amount: 1500, paid_amount: 1500, month });
  expect(ch.receipt_path).toMatch(/^site-o1\//);

  // 3. Yönetim: dekontu onaylar, talebi yanıtlar, gideri arsa payına göre dağıtır.
  await login(page, 'ev@ornek.com');
  await expect(page.getByText('Moda Dairesi').first()).toBeVisible();
  await page.goto(url('/uygulama/site'));
  await expect(page.getByText('Onay bekleyen dekontlar')).toBeVisible();
  await page.getByRole('button', { name: 'Onayla', exact: true }).click();
  await expect.poll(async () => (await db(page)).tables.site_charges.find(x => x.id === ch.id).status).toBe('paid');
  await page.getByRole('button', { name: 'Talepler (1)' }).click();
  await page.getByRole('checkbox', { name: 'Çözüldü' }).click();
  await page.getByLabel('Yanıt').fill('Daire için aidatı malik ödeyecek.');
  await page.getByRole('button', { name: 'Kaydet' }).click();
  await expect(page.getByRole('button', { name: 'Talepler (0)' })).toBeVisible();
  await page.getByRole('button', { name: 'Giderler' }).click();
  await page.getByLabel('Kalem').fill('Çatı onarımı');
  await page.getByLabel('Tutar (₺)').fill('3000');
  await page.getByRole('button', { name: 'Gideri ekle' }).click();
  await page.getByRole('button', { name: 'Dairelere dağıt' }).click();
  await expect(page.getByLabel('Başlık')).toHaveValue('Çatı onarımı');
  await expect(page.getByText('2 daireye toplam ₺3.000')).toBeVisible();
  await page.getByRole('button', { name: 'Tahakkuk et' }).click();
  await expect(page.getByText('2 daireye tahakkuk edildi.')).toBeVisible();
  d = await db(page);
  expect(d.tables.site_charges.filter(x => x.kind === 'ozel').map(x => x.amount).sort()).toEqual([1000, 2000]);   // arsa payı 2:1

  // 4. Kiracı: ödeme onaylı, talebin yanıtı görünür.
  await login(page, 'kiraci@ornek.com');
  await expect(page.getByText('Moda Dairesi').first()).toBeVisible();
  await page.goto(url('/uygulama/sitem'));
  await expect(page.getByText('Ödendi').first()).toBeVisible();
  await expect(page.getByText('Daire için aidatı malik ödeyecek.')).toBeVisible();
});

test('ev sahibi mülkünü site dairesine bağlar; kiracı kira ile aidatı aynı ekranda öder; bütçe aidatları günceller; rapor', async ({ page }) => {
  await page.addInitScript(() => {
    const d = JSON.parse(localStorage.getItem('__fakedb'));
    if (d.tables.site_units && d.tables.site_units.length) return;
    const now = new Date().toISOString();
    d.tables.site_units = [{ id: 'u1', org_id: 'o1', block: 'A', no: '1', area: 120, share: 2, aidat: 1500, payer: 'kiraci', note: '', created_at: now }];
    d.tables.site_residents = [{ id: 'r1', org_id: 'o1', unit_id: 'u1', user_id: '00000000-0000-4000-8000-00000000000a', role: 'malik', name: 'Ayşe Mülk', phone: '', email: '', lives_here: false, code: 'S0000001', created_at: now }];
    d.tables.site_charges = [{ id: 'c1', org_id: 'o1', unit_id: 'u1', month: new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(new Date()).slice(0, 7), kind: 'aidat', title: '', amount: 1500, status: 'open', paid_amount: 0, method: 'dekont', created_at: now }];
    localStorage.setItem('__fakedb', JSON.stringify(d));
  });
  // 1. Ev sahibi (dairenin maliki) mülkünü daireye bağlar.
  await login(page, 'ev@ornek.com');
  await expect(page.getByText('Moda Dairesi').first()).toBeVisible();
  await page.goto(url('/uygulama/mulk?pid=p1&sub=odeme'));
  await page.getByRole('button', { name: 'Atakum Sitesi · A Blok No 1' }).click();
  await expect(page.getByText('Site aidatı · Atakum Sitesi')).toBeVisible();
  expect((await db(page)).tables.properties[0].site_unit_id).toBe('u1');

  // 2. Kiracı: Ödemeler'de kiranın altında site aidatı; dekont yükler.
  await login(page, 'kiraci@ornek.com');
  await expect(page.getByText('Moda Dairesi').first()).toBeVisible();
  await page.goto(url('/uygulama/odemeler'));
  await expect(page.getByText('Site aidatı · Atakum Sitesi')).toBeVisible();
  await page.getByRole('button', { name: 'Dekont yükle' }).last().click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Dosya seç' }).click();
  await (await chooser).setFiles(PNG);
  await expect(page.getByText('dekont.png')).toBeVisible();
  await page.getByRole('button', { name: 'Yönetime gönder' }).click();
  await expect.poll(async () => (await db(page)).tables.site_charges[0].status).toBe('review');

  // 3. Yönetim: bağlı kiracıyı görür; işletme projesinden aidatı günceller; rapor.
  await login(page, 'ev@ornek.com');
  await expect(page.getByText('Moda Dairesi').first()).toBeVisible();
  await page.goto(url('/uygulama/site'));
  await page.getByRole('button', { name: 'Daireler' }).click();
  await expect(page.getByText('Kiracı · ev sahibinin anahtar hesabı üzerinden bağlı')).toBeVisible();
  await page.getByRole('button', { name: 'Bütçe' }).click();
  await page.getByLabel('Gider kalemi').fill('Asansör bakımı');
  await page.getByLabel('Yıllık tutar (₺)').fill('48000');
  await page.getByRole('button', { name: 'Kalem ekle' }).click();
  await page.getByLabel('Gider kalemi').last().fill('Temizlik');
  await page.getByLabel('Yıllık tutar (₺)').last().fill('72000');
  await expect(page.getByText('₺10.000 / ay')).toBeVisible();          // 120.000 / 12, tek daire
  await page.getByRole('button', { name: 'Kaydet' }).click();
  await expect(page.getByText('İşletme projesi kaydedildi.')).toBeVisible();
  await page.getByRole('button', { name: 'Daire aidatlarını güncelle' }).click();
  await expect.poll(async () => (await db(page)).tables.site_units[0].aidat).toBe(10000);
  await page.getByRole('button', { name: 'Rapor' }).click();
  await expect(page.getByText(/yönetim raporu$/).first()).toBeVisible();
  await expect(page.getByText('Borçlu daireler')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Yazdır / PDF' })).toBeVisible();
});
