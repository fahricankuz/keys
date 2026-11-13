/* Hata izleme (Sentry, AB bölgesi) — WEB. Telefon sürümü: sentry.native.js. Sunucu kaydı (errors.js → client_errors) aynen sürer.
   @sentry/browser ilk yüklemeyi büyütmesin diye açılıştan sonra, boş zamanda ve ayrı parça olarak yüklenir. Statik dışa aktarma
   (Node) çalışırken window yoktur: orada hiçbir şey yapılmaz. Yalnız anahtar.io / www.anahtar.io gönderir (önizleme ve localhost değil).
   Oturum tekrarı (replay) yok; kullanıcıda yalnız UUID; metinler sentry-scrub.js ile log_redact kurallarından geçer. Ayrıntı: docs/loglar.md. */
import { scrubEvent, scrubBreadcrumb, NOISE } from './sentry-scrub.js';

const toError = (x) => (x instanceof Error ? x : Object.assign(new Error(String((x && (x.message || x.reason)) || x || '')), x && x.stack ? { stack: x.stack } : {}));
const DSN = process.env.EXPO_PUBLIC_SENTRY_DSN_WEB || '';
const RELEASE = process.env.EXPO_PUBLIC_SENTRY_RELEASE || '';
const QUEUE_MAX = 10;
let S = null;
let started = false;
let uid = null;
const queue = [];

const early = (kind) => (e) => { if (!S && queue.length < QUEUE_MAX) queue.push([e && (e.error || e.reason || e.message), kind]); };
const onError = early('error');
const onRejection = early('rejection');

export function initSentry() {
  if (typeof window === 'undefined' || !DSN || started) return;
  if (!/^(www\.)?anahtar\.io$/i.test(window.location.hostname)) return;
  started = true;
  // Sentry yüklenene kadar (≈4 sn) olan hatalar kaybolmasın: en çok 10 tanesi kuyruğa alınır, yüklenince gönderilir.
  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onRejection);
  const go = () => import('@sentry/browser').then((m) => {
    m.init({
      dsn: DSN, environment: 'production', release: RELEASE ? 'anahtar-web@' + RELEASE.slice(0, 7) : undefined,
      sendDefaultPii: false, maxBreadcrumbs: 30, ignoreErrors: [NOISE],
      denyUrls: [/^(chrome|moz|safari(-web)?)-extension:\/\//i],
      integrations: [m.breadcrumbsIntegration({ console: false })],
      beforeSend: scrubEvent, beforeBreadcrumb: scrubBreadcrumb
    });
    S = m;
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onRejection);
    if (uid) m.setUser({ id: uid });
    for (const [err, kind] of queue.splice(0)) captureError(err, kind);
  }).catch(() => { started = false; });
  if (window.requestIdleCallback) window.requestIdleCallback(go, { timeout: 4000 }); else setTimeout(go, 2000);
}

/** Web'de kök bileşen olduğu gibi döner (hata sınırı expo-router'ın ErrorBoundary'sindedir). */
export const wrapRoot = (C) => C;

export function setSentryUser(id) {
  uid = id || null;
  if (S) S.setUser(uid ? { id: uid } : null);
}

/** Sentry'nin kendi yakaladıklarının (yakalanmamış hata ve söz reddi) dışındakiler: ekran hatası ('render') ve logCaught ('caught'). */
export function captureError(err, kind) {
  if (S) { S.withScope((s) => { s.setTag('kind', kind); S.captureException(toError(err)); }); return; }
  if (DSN && queue.length < QUEUE_MAX) queue.push([err, kind]);
}
