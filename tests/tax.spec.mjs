// Vergi hesabı birim testleri — tarayıcı gerekmez.
import { test, expect } from '@playwright/test';
import { progressive, estimate, ratesFor, RATES } from '../assets/js/tax.js';

test('artan oranlı tarife dilimleri doğru toplar', () => {
  const b = RATES[2025].brackets;
  expect(progressive(0, b)).toBe(0);
  expect(progressive(158000, b)).toBe(23700);                       // 158.000 × %15
  expect(progressive(200000, b)).toBe(23700 + 42000 * 0.20);         // ikinci dilime taşma
  expect(progressive(5000000, b)).toBe(Math.round(
    158000 * .15 + 172000 * .20 + 470000 * .27 + 3500000 * .35 + 700000 * .40));
});

const konut = (gross, exp = 0, withheld = 0) => ({ konut:{ gross, exp, withheld } });

test('istisna altında vergi çıkmaz', () => {
  const e = estimate(konut(40000, 5000), { year:2025 });
  expect(e.belowExemption).toBe(true);
  expect(e.goturu.payable).toBe(0);
});

test('götürü ve gerçek gider karşılaştırılır', () => {
  const e = estimate(konut(390000, 20000), { year:2025 });
  expect(e.declared).toBe(390000 - 47000);
  expect(e.goturu.base).toBe(Math.round(343000 * 0.85));
  // İstisna varken giderin yalnızca vergiye tabi kısma düşen payı indirilir.
  expect(e.gercek.allowed).toBe(Math.round(20000 * 343000 / 390000));
  expect(e.best).toBe('goturu');

  const heavy = estimate(konut(390000, 150000), { year:2025 });
  expect(heavy.best).toBe('gercek');
});

test('istisna kapatılınca tüm gelir vergiye tabidir', () => {
  const e = estimate(konut(390000), { year:2025, noExemption:true });
  expect(e.istisna).toBe(0);
  expect(e.declared).toBe(390000);
});

test('işyeri kirasına konut istisnası uygulanmaz', () => {
  const e = estimate({ diger:{ gross:40000, withheld:0, exp:0 } }, { year:2025 });
  expect(e.needed).toBe(true);
  expect(e.declared).toBe(40000);
  expect(e.goturu.payable).toBe(progressive(34000, RATES[2025].brackets));
});

test('stopajlı işyeri kirası beyan sınırının altındaysa beyana girmez', () => {
  const e = estimate({ stopajli:{ gross:300000, withheld:60000, exp:0 } }, { year:2025 });
  expect(e.includeW).toBe(false);
  expect(e.needed).toBe(false);
  expect(e.credit).toBe(0);
});

test('beyan sınırını aşan stopajlı kira beyana girer, stopaj mahsup edilir', () => {
  const e = estimate({ stopajli:{ gross:720000, withheld:144000, exp:0 } }, { year:2025 });
  expect(e.includeW).toBe(true);
  expect(e.declared).toBe(720000);
  expect(e.credit).toBe(144000);
  const base = Math.round(720000 * 0.85);
  expect(e.goturu.payable).toBe(progressive(base, RATES[2025].brackets) - 144000);
});

test('konut beyanı gerekse de sınır altındaki stopajlı işyeri kirası eklenmez', () => {
  const e = estimate({ konut:{ gross:390000, exp:0, withheld:0 }, stopajli:{ gross:300000, withheld:60000, exp:0 } }, { year:2025 });
  expect(e.needed).toBe(true);
  expect(e.declared).toBe(390000 - 47000);
  expect(e.credit).toBe(0);
});

test('verisi olmayan yıl en yakın önceki yıla düşer ve işaretlenir', () => {
  const r = ratesFor(2031);
  expect(r.approx).toBe(true);
  expect(r.year).toBe(Math.max(...Object.keys(RATES).map(Number)));
  expect(ratesFor(2024).approx).toBe(false);
});
