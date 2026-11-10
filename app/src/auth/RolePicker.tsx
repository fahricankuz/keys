import { useRouter } from 'expo-router';
import { View } from 'react-native';
import AuthShell from './AuthShell';
import { useAuth } from './auth';
import SignedIn from './SignedIn';
import { t } from '../domain/i18n';
import { PressScale, Text } from '../ui/kit';
import { fonts, radius, useBreakpoint, useColors } from '../ui/theme';
import { Icon } from '../app-ui/blocks';

/** Tek kayıt ekranı: kişi kendini listeden seçer; her seçenek kendi kuralıyla devam eder.
    Kiracı ve site sakini davet koduyla, mülk sahibi kodsuz (deneme), site/portföy yöneticisi kurumsal başvuruyla, ekip kendi kaydıyla.
    Geniş ekranda iki sütun; kartlar eşit görünür (hiçbiri seçili gibi durmaz), öne çıkan yalnız etiket. */
export default function RolePicker() {
  const router = useRouter();
  const c = useColors();
  const { phone } = useBreakpoint();
  const { user, ready } = useAuth();
  if (ready && user) return <SignedIn user={user} />;
  const cards: { title: string; sub: string; href: string; icon: string; tag: string; hot?: boolean }[] = [
    { title: t('Mülk sahibiyim'), sub: t('Mülklerimi ve kiracılarımı yönetirim.'), href: '/kayit/mulk-sahibi', icon: 'landlord', tag: t('1 ay ücretsiz'), hot: true },
    { title: t('Kiracıyım'), sub: t('Kiramı öder, taleplerimi takip ederim. Mülk sahibimin davet koduyla.'), href: '/kayit/kiraci', icon: 'home', tag: t('Davet kodu gerekir') },
    { title: t('Sitede oturuyorum'), sub: t('Aidatımı, duyuruları ve taleplerimi izlerim. Site yönetimimin davet koduyla.'), href: '/kayit/site-sakini', icon: 'grid', tag: t('Davet kodu gerekir') },
    { title: t('Site ya da portföy yönetiyorum'), sub: t('Site, AVM, depo ya da GYO yönetimi. Kısa bir başvuruyla kurumunu açarız.'), href: '/kurumsal', icon: 'chart', tag: t('Başvuru') },
    { title: t('Emlakçı, muhasebeci ya da personelim'), sub: t('Bir mülk sahibinin ya da kurumun ekibinde çalışırım.'), href: '/kayit/ekip', icon: 'key', tag: t('Ücretsiz') }
  ];
  return (
    <AuthShell wide top={{ label: t('Hesabın var mı?'), action: t('Giriş yap'), href: '/giris' }} title={t('Kayıt ol')}
      lead={t('Sana uyanı seç. Tek hesapla başlar, başka rollerini sonradan hesabının içinden eklersin.')}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        {cards.map((x) => (
          <PressScale key={x.href} onPress={() => router.push(x.href as any)} accessibilityRole="link" accessibilityLabel={x.title} scaleTo={0.98} hoverScale={1.015}
            style={{ flexGrow: 1, flexBasis: phone ? '100%' : 260, padding: 16, borderRadius: radius.lg, backgroundColor: c.surface, borderWidth: 1.5,
              borderColor: x.hot ? c.accent : c.line, gap: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <View style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: x.hot ? c.accent : c.accentSoft }}>
                <Icon name={x.icon} size={18} color={x.hot ? '#FFFFFF' : c.accent} />
              </View>
              <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: x.hot ? c.accent : c.tile }}>
                <Text v="small" color={x.hot ? '#FFFFFF' : c.muted} style={{ fontFamily: fonts.bodyBold, fontSize: 12 }}>{x.tag}</Text>
              </View>
            </View>
            <View style={{ gap: 4 }}>
              <Text v="body" style={{ fontFamily: fonts.siteBold }}>{x.title}</Text>
              <Text v="small" muted>{x.sub}</Text>
            </View>
          </PressScale>
        ))}
      </View>
    </AuthShell>
  );
}
