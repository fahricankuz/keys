import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import AuthShell from '../auth/AuthShell';
import { useAuth } from '../auth/auth';
import * as backend from '../domain/backend';
import { t } from '../domain/i18n';
import { Button, Text } from '../ui/kit';
import { useColors } from '../ui/theme';

/** Bağlantıdaki jetonla oturumu açar (kayıt onayı ve e-posta değişikliği). Jeton yoksa ya da geçersizse false. */
async function openFromLink(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  const q = new URLSearchParams(window.location.search);
  const h = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const get = (k: string) => q.get(k) || h.get(k);
  if (get('error') || get('error_code')) return false;
  const c = await backend.client();
  let error: unknown = null;
  const access = get('access_token'), refresh = get('refresh_token'), code = get('code'), hashTok = get('token_hash');
  if (access && refresh) ({ error } = await c.auth.setSession({ access_token: access, refresh_token: refresh }));
  else if (code) ({ error } = await c.auth.exchangeCodeForSession(code));
  else if (hashTok) ({ error } = await c.auth.verifyOtp({ token_hash: hashTok, type: (get('type') as any) || 'signup' }));
  else return false;
  // Jeton adreste (geçmişte, ekran görüntüsünde) kalmasın.
  try { window.history.replaceState(null, '', window.location.pathname); } catch {}
  return !error;
}

/** E-posta onay bağlantısının indiği sayfa: hesabı açar ve kişiyi giriş geçişiyle doğrudan paneline götürür. */
export default function Dogrula() {
  const { adopt } = useAuth();
  const router = useRouter();
  const c = useColors();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    openFromLink()
      .then((ok) => (ok ? adopt() : null))
      .then((u) => { if (u) router.replace(u.admin ? '/admin' : '/uygulama'); else setFailed(true); })
      .catch(() => setFailed(true));
  }, []);
  if (!failed) return <View style={{ flex: 1, backgroundColor: c.bg }} />;
  return (
    <AuthShell title={t('Bağlantı geçersiz')} lead={t('Onay bağlantısının süresi dolmuş ya da daha önce kullanılmış olabilir. E-postan doğrulandıysa giriş yaparak devam edebilirsin.')}>
      <Text v="small" muted>{t('Sorun sürerse info@anahtar.io adresine yaz.')}</Text>
      <Button block title={t('Giriş yap')} onPress={() => router.replace('/giris')} />
    </AuthShell>
  );
}
