/* kiracım logosu: ev + anahtar deliği simgesi, küçük harfli kalın wordmark ve "i"nin Kiremit halkası.
   Katmanlar ayrı dosyalardır (assets/brand): ev, kelime, halka. Halka ayrı olduğu için açılışta
   "i"den "ı"nın üstüne sıçrayıp yerine oturabilir (600 ms). */
import { Image, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import { useEffect } from 'react';
import { useColors } from './theme';

const ART = {
  ink: { house: require('../../assets/brand/house-ink.png'), word: require('../../assets/brand/word-ink.png'), ring: require('../../assets/brand/ring-ink.png') },
  cream: { house: require('../../assets/brand/house-cream.png'), word: require('../../assets/brand/word-cream.png'), ring: require('../../assets/brand/ring-cream.png') }
};
/** Kaynak tuvalin ölçüleri (px): tüm katmanlar aynı tuvale oturur. */
const W = 1703, H = 311;
/** Kelimenin başladığı x (k harfinin sol kenarı) ve "i" ile "ı"nın merkezleri. */
const WORD_X = 409, I_CX = 677, DOT_CX = 1359;

export function Wordmark({ size = 28, color, animate, house = true, variant }: {
  size?: number; color?: string; animate?: boolean; house?: boolean; variant?: 'ink' | 'cream';
}) {
  const c = useColors();
  // Renk verilmişse koyu zemin varsayılır (krem logo); yoksa temaya göre.
  const tone = variant ?? (color ? 'cream' : c.ink === '#1D1A19' ? 'ink' : 'cream');
  const h = size * 1.15;
  const s = h / H;
  const full = W * s;
  const left = house ? 0 : -WORD_X * s;
  const width = house ? full : (W - WORD_X) * s;
  const art = ART[tone];

  const dx = useSharedValue(0);
  const dy = useSharedValue(0);
  useEffect(() => {
    if (!animate) return;
    const d = (DOT_CX - I_CX) * s;
    const ease = Easing.out(Easing.cubic);
    dx.value = withSequence(withTiming(d, { duration: 300, easing: ease }), withTiming(0, { duration: 300, easing: ease }));
    dy.value = withSequence(
      withTiming(-h * 0.22, { duration: 150, easing: Easing.out(Easing.quad) }), withTiming(0, { duration: 150, easing: Easing.in(Easing.quad) }),
      withTiming(-h * 0.22, { duration: 150, easing: Easing.out(Easing.quad) }), withTiming(0, { duration: 150, easing: Easing.in(Easing.quad) })
    );
  }, [animate, h]);
  const hop = useAnimatedStyle(() => ({ transform: [{ translateX: dx.value }, { translateY: dy.value }] }));

  const layer = { position: 'absolute' as const, top: 0, left, width: full, height: h };
  return (
    <View accessibilityRole="image" accessibilityLabel="kiracım" style={{ width, height: h, overflow: 'hidden' }}>
      {house ? <Image source={art.house} style={layer} resizeMode="contain" /> : null}
      <Image source={art.word} style={layer} resizeMode="contain" />
      <Animated.View style={[layer, hop]} pointerEvents="none"><Image source={art.ring} style={{ width: full, height: h }} resizeMode="contain" /></Animated.View>
    </View>
  );
}
