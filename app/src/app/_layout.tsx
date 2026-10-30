import { useEffect, useState } from 'react';
import { Platform, View } from 'react-native';
import { Slot, usePathname, type ErrorBoundaryProps } from 'expo-router';
import { useFonts } from 'expo-font';
import { FONT_FILES } from '../ui/fontFiles';
import { hydrate } from '../domain/storage';
import { initLang } from '../domain/i18n';
import { boot } from '../domain/state';
import { AuthProvider } from '../auth/auth';
import { useColors } from '../ui/theme';
import titles from '../site/titles.json';
import { installErrorReporting, reportError } from '../domain/errors';
import { t } from '../domain/i18n';
import { Button, Text } from '../ui/kit';
import { fonts } from '../ui/theme';

/** Beklenmeyen ekran hatası: boş ekran yerine açıklama ve yeniden deneme; hata sunucuya kaydedilir (yönetici → Hatalar). */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  const c = useColors();
  useEffect(() => { reportError(error, 'render'); }, [error]);
  return (
    <View accessibilityRole="alert" style={{ flex: 1, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 14 }}>
      <Text v="h2" style={{ fontFamily: fonts.siteBold, textAlign: 'center' }}>{t('Bir şeyler ters gitti')}</Text>
      <Text v="body" muted style={{ textAlign: 'center', maxWidth: 420 }}>{t('Ekran yüklenirken beklenmeyen bir hata oluştu. Kayıtların güvende; hatayı ekibimize ilettik.')}</Text>
      <Button title={t('Yeniden dene')} onPress={retry} />
      <Button kind="ghost" title={t('Ana sayfaya dön')} onPress={() => { if (typeof window !== 'undefined' && window.location) window.location.assign('/'); else retry(); }} />
    </View>
  );
}

export default function Root() {
  const [fontsOk] = useFonts(FONT_FILES);
  const [stored, setStored] = useState(false);
  useEffect(() => { installErrorReporting(); }, []);
  useEffect(() => {
    // Web'de sunucu HTML'i Türkçe üretilir; kayıtlı dil, hidrasyon bittikten sonra uygulanır
    // (aksi halde metinler sunucu çıktısıyla uyuşmaz).
    // Sabit bir bekleme yetmez: sayfa bölümleri ayrı yüklenir; dil, içerik React'e bağlanmadan değişirse
    // "hydration" hatası olur. Bu yüzden sayfadaki son öğe React'e bağlanınca (en fazla 3 sn) uygulanır.
    hydrate().then(() => {
      const apply = () => { initLang().then(() => { boot(); setStored(true); }); };
      if (Platform.OS !== 'web' || typeof document === 'undefined') { apply(); return; }
      const t0 = Date.now();
      const hydrated = () => {
        const all = (document.getElementById('root') || document.body).getElementsByTagName('*');
        const last = all[all.length - 1];
        return !last || Object.keys(last).some((k) => k.startsWith('__reactFiber'));
      };
      const wait = () => { if (hydrated() || Date.now() - t0 > 3000) requestAnimationFrame(() => setTimeout(apply, 0)); else setTimeout(wait, 30); };
      wait();
    });
  }, []);
  // E-posta onay bağlantısı eskiden ana sayfaya dönüyordu (#access_token=…&type=signup): /dogrula sayfasına aktarılır,
  // oturum açılıp kişi paneline geçer. Yeni kayıtlarda bağlantı zaten /dogrula adresine gelir.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const h = window.location.hash;
    if (/access_token=/.test(h) && /type=(signup|email|email_change|invite|magiclink)/.test(h) && !/^\/dogrula/.test(window.location.pathname))
      window.location.replace('/dogrula' + h);
  }, []);
  // Eski uygulamanın servis çalışıcısı ve önbelleği telefonlarda kalmış olabilir ("bazen eski uygulama açılıyor"):
  // bulunursa kaldırılır ve eski önbellek silinir. Yeni sitenin kendi çalışıcısı yoktur.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.getRegistrations().then((regs) => Promise.all(regs.map((r) => r.unregister()))).catch(() => {});
    if (typeof caches !== 'undefined') caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith('evim-')).map((k) => caches.delete(k)))).catch(() => {});
  }, []);
  const c = useColors();
  // Sayfa geçişlerinde sekme başlığı da değişsin (ekran okuyucu ve geçmiş için).
  const path = usePathname();
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const key = path.replace(/^\/|\/$/g, '');
    const T = titles as unknown as Record<string, string | { title: string }>;
    const v = T[key] || T[key.split('/').slice(0, 2).join('/')] || T[key.split('/')[0]] || T._default;
    document.title = typeof v === 'string' ? v : v.title;
  }, [path]);
  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      document.documentElement.style.backgroundColor = c.bg;
      document.documentElement.style.colorScheme = c.bg === '#141311' ? 'dark' : 'light';
    }
  }, [c.bg]);
  // Web'de içerik hemen çizilir (statik dışa aktarma dolu HTML üretir); yazı tipi gelince değişir.
  if (Platform.OS !== 'web' && (!fontsOk || !stored)) return <View style={{ flex: 1, backgroundColor: c.bg }} />;
  return (
    <AuthProvider>
      <View style={{ flex: 1, backgroundColor: c.bg }}>
        <Slot />
      </View>
    </AuthProvider>
  );
}
