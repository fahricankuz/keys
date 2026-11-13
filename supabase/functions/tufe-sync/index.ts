// anahtar — yasal kira artış oranını (TÜFE 12 aylık ortalamalara göre değişim) ve günlük dolar/avro kurlarını TCMB EVDS'ten
// çeker (Supabase Edge Function).
//
// Zamanlama: Supabase → Integrations → Cron → "tufe-sync-aylik", POST, başlık x-anahtar-secret, "0 13 * * *" (her gün; TCMB
// kurları 15:30'da açıklar, TÜİK bülteni her ayın 3'ünde gelir). Migration kur_altyapisi zamanlamayı bu değere çevirir.
// Kur: public.fx_rates (döviz alış ve satış). İlk çalışmada 2020'den bugüne doldurur, sonra son 10 günü yeniler (fx.ts).
// TÜFE ve kur birbirinden bağımsızdır: biri başarısız olsa da diğeri yazılır; hata yanıtta ve Sunucu kayıtlarında görünür.
// Gizli değişkenler: TUFE_SECRET, EVDS_KEY (evds3.tcmb.gov.tr → üye ol → profil → API anahtarı).
// Sentry açıksa (SENTRY_DSN) her çalışma Sentry cron izlemesine (monitor "tufe-sync", "0 13 * * *", UTC) işaretlenir; ikisinden biri başarısızsa error.
// İsteğe bağlı: EVDS_URL (varsayılan https://evds3.tcmb.gov.tr/igmevdsms-dis; eski evds2 servisi 2025 sonunda kapandı ve artık
// JSON yerine sitenin HTML sayfasını döndürüyor), EVDS_SERIES (varsayılan TP.TUKFIY2025.GENEL, TÜFE 2025=100;
// TÜİK Ocak 2026'da temel yılı değiştirdi, eski TP.FG.J0 (2003=100) serisi Ocak 2026'da bitti. Yeni seri 2005'ten başlayan tek
// tutarlı seridir; 12 aylık ortalama oran temel yılından bağımsız olduğu için iki seri birleştirilmez). Anahtar "key" başlığında gider.
//
// Oran endeks serisinden hesaplanır: son 12 ayın ortalaması ÷ önceki 12 ayın ortalaması − 1. TÜİK yuvarlanmış endeksten
// yayımladığı için sonuç ±0,01 puan farklı olabilir; yöneticinin elle girdiği ("manual") aylar hiçbir zaman ezilmez.
import { serviceClient } from '../_shared/keys.ts';
import { logger } from '../_shared/log.ts';
import { cronCheckIn, sentryServe } from '../_shared/sentry.ts';
import { fxRanges, fxUrl, parseFx } from './fx.ts';

const log = logger('tufe-sync');

const env = (k: string) => Deno.env.get(k) ?? '';
const admin = serviceClient();

function safeEqual(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  let d = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) d |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return d === 0;
}

/** EVDS "2024-1" / "01-2024" gibi tarihleri "2024-01" yapar. */
function monthKey(s: string): string | null {
  const m = String(s).match(/^(\d{4})-(\d{1,2})$/) || String(s).match(/^(\d{1,2})-(\d{4})$/);
  if (!m) return null;
  const [y, mo] = m[1].length === 4 ? [m[1], m[2]] : [m[2], m[1]];
  return `${y}-${mo.padStart(2, '0')}`;
}

export function avg12(index: Map<string, number>): Map<string, number> {
  const keys = [...index.keys()].sort();
  const out = new Map<string, number>();
  for (let i = 23; i < keys.length; i++) {
    const last = keys.slice(i - 11, i + 1).map((k) => index.get(k)!);
    const prev = keys.slice(i - 23, i - 11).map((k) => index.get(k)!);
    const a = last.reduce((s, v) => s + v, 0) / 12, b = prev.reduce((s, v) => s + v, 0) / 12;
    out.set(keys[i], Math.round((a / b - 1) * 10000) / 100);
  }
  return out;
}

type Step = { ok: true; [k: string]: unknown } | { ok: false; status: number; error: string; detail?: string };
const fail = (status: number, error: string, detail?: string): Step => ({ ok: false, status, error, detail });
const base = () => (env('EVDS_URL') || 'https://evds3.tcmb.gov.tr/igmevdsms-dis').replace(/\/$/, '');

/** EVDS'ten JSON okur; bağlantı, durum ve biçim hatalarını açık mesajla döndürür. */
async function evds(url: string, what: string): Promise<{ items: Record<string, unknown>[] } | Step> {
  let res: Response;
  try {
    res = await fetch(url, { headers: { key: env('EVDS_KEY'), accept: 'application/json' }, signal: AbortSignal.timeout(20000) });
  } catch (e) {
    await log.error(`EVDS bağlantı hatası (${what})`, e);
    return fail(502, 'EVDS’e bağlanılamadı', String((e as Error)?.message ?? e));
  }
  const text = await res.text();
  if (!res.ok) {
    await log.error(`EVDS yanıtı (${what})`, { status: res.status, body: text.slice(0, 300) });
    return fail(502, `EVDS ${res.status}`, text.slice(0, 300));
  }
  try { return { items: (JSON.parse(text).items ?? []) as Record<string, unknown>[] }; } catch {
    // Anahtar geçersizse ya da adres değiştiyse EVDS JSON yerine HTML sayfası döndürür.
    await log.error(`EVDS JSON döndürmedi (${what})`, text.slice(0, 300));
    return fail(502, 'EVDS JSON döndürmedi (API anahtarını ve EVDS_URL’yi kontrol et)', text.slice(0, 300));
  }
}

async function syncCpi(): Promise<Step> {
  const series = env('EVDS_SERIES') || 'TP.TUKFIY2025.GENEL';
  const now = new Date();
  const start = `01-01-${now.getUTCFullYear() - 4}`, end = `31-12-${now.getUTCFullYear()}`;
  const got = await evds(`${base()}/series=${series}&startDate=${start}&endDate=${end}&type=json&frequency=5`, 'TÜFE');
  if (!('items' in got)) return got;
  const col = series.replaceAll('.', '_');
  const index = new Map<string, number>();
  for (const it of got.items) {
    const k = monthKey(String(it.Tarih ?? '')), v = Number(it[col]);
    if (k && isFinite(v) && v > 0) index.set(k, v);
  }
  if (!index.size) {
    await log.error('EVDS veri döndürmedi (TÜFE)', JSON.stringify(got.items).slice(0, 300));
    return fail(502, 'EVDS veri döndürmedi');
  }
  const rates = avg12(index);
  const { data: manual, error: readErr } = await admin.from('cpi_rates').select('month').eq('source', 'manual');
  if (readErr) {
    await log.error('cpi_rates okunamadı', readErr.message);
    return fail(500, 'cpi_rates okunamadı', readErr.message);
  }
  const keep = new Set((manual ?? []).map((r: { month: string }) => r.month));
  const rows = [...rates].filter(([m]) => !keep.has(m)).map(([month, v]) => ({ month, avg12: v, source: 'evds', updated_at: new Date().toISOString() }));
  if (rows.length) {
    const { error } = await admin.from('cpi_rates').upsert(rows, { onConflict: 'month' });
    if (error) {
      await log.error('cpi_rates yazılamadı', error.message);
      return fail(500, 'cpi_rates yazılamadı', error.message);
    }
  }
  return { ok: true, months: rows.length, latest: rows.at(-1) ?? null };
}

/** Günlük kur: elle girilen ("manual") günler ezilmez. */
async function syncFx(): Promise<Step> {
  const { data: last, error: lastErr } = await admin.from('fx_rates').select('day').eq('source', 'evds').order('day', { ascending: false }).limit(1);
  if (lastErr) {
    await log.error('fx_rates okunamadı', lastErr.message);
    return fail(500, 'fx_rates okunamadı', lastErr.message);
  }
  const today = new Date().toISOString().slice(0, 10);
  const rows = [];
  for (const r of fxRanges(last?.[0]?.day ?? null, today)) {
    const got = await evds(fxUrl(base(), r), 'kur');
    if (!('items' in got)) return got;
    rows.push(...parseFx(got.items));
  }
  if (!rows.length) return { ok: true, days: 0, latest: null };
  const { data: manual } = await admin.from('fx_rates').select('day, currency').eq('source', 'manual');
  const keep = new Set((manual ?? []).map((m: { day: string; currency: string }) => m.currency + m.day));
  const put = rows.filter((x) => !keep.has(x.currency + x.day)).map((x) => ({ ...x, updated_at: new Date().toISOString() }));
  for (let i = 0; i < put.length; i += 500) {
    const { error } = await admin.from('fx_rates').upsert(put.slice(i, i + 500), { onConflict: 'currency,day' });
    if (error) {
      await log.error('fx_rates yazılamadı', error.message);
      return fail(500, 'fx_rates yazılamadı', error.message);
    }
  }
  const latest = put.reduce((a, x) => (x.day > a ? x.day : a), '');
  return { ok: true, days: new Set(put.map((x) => x.day)).size, latest: latest || null, usd: put.findLast((x) => x.currency === 'USD' && x.day === latest)?.sell ?? null };
}

sentryServe('tufe-sync', async (req) => {
  if (req.method !== 'POST') return new Response('method', { status: 405 });
  const secret = env('TUFE_SECRET');
  if (!secret || !safeEqual(req.headers.get('x-anahtar-secret') ?? '', secret)) return new Response('unauthorized', { status: 401 });
  const checkIn = cronCheckIn('tufe-sync', '0 13 * * *');   // Sentry cron izleme (UTC; DSN yoksa boş iş)
  if (!env('EVDS_KEY')) {
    await checkIn.done(false);
    return Response.json({ error: 'EVDS_KEY eksik' }, { status: 500 });
  }

  // Her adımın hatası açık bir mesajla döner (Logs'ta ve yanıtta görünür); "Internal Server Error" yerine nedenini söyler.
  const run = async (f: () => Promise<Step>): Promise<Step> => {
    try { return await f(); } catch (e) {
      await log.error('beklenmeyen hata', e);
      return fail(500, 'Beklenmeyen hata', String((e as Error)?.message ?? e));
    }
  };
  const cpi = await run(syncCpi), fx = await run(syncFx);
  await checkIn.done(cpi.ok && fx.ok);
  const strip = (s: Step) => { const { ok: _ok, status: _st, ...rest } = s as Record<string, unknown>; return rest; };
  // Eski yanıt biçimi korunur (months, latest); kur sonucu "fx" altında. İkisi de başarısızsa hata durumu döner.
  const out = { ...strip(cpi), fx: strip(fx) };
  const status = !cpi.ok && !fx.ok ? (cpi as { status: number }).status : 200;
  return Response.json(out, { status });
});
