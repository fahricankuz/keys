import { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { t } from '../domain/i18n';
import { PressScale, Text } from '../ui/kit';
import { Wordmark } from '../ui/Wordmark';
import { Grain } from '../ui/Grain';
import { fonts, radius, useBreakpoint, useColors } from '../ui/theme';

/** Giriş, kayıt ve şifre ekranlarının ortak iskeleti: geniş ekranda solda marka paneli. */
export default function AuthShell({ title, lead, children }: { title: string; lead?: string; children: ReactNode }) {
  const c = useColors();
  const router = useRouter();
  const { desktop } = useBreakpoint();
  return (
    <View style={{ flex: 1, flexDirection: desktop ? 'row' : 'column', backgroundColor: c.cream }}>
      {desktop && (
        <View style={{ flex: 0.8, backgroundColor: c.deepA, margin: 14, borderRadius: 40, padding: 56, justifyContent: 'space-between', overflow: 'hidden' }}>
          <Grain />
          <PressScale onPress={() => router.replace('/')} accessibilityRole="link"><Wordmark size={34} color={c.heroInk} animate /></PressScale>
          <View style={{ gap: 16, maxWidth: 440 }}>
            <Text v="h1" color="#FFF3EA" style={{ fontFamily: fonts.siteBold, fontSize: 56, lineHeight: 53 }}>{t('Kira işinin anahtarı.')}</Text>
            <Text v="body" color={c.heroMuted}>{t('Kiracılar ücretsiz. Mülk sahipleri 1 ay ücretsiz dener.')}</Text>
          </View>
          <Text v="small" color={c.heroMuted}>{t('Konut, ofis, mağaza ve depo')}</Text>
        </View>
      )}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 20, paddingVertical: 40 }} keyboardShouldPersistTaps="handled">
        <Animated.View entering={FadeInDown.springify().damping(22).stiffness(130)} style={{ width: '100%', maxWidth: 440, alignSelf: 'center', gap: 22 }}>
          {!desktop && <PressScale onPress={() => router.replace('/')} accessibilityRole="link"><Wordmark size={28} /></PressScale>}
          <View style={{ gap: 8 }}>
            <Text v="h1" style={{ fontSize: 36, lineHeight: 38, fontFamily: fonts.siteBold }}>{title}</Text>
            {lead ? <Text v="body" muted>{lead}</Text> : null}
          </View>
          <View style={{ gap: 16, backgroundColor: c.surface, padding: 22, borderRadius: 32, borderWidth: 1, borderColor: c.line }}>{children}</View>
        </Animated.View>
      </ScrollView>
    </View>
  );
}
