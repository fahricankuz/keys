// Kur çekme ve çevirme kuralları: EVDS yanıtı (supabase/functions/tufe-sync/fx.ts) ve uygulamadaki kur tablosu (app/src/domain/fx.js).
import { test, expect } from '@playwright/test';
import { dayKey, fxRanges, fxUrl, num, parseFx } from '../supabase/functions/tufe-sync/fx.ts';
import { fromTl, fxTable, rateDay, rateOn, toTl } from '../app/src/domain/fx.js';

test('EVDS günlük yanıtı: tarih ve sayı biçimleri, tatilde boş değer atlanır, satış yoksa satır yok', () => {
  expect(dayKey('02-01-2020')).toBe('2020-01-02');
  expect(dayKey('2-1-2020')).toBe('2020-01-02');
  expect(dayKey('2020-01-02')).toBe('2020-01-02');
  expect(dayKey('2020-1')).toBe(null);
  expect(num('36,12345')).toBe(36.1235);
  expect(num('')).toBe(null);
  expect(num(null)).toBe(null);
  expect(num('0')).toBe(null);
  const rows = parseFx([
    { Tarih: '06-11-2026', TP_DK_USD_A_YTL: '41.9', TP_DK_USD_S_YTL: '42.0', TP_DK_EUR_A_YTL: '48.4', TP_DK_EUR_S_YTL: '48.5' },
    { Tarih: '07-11-2026', TP_DK_USD_A_YTL: null, TP_DK_USD_S_YTL: null, TP_DK_EUR_A_YTL: null, TP_DK_EUR_S_YTL: null },
    { Tarih: '09-11-2026', TP_DK_USD_A_YTL: '42.1', TP_DK_USD_S_YTL: '42.2', TP_DK_EUR_A_YTL: '', TP_DK_EUR_S_YTL: '' },
    { Tarih: 'bozuk', TP_DK_USD_S_YTL: '1' }
  ]);
  expect(rows).toEqual([
    { day: '2026-11-06', currency: 'USD', buy: 41.9, sell: 42, source: 'evds' },
    { day: '2026-11-06', currency: 'EUR', buy: 48.4, sell: 48.5, source: 'evds' },
    { day: '2026-11-09', currency: 'USD', buy: 42.1, sell: 42.2, source: 'evds' }
  ]);
});

test('ilk çalışma 2020’den bugüne yıl yıl; sonraki çalışmalar son kayıttan 10 gün öncesinden', () => {
  const first = fxRanges(null, '2026-11-06');
  expect(first[0]).toEqual({ start: '01-01-2020', end: '31-12-2020' });
  expect(first.at(-1)).toEqual({ start: '01-01-2026', end: '06-11-2026' });
  expect(first.length).toBe(7);
  expect(fxRanges('2026-11-05', '2026-11-06')).toEqual([{ start: '26-10-2026', end: '06-11-2026' }]);
  expect(fxRanges('2020-01-03', '2020-01-06')).toEqual([{ start: '01-01-2020', end: '06-01-2020' }]);
  expect(fxUrl('https://evds3.tcmb.gov.tr/igmevdsms-dis/', { start: '01-01-2020', end: '31-12-2020' }))
    .toBe('https://evds3.tcmb.gov.tr/igmevdsms-dis/series=TP.DK.USD.A.YTL-TP.DK.USD.S.YTL-TP.DK.EUR.A.YTL-TP.DK.EUR.S.YTL&startDate=01-01-2020&endDate=31-12-2020&type=json&frequency=1');
});

test('uygulama: işlemin günü, yoksa son iş günü (sunucudaki fx_rate ile aynı kural); kur yoksa uydurmaz', () => {
  const t = fxTable([
    { day: '2026-11-09', currency: 'USD', sell: '42.2' },
    { day: '2026-11-06', currency: 'USD', sell: '42' },
    { day: '2026-11-06', currency: 'EUR', sell: 48.5 }
  ]);
  expect(rateOn(t, 'USD', '2026-11-06')).toBe(42);
  expect(rateOn(t, 'USD', '2026-11-08')).toBe(42);
  expect(rateDay(t, 'USD', '2026-11-08')).toBe('2026-11-06');
  expect(rateOn(t, 'USD', '2026-11-09T10:00:00Z')).toBe(42.2);
  expect(rateOn(t, 'USD', new Date(2026, 11, 31))).toBe(42.2);
  expect(rateOn(t, 'USD', '2026-11-05')).toBe(null);
  expect(rateOn(t, 'TRY', '2000-01-01')).toBe(1);
  expect(rateOn(fxTable([]), 'EUR', '2026-11-09')).toBe(null);
  expect(fromTl(t, 84000, 'USD', '2026-11-07')).toBe(2000);
  expect(toTl(t, 100, 'EUR', '2026-11-09')).toBe(4850);
  expect(fromTl(t, 1000, 'USD', '2020-01-01')).toBe(null);
  expect(fromTl(t, 1000, 'TRY', '2020-01-01')).toBe(1000);
});
