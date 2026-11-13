/* Bot koruması (Cloudflare Turnstile): iOS ve Android. Web sürümüyle (captcha.tsx) aynı arayüz.

   Turnstile yalnızca tarayıcıda çalışır; telefonda sitenin kendi doğrulama sayfası (public/turnstile) bir WebView içinde açılır
   ve jetonu window.ReactNativeWebView.postMessage ile uygulamaya verir. Yalnızca EXPO_PUBLIC_TURNSTILE_SITE_KEY verilmişse
   çalışır; anahtar yoksa hiçbir şey çizilmez ve istekler jetonsuz gider (bugünkü davranış).
   Doğrulama yüklenemezse (çevrimdışı, engelli) açık bir hata ve "Yeniden dene" gösterilir; jetonsuz istek hiçbir zaman gönderilmez
   (auth.tsx captchaPending() ile formu durdurur). */
import { useEffect, useRef, useState, type ComponentType, type Ref } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { WebView, type WebViewMessageEvent, type WebViewProps } from 'react-native-webview';
import { getLang, t } from '../domain/i18n';
import { Button, Text } from '../ui/kit';
import { useColors } from '../ui/theme';

// react-native-webview'un tür bildirimi (WebView<undefined>) React 19 türleriyle `never` verir; özellikleri açıkça veriyoruz.
const Web = WebView as unknown as ComponentType<WebViewProps & { ref?: Ref<WebView> }>;

export const CAPTCHA_KEY = process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY || '';
const ON = !!CAPTCHA_KEY;
const ORIGIN = 'https://anahtar.io';
const PAGE = ORIGIN + '/turnstile/';
const CF = 'https://challenges.cloudflare.com/';

let token: string | null = null;
let askReset: (() => void) | null = null;

/** İstek için gerekli jeton. Doğrulama kapalıysa null (istek jetonsuz gider). */
export const captchaToken = () => (ON ? token : null);
/** Doğrulama açık ama jeton henüz yok: form gönderilmemeli. */
export const captchaPending = () => ON && !token;
/** Jeton tek kullanımlıktır; istekten sonra sayfadan yenisi istenir. */
export function captchaSpent() {
  token = null;
  try { askReset?.(); } catch { /* sayfa kapanmış olabilir */ }
}

export function Captcha() {
  const c = useColors();
  const web = useRef<WebView>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!ON) return;
    askReset = () => { web.current?.injectJavaScript('window.resetTurnstile&&window.resetTurnstile();true;'); };
    return () => { askReset = null; token = null; };
  }, []);
  if (!ON) return null;

  const uri = PAGE + '?k=' + encodeURIComponent(CAPTCHA_KEY) + '&lang=' + (getLang() === 'en' ? 'en' : 'tr');

  const onMessage = (e: WebViewMessageEvent) => {
    // Yalnızca kendi doğrulama sayfamızdan gelen ileti kabul edilir.
    if (!String(e.nativeEvent.url || '').startsWith(PAGE)) return;
    let m: { type?: string; token?: string } | null = null;
    try { m = JSON.parse(e.nativeEvent.data); } catch { return; }
    if (!m) return;
    if (m.type === 'token' && typeof m.token === 'string' && m.token.length > 0 && m.token.length <= 2100) { token = m.token; setState('ready'); }
    else if (m.type === 'expired') { token = null; }
    else if (m.type === 'error') { token = null; setState('error'); }
    else if (m.type === 'ready') setState((s) => (s === 'loading' ? 'ready' : s));
  };
  const retry = () => { token = null; setState('loading'); setAttempt((a) => a + 1); };

  return (
    <View style={{ gap: 8 }}>
      {state === 'error' ? (
        <View accessibilityRole="alert" style={{ gap: 8 }}>
          <Text v="small" color={c.badInk}>{t('Güvenlik doğrulaması yüklenemedi. Bağlantını kontrol edip yeniden dene.')}</Text>
          <Button kind="ghost" title={t('Yeniden dene')} onPress={retry} />
        </View>
      ) : (
        <View style={{ height: 72, justifyContent: 'center' }}>
          <Web
            key={attempt}
            ref={web}
            source={{ uri }}
            originWhitelist={[ORIGIN, ORIGIN + '/*', CF + '*']}
            onShouldStartLoadWithRequest={(r) => r.isTopFrame === false || r.url.startsWith(PAGE) || r.url === 'about:blank'}
            onMessage={onMessage}
            onError={() => { token = null; setState('error'); }}
            onHttpError={() => { token = null; setState('error'); }}
            javaScriptEnabled
            domStorageEnabled
            incognito
            setSupportMultipleWindows={false}
            allowsLinkPreview={false}
            scrollEnabled={false}
            bounces={false}
            overScrollMode="never"
            style={{ backgroundColor: 'transparent', opacity: state === 'ready' ? 1 : 0.01 }}
            containerStyle={{ backgroundColor: 'transparent' }}
            accessibilityLabel={t('Güvenlik doğrulaması')}
          />
          {state === 'loading' ? (
            <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, alignItems: 'center' }}>
              <ActivityIndicator color={c.muted} />
            </View>
          ) : null}
        </View>
      )}
    </View>
  );
}
