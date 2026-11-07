// Site projeleri ve talep yazışması, uygulama üzerinde uçtan uca: yönetim proje ve fotoğraflı ilerleme güncellemesi ekler;
// sakin "Sitem"de projeyi, durumunu ve güncellemeyi görür; talep üzerinden iki yönlü yazışılır; çözülmüş talebe sakin yazınca
// talep yeniden açılır. Ek ödemede tutar boşken gönderilemez, gönderim onay ister.
// Sunucu kuralları gerçek Postgres'te ayrıca sınanır (site-projeler.sql, site-talep-yazisma.sql, site-tahakkuk-koruma.sql).
import { test, expect } from '@playwright/test';
import { serveDist, seed, PW, ensureDist, ID } from './app-helpers.mjs';
import { watchErrors, PNG } from './helpers.mjs';

const DIST = new URL('../app/dist-fake', import.meta.url).pathname;
const PORT = 8213;
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
  const now = new Date().toISOString();
  // Mülk sahibi hesabı Atakum Sitesi'nin master yöneticisi; kiracı A Blok No 1'in kiracısı ve bir talep açmış.
  db.tables.organizations = [{ id: 'o1', name: 'Atakum Sitesi', sector: 'site', modules: ['aidat', 'duyuru', 'gider_dagitim', 'rapor'], status: 'active', units: null, created_at: now }];
  db.tables.org_roles = [];
  db.tables.org_members = [{ org_id: 'o1', user_id: ID.landlord, role_id: null, is_master: true, created_at: now }];
  db.tables.site_units = [
    { id: 'u1', org_id: 'o1', block: 'A', no: '1', area: 100, share: 1, aidat: 1000, payer: 'kiraci', currency: 'TRY', created_at: now },
    { id: 'u2', org_id: 'o1', block: 'A', no: '2', area: 100, share: 1, aidat: 1000, payer: 'kiraci', currency: 'TRY', created_at: now }
  ];
  db.tables.site_residents = [{ id: 'r1', org_id: 'o1', unit_id: 'u1', user_id: ID.tenant, role: 'kiraci', name: 'Mehmet Kiracı', phone: '', email: 'kiraci@ornek.com', lives_here: true, code: 'S0000001', created_at: now }];
  db.tables.site_requests = [{ id: 'q1', org_id: 'o1', unit_id: 'u1', user_id: ID.tenant, cat: 'ariza', title: 'Asansör arızası', body: 'B blok asansörü durdu.', status: 0, reply: '', created_at: now, updated_at: now }];
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

test('yönetim projeyi açar ve aşama aşama (teklif, yapım, tamamlandı) fotoğraflarla ilerletir; sakin süreci görür; talepte yazışma', async ({ page }) => {
  // 1. Yönetim: projeyi açar, aşama aşama ilerletir.
  await login(page, 'ev@ornek.com');
  await expect(page).toHaveURL(/\/uygulama\/site$/);
  await page.goto(url('/uygulama/site/projeler'));
  await expect(page.getByText('Henüz proje yok. İlk projeyi ekleyerek sakinlerle paylaşabilirsin.')).toBeVisible();
  await page.getByRole('button', { name: 'Yeni proje' }).click();
  await page.getByLabel('Proje adı').fill('Dış cephe boyası');
  await page.getByLabel('Açıklama').fill('A ve B blok cephesi yenilenecek.');
  await page.getByLabel('Bütçe (₺, isteğe bağlı)').fill('450000');
  await page.getByRole('button', { name: 'Projeyi aç' }).click();
  await expect(page.getByText('Dış cephe boyası')).toBeVisible();
  await expect(page.getByText('Proje açıldı').first()).toBeVisible();
  // Aşama 2: teklif alındı (teklif fotoğrafıyla); sakinlere aşamanın adıyla bildirim gider.
  await page.getByRole('button', { name: 'Sonraki aşama: Teklif alındı' }).click();
  await expect(page.getByText('Sakinlere "Dış cephe boyası: Teklif alındı" bildirimi gider.')).toBeVisible();
  await page.getByLabel('Ne yapıldı?').fill('Üç firmadan teklif alındı.');
  let chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Fotoğraf seç' }).click();
  await (await chooser).setFiles(PNG);
  // Fotoğraf hazırlanınca (küçültme bitince) seçim düğmesi "Değiştir" olur; ondan önce gönderilirse fotoğrafsız gider.
  await expect(page.getByRole('button', { name: 'Değiştir' })).toBeVisible();
  await page.getByRole('button', { name: 'Aşamayı ilerlet ve paylaş' }).click();
  await expect(page.getByText('Üç firmadan teklif alındı.')).toBeVisible();
  // Aşama 3: yapıma başlandı, %40.
  await page.getByRole('button', { name: 'Sonraki aşama: Yapıma başlandı' }).click();
  await page.getByLabel('Ne yapıldı?').fill('İskele kuruldu.');
  await page.getByLabel('Yeni ilerleme (%, isteğe bağlı)').fill('40');
  await page.getByRole('button', { name: 'Aşamayı ilerlet ve paylaş' }).click();
  await expect(page.getByText('İskele kuruldu.')).toBeVisible();
  await expect(page.getByText('%40').first()).toBeVisible();
  // Düzenleme aşamayı değiştirmez (aşama alanı yok); sonraki aşama düğmesi tamamlamaya götürür.
  await expect(page.getByRole('button', { name: 'Sonraki aşama: Tamamlandı' })).toBeVisible();
  let d = await db(page);
  expect(d.tables.site_projects[0]).toMatchObject({ title: 'Dış cephe boyası', status: 'yapim', progress: 40, budget: 450000 });
  expect(d.tables.site_project_updates.map((u) => u.status).sort()).toEqual(['teklif', 'yapim']);
  expect(d.tables.site_project_updates.find((u) => u.status === 'teklif').photos).toEqual([expect.stringMatching(/^site-o1\//)]);
  // Aşama 4: tamamlandı (fotoğrafla); yüzde 100 olur, proje "Tamamlanan" süzgecine geçer.
  await page.getByRole('button', { name: 'Sonraki aşama: Tamamlandı' }).click();
  await page.getByLabel('Ne yapıldı?').fill('Cephe tamamlandı, iskele söküldü.');
  chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Fotoğraf seç' }).click();
  await (await chooser).setFiles(PNG);
  await expect(page.getByRole('button', { name: 'Değiştir' })).toBeVisible();
  await page.getByRole('button', { name: 'Aşamayı ilerlet ve paylaş' }).click();
  await expect(page.getByText('Bu filtrede proje yok.')).toBeVisible();
  await page.getByRole('checkbox', { name: 'Tamamlanan' }).click();
  await expect(page.getByText('Cephe tamamlandı, iskele söküldü.')).toBeVisible();
  d = await db(page);
  expect(d.tables.site_projects[0]).toMatchObject({ status: 'tamam', progress: 100 });

  // 2. Yönetim talebe yazar (talep kartında sakinin adı görünür).
  await page.goto(url('/uygulama/site/talepler'));
  await expect(page.getByText('Mehmet Kiracı').first()).toBeVisible();
  await page.getByLabel('Sakine yaz').fill('Teknik ekip yarın gelecek.');
  await page.getByRole('button', { name: 'Mesaj gönder', exact: true }).click();
  await expect(page.getByText('Teknik ekip yarın gelecek.')).toBeVisible();
  await page.getByRole('checkbox', { name: 'Çözüldü' }).click();
  await page.getByRole('button', { name: 'Kaydet' }).click();
  await expect(page.getByText('Kaydedildi; sakine bildirim gitti.')).toBeVisible();

  // 3. Sakin: projeyi ve güncellemeyi görür; yönetimin mesajını görür, cevap yazar; çözülmüş talep yeniden açılır.
  await login(page, 'kiraci@ornek.com');
  await page.goto(url('/uygulama/sitem'));
  await expect(page.getByText('Site projeleri')).toBeVisible();
  await expect(page.getByText('Dış cephe boyası')).toBeVisible();
  await expect(page.getByText('Cephe tamamlandı, iskele söküldü.')).toBeVisible();
  await expect(page.getByText('Üç firmadan teklif alındı.')).toBeVisible();                  // son üç güncelleme görünür
  await expect(page.getByRole('button', { name: 'Güncelleme ekle' })).toHaveCount(0);       // sakin yalnız izler
  await expect(page.getByRole('button', { name: /Sonraki aşama/ })).toHaveCount(0);
  await expect(page.getByText('Teknik ekip yarın gelecek.')).toBeVisible();
  await page.getByLabel('Yönetime yaz').fill('Hâlâ çalışmıyor.');
  await page.getByRole('button', { name: 'Mesaj gönder', exact: true }).click();
  await expect(page.getByText('Hâlâ çalışmıyor.')).toBeVisible();
  d = await db(page);
  expect(d.tables.site_request_messages.map((m) => [m.from_mgmt, m.body])).toEqual([[true, 'Teknik ekip yarın gelecek.'], [false, 'Hâlâ çalışmıyor.']]);
  expect(d.tables.site_requests[0].status).toBe(2);
});

test('ek ödeme: tutar boşken gönderilemez; gönderim özet ve onay ister; sonra form temizlenir', async ({ page }) => {
  await login(page, 'ev@ornek.com');
  await expect(page).toHaveURL(/\/uygulama\/site$/);
  await page.goto(url('/uygulama/site/tahakkuk'));
  await page.getByRole('button', { name: 'Ek ödeme iste' }).click();                         // otomatik aidat kapalı: tür "Aidat" açılır
  await expect(page.getByRole('checkbox', { name: 'Dairenin aidatı' })).toBeChecked();
  await page.getByRole('checkbox', { name: 'Özel toplama' }).click();
  await expect(page.getByRole('checkbox', { name: 'Her daireye aynı tutar' })).toBeChecked();   // ek ödemede dağıtım da değişir
  await page.getByLabel('Başlık').fill('Çatı onarımı');
  await expect(page.getByText('Tutar yaz.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ödemeyi iste' })).toBeDisabled();
  await page.getByLabel('Daire başına tutar (₺)').fill('250');
  await page.getByRole('button', { name: 'Ödemeyi iste' }).click();
  await expect(page.getByText('2 daireye toplam ₺500 yazılacak ve sakinlere bildirim gidecek. Onaylıyor musun?')).toBeVisible();
  expect((await db(page)).tables.site_charges || []).toEqual([]);                            // onaylanmadan yazılmaz
  await page.getByRole('button', { name: 'Onayla ve gönder' }).click();
  await expect(page.getByText('2 daireye eklendi.')).toBeVisible();
  await expect(page.getByLabel('Daire başına tutar (₺)')).toHaveValue('');
  expect((await db(page)).tables.site_charges.map((x) => x.amount)).toEqual([250, 250]);
});
