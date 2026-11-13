import { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import AuthShell from '../auth/AuthShell';
import { dropInvite, keepInvite, useAuth } from '../auth/auth';
import { t } from '../domain/i18n';
import { invitePreview } from '../domain/backend';
import { isOrgInviteCode, isSiteInviteCode, inviteCodeFromInput, normalizeInviteCode } from '../domain/invite-code';
import { siteInviteInfo } from '../domain/site';
import { roleLabel } from '../domain/team';
import { Button, Text } from '../ui/kit';
import { View } from 'react-native';
import { useColors, fonts } from '../ui/theme';

type Preview = { role: string; scope?: string; owner?: string; property?: string; valid?: boolean; email_bound?: boolean };

/** Davet bağlantısı: kod saklanır, hesap açıldıktan / giriş yapıldıktan sonra mülke ya da ekibe katılınır. */
export default function Katil() {
  const { kod } = useLocalSearchParams<{ kod?: string }>();
  const { user, ready, join, live } = useAuth();
  const router = useRouter();
  const c = useColors();
  // Statik çıktıda adres parametresi yoktur; hidrasyon uyuşsun diye kod bağlandıktan sonra çizilir.
  const [mounted, setMounted] = useState(false);
  const [info, setInfo] = useState<Preview | null>(null);
  const [siteInfo, setSiteInfo] = useState<any>(null);
  // Sunucu kodu tanımıyor (yazım hatası ya da silinmiş davet). Sunucuya ulaşılamadıysa bu değer değişmez: davet sayfası kalır.
  const [missing, setMissing] = useState(false);
  const noInvite = (x: unknown) => { if (!x) { setMissing(true); dropInvite(); } };
  useEffect(() => setMounted(true), []);
  const given = mounted ? normalizeInviteCode(Array.isArray(kod) ? kod[0] : kod) : '';
  const code = inviteCodeFromInput(given);            // kod olamayacak kadar kısa ya da uzun değerler kod sayılmaz
  useEffect(() => {
    if (!mounted) return;
    if (!code) { if (given) setMissing(true); else router.replace('/giris'); return; }
    keepInvite(code);
    if (live && !isOrgInviteCode(code) && !isSiteInviteCode(code)) invitePreview(code).then((x) => { setInfo(x); noInvite(x); }).catch(() => {});
    // Site daveti: sunucu yalnız site, daire, rol ve maskeli ad döndürür (telefon ve e-posta yok); kayıt formu önceden doldurulmaz.
    if (live && isSiteInviteCode(code) && !user) siteInviteInfo(code).then((x) => { setSiteInfo(x); noInvite(x); }).catch(() => {});
    if (ready && live && user && !user.admin) join(code).then(() => router.replace('/uygulama'));
  }, [mounted, code, given, ready, live, user, join, router]);

  // Kurum yöneticisi daveti ("K" ile başlayan kod): ücretsiz ekip hesabıyla ya da mevcut hesapla katılınır.
  const org = isOrgInviteCode(code);
  // Site dairesi daveti ("S" ile başlar): malik ya da kiracı ücretsiz hesapla katılır.
  const site = isSiteInviteCode(code);
  const team = org || (!!info && info.role !== 'tenant');
  const title = missing ? t('Davet bulunamadı') : site ? t('Sitene davet edildin') : org ? t('Kurum yöneticisi olarak davet edildin') : team ? t('Ekibe davet edildin') : t('Kiraladığın mülke davet edildin');
  const lead = missing
    ? t('Bu kodla bir davet yok. Bağlantıyı kontrol et ya da davet edenden yeni kod iste.')
    : site
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
          {siteInfo ? <Text v="small" muted>{[siteInfo.org, siteInfo.unit].filter(Boolean).join(' · ')}</Text> : null}
          {siteInfo && siteInfo.name ? <Text v="small" muted>{siteInfo.name}</Text> : null}
          {(siteInfo && siteInfo.email_bound) || (info && info.email_bound) ? <Text v="small" muted>{t('Bu davet bir e-posta adresine özel: davet edilen e-postayla kayıt ol ya da giriş yap.')}</Text> : null}
          {siteInfo && siteInfo.used ? <Text v="small" color={c.badInk}>{t('Bu davet kullanılmış. Yönetiminden yeni davet iste.')}</Text> : null}
          {info ? <Text v="small" muted>{info.property}{team ? ' · ' + (info.scope === 'portfolio' ? t('tüm portföy') : t('tek mülk')) : ''}</Text> : null}
          {info && !info.valid ? <Text v="small" color={c.badInk}>{t('Bu davet kullanılmış ya da süresi dolmuş. Mülk sahibinden yeni kod iste.')}</Text> : null}
        </View>
      ) : null}
      {missing ? (
        <>
          <Button kind="primary" block title={t('Ana sayfaya dön')} onPress={() => router.replace('/')} />
          <Button block kind="ghost" title={t('Hesabım var, giriş yap')} onPress={() => router.push('/giris')} />
        </>
      ) : site ? (
        <>
          <Button kind="primary" block title={t('Ücretsiz hesap oluştur')} onPress={() => router.push('/kayit/site-sakini')} />
          <Button block kind="ghost" title={t('Hesabım var, giriş yap')} onPress={() => router.push('/giris')} />
        </>
      ) : team ? (
        <>
          <Button kind="primary" block title={org ? t('Hesap oluştur') : t('Ekip hesabı oluştur')} onPress={() => router.push('/kayit/ekip')} />
          <Button block kind="ghost" title={t('Hesabım var, giriş yap')} onPress={() => router.push('/giris')} />
        </>
      ) : (
        <>
          <Button kind="primary" block title={t('Kiracı hesabı oluştur')} onPress={() => router.push('/kayit/kiraci')} />
          <Button block kind="ghost" title={t('Hesabım var, giriş yap')} onPress={() => router.push('/giris')} />
        </>
      )}
    </AuthShell>
  );
}
