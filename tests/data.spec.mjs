import { test, expect } from '@playwright/test';
import { watchErrors, open } from './helpers.mjs';

let errors;
test.beforeEach(({ page }) => { errors = watchErrors(page); });
test.afterEach(() => { expect(errors).toEqual([]); });

/** İlk prototipin (v1) kaydettiği biçimde küçük bir veri. */
function v1Fixture(){
  const d = new Date(), y = d.getFullYear(), m = d.getMonth();
  const key = off => { const x = new Date(y, m + off, 1); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0'); };
  const iso = off => { const x = new Date(); x.setDate(x.getDate() + off); return x.toISOString().slice(0, 10); };
  const pay = {};
  for (let i = -2; i <= 0; i++) pay[key(i)] = { status:'approved', date:key(i) + '-03', amount:20000, receipt:'d.pdf' };
  return {
    v:1, role:'landlord', myHome:'ev1', tab:'portfolio', lpid:null, lsub:'ozet', tsub:null,
    props:{ ev1:{
      id:'ev1', name:'Eski kayıt evi', addr:'Test Sk. 1',
      tenant:{ name:'Eski Kiracı', phone:'05000000009' }, landlord:{ name:'Eski Sahip', phone:'05000000008' },
      rent:20000, dueDay:5, aidat:1000, aidatPayer:'Kiracı', deposit:40000, depositNote:'Banka',
      contractEnd:iso(200), dask:iso(300), bills:[{ n:'Su', who:'Kiracı' }], pay,
      requests:[{ id:'x1', cat:'Arıza', title:'Eski talep kaydı', desc:'', urgency:'Normal', status:1, cost:'Belirlenmedi', costOk:false, date:iso(-3), photos:0 }],
      msgs:[{ from:'tenant', text:'Eski mesaj', at:Date.now() - 86400000 }],
      docs:[{ cat:'Kira sözleşmesi', name:'eski_sozlesme.pdf', at:iso(-100) }],
      inspect:{ tenantOk:true, landlordOk:true, rooms:[{ n:'Salon', photos:3, note:'' }] },
      renewal:null
    } },
    order:['ev1'],
    settings:{ rentDays:3, renewDays:60, insDays:30, evictDays:90, reqUpdates:true, lateNotice:true },
    inbox:[], seenHint:true
  };
}

test('ilk prototipin verisi kaybolmadan taşınır', async ({ page }) => {
  await page.addInitScript(data => {
    if (!sessionStorage.getItem('seeded')){
      localStorage.setItem('evim-proto-v1', JSON.stringify(data));
      sessionStorage.setItem('seeded', '1');
    }
  }, v1Fixture());
  await open(page, '#/mulk-sahibi');
  await expect(page.locator('#screen')).toContainText('Eski kayıt evi');
  await open(page, '#/mulk-sahibi/mulk/ev1/talep');
  await expect(page.locator('#screen')).toContainText('Eski talep kaydı');
  await open(page, '#/mulk-sahibi/mulk/ev1/belge');
  await expect(page.locator('#screen')).toContainText('eski_sozlesme.pdf');

  const stored = await page.evaluate(() => ({
    cur: JSON.parse(localStorage.getItem('evim')),
    backup: localStorage.getItem('evim-yedek-v1'),
    legacy: localStorage.getItem('evim-proto-v1')
  }));
  expect(stored.cur.v).toBeGreaterThanOrEqual(2);
  expect(stored.backup).not.toBeNull();
  expect(stored.legacy).not.toBeNull();   // eski anahtara dokunulmaz
  expect(stored.cur.props.ev1.docs[0].id).toBeTruthy();
});

test('daha yeni sürümün verisi üzerine yazılmaz', async ({ page }) => {
  const future = v1Fixture();
  future.v = 999;
  await page.addInitScript(data => {
    if (!sessionStorage.getItem('seeded')){
      localStorage.setItem('evim', JSON.stringify(data));
      sessionStorage.setItem('seeded', '1');
    }
  }, future);
  await open(page, '#/mulk-sahibi');
  await expect(page.locator('#banners')).toContainText('Salt okunur');
  await page.click('.shell button:has-text("Koyu")');
  const v = await page.evaluate(() => JSON.parse(localStorage.getItem('evim')).v);
  expect(v).toBe(999);
});

test('bozuk kayıt uygulamayı çökertmez', async ({ page }) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('seeded')){
      localStorage.setItem('evim', '{bozuk');
      sessionStorage.setItem('seeded', '1');
    }
  });
  await open(page, '#/kiraci');
  await expect(page.locator('#screen h1')).toHaveText('Moda’daki ev');
});

test('onay penceresi: vazgeç veriyi korur, onay sıfırlar', async ({ page }) => {
  await open(page, '#/kiraci/talepler');
  await page.click('button:has-text("Yeni talep aç")');
  await page.locator('#layer .sheet input[name=title]').fill('Silinmemesi gereken');
  await page.locator('#layer .sheet button:has-text("Talebi gönder")').click();
  await expect(page.locator('#screen')).toContainText('Silinmemesi gereken');

  await page.click('.shell button:has-text("Demoyu sıfırla")');
  const dialog = page.locator('#confirm [role=alertdialog]');
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('#screen')).toContainText('Silinmemesi gereken');

  await page.click('.shell button:has-text("Demoyu sıfırla")');
  await dialog.locator('button:has-text("Sıfırla")').click();
  await open(page, '#/kiraci/talepler');
  await expect(page.locator('#screen')).not.toContainText('Silinmemesi gereken');
});

test('belge silme onay ister', async ({ page }) => {
  await open(page, '#/kiraci/belgeler');
  const before = await page.locator('#screen .li').count();
  await page.locator('[aria-label$="belgesini sil"]').first().click();
  await page.locator('#confirm button:has-text("Sil")').click();
  await expect(page.locator('#screen .li')).toHaveCount(before - 1);
});
