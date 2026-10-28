/* "Seni en iyi ne tanımlar?" kartları ve segment sayfalarının ortak parçaları (marka kiti: renkli simge kutulu liste kartı,
   Baca Karası kira kartı ve kapı çubuğu, Tuğla zeminde süper grafik "a"). */
import { ReactNode, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text as RNText, View } from 'react-native';
import Svg, { G, Path } from 'react-native-svg';
import { t } from '../domain/i18n';
import { PressScale, Text } from '../ui/kit';
import { fonts, radius, shadows, useBreakpoint, useColors } from '../ui/theme';
import { MONO } from '../ui/Wordmark';
import { Icon } from '../app-ui/blocks';
import { Segment, segments } from './segments';

const TONE = { peach: ['#F0CFC8', '#A8231F'], butter: ['#F7DDB0', '#6B4A00'], sage: ['#D5EBD7', '#2A6B3A'], sky: ['#E8DDD5', '#5C4F4A'] } as const;

/** Seçim kartı: simge kutusu, ad, alt bilgi, ok. */
function Option({ s, onPress, compact }: { s: Segment; onPress: () => void; compact?: boolean }) {
  const c = useColors();
  const bg = c.accentSoft, fg = c.accentText;
  return (
    <PressScale onPress={onPress} accessibilityRole="link" accessibilityLabel={s.name + ' · ' + s.sub} scaleTo={0.98} hoverScale={1.015}
      wrapStyle={{ flexGrow: 1, flexBasis: compact ? 220 : 300 }}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: c.surface, borderRadius: 22, borderWidth: 1, borderColor: c.line, padding: compact ? 12 : 16, minHeight: compact ? 64 : 84 }}>
      <View style={{ width: compact ? 40 : 52, height: compact ? 40 : 52, borderRadius: compact ? 13 : 16, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={s.icon} size={compact ? 19 : 23} color={fg} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text v="body" style={{ fontFamily: fonts.bodyXBold, fontSize: compact ? 15 : 17 }}>{s.name}</Text>
        <Text v="small" muted style={{ fontSize: compact ? 13 : 14 }}>{s.sub}</Text>
      </View>
      <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: c.tile, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '180deg' }] }}>
        <Icon name="back" size={15} color={c.ink} />
      </View>
    </PressScale>
  );
}

/** Tüm seçenekler; `except` verilen segment hariç. */
export function SegmentGrid({ go, compact, except }: { go: (p: string) => void; compact?: boolean; except?: string }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: compact ? 10 : 12 }}>
      {segments().filter((s) => s.slug !== except).map((s) => <Option key={s.slug} s={s} compact={compact} onPress={() => go('/cozumler/' + s.slug)} />)}
    </View>
  );
}

/** Kayan şerit (web): kartlar iki kez dizilir ve -%50'ye kayar; böylece uçsuz bucaksız akar.
    Kenarlar yumuşakça kaybolur, üstüne gelince durur. Hareketi azaltmayı seçende ve telefonda elle kaydırılır. */
const FLOW: any = Platform.OS === 'web' ? StyleSheet.create({
  track: {
    animationKeyframes: [{ '0%': { transform: 'translateX(0)' }, '100%': { transform: 'translateX(-50%)' } }],
    animationDuration: '48s', animationIterationCount: 'infinite', animationTimingFunction: 'linear'
  } as any,
  mask: {
    maskImage: 'linear-gradient(90deg, transparent 0, #000 9%, #000 91%, transparent 100%)',
    WebkitMaskImage: 'linear-gradient(90deg, transparent 0, #000 9%, #000 91%, transparent 100%)'
  } as any
}) : null;

function FlowCard({ s, go }: { s: Segment; go: (p: string) => void }) {
  const c = useColors();
  return (
    <PressScale onPress={() => go('/cozumler/' + s.slug)} accessibilityRole="link" accessibilityLabel={s.name + ' · ' + s.sub} scaleTo={0.97} hoverScale={1.03}
      style={{ width: 300, flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: c.surface, borderRadius: 24, borderWidth: 1, borderColor: c.line, paddingVertical: 14, paddingLeft: 14, paddingRight: 18, boxShadow: '0 1px 0 rgba(29,26,25,0.03), 0 12px 32px -18px rgba(29,26,25,0.28)' } as any}>
      <View style={{ width: 46, height: 46, borderRadius: 15, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={s.icon} size={21} color={c.accentText} />
      </View>
      <View style={{ flex: 1, gap: 1 }}>
        <RNText numberOfLines={1} style={{ fontFamily: fonts.bodyXBold, fontSize: 16, color: c.ink }}>{s.name}</RNText>
        <RNText numberOfLines={1} style={{ fontFamily: fonts.body, fontSize: 13.5, color: c.muted }}>{s.sub}</RNText>
      </View>
      <View style={{ transform: [{ rotate: '180deg' }], opacity: 0.45 }}><Icon name="back" size={15} color={c.ink} /></View>
    </PressScale>
  );
}

/** Sayfa altındaki diğer çözümler: kesintisiz akan kart şeridi. */
export function SegmentFlow({ go, except }: { go: (p: string) => void; except?: string }) {
  const { phone } = useBreakpoint();
  const [hover, setHover] = useState(false);
  const list = segments().filter((s) => s.slug !== except);
  const reduce = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (!FLOW || reduce || phone) {
    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingHorizontal: 16, paddingVertical: 10 }}>
        {list.map((s) => <FlowCard key={s.slug} s={s} go={go} />)}
      </ScrollView>
    );
  }
  return (
    <View style={[{ overflow: 'hidden', paddingVertical: 14 }, FLOW.mask]} onPointerEnter={() => setHover(true)} onPointerLeave={() => setHover(false)}>
      <View style={[{ flexDirection: 'row', width: 'max-content' as any }, FLOW.track, { animationPlayState: hover ? 'paused' : 'running' } as any]}>
        {[0, 1].map((k) => (
          <View key={k} aria-hidden={k === 1} style={{ flexDirection: 'row', gap: 14, paddingRight: 14 }}>
            {list.map((s) => <FlowCard key={s.slug} s={s} go={go} />)}
          </View>
        ))}
      </View>
    </View>
  );
}

/** Marka kitindeki kira kartı: tutar, 12 kapı (ödenen kapı açık, bu ay tuğla çerçeveli), düğme. */
export function RentCard({ amount, label, paid = 9 }: { amount: string; label: string; paid?: number }) {
  const { phone } = useBreakpoint();
  return (
    <View style={{ backgroundColor: '#1D1A19', borderRadius: phone ? 26 : 32, padding: phone ? 20 : 28, gap: 14, boxShadow: shadows.lift } as any}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <RNText style={{ fontFamily: fonts.bodyBold, fontSize: 12, letterSpacing: 1.2, color: '#BDB1AB' }}>{t('KİRA KARTI')}</RNText>
        <RNText style={{ fontFamily: fonts.bodyBold, fontSize: 12, letterSpacing: 1.2, color: '#F2B544' }}>{t('BU AY')}</RNText>
      </View>
      <RNText style={{ fontFamily: fonts.body, fontSize: 14, color: '#BDB1AB' }}>{label}</RNText>
      <RNText style={{ fontFamily: fonts.siteBold, fontSize: phone ? 40 : 54, lineHeight: phone ? 44 : 58, letterSpacing: -1.6, color: '#FAF5F0' }}>{amount}</RNText>
      <View style={{ flexDirection: 'row', gap: phone ? 4 : 6 }}>
        {Array.from({ length: 12 }, (_, i) => (
          <View key={i} style={{ flex: 1, aspectRatio: 0.8, borderRadius: 6, backgroundColor: i < paid ? '#F2B544' : i === paid ? 'transparent' : '#3A3330', borderWidth: i === paid ? 2 : 0, borderColor: '#C8302E' }} />
        ))}
      </View>
      <RNText style={{ fontFamily: fonts.body, fontSize: 12.5, color: '#BDB1AB' }}>{t('{n} / 12 kapı açıldı', { n: paid })}</RNText>
    </View>
  );
}

/** Tuğla zeminde süper grafik "a" (kireç çizgi, kadraj dışına taşar) ile çağrı bandı. */
export function BrandBand({ title, body, action }: { title: string; body: string; action: ReactNode }) {
  const { phone } = useBreakpoint();
  return (
    <View style={{ backgroundColor: '#C8302E', borderRadius: phone ? 28 : 40, overflow: 'hidden', padding: phone ? 24 : 56, minHeight: phone ? 0 : 280, justifyContent: 'center' }}>
      <Svg viewBox="0 0 1000 1000" width={phone ? 300 : 520} height={phone ? 300 : 520} style={{ position: 'absolute', right: phone ? -110 : -60, top: phone ? -40 : -110, opacity: 0.5 } as any}>
        <G transform="translate(180,190) scale(0.64)"><Path d={MONO} fill="none" stroke="#FAF5F0" strokeWidth={14} fillRule="evenodd" /></G>
      </Svg>
      <View style={{ gap: 12, maxWidth: 620 }}>
        <RNText style={{ fontFamily: fonts.siteBold, fontSize: phone ? 28 : 46, lineHeight: phone ? 31 : 49, letterSpacing: phone ? -0.8 : -1.6, color: '#FAF5F0' }}>{title}</RNText>
        <RNText style={{ fontFamily: fonts.body, fontSize: phone ? 15.5 : 18, lineHeight: phone ? 23 : 27, color: '#FAF5F0', opacity: 0.9 }}>{body}</RNText>
        <View style={{ alignSelf: 'flex-start', marginTop: 8 }}>{action}</View>
      </View>
    </View>
  );
}

/** Başlıkta tek sözcük Tuğla ile vurgulanır (marka kuralı). */
export function Headline({ parts, size, center }: { parts: [string, string, string]; size: number; center?: boolean }) {
  const c = useColors();
  return (
    <RNText style={{ fontFamily: fonts.siteBold, fontSize: size, lineHeight: Math.round(size * 1.06), letterSpacing: -size * 0.035, color: c.ink, textAlign: center ? 'center' : undefined, textWrap: 'balance' } as any}>
      {parts[0]} <RNText style={{ color: c.accent }}>{parts[1]}</RNText> {parts[2]}
    </RNText>
  );
}

export { TONE, radius };
