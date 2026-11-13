import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import AuthShell from '../auth/AuthShell';
import { useAuth } from '../auth/auth';
import { clearLinkFromUrl, useAuthLink } from '../auth/auth-link';
import * as backend from '../domain/backend';
import { t } from '../domain/i18n';
import { Button, Text } from '../ui/kit';
import { useColors } from '../ui/theme';

/** E-posta onay bağlantısının indiği sayfa: hesabı açar ve kişiyi giriş geçişiyle doğrudan paneline götürür.
    Bağlantı PKCE kodu taşır; kod yalnızca isteğin yapıldığı cihazda oturuma çevrilir. Başka cihazda açılırsa açıklama gösterilir. */
export default function Dogrula() {
  const { adopt } = useAuth();
  const router = useRouter();
  const c = useColors();
  const { ready, link } = useAuthLink();
  const [state, setState] = useState<'check' | 'failed' | 'device'>('check');
  const started = useRef(false);
  useEffect(() => {
    if (!ready || started.current) return;
    started.current = true;
    (async () => {
      if (link.error || !link.code) return setState('failed');
      const r = await backend.exchangeAuthCode(link.code, link.flowId);
      clearLinkFromUrl();
      if (r === 'device') return setState('device');
      const u = r === 'ok' ? await adopt() : null;
      if (u) router.replace(u.admin ? '/admin' : '/uygulama'); else setState('failed');
    })().catch(() => setState('failed'));
  }, [ready, link]);
  if (state === 'check') return <View style={{ flex: 1, backgroundColor: c.bg }} />;
  if (state === 'device') return (
    <AuthShell title={t('Bağlantıyı başka cihazda açtın')} lead={t('Güvenliğin için bu bağlantı yalnızca isteği yaptığın cihazda ve uygulamada ya da tarayıcıda çalışır. Bağlantıyı orada aç. E-postanı zaten doğruladıysan giriş yaparak devam edebilirsin.')}>
      <Button block title={t('Giriş yap')} onPress={() => router.replace('/giris')} />
    </AuthShell>
  );
  return (
    <AuthShell title={t('Bağlantı geçersiz')} lead={t('Onay bağlantısının süresi dolmuş ya da daha önce kullanılmış olabilir. E-postan doğrulandıysa giriş yaparak devam edebilirsin.')}>
      <Text v="small" muted>{t('Sorun sürerse info@anahtar.io adresine yaz.')}</Text>
      <Button block title={t('Giriş yap')} onPress={() => router.replace('/giris')} />
    </AuthShell>
  );
}
