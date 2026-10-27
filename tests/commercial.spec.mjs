// Mülk tipleri (konut/ofis/mağaza/depo), şirket kiracı, stopaj ve işyeri vergisi.
import { test, expect } from '@playwright/test';
import { watchErrors, open, sheet, PNG } from './helpers.mjs';

let errors;
test.beforeEach(({ page }) => { errors = watchErrors(page); });
test.afterEach(() => { expect(errors).toEqual([]); });

const screen = page => page.locator('#screen');

test('portföy tipe göre filtrelenir ve işyerleri kendi ikonuyla görünür', async ({ page }) => {
  await open(page, '#/mulk-sahibi');
  await expect(screen(page).locator('h1')).toHaveText('Portföyüm');
  await expect(screen(page).locator('.card.prop')).toHaveCount(5);
  await screen(page).locator('button[data-act=propFilter][data-v="Ofis"]').click();
  await expect(screen(page).locator('.card.prop')).toHaveCount(1);
  await expect(screen(page).locator('.card.prop')).toContainText('Levent ofis');
  await expect(screen(page).locator('.card.prop')).toContainText('[Şirket A.Ş.]');
  await screen(page).locator('button[data-act=propFilter][data-v="all"]').click();
  await expect(screen(page).locator('.card.prop')).toHaveCount(5);
});

test('stopajlı kirada kiracı net tutarı öder, brüt ve stopaj açıklanır', async ({ page }) => {
  await open(page, '#/mulk-sahibi/mulk/levent');
  await expect(screen(page)).toContainText('Aylık brüt kira');
  await expect(screen(page)).toContainText('₺60.000');
  await expect(screen(page)).toContainText('Hesaba geçen');
  await expect(screen(page).locator('.hero .big').first()).toHaveText('₺48.000');
  await expect(screen(page)).toContainText('VKN 0000000000');
  await expect(screen(page)).not.toContainText('DASK bitişi');
});

test('stopajlı mağazada gecikme net tutar üzerinden, ödeme formu net tutarı önerir', async ({ page }) => {
  await open(page, '#/mulk-sahibi/mulk/bagdat');
  // Yenilemeden sonraki brüt ₺45.000 → net ₺36.000
  await expect(screen(page).locator('.hero .big').first()).toHaveText('₺36.000');
  await expect(screen(page).locator('.hero').first()).toContainText('Brüt ₺45.000');
  await expect(screen(page)).toContainText('Teminat mektubu');

  await page.goto('index.html#/mulk-sahibi/mulk/bagdat/odeme?s=odeme&pid=bagdat');
  await expect(sheet(page).locator('input[name=amount]')).toHaveValue('36000');
  await expect(sheet(page)).toContainText('Hesaba yatacak tutar');
});

test('işyeri belgelerinde stopaj ve ruhsat kategorileri var, konut sigortası yok', async ({ page }) => {
  await open(page, '#/mulk-sahibi/mulk/levent/belge');
  const heads = await screen(page).locator('section.card h2').allInnerTexts();
  expect(heads).toContain('Stopaj makbuzu');
  expect(heads).toContain('İşyeri sigortası');
  expect(heads).not.toContain('Konut sigortası');

  await open(page, '#/mulk-sahibi/mulk/moda/belge');
  const konut = await screen(page).locator('section.card h2').allInnerTexts();
  expect(konut).toContain('Konut sigortası');
  expect(konut).not.toContain('Stopaj makbuzu');
});

test('işyeri tutanağı "alan" diliyle ve tipe uygun alanlarla gelir', async ({ page }) => {
  await open(page, '#/mulk-sahibi/mulk/bagdat/tutanak');
  await expect(screen(page)).toContainText('Teslimde alan alan kayıt al');
  await expect(screen(page)).toContainText('Satış alanı');
  await expect(screen(page).locator('#roomIn')).toHaveAttribute('placeholder', /Alan ekle/);
});

test('mağaza eklenir: şirket kiracı, stopaj ve tipe göre tutanak alanları', async ({ page }) => {
  await open(page, '#/mulk-sahibi?s=ev-ekle');
  await sheet(page).locator('button[data-act=newPropType][data-v="Mağaza"]').click();
  await sheet(page).locator('input[name=name]').fill('Nişantaşı dükkan');
  await sheet(page).locator('input[name=addr]').fill('Abdi İpekçi Cd.');
  await sheet(page).locator('input[name=rent]').fill('50000');
  await sheet(page).locator('select[name=tenantKind]').selectOption('Şirket / esnaf');
  await expect(sheet(page).locator('[data-company]')).toBeVisible();
  await sheet(page).locator('input[name=coName]').fill('Moda Butik Ltd.');
  await sheet(page).locator('button:has-text("Kaydet ve davet et")').click();

  await expect(screen(page).locator('h1')).toHaveText('Nişantaşı dükkan');
  await expect(screen(page)).toContainText('Mağaza');
  await expect(screen(page)).toContainText('Moda Butik Ltd.');
  await expect(screen(page)).toContainText('Aylık brüt kira');
  const p = await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('evim')); return s.props[s.order[s.order.length - 1]]; });
  expect(p).toMatchObject({ type:'Mağaza', stopaj:true, dask:null, company:{ name:'Moda Butik Ltd.' } });
  expect(p.inspect.rooms.map(r => r.n)).toEqual(['Satış alanı', 'Vitrin', 'Depo', 'Cephe ve tabela', 'WC']);
});

test('tip değiştirmek formda yazılanları silmez', async ({ page }) => {
  await open(page, '#/mulk-sahibi?s=ev-ekle');
  await sheet(page).locator('input[name=name]').fill('Deneme');
  await sheet(page).locator('button[data-act=newPropType][data-v="Depo"]').click();
  await expect(sheet(page).locator('input[name=name]')).toHaveValue('Deneme');
  await expect(sheet(page).locator('button[data-act=newPropType][data-v="Depo"]')).toHaveAttribute('aria-pressed', 'true');
});

test('mülk bilgilerinde kiracı bireysele çevrilince stopaj kalkar', async ({ page }) => {
  await open(page, '#/mulk-sahibi/mulk/levent?s=ev-duzenle&pid=levent');
  await sheet(page).locator('select[name=tenantKind]').selectOption('Bireysel');
  await expect(sheet(page).locator('[data-company]')).toBeHidden();
  await sheet(page).locator('button:has-text("Kaydet")').first().click();
  await expect(screen(page).locator('.hero .big').first()).toHaveText('₺60.000');
  await expect(screen(page)).not.toContainText('Hesaba geçen');
});

test('rapor konut ve işyeri gelirini ayırır, stopajlı kirayı beyan sınırına göre değerlendirir', async ({ page }) => {
  await open(page, '#/mulk-sahibi/rapor');
  await expect(screen(page)).toContainText('İşyeri kira geliri (stopajlı)');
  await expect(screen(page)).toContainText('Konut kira geliri');
  await expect(screen(page)).toContainText('kiracının kestiği stopaj');
  await expect(screen(page).locator('.grid2 .card .label', { hasText:'İşyeri' })).toBeVisible();
});

test('yeni talepte mülk tipine uygun öneriler var', async ({ page }) => {
  // Demo kiracısı konutta; ofis önerilerini ev sahibi tarafındaki kiracı görünümü göstermez,
  // bu yüzden formu doğrudan ofis için açarız.
  await open(page, '#/kiraci?s=yeni-talep&pid=levent');
  await expect(sheet(page)).toContainText('İnternet altyapısı');
  await sheet(page).locator('button[data-act=suggestTitle]', { hasText:'Aydınlatma' }).click();
  await expect(sheet(page).locator('input[name=title]')).toHaveValue('Aydınlatma');
});

test('eski adresler yeni karşılıklarına yönlenir', async ({ page }) => {
  await open(page, '#/ev-sahibi/ev/moda/odeme');
  await expect(page).toHaveURL(/#\/mulk-sahibi\/mulk\/moda\/odeme$/);
  await expect(screen(page).locator('h1')).toHaveText('Moda’daki ev');
});

test('v3 verisi taşınır: tip konut olur, "Ev sahibi" değerleri yenilenir', async ({ page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    const p = { id:'x', name:'Eski ev', addr:'A', tenants:[{ id:'t1', name:'K', phone:'', email:'' }], landlord:{ name:'L', phone:'' },
      rent:10000, dueDay:1, aidat:0, aidatPayer:'Ev sahibi', deposit:0, depositNote:'', startDate:'2026-01-01', contractEnd:'2027-01-01', dask:'2027-01-01',
      bills:[{ n:'Su', who:'Ev sahibi' }], pay:{}, rentHistory:[{ from:'2026-01-01', amount:10000 }], expenses:[], value:null, moveOut:null,
      requests:[{ id:'r1', cat:'Arıza', title:'T', desc:'', urgency:'Normal', status:0, cost:'Ev sahibi', costOk:false, decision:null, date:'2026-02-01', photos:0, shots:[], log:[], quotes:[], invoice:null }],
      msgs:[], docs:[], inspect:{ tenantOk:false, landlordOk:false, rooms:[] }, renewal:null };
    localStorage.setItem('evim', JSON.stringify({ v:3, lang:'tr', myHome:'x', order:['x'], props:{ x:p }, settings:{ rentDays:3, renewDays:60, insDays:30, evictDays:90 }, inbox:[], theme:'system', seenHint:true, tourDone:true }));
  });
  await open(page, '#/mulk-sahibi/mulk/x');
  const s = await page.evaluate(() => JSON.parse(localStorage.getItem('evim')));
  expect(s.v).toBe(4);
  expect(s.props.x).toMatchObject({ type:'Konut', stopaj:false, company:null, depositKind:'Nakit', aidatPayer:'Mülk sahibi' });
  expect(s.props.x.requests[0].cost).toBe('Mülk sahibi');
  expect(s.props.x.bills[0].who).toBe('Mülk sahibi');
  expect(await page.evaluate(() => localStorage.getItem('evim-yedek-v3'))).toBeTruthy();
});

/* ---- abonelik (demo) ---- */

test('demo: deneme şeridi, abonelik sayfası ve süre bitince kilit', async ({ page }) => {
  await open(page, '#/mulk-sahibi');
  await expect(screen(page).locator('.subbar')).toContainText('Deneme sürümü');
  await page.click('.subbar button:has-text("Abone ol")');
  await expect(sheet(page).locator('h3')).toHaveText('Mülk sahibi aboneliği');
  await expect(sheet(page)).toContainText('Kiracıların için her zaman ücretsiz');

  // Süre bitti: kayıt değiştiren işlem abonelik sayfasını açar, veri değişmez.
  await sheet(page).locator('button[data-act=demoBilling][data-v=expired]').click();
  await page.goto('index.html#/mulk-sahibi/mulk/cihangir/odeme');
  await expect(screen(page).locator('.subbar.lock')).toContainText('Deneme süren bitti');
  await screen(page).locator('button[data-act=approvePay]').first().click();
  await expect(sheet(page).locator('h3')).toHaveText('Mülk sahibi aboneliği');
  const st = await page.evaluate(() => JSON.parse(localStorage.getItem('evim')).props.cihangir.pay);
  expect(Object.values(st).some(r => r.status === 'review')).toBe(true);

  // Kiracı görünümü etkilenmez.
  await page.goto('index.html#/kiraci');
  await expect(page.locator('.subbar')).toHaveCount(0);

  // Abone ol → kilit kalkar.
  await page.goto('index.html#/mulk-sahibi?s=abonelik');
  await sheet(page).locator('button[data-act=billingPlan][data-v=monthly]').click();
  await expect(sheet(page).locator('button[data-act=billingPlan][data-v=monthly]')).toHaveAttribute('aria-pressed', 'true');
  await sheet(page).locator('button[data-act=subscribe]').click();
  await expect(page.locator('#banners')).toContainText('Aboneliğin başladı');
  await expect(page.locator('.subbar')).toHaveCount(0);
  await page.goto('index.html#/mulk-sahibi?s=ayarlar');
  await expect(sheet(page).locator('button[data-s=abonelik]')).toHaveText('Aktif');
});
