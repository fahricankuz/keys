// Uygulamadaki kira geliri vergi tahmini (app/src/domain/tax.js): 2026 oranları (332 sıra no.lu GVGT, RG 31.12.2025).
import { test, expect } from '@playwright/test';
import { estimate, progressive, ratesFor, RATES } from '../app/src/domain/tax.js';

test('2026 oranları var: yaklaşık uyarısı çıkmaz; istisna 58.000, beyan sınırı 400.000, dilimler güncel', () => {
  const r = ratesFor(2026);
  expect(r.approx).toBe(false);
  expect(r.istisna).toBe(58000);
  expect(r.beyanSiniri).toBe(400000);
  expect(r.brackets.map(([u]) => u)).toEqual([190000, 400000, 1000000, 5300000, Infinity]);
  expect(r.brackets.map(([, o]) => o)).toEqual([0.15, 0.20, 0.27, 0.35, 0.40]);
});

test('2026 tarifesi: 190.000 → 28.500; 400.000 → 70.500; 1.000.000 → 232.500; 5.300.000 → 1.737.500', () => {
  const b = RATES[2026].brackets;
  expect(progressive(190000, b)).toBe(28500);
  expect(progressive(400000, b)).toBe(70500);
  expect(progressive(1000000, b)).toBe(232500);
  expect(progressive(5300000, b)).toBe(1737500);
});

test('2026: 58.000 ₺ altı konut kirası beyana girmez; üstü götürü giderle hesaplanır', () => {
  expect(estimate({ konut: { gross: 55000, withheld: 0, exp: 0 } }, { year: 2026 }).needed).toBe(false);
  const e = estimate({ konut: { gross: 360000, withheld: 0, exp: 0 } }, { year: 2026 });
  expect(e.konutTaxable).toBe(302000);
  expect(e.goturu.base).toBe(256700);                       // 302.000 × 0,85
  expect(e.goturu.payable).toBe(28500 + Math.round((256700 - 190000) * 0.20));
});

test('verisi olmayan yıl (2027) 2026 değerleriyle yaklaşık hesaplanır', () => {
  const r = ratesFor(2027);
  expect(r.approx).toBe(true);
  expect(r.year).toBe(2026);
});
