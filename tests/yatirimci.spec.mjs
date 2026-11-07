// Yatırımcı raporu hesabı (app/src/domain/investor.js), A4 belgesi (investor-html.js) ve "Mailime gönder" e-postası.
import { test, expect } from '@playwright/test';
import { buildSync } from 'esbuild';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { renderOutbox } from '../supabase/functions/mail-send/template.ts';

const D = new URL('../app/src/domain/', import.meta.url).pathname;
const STUBS = new URL('./stubs/', import.meta.url).pathname;
let M;

test.beforeAll(async () => {
  const out = join(mkdtempSync(join(tmpdir(), 'yatirimci-')), 'm.mjs');
  buildSync({
    stdin: { contents: `export * from '${D}investor.js'; export * from '${D}investor-html.js'; export { fxTable } from '${D}fx.js'; export { fmtMoney, fmtShort } from '${D}money.js';`, resolveDir: D, loader: 'js' },
    bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'silent',
    alias: { 'react-native': STUBS + 'react-native.js', '@react-native-async-storage/async-storage': STUBS + 'async-storage.js' },
    external: ['@supabase/supabase-js', 'expo-*', '@capacitor/*']
  });
  M = await import(pathToFileURL(out).href);
});

const now = '2026-01-01T00:00:00Z';
function fixture() {
  const units = [
    { id: 'u1', block: 'Levent Ofis', no: 'K1', area: 1000, rent: 10000, currency: 'USD', lease_end: '2028-12-31', index_kind: 'tufe' },
    { id: 'u2', block: 'Levent Ofis', no: 'K2', area: 500, rent: 200000, currency: 'TRY', lease_end: '2027-06-30', index_kind: 'sabit' },
    { id: 'u3', block: 'Tuzla Depo', no: 'D1', area: 2000, rent: 0, currency: 'TRY', lease_end: null, index_kind: 'tufe' },     // boş
    { id: 'u4', block: 'Tuzla Depo', no: 'D2', area: 500, rent: 100000, currency: 'TRY', lease_end: null, index_kind: 'yok' }  // süresiz
  ];
  const residents = [
    { unit_id: 'u1', role: 'kiraci', name: 'Delta Holding' }, { unit_id: 'u2', role: 'kiraci', name: 'Ece Mimarlık' }, { unit_id: 'u4', role: 'kiraci', name: 'Kargo AŞ' }
  ];
  const ch = (id, unit_id, month, kind, amount, extra = {}) => ({ id, unit_id, month, kind, amount, status: 'open', paid_amount: 0, due_on: month + '-05', ...extra });
  const charges = [];
  for (const m of ['2026-07', '2026-08', '2026-09']) {
    charges.push(ch('a' + m, 'u1', m, 'kira', 400000, { currency: 'USD', orig_amount: 10000, fx: 40, status: 'paid', paid_on: m + '-05', paid_amount: 400000 }));
    charges.push(ch('b' + m, 'u2', m, 'kira', 200000, { status: 'paid', paid_on: m + '-05', paid_amount: 200000 }));
    charges.push(ch('c' + m, 'u4', m, 'kira', 100000, { status: m === '2026-07' ? 'open' : 'paid', paid_on: m === '2026-07' ? null : m + '-05', paid_amount: m === '2026-07' ? 0 : 100000 }));
    charges.push(ch('d' + m, 'u2', m, 'ortak_gider', 40000, { status: 'paid', paid_on: m + '-05', paid_amount: 40000 }));
  }
  charges.push(ch('e1', 'u1', '2026-04', 'kira', 400000, { currency: 'USD', orig_amount: 10000, fx: 40, status: 'paid', paid_on: '2026-04-05', paid_amount: 400000 }));
  const expenses = [
    { id: 'x1', cat: 'Güvenlik', amount: 60000, spent_on: '2026-08-10', kind: 'ortak' },
    { id: 'x2', cat: 'Sigorta', amount: 80000, spent_on: '2026-09-10' },            // türü yok → işletme gideri
    { id: 'x3', cat: 'Eski', amount: 1, spent_on: '2026-06-30', kind: 'isletme' }   // önceki çeyrek
  ];
  const rentChanges = [{ unit_id: 'u2', from_date: '2026-08-01', old_amount: 160000, new_amount: 200000, currency: 'TRY' }];
  return { units, residents, charges, expenses, rentChanges, linked: [], budgets: [], requests: [], turnovers: [] };
}
const rates = () => M.fxTable([{ day: '2026-01-01', currency: 'USD', sell: 40 }, { day: '2026-01-01', currency: 'EUR', sell: 50 }]);
const org = { name: 'Marmara GYO', sector: 'gyo', report_currency: 'USD' };

test('sayı biçimi: Türkçe, kuruşsuz, eksi işareti; kısa biçim kesilmeden (bin, mn, mr)', () => {
  expect(M.fmtMoney(1234567, 'TRY')).toBe('₺1.234.567');
  expect(M.fmtMoney(-47.6, 'USD')).toBe('−$48');
  expect(M.fmtMoney(41.78, 'TRY', 2)).toBe('₺41,78');
  expect(M.fmtMoney(null, 'EUR')).toBe('—');
  expect(M.fmtShort(950, 'USD')).toBe('$950');
  expect(M.fmtShort(12300, 'TRY')).toBe('₺12,3 bin');
  expect(M.fmtShort(4560000, 'EUR')).toBe('€4,56 mn');
  expect(M.fmtShort(2100000000, 'TRY')).toBe('₺2,1 mr');
});

test('dönemler: çeyrek ve yıl, önceki dönem, son tamamlanan çeyrek', () => {
  expect(M.periodRange('2026-Q3')).toMatchObject({ months: ['2026-07', '2026-08', '2026-09'], from: '2026-07-01', to: '2026-09-30', prev: '2026-Q2', quarter: true });
  expect(M.periodRange('2026-Q1').prev).toBe('2025-Q4');
  expect(M.periodRange('2025')).toMatchObject({ from: '2025-01-01', to: '2025-12-31', prev: '2024', quarter: false });
  expect(M.periodRange('2025').months.length).toBe(12);
  expect(M.lastQuarter(new Date(2026, 10, 6))).toBe('2026-Q3');
  expect(M.lastQuarter(new Date(2026, 1, 6))).toBe('2025-Q4');
  expect(M.isPeriod('2026-Q5')).toBe(false);
});

test('gösterge ve özet: gelir, NOI, marj, tahsilat, doluluk (m²), WALE; önceki dönem', () => {
  const r = M.investorReport({ d: fixture(), org, key: '2026-Q3', table: rates(), today: new Date('2026-11-06T12:00:00Z') });
  expect(r.cur).toBe('USD');
  expect(r.asOf).toBe('2026-09-30');
  // Brüt kira: 3 × ($10.000 + 200.000/40 + 100.000/40) = $52.500; ortak gider tahakkuku 3 × 40.000/40 = $3.000.
  expect(r.now.gross).toBe(52500);
  expect(r.now.service).toBe(3000);
  expect(r.now.serviceCost).toBe(1500);
  expect(r.now.opex).toBe(2000);
  expect(r.now.noi).toBe(52000);
  expect(r.kpi.revenue).toBe(55500);
  expect(r.kpi.margin).toBeCloseTo(52000 / 55500, 6);
  expect(r.now.collection).toBeCloseTo((55500 - 2500) / 55500, 6);
  expect(r.tl.gross).toBe(2100000);
  expect(r.prev.gross).toBe(10000);
  expect(r.prev.opex).toBeCloseTo(1 / 40, 6);
  expect(r.kpi.occupancy).toBe(2000 / 4000);                           // u3 boş
  // WALE (kira ağırlıklı): u1 $120.000/yıl, 2028-12-31'e 2,25 yıl; u2 $60.000/yıl, 2027-06-30'a 0,75 yıl; süresiz u4 sayılmaz.
  expect(r.kpi.wale).toBeCloseTo((120000 * 2.2533 + 60000 * 0.7474) / 180000, 2);
  expect(r.kpi.waleArea).toBeCloseTo((1000 * 2.2533 + 500 * 0.7474) / 1500, 2);
});

test('ayrıntılar: varlık doluluğu, biten sözleşmeler ve kira payı, en büyük kiracılar, artışlar, 30 günü geçen alacak', () => {
  const r = M.investorReport({ d: fixture(), org, key: '2026-Q3', table: rates(), today: new Date('2026-11-06T12:00:00Z') });
  expect(r.assets.map((a) => [a.name, a.area, a.occArea])).toEqual([['Tuzla Depo', 2500, 500], ['Levent Ofis', 1500, 1500]]);
  expect(r.expiries.map((x) => [x.year, x.count, Math.round(x.share * 1000) / 10])).toEqual([['2027', 1, 28.6], ['2028', 1, 57.1], ['Süresiz', 1, 14.3]]);
  expect(r.tenants.map((x) => x.name)).toEqual(['Delta Holding', 'Ece Mimarlık', 'Kargo AŞ']);
  expect(r.tenants[0]).toMatchObject({ area: 1000, rent: 120000, end: '2028-12-31' });
  expect(r.increases).toEqual([expect.objectContaining({ tenant: 'Ece Mimarlık', kind: 'sabit', rate: 0.25, date: '2026-08-01' })]);
  expect(r.receivables).toEqual([expect.objectContaining({ tenant: 'Kargo AŞ', amount: 2500, count: 1 })]);
  expect(r.receivables[0].days).toBe(87);
});

test('avro raporu ve kur yokken eksik işareti', () => {
  const eur = M.investorReport({ d: fixture(), org: { ...org, report_currency: 'EUR' }, key: '2026-Q3', table: rates(), today: new Date('2026-11-06T12:00:00Z') });
  expect(eur.cur).toBe('EUR');
  expect(eur.now.gross).toBe(42000);                                     // $10.000 × 40 / 50 + 300.000 / 50 = €14.000 / ay
  const none = M.investorReport({ d: fixture(), org, key: '2026-Q3', table: M.fxTable([]), today: new Date('2026-11-06T12:00:00Z') });
  expect(none.missing).toBe(true);
  expect(none.now.gross).toBe(0);
});

test('A4 belgesi: üç sayfa, betik yok, kaçışlı ad, not yalnız doluysa, yöntem notu ve kur dip notu; uzun listeler kısaltılır', () => {
  const d = fixture();
  const r = M.investorReport({ d, org: { ...org, name: 'Marmara <b>GYO</b>' }, key: '2026-Q3', table: rates(), today: new Date('2026-11-06T12:00:00Z') });
  const html = M.investorHtml(r, { origin: 'https://anahtar.io', generated: new Date(2026, 10, 6) });
  expect(html.match(/<section class="page/g).length).toBe(3);
  expect(html).not.toMatch(/<script|onclick=/);
  expect(html).toContain('Marmara &lt;b&gt;GYO&lt;/b&gt;');
  expect(html).toContain('@page{size:A4;margin:0}');
  expect(html).toContain('width:210mm;height:297mm');
  expect(html).toContain('https://anahtar.io/marka/anahtar-logo-seffaf-beyaz.png');
  expect(html).toContain('$55.500');
  expect(html).toContain('denetlenmiş finansal tablo ya da değerleme raporu yerine geçmez');
  expect(html).toContain('TCMB döviz satış kuru');
  expect(html).toContain('1 $ = ₺40,00');
  expect(html).not.toContain('Yönetimin notu');
  const withNote = M.investorHtml(M.investorReport({ d, org, key: '2026-Q3', table: rates(), note: 'Doluluk <hedef> %95', today: new Date('2026-11-06T12:00:00Z') }), {});
  expect(withNote).toContain('Yönetimin notu');
  expect(withNote).toContain('Doluluk &lt;hedef&gt; %95');
  // Çok varlık ve çok yıl: sayfaya sığacak kadar satır, kalanı "ve n … daha".
  for (let i = 0; i < 12; i++) d.units.push({ id: 'z' + i, block: 'Varlık ' + i, no: '1', area: 10, rent: 1000, currency: 'TRY', lease_end: (2030 + i) + '-01-01' });
  for (let i = 0; i < 12; i++) d.residents.push({ unit_id: 'z' + i, role: 'kiraci', name: 'Kiracı ' + i });
  const big = M.investorHtml(M.investorReport({ d, org, key: '2026-Q3', table: rates(), today: new Date('2026-11-06T12:00:00Z') }), {});
  expect(big).toMatch(/ve \d+ varlık daha/);
  expect(big).toMatch(/ve \d+ yıl daha/);
  expect((big.match(/<td class="clip">Kiracı \d+/g) || []).length).toBeLessThanOrEqual(10);
});

test('TL raporu: çeviri yok, TL sütunu tekrarlanmaz, kur dip notu yok; kurumun varsayılanı yalnız seçim yoksa', () => {
  const tl = M.investorReport({ d: fixture(), org, key: '2026-Q3', table: rates(), cur: 'TRY', today: new Date('2026-11-06T12:00:00Z') });
  expect(tl.cur).toBe('TRY');
  expect(tl.now.gross).toBe(2100000);                                    // kayıtlı TL
  expect(tl.rate).toBe(null);
  const html = M.investorHtml(tl, {});
  expect(html).not.toContain('TCMB döviz satış kuruyla çevrilmiştir');
  expect(html).not.toContain('Dönem sonu kuru');
  expect(html).toContain('Tutarlar TL’dir');
  expect(html).toContain('12 aylık gelir (TL)');
  expect(html).not.toContain('<th class="n">TL</th><th class="n">TL</th>');
  expect(html).toContain('₺2.100.000');
  expect(M.investorReport({ d: fixture(), org: { ...org, report_currency: 'EUR' }, key: '2026-Q3', table: rates() }).cur).toBe('EUR');
  expect(M.investorReport({ d: fixture(), org: { ...org, report_currency: 'EUR' }, key: '2026-Q3', table: rates(), cur: 'USD' }).cur).toBe('USD');
});

test('mailime gönder e-postası: özet satırları, rapor bağlantısı (dönemle), kaçış ve İngilizce', () => {
  const data = { org: 'Marmara <GYO>', period: '2026-Q3', label: '3. çeyrek 2026', revenue: '$55.500', noi: '$52.000', margin: '%93,7', occupancy: '%50', wale: '2,4 yıl',
    collection: '%95,5', receivables: '$2.500', fx_diff: '$0', prev_revenue: '$10.000', prev_label: '2. çeyrek 2026' };
  const m = renderOutbox({ kind: 'investor_report', data }, 'https://anahtar.io');
  expect(m.subject).toBe('Marmara <GYO> · Yatırımcı raporu · 3. çeyrek 2026');
  expect(m.html).toContain('Marmara &lt;GYO&gt;');
  expect(m.html).toContain('href="https://anahtar.io/uygulama/site/yatirimci?donem=2026-Q3"');
  for (const v of ['$55.500', '%93,7', '2,4 yıl', 'Önceki dönem (2. çeyrek 2026)', 'değerleme raporu yerine geçmez']) expect(m.html).toContain(v);
  expect(m.text).toContain('Dönem geliri: $55.500');
  const bad = renderOutbox({ kind: 'investor_report', data: { ...data, period: '"><script>' } }, 'https://anahtar.io');
  expect(bad.html).toContain('href="https://anahtar.io/uygulama/site/yatirimci"');
  const en = renderOutbox({ kind: 'investor_report', lang: 'en', data }, 'https://anahtar.io');
  expect(en.html).toContain('Period revenue');
  expect(en.html).toContain('lang="en"');
});
