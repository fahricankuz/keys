import { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import AuthShell from '../auth/AuthShell';
import { unsubscribeAnnouncements } from '../domain/announce';
import { t } from '../domain/i18n';
import { Button, Text } from '../ui/kit';

/** Duyuru e-postasındaki "Duyuru e-postalarını alma" bağlantısı: alıcıya özel jetonla (girişsiz) duyuru e-postalarını kapatır.
    Ayarlar → Bildirimler → "Duyuru e-postaları" ile yeniden açılır. */
export default function DuyuruIptal() {
  const { t: token } = useLocalSearchParams<{ t?: string }>();
  const router = useRouter();
  const [state, setState] = useState<'wait' | 'ok' | 'bad'>('wait');
  useEffect(() => {
    if (!token) return;
    unsubscribeAnnouncements(String(token)).then((ok: boolean) => setState(ok ? 'ok' : 'bad')).catch(() => setState('bad'));
  }, [token]);
  const title = state === 'ok' ? t('Duyuru e-postaları kapatıldı') : state === 'bad' ? t('Bağlantı geçersiz') : t('Duyuru e-postaları');
  const lead = state === 'ok'
    ? t('Artık anahtar duyurularını e-postayla almayacaksın. İstersen Ayarlar → Bildirimler’den yeniden açabilirsin.')
    : state === 'bad' ? t('Bu bağlantı tanınmadı. Duyuru e-postalarını Ayarlar → Bildirimler’den kapatabilirsin.') : t('İşleniyor…');
  return (
    <AuthShell title={title} lead={lead}>
      {state !== 'wait' ? <Button block title={t('anahtar’a git')} onPress={() => router.replace('/')} /> : <Text v="small" muted>{t('Bir saniye…')}</Text>}
    </AuthShell>
  );
}
