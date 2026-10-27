import { useEffect, useState } from 'react';
import { Platform, View } from 'react-native';
import { Slot, usePathname } from 'expo-router';
import { useFonts } from 'expo-font';
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import { InterTight_700Bold, InterTight_800ExtraBold } from '@expo-google-fonts/inter-tight';
import { hydrate } from '../domain/storage';
import { initLang } from '../domain/i18n';
import { boot } from '../domain/state';
import { AuthProvider } from '../auth/auth';
import { useColors } from '../ui/theme';
import titles from '../site/titles.json';

export default function Root() {
  const [fontsOk] = useFonts({
    InterTight_700Bold, InterTight_800ExtraBold, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold
  });
  const [stored, setStored] = useState(false);
  useEffect(() => {
    // Web'de sunucu HTML'i Türkçe üretilir; kayıtlı dil, hidrasyon bittikten sonra uygulanır
    // (aksi halde metinler sunucu çıktısıyla uyuşmaz).
    hydrate().then(() => {
      const apply = () => { initLang(); boot(); setStored(true); };
      if (Platform.OS === 'web') setTimeout(apply, 80); else apply();
    });
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
    const T = titles as Record<string, string>;
    document.title = T[key] || T[key.split('/').slice(0, 2).join('/')] || T[key.split('/')[0]] || T._default;
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
