import { View } from 'react-native';
import { useRouter } from 'expo-router';
import AuthShell from './AuthShell';
import { User, useAuth } from './auth';
import { t } from '../domain/i18n';
import { Button, Text } from '../ui/kit';

const ROLE: Record<string, string> = { tenant: 'Kiracı', landlord: 'Mülk sahibi', team: 'Ekip üyesi' };

/** Giriş ya da kayıt sayfası açıkken oturum zaten açıksa: kullanıcıyı panele zorla atmak yerine seçenek sunar. */
export default function SignedIn({ user }: { user: User }) {
  const { signOut } = useAuth();
  const router = useRouter();
  const who = user.admin ? t('Yönetici') : t(ROLE[user.role] || 'Kiracı');
  return (
    <AuthShell title={t('Zaten giriş yaptın')} lead={t('Bu cihazda açık bir oturumun var.')}>
      <View style={{ gap: 4 }}>
        <Text v="body" style={{ fontWeight: '700' }}>{user.name || user.email}</Text>
        <Text v="small" muted>{user.email}{user.email ? ' · ' : ''}{who}</Text>
      </View>
      <Button kind="primary" block title={user.admin ? t('Yönetici paneline git') : t('Panele git')} onPress={() => router.replace(user.admin ? '/admin' : '/uygulama')} />
      <Button block kind="ghost" title={t('Çıkış yap, başka hesapla devam et')} onPress={() => signOut()} />
    </AuthShell>
  );
}
