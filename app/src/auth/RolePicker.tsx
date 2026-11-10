import { useRouter } from 'expo-router';
import { View } from 'react-native';
import AuthShell from './AuthShell';
import { useAuth } from './auth';
import SignedIn from './SignedIn';
import { t } from '../domain/i18n';
import { PressScale, Text } from '../ui/kit';
import { fonts, radius, useColors } from '../ui/theme';
import { Icon } from '../app-ui/blocks';

/** Tek kayıt ekranı: kişi kendini listeden seçer; her seçenek kendi kuralıyla devam eder.
    Kiracı ve site sakini davet koduyla, mülk sahibi kodsuz (deneme), site/portföy yöneticisi kurumsal başvuruyla, ekip kendi kaydıyla. */
export default function RolePicker() {
  const router = useRouter();
  const c = useColors();
  const { user, ready } = useAuth();
  if (ready && user) return <SignedIn user={user} />;
  // Marka paleti: mülk sahibi Baca Karası (koyu, krem yazı), diğerleri açık kart.
  const cards: { title: string; sub: string; href: string; icon: string; dark?: boolean; tag?: string }[] = [
    { title: t('Kiracıyım'), sub: t('Kiramı öder, taleplerimi takip ederim. Mülk sahibimin davet koduyla.'), href: '/kayit/kiraci', icon: 'home', tag: t('Davet kodu gerekir') },
    { title: t('Sitede oturuyorum'), sub: t('Aidatımı, duyuruları ve taleplerimi izlerim. Site yönetimimin davet koduyla.'), href: '/kayit/site-sakini', icon: 'grid', tag: t('Davet kodu gerekir') },
    { title: t('Mülk sahibiyim'), sub: t('Mülklerimi ve kiracılarımı yönetirim.'), href: '/kayit/mulk-sahibi', icon: 'landlord', dark: true, tag: t('1 ay ücretsiz') },
    { title: t('Site ya da portföy yönetiyorum'), sub: t('Site, AVM, depo ya da GYO yönetimi. Kısa bir başvuruyla kurumunu açarız.'), href: '/kurumsal', icon: 'chart', tag: t('Başvuru') },
    { title: t('Emlakçı, muhasebeci ya da personelim'), sub: t('Bir mülk sahibinin ya da kurumun ekibinde çalışırım.'), href: '/kayit/ekip', icon: 'key', tag: t('Ücretsiz') }
  ];
  return (
    <AuthShell title={t('Kayıt ol')} lead={t('Sana uyanı seç. Tek hesapla başlar, başka rollerini sonradan hesabının içinden eklersin.')}>
      <View style={{ gap: 10 }}>
        {cards.map((x) => (
          <PressScale key={x.href} onPress={() => router.push(x.href as any)} accessibilityRole="link" accessibilityLabel={x.title} scaleTo={0.98} hoverScale={1.015}
            style={{ padding: 16, borderRadius: radius.lg, backgroundColor: x.dark ? c.deepA : c.surface, borderWidth: 1, borderColor: x.dark ? c.line6 : c.line, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <View style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: x.dark ? c.accent : c.accentSoft }}>
              <Icon name={x.icon} size={18} color={x.dark ? '#fff' : c.accent} />
            </View>
            <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
              <Text v="body" color={x.dark ? c.heroInk : c.ink} style={{ fontFamily: fonts.siteBold }}>{x.title}</Text>
              <Text v="small" color={x.dark ? c.heroMuted : c.muted}>{x.sub}</Text>
              {x.tag ? <Text v="small" color={x.dark ? c.heroInk : c.accentText} style={{ fontFamily: fonts.bodyBold }}>{x.tag}</Text> : null}
            </View>
            <View style={{ transform: [{ rotate: '180deg' }] }}><Icon name="back" size={16} color={x.dark ? c.heroInk : c.accentText} /></View>
          </PressScale>
        ))}
      </View>
      <PressScale onPress={() => router.replace('/giris')} accessibilityRole="link">
        <Text v="small" color={c.accentText} style={{ fontFamily: fonts.bodyBold }}>{t('Hesabın var mı? Giriş yap')}</Text>
      </PressScale>
    </AuthShell>
  );
}
