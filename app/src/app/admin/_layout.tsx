import { Redirect, Slot } from 'expo-router';
import { View } from 'react-native';
import { useAuth } from '../../auth/auth';
import { FullLoader } from '../../ui/Loader';
import { PanelUI } from '../../ui/kit';

/** Kapı: yönetici paneli yalnızca admins tablosundaki hesaplara açılır. */
export default function AdminGate() {
  const { user, ready } = useAuth();
  if (!ready) return <FullLoader />;
  if (!user) return <Redirect href="/giris/yonetici" />;
  if (!user.admin) return <Redirect href="/uygulama" />;
  return <PanelUI.Provider value={true}><Slot /></PanelUI.Provider>;
}
