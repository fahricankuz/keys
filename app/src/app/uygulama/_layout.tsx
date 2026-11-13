import { useEffect, useRef } from 'react';
import { Redirect, Slot, useRouter } from 'expo-router';
import { AppState, View } from 'react-native';
import { useAuth } from '../../auth/auth';
import AppShell from '../../app-ui/AppShell';
import JoinCode from '../../app-ui/JoinCode';
import { useStore } from '../../app-ui/hooks';
import { useSheet } from '../../app-ui/overlays';
import { FullLoader } from '../../ui/Loader';
import { myOrgs } from '../../domain/org';
import { registerDevice, listenNotificationTaps, noteSession, shouldPrimePush, markPrimed } from '../../domain/native-push';
import { syncStoreIfDue } from '../../domain/iap';

/** Telefon: bildirim iznini sormadan önce kısa bir açıklama sayfası açar. Girişte değil, ikinci oturumdan itibaren (native-push →
    shouldPrimePush) ve ekranda başka bir sayfa açık değilken; sistem penceresi yalnızca sayfadaki "Aç" ile çıkar. Web'de hiçbir şey yapmaz. */
function PushPrimer({ userId }: { userId?: string }) {
  const { sheet, open } = useSheet();
  const sheetRef = useRef(sheet);
  sheetRef.current = sheet;
  useEffect(() => {
    let on = true;
    const timer = setTimeout(async () => {
      if (!(await shouldPrimePush()) || !on || sheetRef.current) return;
      markPrimed();
      open('bildirim-izni');
    }, 6000);
    return () => { on = false; clearTimeout(timer); };
  }, [userId]);
  return null;
}

/** Kapı: uygulama yalnızca oturumla açılır. Yöneticiler /admin'e, bağlanmamış kiracılar ve ekip üyeleri kod ekranına gider. */
export default function Gate() {
  const { user, ready, live } = useAuth();
  const { S } = useStore();
  const router = useRouter();
  // Telefon uygulaması: oturum açılınca cihaz kaydı (izin zaten verilmişse; izin burada sorulmaz) ve oturum sayacı (web'de işlem yapmaz).
  useEffect(() => { if (live && user && !user.admin) { noteSession(); registerDevice(); } }, [live, user?.id]);
  // Öne gelince: mağaza aboneliğinin süresi 2 gün içinde bitiyorsa sunucudaki kayıt RevenueCat'ten tazelenir (kaçan webhook güvencesi).
  useEffect(() => {
    if (!live || !user || user.admin) return;
    syncStoreIfDue().catch(() => {});
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') syncStoreIfDue().catch(() => {}); });
    return () => sub.remove();
  }, [live, user?.id]);
  useEffect(() => listenNotificationTaps((p: string) => router.push(p as any)), []);
  if (!ready) return <FullLoader />;
  if (!user) return <Redirect href="/giris" />;
  if (user.admin) return <Redirect href="/admin" />;
  // Kiracı davet kodu olmadan da paneli açar; bağlanana kadar her sayfanın üstünde kod alanı görünür (Page → JoinBanner).
  // Henüz hiçbir mülke atanmamış ekip üyesi davet kodu ekranını görür (yalnızca bir kurumun yöneticisiyse kurum ekranı açılır).
  if (live && user.role === 'team' && !S.order.length && !myOrgs().length) return <JoinCode team />;
  return <AppShell><PushPrimer userId={user.id} /><Slot /></AppShell>;
}
