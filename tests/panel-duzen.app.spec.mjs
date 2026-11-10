// Panel düzeni denetimi: telefonda hiçbir ekran yatay kaymaz, hiçbir düğme ekran dışında kalmaz, tutarlar "…" ile kesilmez.
// Yeni eklenen ekranlar da aynı kurala uysun diye ana ekranlar tek tek açılır (masaüstü projesinde telefon boyutu elle verilir).
import { test, expect } from '@playwright/test';
import { serveDist, seed, PW, ensureDist, ID } from './app-helpers.mjs';

const DIST = new URL('../app/dist-fake', import.meta.url).pathname;
const PORT = 8281;
let server;

test.describe.configure({ mode: 'serial' });   // tek sunucu, tek işçi

test.beforeAll(async () => { test.setTimeout(300_000); await ensureDist(DIST); server = await serveDist(DIST, PORT); });
test.afterAll(() => server && server.close());
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

const url = (p) => `http://localhost:${PORT}${p}`;
const at = new Date().toISOString(), m = at.slice(0, 7);

function data(sector) {
  const d = seed();
  d.tables.properties[0].name = 'Moda Dairesi Deniz Manzaralı 3+1';
  d.tables.properties[0].addr = 'Caferağa Mahallesi, Moda Caddesi No: 124 Daire: 7, Kadıköy / İstanbul';
  d.tables.properties[0].rent = 1248000;
  d.tables.memberships[1].display_name = 'Mehmet Abdurrahman Kiracıoğlu';
  d.tables.payments = [{ property_id: 'p1', month: m, kind: 'kira', status: 'review', amount: 1248000, paid_on: at.slice(0, 10), method: 'dekont', receipt_name: 'dekont-kasim-ziraat-bankasi.pdf', receipt_path: 'p1/d.pdf' }];
  if (!sector) return d;
  const site = sector === 'site';
  d.tables.organizations = [{ id: 'o1', name: site ? 'Fişekhane Sitesi Konutları' : 'Marmara Portföy GYO', sector, modules: site ? ['aidat', 'duyuru', 'gider_dagitim', 'rapor'] : ['kira', 'ortak_gider', 'ciro_kira', 'endeksleme', 'doluluk', 'duyuru', 'rapor', 'yatirimci'], status: 'active', units: null, created_at: at }];
  d.tables.org_roles = []; d.tables.org_members = [{ org_id: 'o1', user_id: ID.landlord, role_id: null, is_master: true, created_at: at }];
  d.tables.site_units = []; d.tables.site_residents = []; d.tables.site_charges = [];
  for (let i = 1; i <= 12; i++) {
    const id = 'u' + i;
    d.tables.site_units.push(Object.assign({ id, org_id: 'o1', block: site ? 'A' : 'Zemin kat', no: site ? String(i) : 'Z-' + (100 + i), area: 120, created_at: at },
      site ? { share: 2, aidat: 1500, payer: 'kiraci' } : { rent: 2480000, currency: 'TRY', aidat: 4000, due_day: 5 }));
    d.tables.site_residents.push({ id: 'r' + i, org_id: 'o1', unit_id: id, user_id: null, role: 'kiraci', name: 'Moda Giyim Sanayi ve Ticaret Anonim Şirketi ' + i, phone: '0532 000 00 0' + (i % 10), email: '', code: 'S00000' + String(i).padStart(2, '0'), invited_at: i % 2 ? at : null, created_at: at });
    d.tables.site_charges.push({ id: 'c' + i, org_id: 'o1', unit_id: id, month: m, kind: site ? 'aidat' : 'kira', title: '', amount: site ? 1500 : 2480000, status: ['open', 'paid', 'review'][i % 3], paid_amount: i % 3 ? (site ? 1500 : 2480000) : 0, due_on: m + '-10', created_at: at });
  }
  d.tables.site_expenses = [{ id: 'e1', org_id: 'o1', cat: 'Asansör bakımı', amount: 1250000, spent_on: at.slice(0, 10), note: '', created_at: at }];
  return d;
}

/** Sayfada çalışır; düzen hatalarını metin listesi olarak döner. */
function problems() {
  const vw = document.documentElement.clientWidth, out = [];
  const lab = (el) => (el.getAttribute('aria-label') || el.innerText || el.tagName).replace(/\s+/g, ' ').trim().slice(0, 50);
  const vis = (el) => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
  const inScroller = (el) => { for (let p = el.parentElement; p; p = p.parentElement) { const s = getComputedStyle(p); if (/(auto|scroll)/.test(s.overflowX) && p.scrollWidth > p.clientWidth + 2) return true; } return false; };
  if (document.documentElement.scrollWidth > vw + 1) out.push('sayfa yatay kayıyor: ' + (document.documentElement.scrollWidth - vw) + 'px');
  for (const el of document.querySelectorAll('button,a,[role=button],[role=link],[role=tab],[role=checkbox],[role=switch],input,textarea')) {
    if (!vis(el) || inScroller(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.right > vw + 1 || r.left < -1) out.push('ekran dışında: ' + lab(el));
  }
  for (const el of document.querySelectorAll('div[dir=auto],span')) {
    if (!vis(el) || el.children.length) continue;
    const txt = (el.innerText || '').trim();
    if (/[₺$€]\s?\d|\d[₺$€]|%\d/.test(txt) && txt.length < 40 && el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflow !== 'visible') out.push('tutar kesik: ' + txt);
  }
  return [...new Set(out)];
}

async function check(page, who, entry, db, paths) {
  await page.addInitScript((x) => { if (!localStorage.getItem('__fakedb')) localStorage.setItem('__fakedb', JSON.stringify(x)); }, db);
  await page.goto(url(entry));
  await page.getByLabel('E-posta').fill(who);
  await page.getByLabel('Şifre', { exact: true }).fill(PW);
  await page.getByRole('button', { name: 'Giriş yap' }).click();
  await expect(page).toHaveURL(/\/(uygulama|admin)/);
  const found = {};
  for (const p of paths) {
    await page.goto(url(p));
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(600);
    const f = await page.evaluate(problems);
    if (f.length) found[p] = f;
  }
  expect(found).toEqual({});
}

test('mülk sahibi: telefonda taşma, ekran dışı düğme ve kesik tutar yok', async ({ page }) => {
  await check(page, 'ev@ornek.com', '/giris/mulk-sahibi', data(), ['/uygulama', '/uygulama/mulk?pid=p1', '/uygulama/mulk?pid=p1&sub=odeme', '/uygulama/mulk?pid=p1&sub=belge', '/uygulama/talepler', '/uygulama/mesajlar', '/uygulama/takvim', '/uygulama/rapor', '/uygulama/ayarlar']);
});

test('kiracı: telefonda taşma, ekran dışı düğme ve kesik tutar yok', async ({ page }) => {
  await check(page, 'kiraci@ornek.com', '/giris/kiraci', data(), ['/uygulama', '/uygulama/odemeler', '/uygulama/talepler', '/uygulama/mesajlar', '/uygulama/belgeler', '/uygulama/ayarlar']);
});

test('site yöneticisi: telefonda taşma yok; bölümlere alt çubuktaki "Diğer" ile gidilir', async ({ page }) => {
  await check(page, 'ev@ornek.com', '/giris/mulk-sahibi', data('site'), ['', '/birimler', '/tahakkuk', '/giderler', '/duyurular', '/genelkurul', '/projeler', '/belgeler', '/talepler', '/rapor'].map((s) => '/uygulama/site' + s));
  await page.goto(url('/uygulama/site'));
  await page.getByRole('tab', { name: 'Diğer' }).click();
  await page.getByRole('menuitem', { name: 'Giderler' }).click();
  await expect(page).toHaveURL(/\/uygulama\/site\/giderler$/);
  await expect(page.getByText('Asansör bakımı').first()).toBeVisible();
  await page.getByRole('tab', { name: 'Diğer' }).click();
  await expect(page.getByRole('menuitem', { name: 'Ayarlar' })).toBeVisible();
});

test('portföy yöneticisi (GYO): telefonda taşma ve kesik tutar yok', async ({ page }) => {
  await check(page, 'ev@ornek.com', '/giris/mulk-sahibi', data('gyo'), ['', '/birimler', '/tahakkuk', '/ciro', '/artis', '/giderler', '/belgeler', '/talepler', '/rapor', '/yatirimci'].map((s) => '/uygulama/site' + s));
});

test('yönetici paneli: telefonda bölümlerde taşma ve ekran dışı düğme yok', async ({ page }) => {
  await page.addInitScript((x) => { if (!localStorage.getItem('__fakedb')) localStorage.setItem('__fakedb', JSON.stringify(x)); }, data('site'));
  await page.goto(url('/giris/yonetici'));
  await page.getByLabel('E-posta').fill('admin@ornek.com');
  await page.getByLabel('Şifre', { exact: true }).fill(PW);
  await page.getByRole('button', { name: 'Giriş yap' }).click();
  await expect(page).toHaveURL(/\/admin/);
  const found = {};
  for (const name of ['Genel bakış', 'Büyüme', 'Gelir', 'Gider', 'CRM', 'Hesaplar', 'Müşteri sağlığı', 'Kurumlar', 'Talepler', 'Ödemeler']) {
    await page.getByRole('button', { name: /^Bölümler: / }).click();
    await page.getByRole('button', { name, exact: true }).first().click();
    await page.waitForTimeout(700);
    const f = await page.evaluate(problems);
    if (f.length) found[name] = f;
  }
  expect(found).toEqual({});
});
