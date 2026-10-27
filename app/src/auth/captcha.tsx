/* Bot koruması (Cloudflare Turnstile). Yalnızca EXPO_PUBLIC_TURNSTILE_SITE_KEY verilmişse çalışır;
   Supabase tarafında Authentication → Attack Protection → CAPTCHA açılınca giriş, kayıt ve şifre
   sıfırlama isteği doğrulama olmadan sunucuda reddedilir. Anahtar yoksa hiçbir şey çizilmez. */
import { createElement, useEffect, useRef } from 'react';
import { Platform, View } from 'react-native';

export const CAPTCHA_KEY = process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY || '';
const ON = !!CAPTCHA_KEY && Platform.OS === 'web';

let token: string | null = null;
let widgetId: string | null = null;
const SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

function loadScript(): Promise<any> {
  const w = window as any;
  if (w.turnstile) return Promise.resolve(w.turnstile);
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = SRC; s.async = true;
    s.onload = () => resolve(w.turnstile);
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

/** İstek için gerekli jeton. Doğrulama kapalıysa null (istek jetonsuz gider). */
export const captchaToken = () => (ON ? token : null);
/** Doğrulama açık ama jeton henüz yok: form gönderilmemeli. */
export const captchaPending = () => ON && !token;
/** Jeton tek kullanımlıktır; istekten sonra yenisini ister. */
export function captchaSpent() {
  token = null;
  try { if (widgetId) (window as any).turnstile?.reset(widgetId); } catch {}
}

export function Captcha() {
  const host = useRef<any>(null);
  useEffect(() => {
    if (!ON) return;
    let dead = false;
    loadScript().then((ts) => {
      if (dead || !host.current) return;
      widgetId = ts.render(host.current, {
        sitekey: CAPTCHA_KEY, theme: 'auto', language: 'tr',
        callback: (x: string) => { token = x; },
        'expired-callback': () => { token = null; },
        'error-callback': () => { token = null; }
      });
    }).catch(() => {});
    return () => { dead = true; try { if (widgetId) (window as any).turnstile?.remove(widgetId); } catch {} widgetId = null; token = null; };
  }, []);
  if (!ON) return null;
  return <View>{createElement('div', { ref: host, style: { minHeight: 65 } })}</View>;
}
