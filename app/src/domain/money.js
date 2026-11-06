/* Para biçimi (₺ / $ / €): Türkçe ya da İngilizce yazım, kuruşsuz; kısa biçim grafik etiketleri için (1,2 mn ₺ gibi kesilmeden). */
import { locale } from './i18n.js';
import { t } from './i18n.js';
import { fxSymbol } from './fx.js';

/** "₺1.234.567", "$12.345", "€980"; null → "—" (kur bekleniyor). */
export function fmtMoney(n, cur = 'TRY', digits = 0){
  if (n == null || !isFinite(Number(n))) return '—';
  const v = Number(n), neg = v < 0 ? '−' : '';
  return neg + fxSymbol(cur) + Math.abs(v).toLocaleString(locale(), { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/** Kısa biçim: 950 → "₺950", 12.300 → "₺12,3 b", 4.560.000 → "₺4,56 mn", 2,1 milyar → "₺2,1 mr". */
export function fmtShort(n, cur = 'TRY'){
  if (n == null || !isFinite(Number(n))) return '—';
  const v = Math.abs(Number(n)), neg = Number(n) < 0 ? '−' : '';
  const units = [[1e9, t('mr')], [1e6, t('mn')], [1e3, t('b')]];
  for (const [d, u] of units) if (v >= d) {
    const x = v / d;
    return neg + fxSymbol(cur) + x.toLocaleString(locale(), { maximumFractionDigits: x < 10 ? 2 : x < 100 ? 1 : 0 }) + ' ' + u;
  }
  return neg + fxSymbol(cur) + Math.round(v).toLocaleString(locale());
}
