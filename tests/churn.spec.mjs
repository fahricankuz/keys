// Churn ve kohort hesapları (app/src/domain/churn.js).
import { test, expect } from '@playwright/test';
import { buildSync } from 'esbuild';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const D = new URL('../app/src/domain/', import.meta.url).pathname;
const STUBS = new URL('./stubs/', import.meta.url).pathname;
let addMonths, productMonthly, intervals, churnByMonth, churnKinds, atRisk, cohortGrid, payingGrid, cohortSummary;
test.beforeAll(async () => {
  const out = join(mkdtempSync(join(tmpdir(), 'churn-')), 'm.mjs');
  buildSync({
    stdin: { contents: `export * from '${D}churn.js';`, resolveDir: D, loader: 'js' },
    bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'silent',
    alias: { 'react-native': STUBS + 'react-native.js', '@react-native-async-storage/async-storage': STUBS + 'async-storage.js' },
    external: ['@supabase/supabase-js', 'expo-*', '@capacitor/*']
  });
  ({ addMonths, productMonthly, intervals, churnByMonth, churnKinds, atRisk, cohortGrid, payingGrid, cohortSummary } = await import(pathToFileURL(out).href));
});

const subs = [
  { id: 'a', created_at: '2026-01-10T10:00:00Z', subscribed: true, will_renew: true, billing_issue: false, expires_at: '2026-12-01' },
  { id: 'b', created_at: '2026-01-20T10:00:00Z', subscribed: false, will_renew: false, billing_issue: false },
  { id: 'c', created_at: '2026-02-05T10:00:00Z', subscribed: true, will_renew: false, billing_issue: false, expires_at: '2026-11-20' },
  { id: 'd', created_at: '2026-02-07T10:00:00Z', subscribed: true, will_renew: true, billing_issue: true, expires_at: '2026-11-15' },
  { id: 'e', created_at: '2026-03-01T10:00:00Z', subscribed: false, trial_ends: '2026-03-31T10:00:00Z' }
];
const events = [
  { user_id: 'b', kind: 'basladi', product_id: 'bes_3_aylik', at: '2026-02-01T10:00:00Z' },
  { user_id: 'b', kind: 'odeme_sorunu', product_id: 'bes_3_aylik', at: '2026-04-01T10:00:00Z' },
  { user_id: 'b', kind: 'bitti', product_id: 'bes_3_aylik', at: '2026-04-10T10:00:00Z' },
  { user_id: 'c', kind: 'basladi', product_id: 'tek_1_aylik', at: '2026-03-01T10:00:00Z' }
];

test('ay ekleme ve ürünün aylık değeri (yıllıkta 1/12; bilinmeyen ürün null)', () => {
  expect(addMonths('2026-11', 3)).toBe('2027-02');
  expect(addMonths('2026-01', -1)).toBe('2025-12');
  expect(productMonthly('bes_3_aylik')).toBeGreaterThan(0);
  expect(productMonthly('bes_3_yillik')).toBeLessThan(productMonthly('bes_3_aylik'));
  expect(productMonthly('kurumsal_x')).toBe(null);
});

test('aralıklar: olaylardan; başlangıcı kaydı olmayan ödeyen kayıt tarihinden beri', () => {
  const iv = intervals(events, subs);
  expect(iv.get('b')).toEqual([{ from: '2026-02-01T10:00:00Z', to: '2026-04-10T10:00:00Z', product_id: 'bes_3_aylik' }]);
  expect(iv.get('a')).toEqual([{ from: '2026-01-10T10:00:00Z', to: null, product_id: null, approx: true }]);
  expect(iv.get('c')[0].to).toBe(null);
});

test('aylık churn: dönem başı ödeyen, yeni, ayrılan, oran, kaybedilen aylık gelir', () => {
  const [mar, apr] = churnByMonth(events, subs, ['2026-03', '2026-04']);
  expect(mar).toMatchObject({ started: 1, ended: 0 });
  expect(apr.payersStart).toBe(4);                     // a, b, c, d (d başlangıç kaydı yok → kayıttan beri)
  expect(apr).toMatchObject({ ended: 1, rate: 0.25, lostMrr: productMonthly('bes_3_aylik') });
});

test('ayrılış türleri ve erken uyarı', () => {
  expect(churnKinds(events, subs, ['2026-03', '2026-04'], 30, new Date('2026-11-08'))).toEqual({ payment: 1, cancel: 0, other: 0, trialLost: 1 });
  const r = atRisk(subs);
  expect(r.cancelled.map((s) => s.id)).toEqual(['c']);
  expect(r.billing.map((s) => s.id)).toEqual(['d']);
});

test('kohort tablosu: rol süzgeci, oran, gelmemiş ay boş; özet en büyük düşüşü bulur', () => {
  const rows = [
    { cohort: '2026-09', role: 'landlord', size: 10, active: { '2026-09': 10, '2026-10': 6, '2026-11': 5 } },
    { cohort: '2026-09', role: 'tenant', size: 10, active: { '2026-09': 8, '2026-10': 2 } },
    { cohort: '2026-10', role: 'landlord', size: 4, active: { '2026-10': 4, '2026-11': 2 } }
  ];
  const now = new Date('2026-11-08');
  const all = cohortGrid(rows, 'all', now, 4);
  expect(all[0]).toEqual({ cohort: '2026-10', size: 4, cells: [1, 0.5, null, null] });
  expect(all[1]).toEqual({ cohort: '2026-09', size: 20, cells: [0.9, 0.4, 0.25, null] });
  expect(cohortGrid(rows, 'landlord', now, 4)[1].cells).toEqual([1, 0.6, 0.5, null]);
  const s = cohortSummary(all);
  expect(s.drop.k).toBe(1);
});

test('ödeme kohortu: kayıttan k ay sonra ödeyen oranı', () => {
  const g = payingGrid(events, subs, new Date('2026-04-15'), 4, 6);
  const jan = g.find((r) => r.cohort === '2026-01');           // a (kayıttan beri), b (Şubat–Nisan)
  expect(jan.size).toBe(2);
  expect(jan.cells).toEqual([0.5, 1, 1, 1]);
});
