import { test, expect } from '@playwright/test';
import { watchErrors, open, sheet, PNG } from './helpers.mjs';

let errors;
test.beforeEach(({ page }) => { errors = watchErrors(page); });
test.afterEach(() => { expect(errors).toEqual([]); });

const screen = page => page.locator('#screen');

/* ---- çoklu kiracı ---- */

test('bir evde birden fazla kiracı: liste, ekleme, çıkarma', async ({ page }) => {
  await open(page, '#/mulk-sahibi/mulk/cihangir');
  await expect(screen(page)).toContainText('Kiracılar');
  await expect(screen(page)).toContainText('[Ev arkadaşı]');

  await page.click('button:has-text("Kiracı ekle")');
  await sheet(page).locator('input[name=name]').fill('Yeni Oda Arkadaşı');
  await sheet(page).locator('input[name=email]').fill('oda@ornek.com');
  await sheet(page).locator('button:has-text("Ekle ve davet et")').click();
  // Davet paylaşım sayfası açılır: kod, bağlantı, WhatsApp ve e-posta.
  await expect(sheet(page)).toContainText('Kiracını davet et');
  await expect(sheet(page).locator('.codebox')).toHaveText(/^DEMO\d{4}$/);
  await expect(sheet(page).locator('#inviteLink')).toHaveValue(/#\/katil\/DEMO\d{4}$/);
  await page.keyboard.press('Escape');
  await expect(screen(page)).toContainText('Yeni Oda Arkadaşı');

  await page.click('[aria-label="Yeni Oda Arkadaşı kiracısını çıkar"]');
  await page.locator('#confirm button:has-text("Çıkar")').click();
  await expect(screen(page)).not.toContainText('Yeni Oda Arkadaşı');
});

test('ev arkadaşlarının mesajlarında gönderen adı görünür', async ({ page }) => {
  await open(page, '#/mulk-sahibi/mulk/cihangir/mesaj');
  await expect(page.locator('.bub.them .who').first()).toBeVisible();
  await expect(screen(page)).toContainText('[Ev arkadaşı]');
});

/* ---- kira tutarı geçmişi ---- */

test('yenileme kabul edilince kira geçmişine gelecek tarihli dönem eklenir', async ({ page }) => {
  await open(page, '#/mulk-sahibi/mulk/moda/odeme?s=yenileme');
  await page.fill('[data-input=cpi]', '40');
  await page.click('button:has-text("Teklifi kiracıya gönder")');
  await open(page, '#/kiraci/odemeler');
  await page.click('button:has-text("Kabul et")');
  const card = page.locator('section:has(h2:text("Kira tutarı geçmişi"))');
  await expect(card).toContainText('₺45.500');
  await expect(card).toContainText('itibarıyla');
  await expect(card).toContainText('+%40');
  // Bugünkü kira henüz değişmedi.
  await expect(page.locator('#screen .hero .big')).toHaveText('₺32.500');
});

test('elle kira değişikliği geçmişe bugünden itibaren yazılır', async ({ page }) => {
  await open(page, '#/mulk-sahibi/mulk/atasehir?s=ev-duzenle');
  await sheet(page).locator('input[name=rent]').fill('30000');
  await sheet(page).locator('button:has-text("Kaydet")').click();
  await open(page, '#/mulk-sahibi/mulk/atasehir/odeme');
  const card = page.locator('section:has(h2:text("Kira tutarı geçmişi"))');
  await expect(card).toContainText('₺30.000');
  await expect(card).toContainText('Elle güncellendi');
});

test('süresi dolan sözleşme bir yıl uzar ve yeni kira devreye girer', async ({ page }) => {
  await open(page, '#/mulk-sahibi');
  const r = await page.evaluate(async () => {
    const st = await import('./assets/js/state.js');
    const lg = await import('./assets/js/logic.js');
    const p = st.S.props.moda;
    const past = new Date(); past.setDate(past.getDate() - 3);
    const iso = past.toISOString().slice(0, 10);
    p.contractEnd = iso;
    p.rentHistory.push({ from: iso, amount: 40000, note:'test' });
    lg.normalize(p);
    return { end: p.contractEnd, rent: p.rent, next: String(past.getFullYear() + 1) };
  });
  expect(r.end.startsWith(r.next)).toBe(true);
  expect(r.rent).toBe(40000);
});

/* ---- gider defteri ---- */

test('gider ekle, düzenle, sil; net getiri güncellenir', async ({ page }) => {
  await open(page, '#/mulk-sahibi/mulk/atasehir/gider');
  const net0 = await page.locator('#screen .hero .big').innerText();

  await page.click('button:has-text("Gider ekle")');
  await sheet(page).locator('select[name=cat]').selectOption('Tamir ve bakım');
  await sheet(page).locator('input[name=amount]').fill('5000');
  await sheet(page).locator('input[name=note]').fill('Musluk değişimi');
  await sheet(page).locator('button:has-text("Kaydet")').click();
  await expect(screen(page)).toContainText('Musluk değişimi');
  await expect(page.locator('#screen .hero .big')).not.toHaveText(net0);

  await page.click('.li:has-text("Musluk değişimi")');
  await sheet(page).locator('input[name=amount]').fill('6000');
  await sheet(page).locator('button:has-text("Kaydet")').click();
  await expect(page.locator('.li:has-text("Musluk değişimi")')).toContainText('₺6.000');

  await page.click('.li:has-text("Musluk değişimi")');
  await sheet(page).locator('button:has-text("Gideri sil")').click();
  await page.locator('#confirm button:has-text("Sil")').click();
  await expect(screen(page)).not.toContainText('Musluk değişimi');
  await expect(page.locator('#screen .hero .big')).toHaveText(net0);
});

/* ---- usta ve teklifler ---- */

test('teklif ekle, seç; fatura gider defterine işlenir', async ({ page }) => {
  await open(page, '#/mulk-sahibi/mulk/cihangir/talep');
  await page.click('.card:has-text("aspiratör")');
  await sheet(page).locator('button:has-text("Teklif")').click();
  await sheet(page).locator('input[name=vendor]').fill('Hızlı Tamir');
  await sheet(page).locator('input[name=amount]').fill('1750');
  await sheet(page).locator('button:has-text("Ekle")').click();
  await expect(sheet(page)).toContainText('Hızlı Tamir');

  await sheet(page).locator('button:has-text("Seç")').click();
  await expect(sheet(page)).toContainText('Seçildi');
  await expect(sheet(page).locator('.steplbl .on')).toHaveText('İşlemde');

  // Masrafı ev sahibine al, sonra faturayı işle.
  await sheet(page).locator('select[data-input=cost]').selectOption('Mülk sahibi');
  await sheet(page).locator('button:has-text("Fatura ekle")').click();
  await expect(sheet(page).locator('input[name=amount]')).toHaveValue('1750');
  await sheet(page).locator('button:has-text("Kaydet")').click();

  await open(page, '#/mulk-sahibi/mulk/cihangir/gider');
  await expect(screen(page)).toContainText('Banyo aspiratörü değişimi');
  await expect(screen(page)).toContainText('talebe bağlı');
});

test('kiracı teklifleri görür ama seçemez', async ({ page }) => {
  await open(page, '#/kiraci/talepler/r1');
  await expect(sheet(page)).toContainText('Yetkili servis');
  await expect(sheet(page).locator('button:has-text("Seç")')).toHaveCount(0);
  await expect(sheet(page)).toContainText('Fatura');
});

/* ---- çıkış ve depozito ---- */

test('çıkış süreci: karşılaştırma, kesinti, iki taraf onayı, iade', async ({ page }) => {
  await open(page, '#/mulk-sahibi/mulk/atasehir/cikis');
  await page.click('button:has-text("Çıkış sürecini başlat")');
  await sheet(page).locator('button:has-text("Başlat")').click();
  await expect(screen(page)).toContainText('Oda oda karşılaştırma');
  await expect(screen(page)).toContainText('Girişte');

  await page.locator('select[data-input=exitCond]').first().selectOption('Hasarlı');
  await page.locator('.compare input.inline').first().fill('Duvarda çatlak');
  await page.locator('.compare input.inline').first().blur();

  // Ataşehir'in bu ayki kirası gecikmiş durumda: ödenmemiş kira önerilir.
  await page.click('button:has-text("Ödenmemiş kirayı ekle")');
  await expect(screen(page)).toContainText('Ödenmemiş kira');

  await page.click('section.card:has(h2:text-is("Kesintiler")) button:has-text("Ekle")');
  await sheet(page).locator('input[name=label]').fill('Boya');
  await sheet(page).locator('input[name=amount]').fill('4000');
  await sheet(page).locator('button:has-text("Ekle")').click();

  // Depozito 54.000; kesintiler 27.000 kira + 4.000 boya = 31.000 → iade 23.000
  await expect(page.locator('#screen .hero .big')).toHaveText('₺23.000');

  await page.click('button:has-text("Hesabı onayla")');
  await open(page, '#/kiraci/belgeler/cikis');
  // Kiracı görünümü Moda'dadır; Ataşehir'in kiracısı olarak bakmak için evi değiştirmeyiz,
  // bunun yerine ev sahibi tarafında kiracı onayını modülden veririz.
  await page.evaluate(async () => {
    const st = await import('./assets/js/state.js');
    st.S.props.atasehir.moveOut.tenantOk = true;
    st.save();
  });
  await open(page, '#/mulk-sahibi/mulk/atasehir/cikis');
  await page.click('button:has-text("İadeyi yaptım")');
  await expect(sheet(page).locator('input[name=amount]')).toHaveValue('23000');
  await sheet(page).locator('button:has-text("Kaydet")').click();
  await expect(screen(page)).toContainText('iade edildi');

  await page.click('button:has-text("Çıkış raporunu dışa aktar")');
  await expect(page.locator('#txtOut')).toHaveValue(/Duvarda çatlak/);
  await expect(page.locator('#txtOut')).toHaveValue(/İade: ₺23\.000/);
});

test('kesinti değişince onaylar sıfırlanır', async ({ page }) => {
  await open(page, '#/mulk-sahibi/mulk/moda/cikis');
  await page.click('button:has-text("Çıkış sürecini başlat")');
  await sheet(page).locator('button:has-text("Başlat")').click();
  await page.click('button:has-text("Hesabı onayla")');
  await expect(screen(page)).toContainText('Karşı tarafın onayı bekleniyor');
  await page.click('section.card:has(h2:text-is("Kesintiler")) button:has-text("Ekle")');
  await sheet(page).locator('input[name=label]').fill('Temizlik');
  await sheet(page).locator('input[name=amount]').fill('1500');
  await sheet(page).locator('button:has-text("Ekle")').click();
  await expect(page.locator('button:has-text("Hesabı onayla")')).toBeVisible();
});

test('kiracı çıkış sürecini görür, kesinti ekleyemez', async ({ page }) => {
  await open(page, '#/mulk-sahibi/mulk/moda/cikis');
  await page.click('button:has-text("Çıkış sürecini başlat")');
  await sheet(page).locator('button:has-text("Başlat")').click();
  await open(page, '#/kiraci');
  await expect(screen(page)).toContainText('Çıkış süreci');
  await open(page, '#/kiraci/belgeler/cikis');
  await expect(screen(page)).toContainText('Depozito hesabı');
  await expect(page.locator('section.card:has(h2:text-is("Kesintiler")) button:has-text("Ekle")')).toHaveCount(0);
});

/* ---- rapor ve vergi ---- */

test('rapor net getiriyi ve vergi tahminini gösterir', async ({ page }) => {
  await open(page, '#/mulk-sahibi/rapor');
  await expect(screen(page)).toContainText('net kira getirisi');
  await expect(screen(page)).toContainText('Vergi tahmini');
  await expect(screen(page)).toContainText('Götürü gider');
  await expect(screen(page)).toContainText('Daha avantajlı');

  const years = await page.locator('select[data-input=reportYear] option').allInnerTexts();
  expect(years.length).toBeGreaterThan(1);
  await page.selectOption('select[data-input=reportYear]', years[years.length - 1]);
  await expect(page.locator('#screen h1 + .sub')).toHaveText(years[years.length - 1] + ' yılı');

  await page.check('input[data-input=noExemption]');
  await expect(screen(page)).toContainText('Uygulanmıyor');
});

test('beyanname özeti vergi karşılaştırmasını içerir', async ({ page }) => {
  await open(page, '#/mulk-sahibi/rapor');
  await page.click('button:has-text("Beyanname özeti oluştur")');
  await expect(page.locator('#txtOut')).toHaveValue(/Tahmini vergi|istisna tutarının altında/);
  await expect(page.locator('#txtOut')).toHaveValue(/Toplam belgeli gider/);
});
