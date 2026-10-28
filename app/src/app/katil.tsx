import { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import AuthShell from '../auth/AuthShell';
import { keepInvite, useAuth } from '../auth/auth';
import { t } from '../domain/i18n';
import { invitePreview } from '../domain/backend';
import { isOrgCode } from '../domain/org';
import { isSiteCode } from '../domain/site';
import { roleLabel } from '../domain/team';
import { Button, Text } from '../ui/kit';
import { View } from 'react-native';
import { useColors, fonts } from '../ui/theme';

type Preview = { role: string; scope?: string; owner?: string; property?: string; valid?: boolean };

/** Davet bağlantısı: kod saklanır, hesap açıldıktan / giriş yapıldıktan sonra mülke ya da ekibe katılınır. */
export default function Katil() {
  const { kod } = useLocalSearchParams<{ kod?: string }>();
  const { user, ready, join, live } = useAuth();
  const router = useRouter();
  const c = useColors();
  // Statik çıktıda adres parametresi yoktur; hidrasyon uyuşsun diye kod bağlandıktan sonra çizilir.
  const [mounted, setMounted] = useState(false);
  const [info, setInfo] = useState<Preview | null>(null);
  useEffect(() => setMounted(true), []);
  const code = mounted ? String(Array.isArray(kod) ? kod[0] : kod || '').toUpperCase() : '';
  useEffect(() => {
    if (!mounted) return;
    if (!code) { router.replace('/giris'); return; }
    keepInvite(code);
    if (live && !isOrgCode(code) && !isSiteCode(code)) invitePreview(code).then(setInfo).catch(() => {});
    if (ready && live && user && !user.admin) join(code).then(() => router.replace('/uygulama'));
  }, [mounted, code, ready, live, user, join, router]);

  // Kurum yöneticisi daveti ("K" ile başlayan kod): ücretsiz ekip hesabıyla ya da mevcut hesapla katılınır.
  const org = isOrgCode(code);
  // Site dairesi daveti ("S" ile başlar): malik ya da kiracı ücretsiz hesapla katılır.
  const site = isSiteCode(code);
  const team = org || (!!info && info.role !== 'tenant');
  const title = site ? t('Sitene davet edildin') : org ? t('Kurum yöneticisi olarak davet edildin') : team ? t('Ekibe davet edildin') : t('Kiraladığın mülke davet edildin');
  const lead = site
    ? t('Site yönetimin seni anahtar’a davet etti. Ücretsiz hesabını oluştur ya da giriş yap; aidatını, duyuruları ve taleplerini buradan izleyeceksin.')
    : org
    ? t('Kurumun seni anahtar’da yönetici olarak davet etti. Ücretsiz hesabını oluştur ya da giriş yap; kuruma otomatik katılacaksın.')
    : team
    ? t('{owner} seni {role} olarak ekibine davet etti. Ücretsiz ekip hesabını oluştur ya da giriş yap; ekibe otomatik katılacaksın.',
      { owner: info!.owner, role: roleLabel(info!.role).toLocaleLowerCase('tr') })
    : t('Mülk sahibin seni anahtar’a davet etti. Hesabını oluştur ya da giriş yap; kiraladığın mülke otomatik bağlanacaksın.');
  return (
    <AuthShell title={title} lead={lead}>
      {code ? (
        <View style={{ backgroundColor: c.cream, borderRadius: 20, padding: 16, alignItems: 'center', gap: 4 }}>
          <Text v="h2" selectable style={{ letterSpacing: 4, fontFamily: fonts.siteBold }}>{code}</Text>
          {info ? <Text v="small" muted>{info.property}{team ? ' · ' + (info.scope === 'portfolio' ? t('tüm portföy') : t('tek mülk')) : ''}</Text> : null}
          {info && !info.valid ? <Text v="small" color={c.badInk}>{t('Bu davet kullanılmış ya da süresi dolmuş. Mülk sahibinden yeni kod iste.')}</Text> : null}
        </View>
      ) : null}
      {site ? (
        <>
          <Button kind="primary" block title={t('Ücretsiz hesap oluştur')} onPress={() => router.push('/kayit/kiraci')} />
          <Button block kind="ghost" title={t('Hesabım var, giriş yap')} onPress={() => router.push('/giris')} />
        </>
      ) : team ? (
        <>
          <Button kind="primary" block title={org ? t('Hesap oluştur') : t('Ekip hesabı oluştur')} onPress={() => router.push('/kayit/ekip')} />
          <Button block kind="ghost" title={t('Hesabım var, giriş yap')} onPress={() => router.push('/giris/mulk-sahibi')} />
        </>
      ) : (
        <>
          <Button kind="primary" block title={t('Kiracı hesabı oluştur')} onPress={() => router.push('/kayit/kiraci')} />
          <Button block kind="ghost" title={t('Hesabım var, giriş yap')} onPress={() => router.push('/giris/kiraci')} />
        </>
      )}
    </AuthShell>
  );
}
