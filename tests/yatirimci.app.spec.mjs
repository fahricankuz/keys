// Yatırımcı raporu ekranı: GYO menüsünde, dönem göstergeleri, yönetimin notu, "Mailime gönder"; açılan belge üç A4 sayfası
// ve hiçbir sayfada taşma ya da kesilme yok (uzun kurum adı ve çok kiracıyla). AVM'de modül kapalıyken görünmez; gider türü seçilir.
import { test, expect } from '@playwright/test';
import { serveDist, seed, PW, ensureDist, ID , pickRole } from './app-helpers.mjs';
import { watchErrors } from './helpers.mjs';

const DIST = new URL('../app/dist-fake', import.meta.url).pathname;
const PORT = 8251;
let server, errors;

test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => { test.setTimeout(300_000); await ensureDist(DIST); server = await serveDist(DIST, PORT); });
test.afterAll(() => server && server.close());
test.beforeEach(({ page }) => { errors = watchErrors(page); });
test.afterEach(() => { expect(errors).toEqual([]); });

const url = (p) => `http://localhost:${PORT}${p}`;
const pad = (n) => String(n).padStart(2, '0');
// Son tamamlanan çeyreğin ayları (ekranın varsayılan dönemi).
const lastQ = (() => { const d = new Date(); const q = Math.floor(d.getMonth() / 3); const y = q ? d.getFullYear() : d.getFullYear() - 1; const s = q ? (q - 1) * 3 : 9; return [1, 2, 3].map((i) => y + '-' + pad(s + i)); })();

function data(sector, modules, many = false) {
  const d = seed();
  const now = new Date().toISOString();
  const name = many ? 'Marmara Gayrimenkul Yatırım Ortaklığı Anonim Şirketi Ticari Portföy' : 'Marmara GYO';
  d.tables.organizations = [{ id: 'o1', name, sector, modules, status: 'active', units: null, report_currency: 'USD', created_at: now }];
  d.tables.org_roles = [];
  d.tables.org_members = [{ org_id: 'o1', user_id: ID.landlord, role_id: null, is_master: true, created_at: now }];
  const n = many ? 24 : 2;
  d.tables.site_units = Array.from({ length: n }, (_, i) => ({ id: 'u' + i, org_id: 'o1', block: many ? 'Varlık ' + (i % 9) + ' Uzun Bir Bina Adı' : 'Levent Ofis', no: 'K' + i, area: 1234.5 + i,
    rent: i % 2 ? 987654 : 25000, currency: i % 2 ? 'TRY' : 'USD', payer: 'kiraci', index_kind: 'tufe', lease_end: (2027 + (i % 11)) + '-06-30', created_at: now }));
  d.tables.site_residents = d.tables.site_units.map((u, i) => ({ id: 'r' + i, org_id: 'o1', unit_id: u.id, user_id: null, role: 'kiraci', name: (many ? 'Çok Uzun Adlı Kiracı Ticaret ve Sanayi AŞ ' : 'Kiracı ') + i, phone: '', email: '', lives_here: true, code: 'S00000' + pad(i), created_at: now }));
  d.tables.site_charges = [];
  for (const m of lastQ) d.tables.site_units.forEach((u, i) => d.tables.site_charges.push({ id: m + u.id, org_id: 'o1', unit_id: u.id, month: m, kind: 'kira', title: '',
    amount: u.currency === 'USD' ? u.rent * 40 : u.rent, currency: u.currency, orig_amount: u.currency === 'USD' ? u.rent : null, fx: u.currency === 'USD' ? 40 : null,
    due_on: m + '-05', status: i === 1 && m === lastQ[0] ? 'open' : 'paid', paid_on: m + '-05', paid_amount: u.currency === 'USD' ? u.rent * 40 : u.rent, method: 'havale', created_at: now }));
  d.tables.site_expenses = [{ id: 'x1', org_id: 'o1', cat: 'Güvenlik', amount: 120000, spent_on: lastQ[1] + '-10', kind: 'ortak', note: '', created_at: now }];
  // İki yıllık haftalık kur (dolar 38'den 42'ye, avro 50): her işlemin gününe yakın bir iş günü kuru bulunur.
  d.tables.fx_rates = [];
  for (let i = 0; i < 110; i++) {
    const day = new Date(Date.now() - i * 7 * 864e5).toISOString().slice(0, 10);
    d.tables.fx_rates.push({ day, currency: 'USD', sell: Math.round((42 - i * 0.036) * 100) / 100 }, { day, currency: 'EUR', sell: 50 });
  }
  return d;
}

async function login(page, d) {
  await page.addInitScript((x) => { if (!localStorage.getItem('__fakedb')) localStorage.setItem('__fakedb', JSON.stringify(x)); }, d);
  await page.goto(url('/giris/mulk-sahibi'));
  await page.getByLabel('E-posta').fill('ev@ornek.com');
  await page.getByLabel('Şifre', { exact: true }).fill(PW);
  await page.getByRole('button', { name: 'Giriş yap' }).click();
  await pickRole(page);
  await expect(page).toHaveURL(/\/uygulama\/site$/);
}

test('GYO: menüde yatırımcı raporu; göstergeler dolarda; not kaydedilir; mailime gönder kendi e-postasına', async ({ page }) => {
  await login(page, data('gyo', ['kira', 'ortak_gider', 'doluluk', 'rapor', 'yatirimci']));
  await page.getByRole('link', { name: 'Yatırımcı raporu', exact: true }).first().click();
  await expect(page).toHaveURL(/\/uygulama\/site\/yatirimci/);
  await expect(page.getByText('Dönem geliri')).toBeVisible();
  await expect(page.getByText(/^\$[1-9][\d.]*$/).first()).toBeVisible();              // kur bulundu: tutar sıfır değil
  await expect(page.getByText(/kur henüz yok/)).toHaveCount(0);
  await expect(page.getByText(/^%\d/).first()).toBeVisible();
  await page.getByLabel('Not').fill('Doluluk hedefi %95.');
  await page.getByRole('button', { name: 'Notu kaydet' }).click();
  await expect(page.getByText('Not kaydedildi.')).toBeVisible();
  await page.getByRole('button', { name: 'Mailime gönder' }).click();
  await expect(page.getByText('Rapor özeti ve bağlantısı e-postana gönderildi.')).toBeVisible();
  // ₺ seçilince tutarlar TL; seçim hesapta saklanır, sayfayı yeniden açınca korunur.
  await page.getByRole('button', { name: '₺ TL' }).click();
  await expect(page.getByText(/· Yatırımcı raporu · TL/)).toBeVisible();
  await expect(page.getByText(/^₺[1-9][\d.]*$/).first()).toBeVisible();
  await page.waitForTimeout(1500);
  await page.reload();
  await expect(page.getByText(/· Yatırımcı raporu · TL/)).toBeVisible();
  await page.getByRole('button', { name: '$ USD' }).click();
  await expect(page.getByText(/· Yatırımcı raporu · USD/)).toBeVisible();
  const fake = await page.evaluate(() => JSON.parse(localStorage.getItem('__fakedb')).tables);
  expect(fake.site_investor_notes).toEqual([expect.objectContaining({ org_id: 'o1', note: 'Doluluk hedefi %95.' })]);
  expect(fake.mail_outbox).toEqual([expect.objectContaining({ kind: 'investor_report', to_email: 'ev@ornek.com', data: expect.objectContaining({ org: 'Marmara GYO', currency: 'USD' }) })]);
  expect(fake.mail_outbox[0].data.revenue).toMatch(/^\$[1-9][\d.]*$/);
});

test('belge: üç A4 sayfası; uzun ad ve çok kiracıyla hiçbir sayfada taşma ya da kesilme yok; not son sayfada', async ({ page }) => {
  await login(page, data('gyo', ['kira', 'rapor', 'yatirimci'], true));
  await page.goto(url('/uygulama/site/yatirimci'));
  await page.getByLabel('Not').fill('Uzun not. '.repeat(150));
  await page.getByRole('button', { name: 'Notu kaydet' }).click();
  await expect(page.getByText('Not kaydedildi.')).toBeVisible();
  const [doc] = await Promise.all([page.waitForEvent('popup'), page.getByRole('button', { name: 'Raporu aç' }).click()]);
  await doc.waitForLoadState('load');
  await doc.evaluate(() => document.fonts.ready);
  const pages = doc.locator('section.page');
  await expect(pages).toHaveCount(3);
  const r = await doc.evaluate(() => {
    const out = [];
    document.querySelectorAll('section.page').forEach((p, i) => {
      const box = p.getBoundingClientRect();
      const foot = p.querySelector('.foot').getBoundingClientRect();
      let bottom = 0;
      p.querySelectorAll(':scope > *:not(.foot)').forEach((el) => { bottom = Math.max(bottom, el.getBoundingClientRect().bottom); });
      // Sayı hücreleri ve gösterge değerleri kesilmesin (kendi kutusundan geniş değil).
      const clipped = [...p.querySelectorAll('.n, .kv, .pv')].filter((el) => el.scrollWidth > el.clientWidth + 1).map((el) => el.textContent);
      out.push({ i, w: Math.round(box.width), h: Math.round(box.height), overflow: bottom > foot.top + 1, clipped });
    });
    return out;
  });
  for (const p of r) {
    expect(p.w, 'sayfa genişliği').toBe(794);
    expect(p.h, 'sayfa yüksekliği').toBe(1123);
    expect(p.overflow, `sayfa ${p.i + 1} taşıyor`).toBe(false);
    expect(p.clipped, `sayfa ${p.i + 1} kesilen değer`).toEqual([]);
  }
  await expect(doc.getByText('Yönetimin notu')).toBeVisible();
  await expect(doc.getByText(/kur bulunamadı/)).toHaveCount(0);
  expect(await doc.locator('svg rect').count()).toBe(12);
  // Grafik etiketleri çizim alanının içinde (üstten kesilmez).
  expect(await doc.evaluate(() => Math.min(...[...document.querySelectorAll('svg text')].filter((x) => x.textContent).map((x) => x.getBBox().y)))).toBeGreaterThanOrEqual(0);
  await expect(doc.getByText(/ve \d+ kiracı daha|ve \d+ varlık daha/).first()).toBeVisible();
  await expect(doc.getByText(/değerleme raporu yerine geçmez/)).toBeVisible();
  await doc.close();
});

test('AVM: modül kapalıyken yatırımcı raporu yok; giderde tür seçilir (ortak gider kiracıya yansır)', async ({ page }) => {
  await login(page, data('avm', ['kira', 'ortak_gider', 'rapor']));
  await expect(page.getByRole('link', { name: 'Yatırımcı raporu', exact: true })).toHaveCount(0);
  await page.getByRole('link', { name: 'Giderler', exact: true }).first().click();
  await page.getByLabel('Kalem').fill('Temizlik');
  await page.getByLabel('Tutar (₺)').fill('5000');
  await page.getByRole('button', { name: 'Ortak gider (kiracıya yansır)' }).click();
  await page.getByRole('button', { name: 'Gideri ekle' }).click();
  await expect(page.getByText(/Ortak gider/).nth(1)).toBeVisible();
  const ex = await page.evaluate(() => JSON.parse(localStorage.getItem('__fakedb')).tables.site_expenses.find((x) => x.cat === 'Temizlik'));
  expect(ex.kind).toBe('ortak');
});
