// anahtar — Edge Function logları. Her kayıt tek satır JSON olarak çıkar (Supabase → Edge Functions → Logs);
// warn ve error ayrıca public.function_logs tablosuna yazılır (yönetici paneli → Hatalar, 90 gün saklanır).
// Kullanım: const log = logger('mail-send'); await log.error('gönderilemedi', { id, error });
// Kişisel veri ve sırlar yazılmadan temizlenir. Kayıt hiçbir zaman hata fırlatmaz, işi durdurmaz. Ayrıntı: docs/loglar.md

const env = (k: string) => Deno.env.get(k) ?? '';
type Level = 'info' | 'warn' | 'error';

/** public.log_redact ile aynı kurallar (tests/loglar.sql.spec.mjs ikisini karşılaştırır). */
export function redact(s: string): string {
  return String(s ?? '')
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+/g, '[e-posta]')
    .replace(/eyJ[A-Za-z0-9_-]{8,}(\.[A-Za-z0-9_-]+){1,2}/g, '[jeton]')
    .replace(/([Bb]earer|[Bb]asic)\s+[A-Za-z0-9._~+/=-]{8,}/g, '$1 [gizli]')
    .replace(/(token|secret|password|passwd|parola|sifre|şifre|apikey|api_key|authorization)(["']?\s*[:=]\s*["']?)[^\s"'&,;}]+/gi, '$1$2[gizli]')
    .replace(/(^|[^0-9])(\+?90[ -]?)?0?5[0-9]{2}[ -]?[0-9]{3}[ -]?[0-9]{2}[ -]?[0-9]{2}(?![0-9])/g, '$1[telefon]');
}

function detailText(d: unknown): string {
  if (d === undefined || d === null) return '';
  if (typeof d === 'string') return d;
  try {
    return JSON.stringify(d, (_k, v) => (v instanceof Error ? { message: v.message, stack: v.stack } : v)) ?? '';
  } catch {
    return String(d);
  }
}

// Fonksiyon döngüde sürekli hata alırsa tablo şişmesin: bir kopya (isolate) dakikada en çok 30 kayıt yazar; konsola yazmaya devam eder.
const MAX_PER_MINUTE = 30;
let windowStart = 0, written = 0;
function allowed(): boolean {
  const now = Date.now();
  if (now - windowStart > 60_000) { windowStart = now; written = 0; }
  return written++ < MAX_PER_MINUTE;
}

async function persist(fn: string, level: Level, message: string, detail: string): Promise<void> {
  const url = env('SUPABASE_URL'), key = env('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key || !allowed()) return;
  const res = await fetch(`${url.replace(/\/$/, '')}/rest/v1/function_logs`, {
    method: 'POST',
    headers: { apikey: key, authorization: `Bearer ${key}`, 'content-type': 'application/json', prefer: 'return=minimal' },
    body: JSON.stringify({ fn, level, message, detail }),
    signal: AbortSignal.timeout(3000)
  });
  if (!res.ok) console.error(JSON.stringify({ level: 'error', fn: 'log', message: 'function_logs yazılamadı', status: res.status }));
}

async function write(fn: string, level: Level, message: string, d?: unknown): Promise<void> {
  try {
    const msg = redact(message).slice(0, 1000), detail = redact(detailText(d)).slice(0, 4000);
    const line = JSON.stringify({ at: new Date().toISOString(), level, fn, message: msg, ...(detail ? { detail } : {}) });
    if (level === 'error') console.error(line);
    else if (level === 'warn') console.warn(line);
    else console.log(line);
    if (level !== 'info') await persist(fn, level, msg, detail);
  } catch (e) {
    try { console.error('log yazılamadı', (e as Error)?.message); } catch { /* kayıt işi asla durdurmaz */ }
  }
}

export function logger(fn: string) {
  return {
    info: (message: string, detail?: unknown) => write(fn, 'info', message, detail),
    warn: (message: string, detail?: unknown) => write(fn, 'warn', message, detail),
    error: (message: string, detail?: unknown) => write(fn, 'error', message, detail)
  };
}
