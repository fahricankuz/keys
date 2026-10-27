/* Panele giriş: logodaki "a" karosunun gözü anahtar deliğidir. Pirinç bir anahtar önden yaklaşıp deliğe oturur,
   kilit gibi çeyrek tur döner, karo "tık" eder; ardından anahtar deliğinden içeri girer gibi büyüyüp panel açılır.
   Yaklaşık 1,6 sn; web'de oturum başına bir kez, cihazda her açılışta. Hareketi azaltma tercihinde gösterilmez. */
import { useEffect, useState } from 'react';
import { Platform, View } from 'react-native';
import Animated, { Easing, runOnJS, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withSequence, withTiming } from 'react-native-reanimated';
import { SvgXml } from 'react-native-svg';
import { useColors } from '../ui/theme';
import { Monogram } from '../ui/Wordmark';

const SEEN = 'anahtar-acilis';
/** Anahtar deliğinin karodaki yeri (karo kenarına oranla; logo çiziminden hesaplandı). */
const HOLE = { x: 0.519, y: 0.595 };
/** Önden görünen anahtar: süslü baş (halka + iç delik + üç yaprak) ve kısa boyun; gövde kapının içinde kalır.
    Alt orta nokta = deliğe giren boyun ucu. */
const KEY = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 150">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F7DDB0"/><stop offset="0.5" stop-color="#F2B544"/><stop offset="1" stop-color="#B9832A"/></linearGradient>
    <radialGradient id="s" cx="0.35" cy="0.3" r="0.8"><stop offset="0" stop-color="#FFF4DA" stop-opacity="0.9"/><stop offset="1" stop-color="#FFF4DA" stop-opacity="0"/></radialGradient>
  </defs>
  <g stroke="#7A5300" stroke-width="2.5" stroke-linejoin="round">
    <path fill="url(#g)" d="M60 4 C70 4 74 12 74 16 C86 14 98 22 100 34 C110 38 116 48 112 60 C116 72 110 84 98 88 C94 100 82 106 70 102 C66 108 54 108 50 102 C38 106 26 100 22 88 C10 84 4 72 8 60 C4 48 10 38 20 34 C22 22 34 14 46 16 C46 12 50 4 60 4 Z"/>
    <path fill="#7A5300" fill-opacity="0.25" d="M60 34 a22 22 0 1 1 0 44 a22 22 0 1 1 0 -44 Z"/>
    <path fill="#FAF5F0" d="M60 42 a14 14 0 1 1 0 28 a14 14 0 1 1 0 -28 Z"/>
    <rect x="44" y="102" width="32" height="12" rx="4" fill="url(#g)"/>
    <rect x="51" y="112" width="18" height="36" rx="5" fill="url(#g)"/>
  </g>
  <path fill="url(#s)" d="M60 4 C70 4 74 12 74 16 C86 14 98 22 100 34 C110 38 116 48 112 60 L60 56 Z"/>
</svg>`;

export default function OpenSplash() {
  const c = useColors();
  const reduced = useReducedMotion();
  const [show, setShow] = useState(() => {
    if (Platform.OS !== 'web') return true;
    try { if (sessionStorage.getItem(SEEN)) return false; sessionStorage.setItem(SEEN, '1'); } catch {}
    return true;
  });
  const tile = useSharedValue(0);    // karo belirir
  const key = useSharedValue(0);     // anahtar yaklaşır ve oturur
  const turn = useSharedValue(0);    // çeyrek tur
  const click = useSharedValue(1);   // kilit "tık"
  const zoom = useSharedValue(0);    // delikten içeri
  const done = () => setShow(false);

  useEffect(() => {
    if (!show) return;
    if (reduced) { setShow(false); return; }
    const ease = Easing.bezier(0.32, 0.72, 0, 1);
    tile.value = withTiming(1, { duration: 320, easing: ease });
    key.value = withDelay(260, withTiming(1, { duration: 460, easing: ease }));
    turn.value = withDelay(780, withTiming(1, { duration: 380, easing: Easing.inOut(Easing.cubic) }));
    click.value = withDelay(1130, withSequence(withTiming(1.05, { duration: 90 }), withTiming(1, { duration: 140 })));
    zoom.value = withDelay(1300, withTiming(1, { duration: 520, easing: Easing.in(Easing.cubic) }, (ok) => { if (ok) runOnJS(done)(); }));
    // Güvenlik: animasyon bir sebeple bitmezse panel yine açılır.
    const id = setTimeout(done, 2600);
    return () => clearTimeout(id);
  }, [show, reduced]);

  const S = 132;                      // karo kenarı
  const kw = S * 0.46, kh = kw * 1.25; // anahtar boyutu (viewBox 120×150)
  const stage = useAnimatedStyle(() => ({
    opacity: tile.value,
    transform: [{ scale: (0.9 + 0.1 * tile.value) * click.value * (1 + 15 * zoom.value * zoom.value) }]
  }));
  const keyStyle = useAnimatedStyle(() => ({
    opacity: key.value,
    transform: [{ translateY: -36 * (1 - key.value) }, { scale: 1.7 - 0.7 * key.value }, { rotate: 90 * turn.value + 'deg' }]
  }));
  const veil = useAnimatedStyle(() => ({ opacity: 1 - Math.max(0, (zoom.value - 0.35) / 0.65) }));
  if (!show) return null;
  return (
    <Animated.View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
      style={[{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 999, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }, veil]}>
      <Animated.View style={[{ width: S, height: S, transformOrigin: `${HOLE.x * 100}% ${HOLE.y * 100}%` } as any, stage]}>
        <View style={{ position: 'absolute', top: 0, left: 0, boxShadow: '0 18px 40px -12px rgba(200,48,46,0.45)', borderRadius: S * 0.23 } as any}>
          <Monogram size={S} knock={c.bg} />
        </View>
        {/* Anahtarın uç noktası deliğin merkezine oturur; dönüş bu noktanın etrafında. */}
        <Animated.View style={[{ position: 'absolute', width: kw, height: kh, left: HOLE.x * S - kw / 2, top: HOLE.y * S - kh, transformOrigin: '50% 100%', filter: 'drop-shadow(0 6px 8px rgba(29,26,25,0.35))' } as any, keyStyle]}>
          <SvgXml xml={KEY} width={kw} height={kh} />
        </Animated.View>
      </Animated.View>
    </Animated.View>
  );
}
