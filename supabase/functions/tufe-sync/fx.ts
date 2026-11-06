// Kur çekme yardımcıları (tufe-sync): TCMB EVDS günlük dolar ve avro kurları → public.fx_rates satırları.
// Saf işlevler; testler (tests/kur.spec.mjs) doğrudan içe aktarır.

/** EVDS seri kodları: A döviz alış, S döviz satış (1 birim döviz kaç TL). */
export const FX_SERIES = {
  USD: { buy: 'TP.DK.USD.A.YTL', sell: 'TP.DK.USD.S.YTL' },
  EUR: { buy: 'TP.DK.EUR.A.YTL', sell: 'TP.DK.EUR.S.YTL' }
} as const;

/** İlk çalışmada doldurulan geçmişin başlangıcı. */
export const FX_FROM = '2020-01-01';

export type FxRow = { day: string; currency: 'USD' | 'EUR'; buy: number | null; sell: number; source: 'evds' };

const col = (code: string) => code.replaceAll('.', '_');

/** EVDS tarihleri ("02-01-2020", "2-1-2020", "2020-01-02") → "2020-01-02"; tanınmazsa null. */
export function dayKey(s: unknown): string | null {
  const t = String(s ?? '').trim();
  let m = t.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  return null;
}

/** "36,1234" ya da "36.1234" → 36.1234; boş, sıfır ve sayı olmayan → null (tatil günlerinde EVDS boş döndürür). */
export function num(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(String(v).replace(',', '.'));
  return isFinite(n) && n > 0 ? Math.round(n * 10000) / 10000 : null;
}

/** EVDS yanıtındaki satırlar → fx_rates satırları. Satış kuru olmayan gün (tatil) atlanır. */
export function parseFx(items: Record<string, unknown>[] = []): FxRow[] {
  const out: FxRow[] = [];
  for (const it of items) {
    const day = dayKey(it.Tarih);
    if (!day) continue;
    for (const cur of ['USD', 'EUR'] as const) {
      const sell = num(it[col(FX_SERIES[cur].sell)]);
      if (sell == null) continue;
      out.push({ day, currency: cur, buy: num(it[col(FX_SERIES[cur].buy)]), sell, source: 'evds' });
    }
  }
  return out;
}

const dmy = (iso: string) => `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}`;
const addDays = (iso: string, n: number) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

/** Çekilecek aralıklar (EVDS biçimi gg-aa-yyyy). Kayıt yoksa 2020'den bugüne yıl yıl; varsa son kayıttan 10 gün öncesinden
    bugüne (TCMB'nin geç düzelttiği günler de yenilenir). */
export function fxRanges(last: string | null, today: string): { start: string; end: string }[] {
  if (last) {
    const s = addDays(last, -10);
    return [{ start: dmy(s < FX_FROM ? FX_FROM : s), end: dmy(today) }];
  }
  const out = [];
  for (let y = Number(FX_FROM.slice(0, 4)); y <= Number(today.slice(0, 4)); y++) {
    const e = y === Number(today.slice(0, 4)) ? today : `${y}-12-31`;
    out.push({ start: dmy(`${y}-01-01`), end: dmy(e) });
  }
  return out;
}

/** EVDS istek adresi (dört seri tek istekte). */
export function fxUrl(base: string, r: { start: string; end: string }): string {
  const series = Object.values(FX_SERIES).flatMap((s) => [s.buy, s.sell]).join('-');
  return `${base.replace(/\/$/, '')}/series=${series}&startDate=${r.start}&endDate=${r.end}&type=json&frequency=1`;
}
