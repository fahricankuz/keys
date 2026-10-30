// Hukuki süreç desteği, uygulama üzerinde uçtan uca: kira 10 günden fazla gecikince mülk sahibine kart çıkar, talep formu
// onaysız gönderilmez, ödeme geçmişi talebe kendiliğinden eklenir; kiracı Ayarlar → Yardım'dan depozito talebi açar ve
// mülk sahibinin talebini görmez; yönetici ödemeyi işaretleyip not yazınca kişi durumu ve notu görür; kiracı kendi talebini
// iptal eder. Sunucu kuralları gerçek Postgres'te ayrıca sınanır (hukuki.sql.spec.mjs).
import { test, expect } from '@playwright/test';
import { serveDist, seed, PW, ensureDist } from './app-helpers.mjs';
import { watchErrors } from './helpers.mjs';

const DIST = new URL('../app/dist-fake', import.meta.url).pathname;
const PORT = 8212;
let server;
let errors;

test.describe.configure({ mode: 'serial' });


test.beforeAll(async () => {
  test.setTimeout(300_000);
  await ensureDist(DIST);
  server = await serveDist(DIST, PORT);
});
test.afterAll(() => server && server.close());

// İstanbul tarihiyle: sözleşme iki ay önce başladı (ilk iki ayın kirası ödenmedi), 40 gün sonra bitiyor.
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(new Date());
const [Y, M] = today.split('-').map(Number);
const ymd = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const START = ymd(new Date(Y, M - 3, 1));
const END = ymd(new Date(Date.parse(today) + 40 * 86400000));

function seedLate() {
  const db = seed();
  Object.assign(db.tables.properties[0], { start_date: START, contract_end: END, deposit: 60000 });
  db.tables.rent_history = [{ id: 'p1:' + START, property_id: 'p1', from_date: START, amount: 30000, note: 'Sözleşme başlangıcı' }];
  return db;
}
/** Mülk sahibinin daha önce açtığı bir gecikme talebiyle. */
function seedWithRequest() {
  const db = seedLate();
  const at = new Date().toISOString();
  db.tables.legal_requests = [{ id: 'lr1', no: 1, user_id: db.users[0].id, role: 'landlord', property_id: 'p1', property_name: 'Moda Dairesi', topic: 'gecikme',
    body: 'İki aydır kira ödenmiyor.', files: [], price: 3000, status: 'received', reply: '', paid_at: null, forwarded_at: null, closed_at: null,
    consent_at: at, scope_at: at, created_at: at, updated_at: at, contact: { name: 'Ayşe Mülk', email: 'ev@ornek.com', phone: '' },
    context: { property: { name: 'Moda Dairesi', addr: 'Kadıköy', rent: 30000, deposit: 60000, landlord: 'Ayşe Mülk', tenant: 'Mehmet Kiracı' },
      docs: [], payments: [{ month: START.slice(0, 7), status: 'late', expected: 30000, paid: null, date: null }] } }];
  return db;
}

// Her test yeni tarayıcı bağlamında, kendi verisiyle başlar.
test.beforeEach(async ({ page }, info) => {
  errors = watchErrors(page);
  const data = /yönetici|iptal|kiracı:/.test(info.title) ? seedWithRequest() : seedLate();
  await page.addInitScript(d => { if (!localStorage.getItem('__fakedb')) localStorage.setItem('__fakedb', JSON.stringify(d)); }, data);
});
test.afterEach(() => { expect(errors).toEqual([]); });

const url = p => `http://localhost:${PORT}${p}`;
const db = page => page.evaluate(() => JSON.parse(localStorage.getItem('__fakedb')));
const ENTRY = { 'kiraci@ornek.com': '/giris/kiraci', 'ev@ornek.com': '/giris/mulk-sahibi', 'admin@ornek.com': '/giris/yonetici' };
async function login(page, email) {
  await page.goto(url(ENTRY[email]));
  await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('__fakedb')); d.session = null; localStorage.setItem('__fakedb', JSON.stringify(d)); });
  await page.goto(url(ENTRY[email]));
  await page.getByLabel('E-posta').fill(email);
  await page.getByLabel('Şifre', { exact: true }).fill(PW);
  await page.getByRole('button', { name: 'Giriş yap' }).click();
}
async function consent(page) {
  await page.getByRole('switch', { name: /açık rıza veriyorum/ }).click();
  await page.getByRole('switch', { name: /idari takip ve koordinasyon/ }).click();
}

test('mülk sahibi: gecikme kartından talep açar; onaysız gönderilmez; ödeme geçmişi eklenir; Talepler’de görünür', async ({ page }) => {
  await login(page, 'ev@ornek.com');
  await expect(page.getByText('Moda Dairesi').first()).toBeVisible();
  await page.goto(url('/uygulama/mulk?pid=p1&sub=odeme'));
  await expect(page.getByText('Gecikme uzadı mı?')).toBeVisible();
  await expect(page.getByText('Kiracı artışa ya da tahliyeye itiraz mı ediyor?')).toBeVisible();   // sözleşme 40 gün sonra bitiyor
  await page.getByRole('button', { name: 'Hukuki destek iste · ₺3.000' }).click();

  await expect(page.getByText('Hukuki süreç desteği').first()).toBeVisible();
  await expect(page.getByRole('radio', { name: 'Kira gecikmesi' })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByText('Son 3 ayın ödeme geçmişi')).toBeVisible();
  await expect(page.getByText('KDV dahil')).toBeVisible();
  await page.getByRole('button', { name: 'Talebi gönder' }).click();
  await expect(page.getByText('Durumu kısaca anlat.')).toBeVisible();
  await page.getByLabel('Kısaca anlat').fill('İki aydır kira ödenmiyor, mesajlara dönmüyor.');
  await page.getByRole('button', { name: 'Talebi gönder' }).click();
  await expect(page.getByText('Devam etmek için iki onayı da ver.')).toBeVisible();
  await consent(page);
  await page.getByRole('button', { name: 'Talebi gönder' }).click();

  await expect(page.getByText('Talep alındı', { exact: true })).toBeVisible();
  await expect(page.getByText(/Talep no H-0001/)).toBeVisible();
  const r = (await db(page)).tables.legal_requests;
  expect(r.length).toBe(1);
  expect(r[0]).toMatchObject({ role: 'landlord', property_id: 'p1', property_name: 'Moda Dairesi', topic: 'gecikme', status: 'received', price: 3000 });
  expect(r[0].context.payments.length).toBe(3);
  expect(r[0].context.payments.filter(p => p.status === 'late').length).toBeGreaterThanOrEqual(2);
  expect(r[0].context.property.deposit).toBe(60000);

  await page.getByRole('button', { name: 'Kapat' }).click();
  await page.goto(url('/uygulama/talepler'));
  await expect(page.getByText('Hukuki destek', { exact: true })).toBeVisible();
  await expect(page.getByText('Kira gecikmesi · Moda Dairesi')).toBeVisible();
});

test('gecikme kartı "×" ile o ay için gizlenir', async ({ page }) => {
  await login(page, 'ev@ornek.com');
  await expect(page.getByText('Moda Dairesi').first()).toBeVisible();
  await page.goto(url('/uygulama/mulk?pid=p1&sub=odeme'));
  await expect(page.getByText('Gecikme uzadı mı?')).toBeVisible();
  await page.getByRole('button', { name: 'Gizle' }).click();
  await expect(page.getByText('Gecikme uzadı mı?')).toHaveCount(0);
  await page.reload();
  await expect(page.getByText('Kiracı artışa ya da tahliyeye itiraz mı ediyor?')).toBeVisible();
  await expect(page.getByText('Gecikme uzadı mı?')).toHaveCount(0);
});

test('kiracı: Ayarlar → Yardım’dan depozito talebi açar; mülk sahibinin talebini görmez', async ({ page }) => {
  await login(page, 'kiraci@ornek.com');
  await expect(page.getByText('Moda Dairesi').first()).toBeVisible();
  await page.goto(url('/uygulama/ayarlar'));
  await page.getByRole('button', { name: 'Yardım' }).click();
  await page.getByText('Hukuki süreç desteği').click();
  await page.getByRole('radio', { name: 'Depozito' }).click();
  await page.getByLabel('Kısaca anlat').fill('Çıkalı iki hafta oldu, depozito iade edilmedi.');
  await consent(page);
  await page.getByRole('button', { name: 'Talebi gönder' }).click();
  await expect(page.getByText(/Talep no H-0002/)).toBeVisible();
  const r = (await db(page)).tables.legal_requests.find(x => x.no === 2);
  expect(r).toMatchObject({ role: 'tenant', property_id: 'p1', topic: 'depozito' });
  await page.getByRole('button', { name: 'Kapat' }).click();

  await page.goto(url('/uygulama/talepler'));
  await expect(page.getByText('Depozito · Moda Dairesi')).toBeVisible();
  await expect(page.getByText('Kira gecikmesi · Moda Dairesi')).toHaveCount(0);
});

test('yönetici ödemeyi işaretler ve not yazar; mülk sahibi bildirim, durum ve notu görür', async ({ page }) => {
  await login(page, 'admin@ornek.com');
  await page.getByRole('button', { name: /^Hukuki talepler/ }).click();
  await expect(page.getByText(/H-0001 · Ayşe Mülk/)).toBeVisible();
  await expect(page.getByText(/Geciken aylar:/).first()).toBeVisible();
  const card = page.locator('div').filter({ has: page.getByText(/H-0001 · Ayşe Mülk/) }).filter({ has: page.getByRole('button', { name: 'Ödeme alındı' }) }).last();
  await card.getByLabel('Kişiye not (bildirimle gider)').fill('Ödemen alındı, ihtarname hazırlanıyor.');
  await card.getByLabel('İç not (yalnız ekip görür)').fill('Av. ile görüşüldü');
  await card.getByRole('button', { name: 'Ödeme alındı' }).click();
  await expect.poll(async () => (await db(page)).tables.legal_requests.find(x => x.no === 1).status).toBe('paid');
  const d = await db(page);
  expect(d.tables.legal_requests.find(x => x.no === 1).reply).toBe('Ödemen alındı, ihtarname hazırlanıyor.');
  expect(d.tables.legal_notes[0].note).toBe('Av. ile görüşüldü');
  expect(d.tables.notifications.some(n => n.title === 'Hukuki destek H-0001: Ödemen alındı')).toBe(true);

  await login(page, 'ev@ornek.com');
  await expect(page.getByText('Moda Dairesi').first()).toBeVisible();
  await page.goto(url('/uygulama/talepler'));
  await page.getByText('Kira gecikmesi · Moda Dairesi').click();
  await expect(page.getByText('Ekibimizin notu')).toBeVisible();
  await expect(page.getByText('Ödemen alındı, ihtarname hazırlanıyor.')).toBeVisible();
  await expect(page.getByText('Ödeme alındı · ₺3.000')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Talebi iptal et' })).toHaveCount(0);   // ödeme alındıktan sonra iptal yok
});

test('kiracı inceleme başlamadan kendi talebini iptal eder', async ({ page }) => {
  await login(page, 'kiraci@ornek.com');
  await expect(page.getByText('Moda Dairesi').first()).toBeVisible();
  await page.goto(url('/uygulama/ayarlar'));
  await page.getByRole('button', { name: 'Yardım' }).click();
  await page.getByText('Hukuki süreç desteği').click();
  await page.getByRole('radio', { name: 'Tahliye' }).click();
  await page.getByLabel('Kısaca anlat').fill('Tahliye bildirimi geldi.');
  await consent(page);
  await page.getByRole('button', { name: 'Talebi gönder' }).click();
  await expect(page.getByText(/Talep no H-0002/)).toBeVisible();
  await page.getByRole('button', { name: 'Talebi iptal et' }).click();
  await page.getByRole('button', { name: 'İptal et', exact: true }).click();
  await expect.poll(async () => (await db(page)).tables.legal_requests.find(x => x.no === 2).status).toBe('cancelled');
  await expect(page.getByText('Bu talep iptal edildi.')).toBeVisible();
  expect((await db(page)).tables.legal_requests.find(x => x.no === 1).status).toBe('received');   // mülk sahibinin talebi etkilenmez
});
