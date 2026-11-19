// Bireysel mülk sahibi: Portföy ekranında banka ekstresinden kira tahsilatı (sahte sunucu). Uydurma ekstre (Garanti düzeni):
// mülkün açıklama koduyla gelen kira kesin eşleşir ve onaylanır; kiracı adıyla gelen öneri olur; dekontla zaten işlenmiş ödeme
// sonraki aya yazılmaz; ikinci yüklemede aynı hareket tekrar işlenmez.
import { test, expect } from '@playwright/test';
import { serveDist, seed, PW, ensureDist, pickRole } from './app-helpers.mjs';
import { watchErrors } from './helpers.mjs';

const DIST = new URL('../app/dist-fake', import.meta.url).pathname;
const PORT = 8301;
let server, errors;

test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => { test.setTimeout(300_000); await ensureDist(DIST); server = await serveDist(DIST, PORT); });
test.afterAll(() => server && server.close());
test.beforeEach(async ({ page }) => {
  errors = watchErrors(page);
  const db = seed();
  db.tables.properties[0].pay_code = 'K7MXRP';
  await page.addInitScript(d => { if (!localStorage.getItem('__fakedb')) localStorage.setItem('__fakedb', JSON.stringify(d)); }, db);
});
test.afterEach(() => { expect(errors).toEqual([]); });

const url = p => `http://localhost:${PORT}${p}`;
const db = page => page.evaluate(() => JSON.parse(localStorage.getItem('__fakedb')));
const pad = (n) => String(n).padStart(2, '0');
const key = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1);
const tr = (d) => pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear();

/** Garanti "hesap hareketleri" düzeninde CSV (aynı başlıklar; .xls okuma birim testinde). */
function statement(rows) {
  return ['T. GARANTİ BANKASI A.Ş.', '', 'Tarih;Açıklama;Etiket;Tutar;Bakiye;Dekont No', ...rows.map((r) => r.join(';'))].join('\n');
}

test('kira: kodlu ödeme kesin eşleşir ve onaylanır; dekontla kayıtlı ödeme ve kart aktarımı sayılmaz; birden çok ekstre birlikte; döviz hesabı eşleştirilmez; ikinci yüklemede tekrar yok', async ({ page }) => {
  await page.goto(url('/giris/mulk-sahibi'));
  await page.getByLabel('E-posta').fill('ev@ornek.com');
  await page.getByLabel('Şifre', { exact: true }).fill(PW);
  await page.getByRole('button', { name: 'Giriş yap' }).click();
  await pickRole(page);
  const now = new Date(), d1 = new Date(now.getFullYear(), now.getMonth(), 1), d2 = new Date(now.getFullYear(), now.getMonth(), 2);
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const isoDay = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  // Bu ayın kirası dekontla onaylanmış (ödeme tarihi ayın 1'i); gelecek ay açık.
  await page.evaluate(([m, d]) => {
    const x = JSON.parse(localStorage.getItem('__fakedb'));
    x.tables.payments = [{ property_id: 'p1', month: m, kind: 'kira', status: 'approved', amount: 30000, paid_on: d, method: 'dekont', receipt_name: 'dekont.pdf', approved_at: new Date().toISOString() }];
    localStorage.setItem('__fakedb', JSON.stringify(x));
  }, [key(now), isoDay(d1)]);
  await page.goto(url('/uygulama'));
  const csv = statement([
    [tr(d1), 'MEHMET KİRACI', 'Para Transferi', '30000', '0', '1'],           // dekontla zaten onaylanmış bu ayın kirası
    [tr(d2), 'AHMET YILMAZ K7MXRP KİRA', 'Para Transferi', '30000', '0', '2'], // kodlu: gelecek ayın kirası (peşin)
    [tr(d2), 'IYZICO TOPLU AKTARIM', 'Para Transferi', '980', '0', '3'],
    [tr(d2), 'MARKET', 'Harcama', '-250', '0', '4']
  ]);
  // İkinci hesabın ekstresi: biri ilk dosyadakiyle aynı hareket (çakışan dönem), biri kodsuz ve tanınmayan gönderen.
  const csv2 = statement([[tr(d2), 'AHMET YILMAZ K7MXRP KİRA', 'Para Transferi', '30000', '0', '2'], [tr(d2), 'BİLİNMEYEN', 'Para Transferi', '500', '0', '9']]);
  const upload = async (list) => {
    const pick = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: /^(Ekstre yükle|Ekstre ekle)$/ }).click();
    await (await pick).setFiles(list.map((b, i) => ({ name: 'ekstre-' + i + '.csv', mimeType: 'text/csv', buffer: Buffer.from(b, 'utf8') })));
  };
  // Döviz hesabının ekstresi: kodlu ve tutarı tutsa bile eşleştirilmez (kira TL), uyarı gösterilir.
  const usd = ['T. GARANTİ BANKASI A.Ş.', '', 'Tarih;Açıklama;Etiket;Tutar (USD);Bakiye (USD);Dekont No', [tr(d2), 'K7MXRP', 'Para Transferi', '30000', '0', '7'].join(';')].join('\n');
  await upload([csv, csv2, usd]);   // birden çok dosya birlikte seçilir
  await expect(page.getByText('Döviz hesabı, eşleştirilmedi (aidat ve kira TL): ekstre-2.csv (USD)')).toBeVisible();
  await expect(page.getByText(/Garanti BBVA · 2 dosya · 4 gelen ödeme · 1 kesin · 0 öneri · 1 eşleşmeyen · 1 zaten kayıtlı · 1 kart aktarımı · 1 hareket birden çok dosyada/)).toBeVisible();
  await expect(page.getByRole('checkbox', { name: /Moda Dairesi · .* kira/ })).toBeVisible();
  await page.getByRole('button', { name: 'Seçilenleri onayla (1)' }).click();
  await expect(page.getByText('İşlendi')).toBeVisible();
  const d = await db(page);
  expect(d.tables.payments.find((x) => x.month === key(next))).toMatchObject({ status: 'approved', amount: 30000, method: 'havale' });
  expect(d.tables.payments.find((x) => x.month === key(now))).toMatchObject({ method: 'dekont' });   // bu ay tekrar sayılmadı
  expect(d.tables.payments.filter((x) => x.status === 'approved')).toHaveLength(2);
  expect(d.tables.rent_bank_txns).toHaveLength(1);
  expect(JSON.stringify(d.tables.rent_bank_txns)).not.toContain('AHMET');
  await page.getByRole('button', { name: 'Temizle' }).click();
  await upload([csv]);
  await expect(page.getByText(/3 gelen ödeme · 0 kesin .* 1 daha önce işlenmiş/)).toBeVisible();
});
