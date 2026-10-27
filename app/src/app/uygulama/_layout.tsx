import { Redirect, Slot } from 'expo-router';
import { View } from 'react-native';
import { useAuth } from '../../auth/auth';
import AppShell from '../../app-ui/AppShell';
import JoinCode from '../../app-ui/JoinCode';
import { useStore } from '../../app-ui/hooks';
import { FullLoader } from '../../ui/Loader';

/** Kapı: uygulama yalnızca oturumla açılır. Yöneticiler /admin'e, bağlanmamış kiracılar ve ekip üyeleri kod ekranına gider. */
export default function Gate() {
  const { user, ready, live } = useAuth();
  const { S } = useStore();
  if (!ready) return <FullLoader />;
  if (!user) return <Redirect href="/giris" />;
  if (user.admin) return <Redirect href="/admin" />;
  if (live && user.role === 'tenant' && !S.myHome) return <JoinCode />;
  // Henüz hiçbir mülke atanmamış ekip üyesi davet kodu ekranını görür.
  if (live && user.role === 'team' && !S.order.length) return <JoinCode team />;
  return <AppShell><Slot /></AppShell>;
}
