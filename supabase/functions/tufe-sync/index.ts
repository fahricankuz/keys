// anahtar — yasal kira artış oranını (TÜFE 12 aylık ortalamalara göre değişim) TCMB EVDS'ten çeker (Supabase Edge Function).
//
// TÜİK bülteni her ayın 3'ünde açıklanır. Zamanlama: Supabase → Integrations → Cron → Edge Function "tufe-sync",
// POST, başlık x-anahtar-secret, "0 9 3-6 * *" (3–6. günler; veri gelmediyse ertesi gün yeniden dener).
// Gizli değişkenler: TUFE_SECRET, EVDS_KEY (evds3.tcmb.gov.tr → üye ol → profil → API anahtarı).
// İsteğe bağlı: EVDS_URL (varsayılan https://evds3.tcmb.gov.tr/igmevdsms-dis; eski evds2 servisi 2025 sonunda kapandı ve artık
// JSON yerine sitenin HTML sayfasını döndürüyor), EVDS_SERIES (varsayılan TP.TUKFIY2025.GENEL, TÜFE 2025=100;
// TÜİK Ocak 2026'da temel yılı değiştirdi, eski TP.FG.J0 (2003=100) serisi Ocak 2026'da bitti. Yeni seri 2005'ten başlayan tek
// tutarlı seridir; 12 aylık ortalama oran temel yılından bağımsız olduğu için iki seri birleştirilmez). Anahtar "key" başlığında gider.
//
// Oran endeks serisinden hesaplanır: son 12 ayın ortalaması ÷ önceki 12 ayın ortalaması − 1. TÜİK yuvarlanmış endeksten
// yayımladığı için sonuç ±0,01 puan farklı olabilir; yöneticinin elle girdiği ("manual") aylar hiçbir zaman ezilmez.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { logger } from '../_shared/log.ts';

const log = logger('tufe-sync');

const env = (k: string) => Deno.env.get(k) ?? '';
const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });

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

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method', { status: 405 });
  const secret = env('TUFE_SECRET');
  if (!secret || !safeEqual(req.headers.get('x-anahtar-secret') ?? '', secret)) return new Response('unauthorized', { status: 401 });
  if (!env('EVDS_KEY')) return Response.json({ error: 'EVDS_KEY eksik' }, { status: 500 });

  // Her adımın hatası açık bir mesajla döner (Logs'ta ve yanıtta görünür); "Internal Server Error" yerine nedenini söyler.
  try {
    const series = env('EVDS_SERIES') || 'TP.TUKFIY2025.GENEL';
    const now = new Date();
    const start = `01-01-${now.getUTCFullYear() - 4}`, end = `31-12-${now.getUTCFullYear()}`;
    const base = (env('EVDS_URL') || 'https://evds3.tcmb.gov.tr/igmevdsms-dis').replace(/\/$/, '');
    let res: Response;
    try {
      res = await fetch(`${base}/series=${series}&startDate=${start}&endDate=${end}&type=json&frequency=5`, {
        headers: { key: env('EVDS_KEY'), accept: 'application/json' },
        signal: AbortSignal.timeout(20000)
      });
    } catch (e) {
      await log.error('EVDS bağlantı hatası', e);
      return Response.json({ error: 'EVDS’e bağlanılamadı', detail: String((e as Error)?.message ?? e) }, { status: 502 });
    }
    const text = await res.text();
    if (!res.ok) {
      await log.error('EVDS yanıtı', { status: res.status, body: text.slice(0, 300) });
      return Response.json({ error: `EVDS ${res.status}`, detail: text.slice(0, 300) }, { status: 502 });
    }
    let body: { items?: Record<string, unknown>[] };
    try { body = JSON.parse(text); } catch {
      // Anahtar geçersizse ya da adres değiştiyse EVDS JSON yerine HTML sayfası döndürür.
      await log.error('EVDS JSON döndürmedi', text.slice(0, 300));
      return Response.json({ error: 'EVDS JSON döndürmedi (API anahtarını ve EVDS_URL’yi kontrol et)', detail: text.slice(0, 300) }, { status: 502 });
    }
    const col = series.replaceAll('.', '_');
    const index = new Map<string, number>();
    for (const it of body.items ?? []) {
      const k = monthKey(String(it.Tarih ?? '')), v = Number(it[col]);
      if (k && isFinite(v) && v > 0) index.set(k, v);
    }
    if (!index.size) {
      await log.error('EVDS veri döndürmedi', text.slice(0, 300));
      return Response.json({ error: 'EVDS veri döndürmedi', detail: text.slice(0, 300) }, { status: 502 });
    }
    const rates = avg12(index);
    const { data: manual, error: readErr } = await admin.from('cpi_rates').select('month').eq('source', 'manual');
    if (readErr) {
      await log.error('cpi_rates okunamadı', readErr.message);
      return Response.json({ error: 'cpi_rates okunamadı', detail: readErr.message }, { status: 500 });
    }
    const keep = new Set((manual ?? []).map((r: { month: string }) => r.month));
    const rows = [...rates].filter(([m]) => !keep.has(m)).map(([month, v]) => ({ month, avg12: v, source: 'evds', updated_at: new Date().toISOString() }));
    if (rows.length) {
      const { error } = await admin.from('cpi_rates').upsert(rows, { onConflict: 'month' });
      if (error) {
        await log.error('cpi_rates yazılamadı', error.message);
        return Response.json({ error: 'cpi_rates yazılamadı', detail: error.message }, { status: 500 });
      }
    }
    return Response.json({ months: rows.length, latest: rows.at(-1) ?? null });
  } catch (e) {
    await log.error('beklenmeyen hata', e);
    return Response.json({ error: 'Beklenmeyen hata', detail: String((e as Error)?.message ?? e) }, { status: 500 });
  }
});
