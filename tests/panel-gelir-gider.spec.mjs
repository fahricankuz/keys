// Yönetici paneli gelir ve gider kuralları (app/src/domain/admin-finance.js): paket fiyatı × mülk adedi (yıllık ayda 1/12),
// gider tekrarı (tek seferlik, aylık, yıllık; ay sonu ve bitiş), KDV ayrımı, dövizli gider o günün kuruyla, yaklaşan giderler.
import { test, expect } from '@playwright/test';
import { buildSync } from 'esbuild';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const D = new URL('../app/src/domain/', import.meta.url).pathname;
const STUBS = new URL('./stubs/', import.meta.url).pathname;
let M;
test.beforeAll(async () => {
  const out = join(mkdtempSync(join(tmpdir(), 'gelir-gider-')), 'm.mjs');
  buildSync({
    stdin: { contents: `export * from '${D}admin-finance.js'; export { fxTable } from '${D}fx.js';`, resolveDir: D, loader: 'js' },
    bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'silent',
    alias: { 'react-native': STUBS + 'react-native.js', '@react-native-async-storage/async-storage': STUBS + 'async-storage.js' },
    external: ['@supabase/supabase-js', 'expo-*', '@capacitor/*']
  });
  M = await import(pathToFileURL(out).href);
});

test('tahmini gelir: paket fiyatı × mülk adedi; yıllık paket ayda 1/12; Kurumsal tahmine girmez', () => {
  const r = M.revenueEstimate([
    { plan: 'bes', yearly: true, owners: 1, units: 5 }, { plan: 'tek', yearly: false, owners: 2, units: 3 }, { plan: 'kurumsal', yearly: false, owners: 1, units: 40 }
  ]);
  expect(r.rows[0].monthly).toBeCloseTo((1999.90 * 5) / 12, 2);
  expect(r.rows[1].monthly).toBeCloseTo(99.99 * 3, 2);
  expect(r.rows[2].monthly).toBe(null);
  expect(r.mrr).toBeCloseTo((1999.90 * 5) / 12 + 99.99 * 3, 2);
  expect(r.arr).toBeCloseTo(r.mrr * 12, 1);
  expect(r.unpriced).toBe(1);
});

test('gider tekrarı: aylık (ay sonu kısalır), yıllık, tek seferlik, bitiş tarihi', () => {
  const monthly = { recurrence: 'monthly', start_on: '2026-01-31', end_on: '2026-06-30' };
  expect(M.occurrence(monthly, '2025-12')).toBe(null);
  expect(M.occurrence(monthly, '2026-01')).toBe('2026-01-31');
  expect(M.occurrence(monthly, '2026-02')).toBe('2026-02-28');
  expect(M.occurrence(monthly, '2026-06')).toBe('2026-06-30');
  expect(M.occurrence(monthly, '2026-07')).toBe(null);
  const yearly = { recurrence: 'yearly', start_on: '2025-03-15' };
  expect(M.occurrence(yearly, '2026-03')).toBe('2026-03-15');
  expect(M.occurrence(yearly, '2026-04')).toBe(null);
  const once = { recurrence: 'once', start_on: '2026-11-07' };
  expect(M.occurrence(once, '2026-11')).toBe('2026-11-07');
  expect(M.occurrence(once, '2026-12')).toBe(null);
});

test('KDV ayrımı ve aylık toplam: dövizli gider o günün kuruyla TL; kur yoksa toplama girmez', () => {
  expect(M.splitVat(120, true, 20)).toEqual({ gross: 120, net: 100, vat: 20 });
  const ex = M.splitVat(100, false, 20);
  expect(ex.gross).toBeCloseTo(120, 6);
  const t = M.fxTable([{ day: '2026-11-02', currency: 'USD', sell: 42 }]);
  const costs = [
    { id: 'a', title: 'Supabase', category: 'altyapi', amount: 25, currency: 'USD', vat_included: false, vat_rate: 20, recurrence: 'monthly', start_on: '2026-01-03' },
    { id: 'b', title: 'Hostinger', category: 'altyapi', amount: 1200, currency: 'TRY', vat_included: true, vat_rate: 20, recurrence: 'yearly', start_on: '2025-11-20' },
    { id: 'c', title: 'Reklam', category: 'pazarlama', amount: 500, currency: 'TRY', vat_included: true, vat_rate: 0, recurrence: 'once', start_on: '2026-10-01' },
    { id: 'd', title: 'Avro', category: 'diger', amount: 10, currency: 'EUR', vat_included: true, vat_rate: 20, recurrence: 'once', start_on: '2026-11-05' }
  ];
  const s = M.monthCosts(costs, '2026-11', t);
  expect(s.items.map((x) => x.cost.id)).toEqual(['a', 'd', 'b']);
  expect(s.items[0]).toMatchObject({ day: '2026-11-03', rate: 42 });
  expect(s.total).toBeCloseTo(25 * 42 * 1.2 + 1200, 6);
  expect(s.vat).toBeCloseTo(25 * 42 * 0.2 + 200, 6);
  expect(s.byCat).toEqual({ altyapi: expect.any(Number) });
  expect(s.missing).toBe(true);                                         // avro kuru yok
  const up = M.upcoming(costs, new Date(2026, 10, 7), 30);
  expect(up.map((x) => [x.cost.id, x.day])).toEqual([['b', '2026-11-20'], ['a', '2026-12-03']]);
});

test('dönem: bu ay ve 1 Ocak’tan bugüne; geçen yılın aynı dönemiyle karşılaştırma', () => {
  const now = new Date(2026, 10, 8);
  expect(M.periodMonths('month', now)).toEqual({ cur: ['2026-11'], prev: ['2026-10'] });
  const y = M.periodMonths('year', now);
  expect(y.cur.length).toBe(11);
  expect(y.cur[0]).toBe('2026-01');
  expect(y.prev[10]).toBe('2025-11');
  expect(M.periodMonths('month', new Date(2026, 0, 5)).prev).toEqual(['2025-12']);
});

test('gelir kırılımı: üyelik (kayıtlı tahmin + bu ay canlı + kurumsal bedel), işlem ücreti, hukuki; POS payı gidere', () => {
  const monthly = [
    { month: '2026-10', mrr: 1000, card: 10000, legal: 3000 },
    { month: '2026-11', mrr: 999, card: 20000, legal: 0 },
    { month: '2026-09', mrr: null, card: 0, legal: 0 }
  ];
  const orgs = [{ status: 'active', created_at: '2026-10-15', billing: { monthly_fee: 5000 } }, { status: 'paused', created_at: '2026-01-01', billing: { monthly_fee: 9999 } }];
  const costs = [{ id: 'a', category: 'altyapi', amount: 1200, currency: 'TRY', vat_included: true, vat_rate: 20, recurrence: 'monthly', start_on: '2026-01-01' }];
  const f = M.finance({ monthly, months: ['2026-09', '2026-10', '2026-11'], liveMrr: 1500, orgs, costs, table: M.fxTable([]), now: new Date(2026, 10, 8) });
  const part = (k) => f.incomeParts.find((x) => x.key === k).value;
  // Üyelik: Eylül kayıtsız (eksik), Ekim kayıtlı 1.000, Kasım canlı 1.500; kurumsal Ekim ve Kasım 5.000'er.
  expect(part('uyelik')).toBe(1000 + 1500 + 10000);
  expect(f.missingMonths).toBe(1);
  expect(part('komisyon')).toBeCloseTo(30000 * 0.025, 6);
  expect(part('diger')).toBe(3000);
  expect(f.expenseParts.find((x) => x.key === 'odeme').value).toBeCloseTo(30000 * 0.02, 6);
  expect(f.expenseParts.find((x) => x.key === 'altyapi').value).toBe(3600);
  expect(f.net).toBeCloseTo(f.income - f.expense, 6);
  expect(M.cardSplit(100, { feeRate: 0.03, providerRate: 0.02 })).toEqual({ fee: 3, pos: 2, net: 1 });   // 100 TL: %2 kurum, %1 bizim
});
