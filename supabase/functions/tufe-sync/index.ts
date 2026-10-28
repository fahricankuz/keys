// anahtar — yasal kira artış oranını (TÜFE 12 aylık ortalamalara göre değişim) TCMB EVDS'ten çeker (Supabase Edge Function).
//
// TÜİK bülteni her ayın 3'ünde açıklanır. Zamanlama: Supabase → Integrations → Cron → Edge Function "tufe-sync",
// POST, başlık x-anahtar-secret, "0 9 3-6 * *" (3–6. günler; veri gelmediyse ertesi gün yeniden dener).
// Gizli değişkenler: TUFE_SECRET, EVDS_KEY (evds2.tcmb.gov.tr → üye ol → profil → API anahtarı).
// İsteğe bağlı: EVDS_URL (varsayılan https://evds2.tcmb.gov.tr/service/evds), EVDS_SERIES (varsayılan TP.FG.J0, TÜFE 2003=100).
//
// Oran endeks serisinden hesaplanır: son 12 ayın ortalaması ÷ önceki 12 ayın ortalaması − 1. TÜİK yuvarlanmış endeksten
// yayımladığı için sonuç ±0,01 puan farklı olabilir; yöneticinin elle girdiği ("manual") aylar hiçbir zaman ezilmez.
import { createClient } from 'npm:@supabase/supabase-js@2';

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

  const series = env('EVDS_SERIES') || 'TP.FG.J0';
  const now = new Date();
  const start = `01-01-${now.getUTCFullYear() - 4}`, end = `31-12-${now.getUTCFullYear()}`;
  const base = (env('EVDS_URL') || 'https://evds2.tcmb.gov.tr/service/evds').replace(/\/$/, '');
  const res = await fetch(`${base}/series=${series}&startDate=${start}&endDate=${end}&type=json&frequency=5`, { headers: { key: env('EVDS_KEY') } });
  if (!res.ok) return Response.json({ error: `EVDS ${res.status}` }, { status: 502 });
  const body = await res.json();
  const col = series.replaceAll('.', '_');
  const index = new Map<string, number>();
  for (const it of body.items ?? []) {
    const k = monthKey(it.Tarih), v = Number(it[col]);
    if (k && isFinite(v) && v > 0) index.set(k, v);
  }
  const rates = avg12(index);
  const { data: manual } = await admin.from('cpi_rates').select('month').eq('source', 'manual');
  const keep = new Set((manual ?? []).map((r: { month: string }) => r.month));
  const rows = [...rates].filter(([m]) => !keep.has(m)).map(([month, v]) => ({ month, avg12: v, source: 'evds', updated_at: new Date().toISOString() }));
  if (rows.length) {
    const { error } = await admin.from('cpi_rates').upsert(rows, { onConflict: 'month' });
    if (error) return Response.json({ error: error.message }, { status: 500 });
  }
  return Response.json({ months: rows.length, latest: rows.at(-1) ?? null });
});
