import { useRouter } from 'expo-router';
import { View } from 'react-native';
import AuthShell from './AuthShell';
import { useAuth } from './auth';
import SignedIn from './SignedIn';
import { t } from '../domain/i18n';
import { PressScale, Text } from '../ui/kit';
import { fonts, radius, useColors } from '../ui/theme';
import { Icon } from '../app-ui/blocks';

/** Giriş ve kayıt için ilk adım: kiracı mı, mülk sahibi mi. */
export default function RolePicker({ mode }: { mode: 'giris' | 'kayit' }) {
  const router = useRouter();
  const c = useColors();
  const { user, ready, live } = useAuth();
  if (ready && user) return <SignedIn user={user} />;
  const login = mode === 'giris';
  // Marka paleti: kiracı Gül Kurusu (açık, sıcak), mülk sahibi Baca Karası (koyu, krem yazı) — soldaki koyu panel ve
  // fiyatlardaki Portföy kartıyla aynı dil.
  const cards: [string, string, string, string, boolean][] = [
    [login ? t('Kiracı girişi') : t('Kiracı olarak kayıt ol'), t('Kiramı öder, taleplerimi takip ederim.'), login ? '/giris/kiraci' : '/kayit/kiraci', c.peach, false],
    [login ? t('Mülk sahibi girişi') : t('Mülk sahibi olarak kayıt ol'), t('Mülklerimi ve kiracılarımı yönetirim.'), login ? '/giris/mulk-sahibi' : '/kayit/mulk-sahibi', c.deepA, true]
  ];
  return (
    <AuthShell title={login ? t('Giriş yap') : t('Kayıt ol')} lead={login ? t('Hesap türünü seç.') : t('Kiracılar ücretsiz. Mülk sahipleri 1 ay ücretsiz dener.')}>
      <View style={{ gap: 12 }}>
        {cards.map(([title, sub, href, bg, dark]) => (
          <PressScale key={href} onPress={() => router.push(href as any)} accessibilityRole="link" scaleTo={0.98} hoverScale={1.015}
            style={{ padding: 20, borderRadius: radius.lg, backgroundColor: bg, borderWidth: 1, borderColor: dark ? c.line6 : 'transparent', flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <View style={{ flex: 1, gap: 4 }}>
              <Text v="h3" color={dark ? c.heroInk : c.ink} style={{ fontFamily: fonts.siteBold }}>{title}</Text>
              <Text v="small" color={dark ? c.heroMuted : c.ink}>{sub}</Text>
            </View>
            <View style={{ width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: dark ? c.accent : c.surface }}>
              <View style={{ transform: [{ rotate: '180deg' }] }}><Icon name="back" size={16} color={dark ? '#fff' : c.accentText} /></View>
            </View>
          </PressScale>
        ))}
      </View>
      <PressScale onPress={() => router.replace(login ? '/kayit' : '/giris')} accessibilityRole="link">
        <Text v="small" color={c.accentText} style={{ fontFamily: fonts.bodyBold }}>{login ? t('Hesabın yok mu? Kayıt ol') : t('Hesabın var mı? Giriş yap')}</Text>
      </PressScale>
      {!login ? (
        <PressScale onPress={() => router.push('/kayit/ekip')} accessibilityRole="link"><Text v="small" muted>{t('Emlakçı, muhasebeci ya da personel misin? Ekip hesabı oluştur')}</Text></PressScale>
      ) : null}
      {login && live ? (
        <PressScale onPress={() => router.push('/giris/yonetici')} accessibilityRole="link"><Text v="small" muted>{t('Yönetici girişi')}</Text></PressScale>
      ) : null}
    </AuthShell>
  );
}
