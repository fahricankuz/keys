// Paketler ve satın alma sayfası: mülk başına fiyat (KDV dahil), Başlangıç/Portföy 1-9 mülk, Kurumsal 10+ (öne çıkan kutu),
// satın alma sayfasında mülk adedi +/− ve Portföy yükseltme önerisi, mülk sınırı uyarısı, SMS kilidi.
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { serveDist, seed, PW, ensureDist, ID } from './app-helpers.mjs';
import { watchErrors } from './helpers.mjs';

const DIST = new URL('../app/dist-fake', import.meta.url).pathname;
const PORT = 8210;
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
  await page.addInitScript((d) => { if (!localStorage.getItem('__fakedb')) localStorage.setItem('__fakedb', JSON.stringify(d)); }, seed());
});
test.afterEach(() => { expect(errors).toEqual([]); });

const url = (p) => `http://localhost:${PORT}${p}`;
const db = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('__fakedb')));
const card = (page, name) => page.locator('div').filter({ has: page.getByText(name, { exact: true }) }).filter({ has: page.getByRole('button', { name: /Paketi seç|Bize ulaşın/ }) }).last();

test('ana sayfa fiyatları: mülk başına, KDV dahil, Başlangıç ve Portföy 1-9 mülk; seçici ve 3 mülk toplamı yok', async ({ page }) => {
  await page.goto(url('/'));
  await expect(page.getByText('Kiracılar için ücretsiz. Mülk sahibi mülkü kadar öder.')).toBeVisible();
  await expect(page.getByText('₺99,99').first()).toBeVisible();
  await expect(page.getByText('₺199,99').first()).toBeVisible();
  await expect(page.getByText('/ mülk / ay').first()).toBeVisible();
  await expect(page.getByText('KDV dahil').first()).toBeVisible();
  await expect(page.getByText('1-9 mülk', { exact: true })).toHaveCount(2);
  await expect(page.getByText('10 ve üstü mülk', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Kaç mülkün var?')).toHaveCount(0);
  await expect(page.getByText(/3 mülk için/)).toHaveCount(0);
  // Kurumsal: aynı açık kart tasarımı + "10+" ve sektör vurgusu; teklif usulü.
  await expect(page.getByText('10+', { exact: true })).toBeVisible();
  for (const x of ['Site yönetimi', 'AVM', 'GYO', 'Depo ve lojistik', 'Emlak ofisi', 'Family office']) await expect(page.getByText(x, { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Teklif alın', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Bize ulaşın' }).first()).toBeVisible();
  // SMS yalnız Portföy maddelerinde (Kurumsal "Portföy'deki her şey" der); Başlangıç listesinde yok.
  expect(await page.getByText('SMS hatırlatmaları', { exact: true }).count()).toBe(1);
  // Yıllık: aylığın 10 katı ve mülk başına aylık karşılığı.
  await page.getByRole('tab', { name: /Yıllık/ }).click();
  await expect(page.getByText('₺999,90').first()).toBeVisible();
  await expect(page.getByText('₺1.999,90').first()).toBeVisible();
  await expect(page.getByText('mülk başına aylık ₺83,33’ye denk gelir')).toBeVisible();
  await expect(page.getByText('mülk başına aylık ₺166,66’ye denk gelir')).toBeVisible();
});

test('"Paketi seç" satın alma sayfasını açar; mülk adedi +/− ile 1-9 arasında değişir, toplam anında güncellenir', async ({ page }) => {
  await page.goto(url('/'));
  await page.getByRole('button', { name: 'Paketi seç' }).first().click();
  await expect(page).toHaveURL(/\/satin-al\?plan=tek&donem=aylik/);
  await expect(page.getByText('Kaç mülkün var?')).toBeVisible();
  const total = (t) => expect(page.getByText(t, { exact: true }).first()).toBeVisible();
  await total('₺99,99');                                     // 1 mülk
  await expect(page.getByRole('button', { name: 'Mülk sayısını azalt' })).toBeDisabled();
  await page.getByRole('button', { name: 'Mülk sayısını artır' }).click();
  await total('₺199,98');                                    // 2 × 99,99
  for (let i = 0; i < 7; i++) await page.getByRole('button', { name: 'Mülk sayısını artır' }).click();
  await total('₺899,91');                                    // 9 × 99,99
  await expect(page.getByRole('button', { name: 'Mülk sayısını artır' })).toBeDisabled();
  await expect(page.getByText(/9 mülk bu paketlerde en fazla/)).toBeVisible();
  // Yıllık dönem: 9 × 999,90
  await page.getByRole('radio', { name: /^Yıllık/ }).click();
  await total('₺8.999,10');
  await expect(page.getByText('aylık ₺749,93’ye denk gelir')).toBeVisible();
  // 10+ için Kurumsal bağlantısı.
  await page.getByRole('link', { name: 'bize ulaşın' }).click();
  await expect(page).toHaveURL(/\/kurumsal/);
});

test('Başlangıç seçiliyken Portföy önerisi: aynı mülk adedi için fark gösterilir; "Portföy\'e geç" paketi değiştirir ve öneri kaybolur', async ({ page }) => {
  await page.goto(url('/satin-al?plan=tek&donem=aylik&adet=3'));
  await expect(page.getByText('₺299,97', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Portföy ile ekibini, raporunu ve SMS’ini aç')).toBeVisible();
  await expect(page.getByText('Aynı 3 mülk için ayda yalnızca ₺300,00 daha.')).toBeVisible();   // 3 × (199,99 − 99,99)
  for (const x of ['Ekip üyeleri: emlakçı, muhasebeci, personel', 'Excel / CSV ile toplu mülk aktarma', 'Net getiri, yıllık rapor ve vergi tahmini']) await expect(page.getByText(x).first()).toBeVisible();
  await page.getByRole('button', { name: 'Portföy’e geç' }).click();
  await expect(page.getByText('₺599,97', { exact: true }).first()).toBeVisible();              // 3 × 199,99
  await expect(page.getByText('Portföy ile ekibini, raporunu ve SMS’ini aç')).toHaveCount(0);
  await expect(page.getByText('Portföy paketinde neler var?')).toBeVisible();
  await expect(page.getByText('SMS hatırlatmaları', { exact: true }).first()).toBeVisible();
  // Yıllıkta öneri farkı yıllık yazılır.
  await page.goto(url('/satin-al?plan=tek&donem=yillik&adet=2'));
  await expect(page.getByText('Aynı 2 mülk için yılda yalnızca ₺2.000,00 daha.')).toBeVisible();
});

test('abonelik başlatma: çıkış yapmışsa mülk sahibi kaydına gider ve seçim saklanır; mülk sahibi oturumunda ödeme-güncelleme bilgisi çıkar; kiracıya uyarı', async ({ page }) => {
  await page.goto(url('/satin-al?plan=bes&adet=4'));
  await expect(page.getByText('Portföy', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('1 ay ücretsiz · bugün ödeme yok')).toBeVisible();
  await expect(page.getByText(/Çekimden 1 gün önce e-posta ve bildirimle hatırlatırız/)).toBeVisible();
  await page.getByRole('button', { name: '1 ay ücretsiz başla' }).click();
  await expect(page).toHaveURL(/\/kayit\/mulk-sahibi/);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('anahtar-paket-secimi')))).toEqual({ plan: 'bes', units: 4, yearly: false });
  // Mülk sahibi oturumu
  await page.goto(url('/giris/mulk-sahibi'));
  await page.getByLabel('E-posta').fill('ev@ornek.com');
  await page.getByLabel('Şifre', { exact: true }).fill(PW);
  await page.getByRole('button', { name: 'Giriş yap' }).click();
  await expect(page).toHaveURL(/\/uygulama/);
  await page.goto(url('/satin-al?plan=tek&adet=2'));
  await page.getByRole('button', { name: '1 ay ücretsiz başla' }).click();
  await expect(page.getByText('Ödeme sistemimizi güncelliyoruz').last()).toBeVisible();
  await expect(page.getByText('Başlangıç, 2 mülk', { exact: false })).toBeVisible();
});

test('İngilizce: dolar fiyatlar, çeviri eksiği yok; ana sayfa fiyatları ve satın alma sayfası erişilebilir (axe)', async ({ page }) => {
  test.setTimeout(120_000);
  await page.addInitScript(() => { localStorage.setItem('evim-tercih', JSON.stringify({ lang: 'en' })); });
  const missing = new Set();
  const sweep = async () => { await page.waitForTimeout(700); (await page.evaluate(() => [...(globalThis.__i18nMissing || [])])).forEach((x) => missing.add(x)); };
  const axe = async (name) => {
    const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(r.violations.map((v) => `${name}: ${v.id} (${v.nodes.length})`)).toEqual([]);
  };
  await page.goto(url('/')); await sweep();
  await expect(page.getByText('$2.00').first()).toBeVisible();
  await expect(page.getByText('$4.00').first()).toBeVisible();
  await expect(page.getByText('/ property / month').first()).toBeVisible();
  await expect(page.getByText('VAT included').first()).toBeVisible();
  await axe('ana sayfa');
  await page.goto(url('/satin-al?plan=tek&adet=3')); await sweep();
  await expect(page.getByText('$6.00', { exact: true }).first()).toBeVisible();                       // 3 × $2.00
  await expect(page.getByText('For the same 3 properties it is only $6.00 more per month.')).toBeVisible();
  await axe('satın alma');
  await page.getByRole('radio', { name: /^Annual/ }).click();
  await expect(page.getByText('$60.00', { exact: true }).first()).toBeVisible();                      // 3 × $20.00
  await sweep();
  expect([...missing]).toEqual([]);
});

test('mülk sınırı: Başlangıç 1 mülk satın alındıysa ikinci mülk eklenemez ve adedi artırma önerilir; SMS ayarı Başlangıç\'ta kilitli', async ({ page }) => {
  // Mülk sahibinin ücretli aboneliği: tek_1_aylik (1 mülk); p1 zaten var.
  await page.addInitScript((id) => {
    const d = JSON.parse(localStorage.getItem('__fakedb'));
    d.tables.subscriptions = [{ user_id: id, entitlement: 'pro', product_id: 'tek_1_aylik', store: 'app_store', period_type: 'normal', expires_at: new Date(Date.now() + 20 * 864e5).toISOString(), active: true, will_renew: true }];
    localStorage.setItem('__fakedb', JSON.stringify(d));
  }, ID.landlord);
  await page.goto(url('/giris/mulk-sahibi'));
  await page.getByLabel('E-posta').fill('ev@ornek.com');
  await page.getByLabel('Şifre', { exact: true }).fill(PW);
  await page.getByRole('button', { name: 'Giriş yap' }).click();
  await expect(page).toHaveURL(/\/uygulama/);
  await expect(page.getByText('Moda Dairesi').first()).toBeVisible();
  // SMS ayarı kilitli (Başlangıç).
  await page.goto(url('/uygulama/ayarlar'));
  await page.getByRole('button', { name: 'Bildirimler', exact: true }).click();
  await expect(page.getByText('Portföy’e özel')).toBeVisible();
  // İkinci mülk: sınır uyarısı ve adet artırma.
  await page.goto(url('/uygulama'));
  await page.getByRole('button', { name: /Mülk ekle/ }).first().click();
  await expect(page.getByText('Mülk adedini artır').first()).toBeVisible();
  await expect(page.getByText(/Başlangıç paketin en fazla 1 mülk içeriyor/)).toBeVisible();
  await page.getByRole('button', { name: 'Mülk adedini 2 yap' }).click();
  await expect(page).toHaveURL(/\/satin-al\?plan=tek&donem=aylik&adet=2/);
  await expect(page.getByText('₺199,98', { exact: true }).first()).toBeVisible();
});
