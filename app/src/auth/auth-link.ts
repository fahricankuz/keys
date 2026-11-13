/* E-posta bağlantılarından (kayıt onayı, şifre sıfırlama, e-posta değişikliği) gelen parametreler.

   Bağlantı PKCE akışında tek kullanımlık bir `code` taşır (ve supabase-js'in eklediği `sb_flow_id`); hazır oturum jetonu taşımaz.
   Web'de adres tarayıcıdan okunur (statik çıktıda adres parametresi yoktur: hidrasyondan sonra). Telefonda parametreleri
   expo-router / expo-linking verir; `window.location` telefonda yoktur. Hata yönlendirmeleri (#error=…&error_code=…) adresin
   parçasında gelir; telefonda yalnız uygulama bağlantıyla açıldıysa (getInitialURL) görülür. */
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import * as Linking from 'expo-linking';
import { useLocalSearchParams } from 'expo-router';

export type AuthLink = { code: string; flowId: string; error: boolean };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || '';

/** "…?a=1&b=2#c=3" biçimindeki adresten sorgu ve parça parametrelerini okur (sorgu önceliklidir). */
export function paramsOf(url: string | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!url) return out;
  const h = url.indexOf('#');
  const hash = h >= 0 ? url.slice(h + 1) : '';
  const rest = h >= 0 ? url.slice(0, h) : url;
  const q = rest.indexOf('?');
  const query = q >= 0 ? rest.slice(q + 1) : '';
  for (const part of [query, hash]) {
    for (const pair of part.split('&')) {
      if (!pair) continue;
      const i = pair.indexOf('=');
      const dec = (s: string) => { try { return decodeURIComponent(s.replace(/\+/g, ' ')); } catch { return s; } };
      const k = dec(i >= 0 ? pair.slice(0, i) : pair);
      if (!(k in out)) out[k] = i >= 0 ? dec(pair.slice(i + 1)) : '';
    }
  }
  return out;
}

/** Bağlantı parametreleri; `ready` false iken (adres henüz okunmadı) hiçbir şey yapılmamalı. */
export function useAuthLink(): { ready: boolean; link: AuthLink } {
  const local = useLocalSearchParams<Record<string, string | string[]>>();
  const [ready, setReady] = useState(false);
  const [extra, setExtra] = useState<Record<string, string>>({});
  useEffect(() => {
    let dead = false;
    (async () => {
      let p: Record<string, string> = {};
      try {
        if (Platform.OS === 'web') p = typeof window !== 'undefined' ? paramsOf(window.location.href) : {};
        else p = paramsOf(await Linking.getInitialURL());
      } catch { /* adres okunamadı: bağlantısız sayılır */ }
      if (!dead) { setExtra(p); setReady(true); }
    })();
    return () => { dead = true; };
  }, []);
  const web = Platform.OS === 'web';
  // Telefonda kod ve akış kimliği yalnızca yönlendiriciden gelir (eski bir açılış bağlantısı bu oturumda yeniden kullanılmasın);
  // hata işareti iki kaynaktan da okunur.
  const code = web ? extra.code || '' : one(local.code);
  const flowId = web ? extra.sb_flow_id || '' : one(local.sb_flow_id);
  const error = !!(extra.error || extra.error_code || one(local.error) || one(local.error_code));
  return { ready, link: { code, flowId, error } };
}

/** Web: kod adreste (geçmişte, ekran görüntüsünde) kalmasın diye adres temizlenir. */
export function clearLinkFromUrl() {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  try { window.history.replaceState(null, '', window.location.pathname); } catch { /* yoksay */ }
}
