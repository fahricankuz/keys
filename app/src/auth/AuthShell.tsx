import { ReactNode, useEffect } from 'react';
import { ScrollView, useWindowDimensions, View } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { t } from '../domain/i18n';
import { LIVE } from '../domain/config';
import { client } from '../domain/backend';
import { PressScale, Text } from '../ui/kit';
import { Wordmark } from '../ui/Wordmark';
import { Grain } from '../ui/Grain';
import { Icon } from '../app-ui/blocks';
import { fonts, useBreakpoint, useColors } from '../ui/theme';

type Side = { title: string; lead: string; points?: string[]; groups?: { title: string; items: string[] }[]; foot?: string };

/** Varsayılan marka paneli: kim için ne yapar (üç satır). */
const DEFAULT_ROWS = () => [
  { icon: 'landlord', title: t('Mülk sahibi'), text: t('Kira takibi, sözleşme, tahsilat ve rapor tek yerde.') },
  { icon: 'home', title: t('Kiracı'), text: t('Kiranı öde, dekont yükle, talebini takip et. Ücretsiz.') },
  { icon: 'grid', title: t('Site ve portföy'), text: t('Aidat, gider, genel kurul ve sakin iletişimi.') }
];

/** Giriş, kayıt ve şifre ekranlarının ortak iskeleti.
    Geniş ekran: ortalanmış iki sütun; solda sayfa kayarken yerinde kalan marka paneli, sağda form. Üstte logo ve karşı bağlantı
    (giriş ↔ kayıt). Telefon: üstte logo ve bağlantı, form yukarıdan başlar. */
export default function AuthShell({ title, lead, children, side, wide, top }: {
  title: string; lead?: string; children: ReactNode;
  /** Sol paneldeki başlık, metin ve maddeler (varsayılan: marka sözü ve kim için ne yapar). */
  side?: Side; wide?: boolean;
  /** Sağ üstteki bağlantı (ör. "Hesabın yok mu? Kayıt ol"). */
  top?: { label: string; action: string; href: string };
}) {
  const c = useColors();
  const router = useRouter();
  const { desktop, phone } = useBreakpoint();
  const { height } = useWindowDimensions();
  // Giriş, kayıt ve şifre sayfaları sunucu kütüphanesini açılır açılmaz arka planda hazırlar (gönder'e basınca beklenmesin).
  useEffect(() => { if (LIVE) client().catch(() => {}); }, []);
  const topLink = top ? (
    <PressScale onPress={() => router.push(top.href as any)} accessibilityRole="link" accessibilityLabel={top.label + ' ' + top.action}>
      <Text v="small" muted>{top.label} <Text v="small" color={c.accentText} style={{ fontFamily: fonts.bodyXBold }}>{top.action}</Text></Text>
    </PressScale>
  ) : null;
  const tick = (x: string) => (
    <View key={x} style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
      <Text v="body" color={c.lemon} style={{ fontFamily: fonts.bodyXBold }}>✓</Text>
      <Text v="body" color="#FFF3EA" style={{ flex: 1 }}>{x}</Text>
    </View>
  );
  const panel = (
    <View style={{ width: 460, flexShrink: 0, alignSelf: 'flex-start', position: 'sticky' as any, top: 20, height: Math.max(560, height - 40),
      backgroundColor: c.deepA, borderRadius: 36, padding: 44, justifyContent: 'space-between', overflow: 'hidden' }}>
      <Grain />
      <PressScale onPress={() => router.replace('/')} accessibilityRole="link" style={{ alignSelf: 'flex-start' }}><Wordmark size={30} color={c.heroInk} animate /></PressScale>
      <View style={{ gap: 18 }}>
        <Text v="h1" color="#FFF3EA" style={{ fontFamily: fonts.siteBold, fontSize: side ? 40 : 46, lineHeight: side ? 43 : 48, letterSpacing: -1 }}>{side ? side.title : t('Kira işinin anahtarı.')}</Text>
        <Text v="body" color={c.heroMuted}>{side ? side.lead : t('Kiracılar ücretsiz. Mülk sahipleri 1 ay ücretsiz dener.')}</Text>
        {side?.points?.map(tick)}
        {side?.groups?.map((g) => (
          <View key={g.title} style={{ gap: 8, marginTop: 6 }}>
            <Text v="small" color={c.heroMuted} style={{ fontFamily: fonts.bodyBold }}>{g.title}</Text>
            <View style={{ gap: 8 }}>{g.items.map(tick)}</View>
          </View>
        ))}
        {!side ? (
          <View style={{ gap: 12, marginTop: 8 }}>
            {DEFAULT_ROWS().map((r) => (
              <View key={r.title} style={{ flexDirection: 'row', gap: 14, alignItems: 'center', padding: 14, borderRadius: 20, backgroundColor: 'rgba(255,243,234,0.06)', borderWidth: 1, borderColor: 'rgba(255,243,234,0.08)' }}>
                <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' }}><Icon name={r.icon} size={18} color="#FFFFFF" /></View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text v="small" color="#FFF3EA" style={{ fontFamily: fonts.bodyXBold }}>{r.title}</Text>
                  <Text v="small" color={c.heroMuted}>{r.text}</Text>
                </View>
              </View>
            ))}
          </View>
        ) : null}
      </View>
      <Text v="small" color={c.heroMuted}>{side?.foot ?? t('Konut, ofis, mağaza ve depo')}</Text>
    </View>
  );
  const form = (
    <Animated.View entering={FadeInDown.springify().damping(22).stiffness(130)} style={{ width: '100%', maxWidth: wide ? 640 : 460, alignSelf: 'center', gap: 20 }}>
      <View style={{ gap: 8 }}>
        <Text v="h1" style={{ fontSize: phone ? 30 : 36, lineHeight: phone ? 33 : 39, fontFamily: fonts.siteBold, letterSpacing: -0.8 }}>{title}</Text>
        {lead ? <Text v="body" muted>{lead}</Text> : null}
      </View>
      <View style={{ gap: 16, backgroundColor: c.surface, padding: phone ? 18 : 26, borderRadius: 28, borderWidth: 1, borderColor: c.line,
        shadowColor: '#1D1A19', shadowOpacity: 0.06, shadowRadius: 24, shadowOffset: { width: 0, height: 10 } }}>{children}</View>
    </Animated.View>
  );
  if (desktop) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: c.cream }} contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: 'row', gap: 56, width: '100%', maxWidth: 1240, alignSelf: 'center', padding: 20, flexGrow: 1 }}>
          {panel}
          <View style={{ flex: 1, minWidth: 0, paddingTop: 8, paddingBottom: 40 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', minHeight: 40, alignItems: 'center' }}>{topLink}</View>
            <View style={{ flexGrow: 1, justifyContent: 'center', paddingTop: 24 }}>{form}</View>
          </View>
        </View>
      </ScrollView>
    );
  }
  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.cream }} contentContainerStyle={{ flexGrow: 1, paddingHorizontal: phone ? 16 : 32, paddingTop: 18, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: phone ? 28 : 56, width: '100%', maxWidth: 640, alignSelf: 'center' }}>
        <PressScale onPress={() => router.replace('/')} accessibilityRole="link"><Wordmark size={26} /></PressScale>
        {topLink}
      </View>
      {form}
    </ScrollView>
  );
}
