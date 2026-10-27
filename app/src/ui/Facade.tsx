/* Cephe deseni: bina cephesi gibi dizilmiş yuvarlatılmış kare "pencere" ızgarası.
   Her pencere bir ay; ödenenler Limon Perde ile "yanar", bekleyenler çizgi olarak kalır.
   Pencereler soldan sağa 80 ms arayla yanar. */
import { View } from 'react-native';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';
import { statusOf } from '../domain/logic';
import { useColors } from './theme';

export type Kind = 'lit' | 'mint' | 'lav' | 'off';

function Win({ kind, i, onDark, size }: { kind: Kind; i: number; onDark?: boolean; size?: number }) {
  const c = useColors();
  const fill = kind === 'lit' ? c.lemon : kind === 'mint' ? c.mint : kind === 'lav' ? c.lavender : 'transparent';
  const outline = onDark ? 'rgba(251,244,234,0.28)' : c.line;
  return (
    <View style={{ flex: size ? undefined : 1, width: size, height: size, aspectRatio: 1, borderRadius: (size || 40) * 0.24, borderWidth: kind === 'off' ? 1.5 : 0, borderColor: outline, overflow: 'hidden' }}>
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

/** 12 aylık ilerleme şeridi: ay penceresi ödenince yanar. */
export function MonthWindows({ p, onDark }: { p: any; onDark?: boolean }) {
  const year = new Date().getFullYear();
  const kinds: Kind[] = Array.from({ length: 12 }).map((_, m) => {
    const st = statusOf(p, year + '-' + String(m + 1).padStart(2, '0'));
    return st === 'approved' ? 'lit' : st === 'partial' || st === 'review' ? 'mint' : 'off';
  });
  const lit = kinds.filter((k) => k === 'lit').length;
  return (
    <View accessibilityRole="image" accessibilityLabel={`${lit}/12`} style={{ flexDirection: 'row', gap: 5 }}>
      {kinds.map((k, i) => <Win key={i + k} kind={k} i={i} onDark={onDark} />)}
    </View>
  );
}
