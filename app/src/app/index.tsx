import { Platform, View } from 'react-native';
import { Redirect } from 'expo-router';
import Landing from '../site/Landing';
import { useAuth } from '../auth/auth';
import { useColors } from '../ui/theme';

/** Web'de tanıtım sayfası. Telefon uygulamasında tanıtım ve fiyat sayfası gösterilmez (mağaza kuralı):
    oturum açıksa doğrudan panel, değilse giriş (rol seçimi ve kayıt bağlantısıyla). */
export default function Index() {
  if (Platform.OS === 'web') return <Landing />;
  return <NativeStart />;
}

function NativeStart() {
  const { user, ready } = useAuth();
  const c = useColors();
  if (!ready) return <View style={{ flex: 1, backgroundColor: c.bg }} />;
  return <Redirect href={(user ? '/uygulama' : '/giris') as any} />;
}
