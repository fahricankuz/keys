// Seçilen para biriminde rapor (app/src/domain/fx-report.js): her işlem kendi gününün kuruyla; dövizli sözleşmede kur farkı ayrı.
import { test, expect } from '@playwright/test';
import { fxTable } from '../app/src/domain/fx.js';
import { amountIn, chargeIn, monthlyRevenue } from '../app/src/domain/fx-report.js';

const t = fxTable([
  { day: '2026-10-10', currency: 'USD', sell: 40 }, { day: '2026-10-20', currency: 'USD', sell: 42 },
  { day: '2026-10-10', currency: 'EUR', sell: 46 }
]);

test('TL sözleşme: istenen son ödeme gününün, tahsilat ödeme gününün kuruyla; ₺ görünümü kayıtlı tutar', () => {
  const x = { month: '2026-10', due_on: '2026-10-10', amount: 4000, status: 'paid', paid_on: '2026-10-20', currency: 'TRY' };
  expect(chargeIn(x, 'TRY', t)).toEqual({ charged: 4000, collected: 4000, unpaid: 0, diff: 0, missing: false });
  const u = chargeIn(x, 'USD', t);
  expect(u.charged).toBe(100);
  expect(u.collected).toBeCloseTo(95.238, 3);
  expect(chargeIn({ ...x, status: 'open' }, 'USD', t)).toMatchObject({ collected: 0, unpaid: 100 });
});

test('dolar sözleşme: sözleşmedeki dolar esas, TL değer kaybı kur farkı satırında', () => {
  const x = { month: '2026-10', due_on: '2026-10-10', currency: 'USD', orig_amount: 1000, fx: 40, amount: 40000, status: 'paid', paid_on: '2026-10-20' };
  const u = chargeIn(x, 'USD', t);
  expect(u.charged).toBe(1000);
  expect(u.collected).toBe(1000);
  expect(u.diff).toBeCloseTo(40000 / 42 - 1000, 6);              // ödeme günü TL ≈ $952 → −$48 kur farkı
  const tl = chargeIn(x, 'TRY', t);
  expect(tl).toMatchObject({ charged: 40000, collected: 40000 });
  expect(tl.diff).toBe(40000 - 1000 * 42);                       // −₺2.000
  expect(chargeIn({ ...x, status: 'partial', paid_amount: 20000 }, 'USD', t).unpaid).toBe(500);
});

test('kur yoksa tutar uydurulmaz; gider harcama gününün kuruyla; 12 aylık gelir', () => {
  expect(chargeIn({ month: '2020-01', amount: 100, status: 'open' }, 'USD', t).missing).toBe(true);
  expect(amountIn(4600, '2026-10-11', 'EUR', t)).toBe(100);
  expect(amountIn(4600, '2020-01-01', 'EUR', t)).toBe(null);
  expect(amountIn(4600, '2020-01-01', 'TRY', t)).toBe(4600);
  const rev = monthlyRevenue([{ month: '2026-10', due_on: '2026-10-10', amount: 4000, status: 'open' }], '2026-10', 'USD', t);
  expect(rev.length).toBe(12);
  expect(rev[0].month).toBe('2025-11');
  expect(rev[11]).toEqual({ month: '2026-10', value: 100, missing: false });
});
