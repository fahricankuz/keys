/* Hareket parçaları: sayı yuvarlanması, konfeti patlaması, ödeme düğmesi, satır satır giren başlık.
   Hepsi sistemdeki "hareketi azalt" ayarına uyar: açıksa animasyonsuz, son hâlini gösterir. */
import { ReactNode, useEffect, useRef, useState } from 'react';
import { Pressable, Text as RNText, View, ViewStyle } from 'react-native';
import Animated, {
  Easing, cancelAnimation, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withRepeat, withSpring, withTiming
} from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';
import { fonts, radius, useColors } from './theme';

/** Sayı → değişince yuvarlanarak yeni değere gelir (ilk gösterimde sıfırdan). */
export function useRoll(value: number, ms = 800) {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(reduced ? value : 0);
  const cur = useRef(reduced ? value : 0);
  useEffect(() => {
    if (reduced) { cur.current = value; setShown(value); return; }
    const from = cur.current, to = value, t0 = Date.now();
    let raf = 0;
    const step = () => {
      const k = Math.min(1, (Date.now() - t0) / ms);
      const e = 1 - Math.pow(1 - k, 3);
      cur.current = from + (to - from) * e;
      setShown(cur.current);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, ms, reduced]);
  return shown;
}

/** Başlık satırı: maskenin içinden aşağıdan yukarı çarparak girer. */
export function Slam({ delay = 0, height, children }: { delay?: number; height: number; children: ReactNode }) {
  const reduced = useReducedMotion();
  // Başlangıç değeri sunucu çıktısıyla aynı kalsın diye ayardan bağımsızdır; ayar açıksa hemen sıfırlanır.
  const y = useSharedValue(height);
  useEffect(() => { y.value = reduced ? 0 : withDelay(delay, withSpring(0, { damping: 15, stiffness: 140 })); }, [delay, reduced, y]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  return <View style={{ overflow: 'hidden', height }}><Animated.View style={style}>{children}</Animated.View></View>;
}

/* ---------------- konfeti ---------------- */

const COLORS = ['#FFD84A', '#FF5A2D', '#BFE8D4', '#D9D0FF', '#FFDDD0', '#2B3A8F'];

function Piece({ i, reduced }: { i: number; reduced: boolean }) {
  const seed = (i * 9301 + 49297) % 233280 / 233280;
  const seed2 = (i * 7919 + 1237) % 10007 / 10007;
  const angle = seed * Math.PI * 2;
  const dist = 90 + seed2 * 150;
  const t = useSharedValue(0);
  useEffect(() => { if (!reduced) t.value = withTiming(1, { duration: 1300 + seed2 * 500, easing: Easing.out(Easing.cubic) }); }, [reduced, seed2, t]);
  const style = useAnimatedStyle(() => ({
    opacity: t.value < 0.75 ? 1 : 1 - (t.value - 0.75) * 4,
    transform: [
      { translateX: Math.cos(angle) * dist * t.value },
      { translateY: Math.sin(angle) * dist * t.value + 140 * t.value * t.value },
      { rotate: (seed * 720 * t.value) + 'deg' }
    ]
  }));
  const w = 6 + seed2 * 6;
  return <Animated.View style={[{ position: 'absolute', width: w, height: w * (i % 3 === 0 ? 1 : 2), borderRadius: i % 4 === 0 ? w : 2, backgroundColor: COLORS[i % COLORS.length] }, style]} />;
}

/** Ortada gradyan tikli daire, etrafında konfeti patlaması ve kısa bir başlık. */
export function CelebrateBurst({ title }: { title: string }) {
  const reduced = useReducedMotion();
  const c = useColors();
  const s = useSharedValue(reduced ? 1 : 0.2);
  useEffect(() => { if (!reduced) s.value = withSpring(1, { damping: 9, stiffness: 160 }); }, [reduced, s]);
  const badge = useAnimatedStyle(() => ({ transform: [{ scale: s.value }], opacity: Math.min(1, s.value * 1.5) }));
  return (
    <View pointerEvents="none" accessibilityRole="alert" accessibilityLabel={title}
      style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
      <View style={{ alignItems: 'center', justifyContent: 'center', width: 120, height: 120 }}>
        {Array.from({ length: 64 }).map((_, i) => <Piece key={i} i={i} reduced={reduced} />)}
        <Animated.View style={[{ width: 96, height: 96, borderRadius: 48, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center', shadowColor: c.accent, shadowOpacity: 0.5, shadowRadius: 24, shadowOffset: { width: 0, height: 8 } }, badge]}>
          <Svg width={48} height={48} viewBox="0 0 48 48"><Path d="M12 25 L21 34 L37 16" stroke="#fff" strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" fill="none" /></Svg>
        </Animated.View>
      </View>
      <View style={{ marginTop: 26, backgroundColor: c.surface, borderRadius: radius.pill, paddingHorizontal: 20, paddingVertical: 10, borderWidth: 1, borderColor: c.line }}>
        <RNText style={{ fontFamily: fonts.bodyXBold, fontSize: 16, color: c.ink }}>{title}</RNText>
      </View>
    </View>
  );
}

/* ---------------- ödeme düğmesi ---------------- */

type PayState = 'idle' | 'busy' | 'done';

/** Düğme basınca halkaya döner, iş bitince yeşile geçip tik çizer. onPress true dönerse başarı sayılır. */
export function PayButton({ title, doneTitle, onPress, style }: { title: string; doneTitle: string; onPress: () => Promise<boolean | void>; style?: ViewStyle }) {
  const c = useColors();
  const reduced = useReducedMotion();
  const [state, setState] = useState<PayState>('idle');
  const spin = useSharedValue(0);
  const draw = useSharedValue(0);
  useEffect(() => {
    if (state === 'busy' && !reduced) spin.value = withRepeat(withTiming(1, { duration: 800, easing: Easing.linear }), -1);
    else { cancelAnimation(spin); spin.value = 0; }
    draw.value = state === 'done' && !reduced ? withTiming(1, { duration: 380 }) : state === 'done' ? 1 : 0;
  }, [state, reduced, spin, draw]);
  const ring = useAnimatedStyle(() => ({ transform: [{ rotate: spin.value * 360 + 'deg' }] }));
  const run = async () => {
    if (state !== 'idle') return;
    setState('busy');
    let ok = false;
    try { ok = (await onPress()) !== false; } catch { ok = false; }
    if (ok) { setState('done'); } else setState('idle');
  };
  const done = state === 'done';
  return (
    <Pressable onPress={run} accessibilityRole="button" accessibilityLabel={done ? doneTitle : title} accessibilityState={{ busy: state === 'busy' }}
      style={[{ minHeight: 52, borderRadius: radius.pill, backgroundColor: done ? '#17653F' : c.accent, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 10, paddingHorizontal: 20 }, style]}>
      {state === 'busy' ? (
        <Animated.View style={ring}>
          <Svg width={22} height={22} viewBox="0 0 22 22"><Circle cx="11" cy="11" r="8.5" stroke="rgba(255,255,255,0.35)" strokeWidth={3} fill="none" /><Path d="M11 2.5 A8.5 8.5 0 0 1 19.5 11" stroke="#fff" strokeWidth={3} strokeLinecap="round" fill="none" /></Svg>
        </Animated.View>
      ) : null}
      {done ? <Svg width={22} height={22} viewBox="0 0 22 22"><Path d="M4 11.5 L9 16.5 L18 6" stroke="#fff" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" fill="none" /></Svg> : null}
      <RNText style={{ fontFamily: fonts.bodyXBold, fontSize: 15, color: done ? '#fff' : c.accentInk }}>{done ? doneTitle : state === 'busy' ? '' : title}</RNText>
    </Pressable>
  );
}
