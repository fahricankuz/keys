// anahtar — Sentry (Edge Function'lar). Hesap: Sentry AB bölgesi (de.sentry.io), proje "anahtar-edge".
//
// Yalnız SENTRY_DSN tanımlıysa açılır; tanımlı değilse bu dosya hiçbir şey yüklemez ve her fonksiyon eskisi gibi çalışır.
// SDK (npm:@sentry/deno) dinamik içe aktarılır: DSN yokken paket hiç indirilmez, yüklenemezse fonksiyon yine çalışır.
// Gizli değişkenler: SENTRY_DSN (zorunlu değil), SENTRY_ENV (varsayılan production), SENTRY_RELEASE (isteğe bağlı).
//
// Tasarım: varsayılan entegrasyonlar kapalı (Deno.serve'e dokunmaz, konsol/ağ izi toplamaz), kişisel veri gönderilmez,
// performans izleme kapalı (tracesSampleRate 0). Her olay gönderilmeden önce _shared/log.ts'teki redact kurallarıyla
// temizlenir (public.log_redact ile aynı kurallar). Mevcut function_logs kaydı olduğu gibi sürer: warn ve error ayrıca
// setLogHook ile Sentry'ye de gider. Ayrıntı: docs/loglar.md
//
// Kullanım (index.ts): sentryServe('billing', async (req) => { … }) — Deno.serve yerine.
// tufe-sync: const run = cronCheckIn('tufe-sync', '0 13 * * *'); … run.done(ok)

import { logger, redact, setLogHook } from './log.ts';

const env = (k: string) => Deno.env.get(k) ?? '';
const log = logger('sentry');

// deno-lint-ignore no-explicit-any
type SentryModule = any;
type Handler = (req: Request, info?: unknown) => Response | Promise<Response>;

/* ---- Temizleme (beforeSend) ---- */

/** Değeri ne olursa olsun gizlenecek anahtar adları. */
const SECRET_KEY = /token|secret|password|passwd|parola|sifre|şifre|apikey|api_key|authorization|cookie|private_key|credential|dsn/i;
/** Yapı alanları: kimlik ve zaman damgaları metin kurallarından geçmez (rastgele rakam dizisi telefon sanılmasın). */
const SKIP_CONTEXTS = new Set(['trace', 'runtime', 'os', 'device', 'app', 'culture', 'cloud_resource']);

function clean(v: unknown, depth = 0): unknown {
  if (typeof v === 'string') return redact(v);
  if (v === null || typeof v !== 'object' || depth > 8) return v;
  if (Array.isArray(v)) return v.map((x) => clean(x, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, x] of Object.entries(v as Record<string, unknown>)) out[k] = SECRET_KEY.test(k) ? '[gizli]' : clean(x, depth + 1);
  return out;
}

/** Adresten sorgu dizesi ve parçayı atar (jeton ve e-posta çoğunlukla orada olur). */
function bareUrl(u: unknown): unknown {
  if (typeof u !== 'string') return u;
  return redact(u.replace(/[?#].*$/, ''));
}

/** Sentry olayını gönderilmeden önce temizler; kullanıcı, sunucu adı, istek gövdesi/başlıkları ve çerezler atılır. */
// deno-lint-ignore no-explicit-any
export function scrubEvent(event: any): any {
  if (!event || typeof event !== 'object') return event;
  delete event.user;
  delete event.server_name;
  if (typeof event.message === 'string') event.message = redact(event.message);
  if (event.logentry) event.logentry = clean(event.logentry);
  if (typeof event.transaction === 'string') event.transaction = redact(event.transaction);
  for (const v of event.exception?.values ?? []) if (typeof v?.value === 'string') v.value = redact(v.value);
  if (event.extra) event.extra = clean(event.extra);
  if (event.tags) event.tags = clean(event.tags);
  if (Array.isArray(event.breadcrumbs)) event.breadcrumbs = clean(event.breadcrumbs);
  if (event.contexts) {
    for (const [k, v] of Object.entries(event.contexts)) if (!SKIP_CONTEXTS.has(k)) event.contexts[k] = clean(v);
  }
  if (event.request) {
    event.request = { method: event.request.method, url: bareUrl(event.request.url) };
  }
  return event;
}

/* ---- Başlatma ---- */

const dsn = env('SENTRY_DSN');
let Sentry: SentryModule | null = null;
/** Gönderilmeyi bekleyen olay olabilir mi (flush yalnız o zaman beklenir). */
let touched = false;

if (dsn) {
  try {
    Sentry = await import('npm:@sentry/deno@10.75.2');
    Sentry.init({
      dsn,
      environment: env('SENTRY_ENV') || 'production',
      release: env('SENTRY_RELEASE') || undefined,
      defaultIntegrations: false,
      integrations: [],
      sendDefaultPii: false,
      tracesSampleRate: 0,
      maxBreadcrumbs: 0,
      skipOpenTelemetrySetup: true,
      beforeSend: scrubEvent,
    });
    // Konsola ve function_logs'a giden warn/error kayıtları Sentry'ye de gider (dakikada en çok 30; sel olmasın).
    let windowStart = 0, sent = 0;
    setLogHook(({ fn, level, message, detail, raw }) => {
      if (fn === 'sentry') return;
      const now = Date.now();
      if (now - windowStart > 60_000) { windowStart = now; sent = 0; }
      if (sent++ >= 30) return;
      touched = true;
      const ctx = { level: level === 'warn' ? 'warning' : 'error', tags: { fn }, extra: { message, ...(detail ? { detail } : {}) } };
      if (raw instanceof Error) Sentry.captureException(raw, ctx);
      else Sentry.captureMessage(message, ctx);
    });
  } catch (e) {
    Sentry = null;
    setLogHook(null);
    await log.warn('Sentry başlatılamadı; fonksiyon Sentry olmadan sürüyor', e);
  }
}

async function flush(): Promise<void> {
  if (!Sentry || !touched) return;
  touched = false;
  try { await Sentry.flush(2000); } catch { /* gönderim hatası fonksiyonu etkilemez */ }
}

/** Sentry açık mı? */
export const sentryEnabled = () => Sentry !== null;

/** Her isteği kendi kapsamında çalıştırır: yakalanmamış hata fn etiketiyle Sentry'ye gider, 2 sn'ye kadar gönderilmesi
    beklenir ve hata yeniden fırlatılır (Supabase eskisi gibi 500 döner). Sentry kapalıysa işleyiciyi olduğu gibi çalıştırır. */
export function sentryWrap(name: string, handler: Handler): Handler {
  return async (req, info) => {
    if (!Sentry) return await handler(req, info);
    const S = Sentry;
    return await S.withScope(async (scope: SentryModule) => {
      scope.setTag('fn', name);
      const region = env('SB_REGION'), exec = env('SB_EXECUTION_ID');
      if (region) scope.setTag('region', region);
      if (exec) scope.setTag('execution_id', exec);
      try {
        const res = await handler(req, info);
        await flush();
        return res;
      } catch (e) {
        touched = true;
        scope.captureException(e, { mechanism: { handled: false, type: 'auto.function.supabase' } });
        await flush();
        throw e;
      }
    });
  };
}

/** Deno.serve yerine kullanılır: sentryServe('billing', async (req) => { … }). */
export function sentryServe(name: string, handler: Handler): void {
  Deno.serve(sentryWrap(name, handler) as (req: Request) => Response | Promise<Response>);
}

/** Zamanlanmış iş için Sentry cron izleme (check-in). Sentry kapalıysa hiçbir şey yapmaz.
    run.done(true | false): iş bittiğinde ok / error işareti ve süre gönderilir (zamanlama UTC). */
export function cronCheckIn(slug: string, crontab: string): { done: (ok: boolean) => Promise<void> } {
  if (!Sentry) return { done: async () => {} };
  const S = Sentry, started = Date.now();
  let id: string | undefined;
  try {
    id = S.captureCheckIn(
      { monitorSlug: slug, status: 'in_progress' },
      { schedule: { type: 'crontab', value: crontab }, timezone: 'UTC', checkinMargin: 30, maxRuntime: 10, failureIssueThreshold: 1, recoveryThreshold: 1 },
    );
  } catch { /* izleme hatası işi durdurmaz */ }
  return {
    done: async (ok: boolean) => {
      try {
        S.captureCheckIn({ checkInId: id, monitorSlug: slug, status: ok ? 'ok' : 'error', duration: (Date.now() - started) / 1000 });
        touched = true;
        await flush();
      } catch { /* izleme hatası işi durdurmaz */ }
    },
  };
}
