/* Cephe deseni: bina cephesi gibi dizilmiş yuvarlatılmış kare "pencere" ızgarası.
   Her pencere bir ay; ödenenler Limon Perde ile "yanar", bekleyenler çizgi olarak kalır.
   Pencereler soldan sağa 80 ms arayla yanar. */
import { View } from 'react-native';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';
import { statusOf } from '../domain/logic';
import { locale } from '../domain/i18n';
import { Text } from './kit';
import { fonts, useColors } from './theme';

export type Kind = 'lit' | 'mint' | 'lav' | 'off';

function Win({ kind, i, onDark, size, full }: { kind: Kind; i: number; onDark?: boolean; size?: number; full?: boolean }) {
  const c = useColors();
  const fill = kind === 'lit' ? c.lemon : kind === 'mint' ? c.mint : kind === 'lav' ? c.lavender : 'transparent';
  const outline = onDark ? 'rgba(251,244,234,0.28)' : c.line;
  return (
    <View style={{ flex: size || full ? undefined : 1, width: full ? '100%' : size, height: size, aspectRatio: 1, borderRadius: (size || 40) * 0.24, borderWidth: kind === 'off' ? 1.5 : 0, borderColor: outline, overflow: 'hidden' }}>
      {kind !== 'off' && (
        <Animated.View entering={ZoomIn.delay(i * 80).duration(260)} style={{ flex: 1, backgroundColor: fill }} />
      )}
    </View>
  );
}

/** Verilen türlerle 12'li (ya da n'li) pencere şeridi. */
export function MonthStrip({ kinds, onDark }: { kinds: Kind[]; onDark?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', gap: 5 }}>
      {kinds.map((k, i) => <Win key={i + k} kind={k} i={i} onDark={onDark} />)}
    </View>
  );
}

/** 12 aylık ilerleme şeridi: iki sıra (Ocak–Haziran, Temmuz–Aralık); ay penceresi ödenince yanar,
    ayın adı pencerenin içinde yazar, bu ayın penceresi çerçeveyle vurgulanır. */
export function MonthWindows({ p, onDark }: { p: any; onDark?: boolean }) {
  const c = useColors();
  const now = new Date(), year = now.getFullYear();
  const months = Array.from({ length: 12 }).map((_, m) => {
    const st = statusOf(p, year + '-' + String(m + 1).padStart(2, '0'));
    const kind: Kind = st === 'approved' ? 'lit' : st === 'partial' || st === 'review' ? 'mint' : 'off';
    const label = new Date(year, m, 1).toLocaleDateString(locale(), { month: 'short' }).replace('.', '');
    return { kind, label, current: m === now.getMonth() };
  });
  const lit = months.filter((x) => x.kind === 'lit').length;
  const offInk = onDark ? 'rgba(251,244,234,0.78)' : c.muted;
  const cell = (x: (typeof months)[number], i: number) => (
    <View key={i + x.kind} style={{ flex: 1, minWidth: 0 }}>
      <Win kind={x.kind} i={i} onDark={onDark} full />
      <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center',
        borderRadius: 10, borderWidth: x.current ? 2 : 0, borderColor: onDark ? '#fff' : c.ink }}>
        <Text v="small" numberOfLines={1} color={x.kind === 'off' ? offInk : '#1C1915'}
          style={{ fontSize: 11, lineHeight: 13, fontFamily: x.current || x.kind !== 'off' ? fonts.bodyXBold : undefined }}>{x.label}</Text>
      </View>
    </View>
  );
  return (
    <View accessibilityRole="image" accessibilityLabel={`${year}: ${lit}/12`} style={{ gap: 5 }}>
      <View style={{ flexDirection: 'row', gap: 5 }}>{months.slice(0, 6).map((x, i) => cell(x, i))}</View>
      <View style={{ flexDirection: 'row', gap: 5 }}>{months.slice(6).map((x, i) => cell(x, i + 6))}</View>
    </View>
  );
}
