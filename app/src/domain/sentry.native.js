/* Hata izleme (Sentry, AB bölgesi) — iOS/Android. Web sürümü: sentry.js. Yerel çökmeler (Swift/ObjC/Java/NDK) SDK ile kendiliğinden yakalanır.
   release ve dist verilmez: SDK bunları yerel pakettenden okur (io.anahtar.app@1.0.0+<derleme no>), EAS autoIncrement ile uyumludur.
   Ekran görüntüsü, görünüm hiyerarşisi ve oturum tekrarı yok; kullanıcıda yalnız UUID; metinler sentry-scrub.js ile log_redact kurallarından geçer.
   Geliştirme modunda (__DEV__) ya da DSN boşken (EXPO_PUBLIC_SENTRY_DSN_MOBILE, eas.json → EAS ortamı) hiçbir şey yapılmaz. */
import * as Sentry from '@sentry/react-native';
import { isRunningInExpoGo } from 'expo';
import { scrubEvent, scrubBreadcrumb, NOISE } from './sentry-scrub.js';

const toError = (x) => (x instanceof Error ? x : Object.assign(new Error(String((x && (x.message || x.reason)) || x || '')), x && x.stack ? { stack: x.stack } : {}));
const DSN = process.env.EXPO_PUBLIC_SENTRY_DSN_MOBILE || '';
const ENV = process.env.EXPO_PUBLIC_APP_ENV || 'production';   // eas.json: development | preview | production
const ACTIVE = !!DSN && !__DEV__;
let on = false;

export function initSentry() {
  if (on || !ACTIVE) return;
  on = true;
  Sentry.init({
    dsn: DSN, environment: ENV, sendDefaultPii: false,
    attachScreenshot: false, attachViewHierarchy: false, enableLogs: false,
    tracesSampleRate: 0.1, profilesSampleRate: 0,
    enableNativeFramesTracking: !isRunningInExpoGo(), maxBreadcrumbs: 50, ignoreErrors: [NOISE],
    integrations: [
      Sentry.breadcrumbsIntegration({ console: false }),
      Sentry.expoRouterIntegration({ enableTimeToInitialDisplay: !isRunningInExpoGo() })
    ],
    beforeSend: scrubEvent, beforeSendTransaction: scrubEvent, beforeBreadcrumb: scrubBreadcrumb
  });
}

/** Kök bileşeni Sentry.wrap ile sarar (dokunma izleri, ekran açılış süresi); DSN yoksa ya da geliştirmede olduğu gibi döner. */
export const wrapRoot = (C) => (ACTIVE ? Sentry.wrap(C) : C);

export function setSentryUser(id) {
  if (on) Sentry.setUser(id ? { id: String(id) } : null);
}

/** Sentry'nin kendi yakaladıklarının (yakalanmamış hata ve söz reddi) dışındakiler: ekran hatası ('render') ve logCaught ('caught'). */
export function captureError(err, kind) {
  if (!on) return;
  Sentry.withScope((s) => { s.setTag('kind', kind); Sentry.captureException(toError(err)); });
}
