// Site yönetimi (kurumsal yol planı Faz 2), uygulama üzerinde uçtan uca: yönetim daireleri toplu ekler, kiracıyı
// davet eder, aidat tahakkuk eder, duyuru yapar, gideri arsa payına göre dağıtır; kiracı davet bağlantısıyla bağlanır,
// "Sitem"de yalnız kendi dairesini görür, dekont yükler ve talep açar; yönetim onaylar ve yanıtlar.
// Sunucu kuralları gerçek Postgres'te ayrıca sınanır (site.sql.spec.mjs).
import { test, expect } from '@playwright/test';
import { serveDist, seed, PW, ensureDist, ID , pickRole } from './app-helpers.mjs';
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
  await pickRole(page);
}
/** Tarayıcı Europe/Istanbul saatinde çalışır (playwright.config); beklenen ay ve günler de o saat dilimiyle hesaplanır. */
const istDay = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(d);
const month = istDay().slice(0, 7);

test('site yönetimi ve sakin: daireler, davet, tahakkuk, duyuru, dekont, talep, onay ve gider dağıtımı', async ({ page }) => {
  // 1. Yönetim: daireleri toplu ekler, kiracı ekler, aidat tahakkuk eder, duyuru yapar.
  await login(page, 'ev@ornek.com');
  await expect(page).toHaveURL(/\/uygulama\/site$/);            // kurum yöneticisi girişte kendi panelinde açılır
  await page.getByRole('link', { name: 'Daireler', exact: true }).first().click();
  await page.getByRole('button', { name: 'Toplu ekle' }).click();
  // Şablon indirilir; doldurulan dosya yüklenir: hatalı satır (m² yok) eklenmez, e-postası olan malike davet kendiliğinden gider.
  const dl = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Şablonu indir (Excel)' }).click();
  expect((await dl).suggestedFilename()).toBe('anahtar-daire-sablonu.xlsx');
  const csv = 'Blok;Daire no;m²;Arsa payı;Aylık aidat (₺);Malik adı;Malik telefonu;Malik e-posta\nA;1;120;2;1500;Ali Malik;05320000000;\nA;2;80;1;1000;Veli Malik;;veli@ornek.com\nA;3;;1;1000;Eksik Metrekare;;';
  const pick = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Dosyayı yükle' }).click();
  await (await pick).setFiles({ name: 'daireler.csv', mimeType: 'text/csv', buffer: Buffer.from(csv, 'utf8') });
  await expect(page.getByText(/3 satır · 2 hazır · 1 hatalı/)).toBeVisible();
  await expect(page.getByText(/Satır 4: m² eksik ya da hatalı/)).toBeVisible();
  await page.getByRole('button', { name: '2 daireyi ekle' }).click();
  await expect(page.getByText(/2 daire eklendi\. 2 kişi eklendi\. 1 kişiye davet e-postası gönderildi\./)).toBeVisible();
  await expect(page.getByText('Ali Malik')).toBeVisible();
  const veli = (await db(page)).tables.site_residents.find((r) => r.name === 'Veli Malik');
  expect(veli.email).toBe('veli@ornek.com');
  await expect.poll(async () => (await db(page)).invokedBodies || []).toContainEqual({ name: 'site-invite', body: { resident: veli.id } });
  // Kişi ekle → Davet gönder: e-posta fonksiyonu çağrılır, WhatsApp hazır mesajla (bağlantı ve kod) açılır.
  await page.getByRole('button', { name: /^A Blok No 1 · / }).click();            // satır dokununca açılır
  await page.getByRole('button', { name: 'Kişi ekle' }).first().click();
  await page.getByLabel('Ad soyad').fill('Mehmet Kiracı');
  await page.getByLabel('Telefon', { exact: true }).fill('0532 123 45 67');
  await page.getByLabel('E-posta (isteğe bağlı)').fill('mehmet@ornek.com');
  await page.context().route('https://wa.me/**', (r) => r.fulfill({ body: 'WhatsApp' }));   // dış ağa çıkılmaz
  const popup = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Davet gönder' }).click();
  const wa = await popup;
  await expect(page.getByText('Davet hazır')).toBeVisible();
  const kiraci = (await db(page)).tables.site_residents.find(r => r.role === 'kiraci');
  const code = kiraci.code;
  await expect.poll(() => wa.url()).toContain('wa.me/905321234567');
  expect(decodeURIComponent(wa.url())).toContain('katil?kod=' + code);
  await wa.close();
  await expect.poll(async () => (await db(page)).invokedBodies || []).toContainEqual({ name: 'site-invite', body: { resident: kiraci.id } });
  await expect.poll(async () => !!(await db(page)).tables.site_residents.find(r => r.id === kiraci.id).invited_at).toBe(true);
  await page.getByRole('button', { name: 'Tamam' }).click();
  await expect(page.getByText('Mehmet Kiracı')).toBeVisible();
  await expect(page.getByText('Davet gönderildi')).toBeVisible();

  await page.getByRole('link', { name: 'Aidat', exact: true }).first().click();
  await page.getByRole('button', { name: 'Ek ödeme iste' }).click();        // otomatik aidat kapalıyken aidat da buradan istenir
  await expect(page.getByText('2 daireye toplam ₺2.500')).toBeVisible();
  await page.getByRole('button', { name: 'Ödemeyi iste' }).click();
  // Toplu ödeme istemeden önce özet ve onay (migration site_tahakkuk_koruma ile gelen düzeltme).
  await expect(page.getByText('2 daireye toplam ₺2.500 yazılacak ve sakinlere bildirim gidecek. Onaylıyor musun?')).toBeVisible();
  await page.getByRole('button', { name: 'Onayla ve gönder' }).click();
  await expect(page.getByText('2 daireye eklendi.')).toBeVisible();
  await page.getByRole('link', { name: 'Duyurular', exact: true }).first().click();
  await page.getByLabel('Başlık').fill('Su kesintisi');
  await page.getByLabel('Duyuru metni').fill('Yarın 10-14 arası su kesilecek.');
  await page.getByRole('button', { name: 'Duyur', exact: true }).click();
  await expect(page.getByText('Yarın 10-14 arası su kesilecek.')).toBeVisible();

  // Davet bağlantısı oturumsuz açılınca yalnız site, daire ve maskeli ad görünür (telefon ve e-posta sunucudan çıkmaz); kayıt formu önceden doldurulmaz.
  await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('__fakedb')); d.session = null; localStorage.setItem('__fakedb', JSON.stringify(d)); });
  await page.goto(url('/katil?kod=' + code));
  await expect(page.getByText('Atakum Sitesi · A Blok No 1')).toBeVisible();
  await page.getByRole('button', { name: 'Ücretsiz hesap oluştur' }).click();
  await expect(page.getByText('M*** K***')).toBeVisible();
  await expect(page.getByText('Bu davet bir e-posta adresine özel')).toBeVisible();
  await expect(page.getByLabel('Ad soyad')).toHaveValue('');
  await expect(page.getByLabel('E-posta')).toHaveValue('');
  await expect(page.getByLabel('Telefon (isteğe bağlı)')).toHaveValue('');
  await expect(page.getByLabel('Davet kodu')).toHaveValue(code);

  // Davet e-postaya bağlıdır: yönetim kişinin e-postasını bu hesabın e-postasıyla düzeltince hesap kabul edebilir.
  await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('__fakedb')); d.tables.site_residents.forEach((r) => { if (r.email === 'mehmet@ornek.com') r.email = 'kiraci@ornek.com'; }); localStorage.setItem('__fakedb', JSON.stringify(d)); });
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
  await page.getByRole('button', { name: 'Dosya seç' }).first().click();         // ikincisi Belgeler bölümünde
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
  await expect(page).toHaveURL(/\/uygulama\/site$/);            // kurum yöneticisi girişte kendi panelinde açılır
  await page.goto(url('/uygulama/site'));
  await expect(page.getByText('Onay bekleyen dekontlar')).toBeVisible();
  await page.getByRole('button', { name: 'Onayla', exact: true }).click();
  await expect.poll(async () => (await db(page)).tables.site_charges.find(x => x.id === ch.id).status).toBe('paid');
  await page.getByRole('link', { name: 'Talepler', exact: true }).first().click();
  await page.getByRole('checkbox', { name: 'Çözüldü' }).click();
  await page.getByLabel('Yanıt').fill('Daire için aidatı malik ödeyecek.');
  await page.getByRole('button', { name: 'Kaydet' }).click();
  await expect.poll(async () => (await db(page)).tables.site_requests[0].status).toBe(3);
  await page.getByRole('link', { name: 'Giderler', exact: true }).first().click();
  // Sitede gider kategoriyle girilir; dairelere yazmak istisnadır ("Ek toplama yap", onayla).
  await page.getByRole('button', { name: 'Onarım ve tadilat', exact: true }).click();
  await page.getByLabel('Tutar (₺)').fill('3000');
  await page.getByLabel('Not (isteğe bağlı)').fill('Çatı onarımı');
  await page.getByRole('button', { name: 'Gideri ekle' }).click();
  await page.getByRole('button', { name: 'Ek toplama yap' }).click();
  await expect(page.getByText('Ek toplama yapılsın mı?')).toBeVisible();          // onay penceresi
  await page.getByRole('button', { name: 'Ek toplama yap' }).last().click();
  await expect(page.getByLabel('Başlık')).toHaveValue('Çatı onarımı');
  await expect(page.getByText('2 daireye toplam ₺3.000')).toBeVisible();
  await page.getByRole('button', { name: 'Ödemeyi iste' }).click();
  await page.getByRole('button', { name: 'Onayla ve gönder' }).click();
  await expect(page.getByText('2 daireye eklendi.')).toBeVisible();
  await expect(page.getByLabel('Başlık')).toHaveValue('');                         // aynı ödeme ikinci kez istenmesin
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
  await expect(page).toHaveURL(/\/uygulama\/site$/);            // kurum yöneticisi girişte kendi panelinde açılır
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
  await expect(page).toHaveURL(/\/uygulama\/site$/);            // kurum yöneticisi girişte kendi panelinde açılır
  await page.goto(url('/uygulama/site'));
  await page.getByRole('link', { name: 'Daireler', exact: true }).first().click();
  await page.getByRole('button', { name: /^A Blok No 1 · / }).click();
  await expect(page.getByText('Ev sahibi üzerinden')).toBeVisible();              // kiracı ev sahibinin anahtar hesabı üzerinden bağlı
  await page.getByRole('link', { name: 'Projeler', exact: true }).first().click();               // işletme projesi artık Projeler'de
  await page.getByRole('button', { name: /işletme projesi aç$/ }).first().click();
  await page.getByRole('button', { name: 'Asansör', exact: true }).first().click();       // kalem gider kategorilerinden seçilir
  await page.getByLabel('Yıllık tutar (₺)').fill('48000');
  await page.getByRole('button', { name: 'Kalem ekle' }).click();
  await page.getByRole('button', { name: 'Temizlik', exact: true }).last().click();
  await page.getByLabel('Yıllık tutar (₺)').last().fill('72000');
  await page.getByRole('button', { name: 'Kaydet' }).click();
  await expect(page.getByText('₺10.000').first()).toBeVisible();                           // aylık aidat toplamı: 120.000 / 12
  await expect(page.getByText('Taslak').first()).toBeVisible();
  await page.getByRole('button', { name: 'Genel kurulda onaylandı olarak işaretle' }).click();
  await page.getByRole('button', { name: 'Daire aidatlarını güncelle ve yürürlüğe al' }).click();
  await expect.poll(async () => (await db(page)).tables.site_units[0].aidat).toBe(10000);
  await expect(page.getByText('Aidatlar güncellendi; işletme projesi yürürlükte.')).toBeVisible();
  await page.getByRole('link', { name: 'Rapor', exact: true }).first().click();
  await expect(page.getByText(/yönetim raporu$/).first()).toBeVisible();
  await expect(page.getByText('Borçlu daireler')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Yazdır / PDF' })).toBeVisible();
});

test('genel kurul: yönetim çağırır ve paketi açar, yoklama açar; malik katılım bildirir ve oy verir; sonuç arsa payıyla', async ({ page }) => {
  await page.addInitScript(([T]) => {
    const d = JSON.parse(localStorage.getItem('__fakedb'));
    if (!d || (d.tables.site_units || []).length) return;
    const at = new Date().toISOString();
    d.tables.site_units = [{ id: 'u1', org_id: 'o1', block: 'A', no: '1', share: 3, payer: 'kiraci', created_at: at }, { id: 'u2', org_id: 'o1', block: 'A', no: '2', share: 1, payer: 'kiraci', created_at: at }];
    d.tables.site_residents = [{ id: 'r1', org_id: 'o1', unit_id: 'u1', user_id: T, role: 'malik', name: 'Ayşe Malik', code: 'S1111111', created_at: at },
      { id: 'r2', org_id: 'o1', unit_id: 'u2', user_id: null, role: 'malik', name: 'Veli Malik', code: 'S2222222', created_at: at }];
    localStorage.setItem('__fakedb', JSON.stringify(d));
  }, [ID.tenant]);
  const later = istDay(new Date(Date.now() + 30 * 86400000));
  await login(page, 'ev@ornek.com');
  await expect(page).toHaveURL(/\/uygulama\/site$/);
  await page.getByRole('link', { name: 'Genel kurul', exact: true }).first().click();
  await expect(page.getByText(/bağlayıcı değildir/).first()).toBeVisible();
  await page.getByRole('button', { name: 'Yeni genel kurul çağrısı' }).click();     // form düğmeyle açılır
  await page.getByLabel('Tarih', { exact: true }).fill(later);
  await page.getByLabel('Yer', { exact: true }).fill('Kapalı otopark');
  await page.getByRole('button', { name: 'Çağrıyı yayınla' }).click();
  await expect(page.getByText('Katılacak 0 · Vekâlet 0 · Katılmayacak 0 · Yanıtsız 2')).toBeVisible();
  const popup = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Toplantı paketi' }).click();
  const pack = await popup;
  await expect(pack.getByRole('heading', { name: 'Hazirun cetveli' })).toBeVisible();
  await expect(pack.getByText('Ayşe Malik')).toBeVisible();
  await expect(pack.getByText('Kapalı otopark')).toBeVisible();
  await pack.close();

  await page.getByRole('button', { name: 'Görüş yoklaması aç' }).click();
  await page.getByLabel('Soru').fill('Çatı yalıtımı yapılsın mı?');
  await page.getByLabel('Bitiş tarihi').fill(later);
  await page.getByRole('switch', { name: 'Arsa payıyla ağırlıklı sonuç' }).click();
  await page.getByRole('button', { name: 'Yoklamayı aç' }).click();
  await expect(page.getByText('Katılım: 0/2 daire · arsa payı 0/4')).toBeVisible();

  // Malik (kiracı hesabıyla giriş yapan kişi A1'in maliki) katılım bildirir ve oy verir.
  await login(page, 'kiraci@ornek.com');
  await page.goto(url('/uygulama/sitem'));
  await expect(page.getByText('Genel kurul ve yoklamalar')).toBeVisible();
  await page.getByRole('checkbox', { name: 'Katılacağım' }).click();
  await expect.poll(async () => (await db(page)).tables.site_meeting_replies.map((r) => r.answer)).toEqual(['katilacak']);
  await page.getByRole('checkbox', { name: 'Evet', exact: true }).click();
  await expect(page.getByText('Katılım: 1/2 daire · arsa payı 3/4')).toBeVisible();
  await expect(page.getByText('%100').first()).toBeVisible();

  await login(page, 'ev@ornek.com');
  await page.goto(url('/uygulama/site/genelkurul'));
  await expect(page.getByText('Katılacak 1 · Vekâlet 0 · Katılmayacak 0 · Yanıtsız 1')).toBeVisible();
  await page.getByLabel('Karar defteri notu (toplantıdan sonra)').fill('Çatı yalıtımı oy birliğiyle kabul edildi.');
  await page.getByRole('button', { name: 'Toplantı yapıldı olarak kaydet' }).click();
  await expect(page.getByText('Yapıldı')).toBeVisible();
});

test('yalnız site sakini: "Mülküne bağlan" yok; ana sayfa, ödemeler, talepler ve belgeler site ekranı; yönetim belge paylaşır', async ({ page }) => {
  await page.addInitScript(([T]) => {
    const d = JSON.parse(localStorage.getItem('__fakedb'));
    if (!d || (d.tables.site_units || []).length) return;
    const at = new Date().toISOString(), m = at.slice(0, 7);
    d.tables.memberships = d.tables.memberships.filter((x) => x.user_id !== T);           // kiracının mülkü yok, yalnız site sakini
    d.tables.site_units = [{ id: 'u1', org_id: 'o1', block: 'A', no: '1', area: 100, share: 1, aidat: 1500, payer: 'kiraci', created_at: at }];
    d.tables.site_residents = [{ id: 'r1', org_id: 'o1', unit_id: 'u1', user_id: T, role: 'kiraci', name: 'Mehmet Kiracı', code: 'S1111111', created_at: at }];
    d.tables.site_charges = [{ id: 'c1', org_id: 'o1', unit_id: 'u1', month: m, kind: 'aidat', title: '', amount: 1500, status: 'open', paid_amount: 0, created_at: at }];
    d.tables.site_documents = [{ id: 'd1', org_id: 'o1', unit_id: null, audience: 'herkes', title: '2027 işletme projesi', name: 'proje.pdf', path: 'site-o1/proje.pdf', uploaded_by: null, created_at: at }];
    localStorage.setItem('__fakedb', JSON.stringify(d));
  }, [ID.tenant]);
  await login(page, 'kiraci@ornek.com');
  await page.goto(url('/uygulama'));
  await expect(page.getByText('A Blok No 1').first()).toBeVisible();
  await expect(page.getByText('Mülküne bağlan')).toHaveCount(0);
  await expect(page.getByText('₺1.500').first()).toBeVisible();
  await page.goto(url('/uygulama/odemeler'));
  await expect(page.getByRole('heading', { name: 'Ödemeler' }).or(page.getByText('Ödemeler', { exact: true })).first()).toBeVisible();
  await expect(page.getByText('Mülküne bağlan')).toHaveCount(0);
  await page.goto(url('/uygulama/talepler'));
  await page.getByLabel('Başlık').fill('Asansör çalışmıyor');
  await page.getByRole('button', { name: 'Talebi gönder' }).click();
  await expect(page.getByText('Talebin yönetime iletildi.')).toBeVisible();
  await page.goto(url('/uygulama/mesajlar'));
  await expect(page).toHaveURL(/\/uygulama\/talepler$/);                                  // mesajlaşma yok; yönetime talep
  await page.goto(url('/uygulama/belgeler'));
  await expect(page.getByText('2027 işletme projesi')).toBeVisible();
  await page.getByLabel('Belgenin adı').fill('Kira sözleşmem');
  const pick = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Dosya seç' }).click();
  await (await pick).setFiles(PNG);
  await page.getByRole('button', { name: 'Gönder', exact: true }).click();
  await expect(page.getByText('Belgen yönetime gönderildi.')).toBeVisible();
  let d = await db(page);
  expect(d.tables.site_documents.find((x) => x.title === 'Kira sözleşmem')).toMatchObject({ audience: 'yonetim', unit_id: 'u1', org_id: 'o1' });

  // Yönetim: sakinden geleni görür, tek daireye belge paylaşır.
  await login(page, 'ev@ornek.com');
  await page.goto(url('/uygulama/site/belgeler'));
  await expect(page.getByText('Sakinlerden gelenler')).toBeVisible();
  await expect(page.getByText('Kira sözleşmem')).toBeVisible();
  await page.getByRole('button', { name: 'Belge paylaş' }).click();
  await page.getByRole('tab', { name: 'Bir daire' }).or(page.getByRole('button', { name: 'Bir daire' })).first().click();
  await page.getByLabel('Daire', { exact: true }).fill('A Blok');
  await page.getByRole('checkbox', { name: 'A Blok No 1' }).click();
  await page.getByLabel('Belgenin adı').fill('Sayaç tutanağı');
  const pick2 = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Dosya seç' }).click();
  await (await pick2).setFiles(PNG);
  await page.getByRole('button', { name: 'Paylaş', exact: true }).click();
  await expect.poll(async () => (await db(page)).tables.site_documents.find((x) => x.title === 'Sayaç tutanağı')).toMatchObject({ audience: 'daire', unit_id: 'u1' });
});
