/* Ana sayfa başlığının iki yanındaki yüzen kartlar (ikas örneği): her kart hafifçe süzülür,
   içindeki iki sahne birbirine karışarak değişir. Fotoğraf yerine uygulamanın gerçek parçaları çizilir. */
import { ReactNode, useEffect, useState } from 'react';
import { Text as RNText, View } from 'react-native';
import Animated, { Easing, FadeIn, FadeOut, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withRepeat, withTiming } from 'react-native-reanimated';
import { t } from '../domain/i18n';
import { demo } from './money';
import { fonts, radius, shadows, useColors } from '../ui/theme';
import { Icon, Steps } from '../app-ui/blocks';

export const CARD_W = 248, CARD_H = 176;

/** Süzülen çerçeve: etiket, iki sahne ve yumuşak gölge. */
function FloatCard({ tag, tone, scenes, delay = 0, w = CARD_W }: { tag: string; tone: string; scenes: ReactNode[]; delay?: number; w?: number }) {
  const c = useColors();
  const reduced = useReducedMotion();
  const y = useSharedValue(0);
  const [i, setI] = useState(0);
  useEffect(() => {
    if (reduced) return;
    y.value = withDelay(delay, withRepeat(withTiming(-9, { duration: 3200, easing: Easing.inOut(Easing.sin) }), -1, true));
  }, [reduced, delay, y]);
  useEffect(() => {
    if (reduced) return;
    let id: ReturnType<typeof setInterval>;
    const start = setTimeout(() => { id = setInterval(() => setI((x) => (x + 1) % scenes.length), 3800); }, 1200 + delay);
    return () => { clearTimeout(start); if (id) clearInterval(id); };
  }, [reduced, delay, scenes.length]);
  const float = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  return (
    <Animated.View style={[{ width: w, height: CARD_H * (w / CARD_W), borderRadius: 18, overflow: 'hidden', backgroundColor: tone, boxShadow: shadows.lift }, float]}>
      <Animated.View key={i} entering={FadeIn.duration(600)} exiting={FadeOut.duration(600)} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, padding: 14, paddingTop: 44, justifyContent: 'center' }}>
        {scenes[i]}
      </Animated.View>
      <View style={{ position: 'absolute', top: 12, left: 12, backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 5 }}>
        <RNText style={{ fontFamily: fonts.bodyBold, fontSize: 12, color: '#1D1A19' }}>{tag}</RNText>
      </View>
    </Animated.View>
  );
}

function Line({ a, b, tone }: { a: string; b: string; tone?: 'ok' | 'warn' }) {
  const c = useColors();
  return (
    <View style={{ backgroundColor: c.surface, borderRadius: radius.pill, paddingHorizontal: 12, minHeight: 30, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <RNText style={{ fontFamily: fonts.bodyBold, fontSize: 12, color: c.ink }}>{a}</RNText>
      <RNText style={{ fontFamily: fonts.bodyXBold, fontSize: 12, color: tone === 'ok' ? c.okInk : tone === 'warn' ? c.warnInk : c.ink }}>{b}</RNText>
    </View>
  );
}

function Big({ icon, title, sub }: { icon: string; title: string; sub: string }) {
  const c = useColors();
  return (
    <View style={{ alignItems: 'center', gap: 6 }}>
      <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' }}><Icon name={icon} size={26} color={c.accentInk} /></View>
      <RNText style={{ fontFamily: fonts.siteBold, fontSize: 18, color: c.ink }}>{title}</RNText>
      <RNText style={{ fontFamily: fonts.body, fontSize: 12, color: c.muted }}>{sub}</RNText>
    </View>
  );
}

function Bubble({ text, mine, icon }: { text: string; mine?: boolean; icon?: string }) {
  const c = useColors();
  return (
    <View style={{ alignSelf: mine ? 'flex-end' : 'flex-start', backgroundColor: mine ? c.ink : c.surface, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8, maxWidth: '88%', flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      {icon ? <Icon name={icon} size={18} color={mine ? c.bg : c.accentText} /> : null}
      <RNText style={{ fontFamily: fonts.body, fontSize: 12.5, color: mine ? c.bg : c.ink }}>{text}</RNText>
    </View>
  );
}

/** Kartı olduğu gibi küçültür (içerik de orantılı küçülür): telefonda kartlar telefonları gölgelemesin. */
function Scaled({ k, w, children }: { k: number; w: number; children: ReactNode }) {
  if (k >= 1) return <>{children}</>;
  return (
    <View style={{ width: w * k, height: CARD_H * (w / CARD_W) * k + 8 }}>
      <View style={{ position: 'absolute', top: 0, left: 0, width: w, transform: [{ scale: k }], transformOrigin: 'top left' } as any}>{children}</View>
    </View>
  );
}

/** Dört kart: ödeme, talep, yazışma, depozito. Yan sütunlar için ikişer ikişer döner. `k` < 1 ise kartlar küçültülür. */
export function useHeroCards(w = CARD_W, k = 1) {
  const c = useColors();
  const mk = (key: string) => {
    const set = cards(key);
    return Object.fromEntries(Object.entries(set).map(([name, el]) => [name, <Scaled key={key + name} k={k} w={w}>{el}</Scaled>])) as typeof set;
  };
  const cards = (k: string) => ({
    odeme: <FloatCard key={k} w={w} tag={t('Ödemeler')} tone={c.butter} delay={0} scenes={[
      <View style={{ gap: 6 }}><Line a={t('Eylül')} b={t('Ödendi')} tone="ok" /><Line a={t('Ekim')} b={t('Ödendi')} tone="ok" /><Line a={t('Kasım')} b={t('Onay bekliyor')} tone="warn" /></View>,
      <Big icon="check" title={t('Ödeme onaylandı')} sub={demo(demo('₺30.000', '$1,150'), '$1,150') + ' · ' + t('Kasım')} />
    ]} />,
    talep: <FloatCard key={k} w={w} tag={t('Talepler')} tone={c.sky} delay={500} scenes={[
      <View style={{ backgroundColor: c.surface, borderRadius: 16, padding: 12, gap: 10 }}><RNText style={{ fontFamily: fonts.bodyXBold, fontSize: 13, color: c.ink }}>{t('Kombi basıncı düşüyor')}</RNText><Steps status={2} labels={[]} /><RNText style={{ fontFamily: fonts.body, fontSize: 12, color: c.muted }}>{t('Durum')}: <RNText style={{ fontFamily: fonts.bodyXBold, color: c.ink }}>{t('İşlemde')}</RNText></RNText></View>,
      <View style={{ gap: 6 }}><Line a={t('Usta teklifi')} b={demo(demo('₺1.850', '$70'), '$70')} /><Line a={t('Fatura')} b={t('Gidere işlendi')} tone="ok" /></View>
    ]} />,
    yazisma: <FloatCard key={k} w={w} tag={t('Yazışma')} tone={c.sage} delay={900} scenes={[
      <View style={{ gap: 8 }}><Bubble icon="cam" text={t('Kombi basıncı düşüyor')} /><Bubble mine text={t('Gördüm, yarın servis arayacak.')} /></View>,
      <View style={{ gap: 8 }}><Bubble text={t('Dekontu yükledim')} /><Bubble mine icon="check" text={t('Onayladım, teşekkürler')} /></View>
    ]} />,
    depozito: <FloatCard key={k} w={w} tag={t('Depozito')} tone={c.peach} delay={1300} scenes={[
      <View style={{ gap: 6 }}><Line a={t('Depozito')} b={demo(demo('₺65.000', '$2,500'), '$2,500')} /><Line a={t('Kesintiler')} b={'− ' + demo(demo('₺4.200', '$160'), '$160')} tone="warn" /><Line a={t('İade edilecek')} b={demo(demo('₺60.800', '$2,340'), '$2,340')} tone="ok" /></View>,
      <View style={{ gap: 6 }}><Line a={t('Yasal üst sınır')} b={t('TÜFE %33')} /><Line a={t('Yeni kira')} b={demo(demo('₺39.900', '$1,530'), '$1,530')} tone="ok" /></View>
    ]} />
  });
  return mk;
}
