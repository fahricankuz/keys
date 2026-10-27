/* Panele giriş: ekran tuğla rengi, ortada kireç rengi "a". "a"nın gözü anahtar deliğidir; içinden sıcak bir ışık
   sızar, sonra kamera deliğe doğru hızlanarak ilerler ve delik ekranı kaplayınca panel arkasında görünür.
   Yaklaşık 1,7 sn; her girişte ve sekmenin ilk açılışında. Hareketi azaltma tercihinde yalnızca kısa bir solma.
   Yakınlaştırma CSS ölçeği yerine SVG geometrisiyle yapılır: 60 kat büyümede de kenarlar keskin kalır. */
import { useEffect, useState } from 'react';
import { Platform, useWindowDimensions, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import Svg, { Defs, G, Path, RadialGradient, Stop } from 'react-native-svg';
import { MONO } from '../ui/Wordmark';

const SEEN = 'anahtar-acilis';
const LOGIN = 'anahtar-acilis-giris';
/** Giriş ya da kayıt başarılı olunca çağrılır: panel açılırken geçiş oynar. */
export function playOnNextOpen() { try { sessionStorage.setItem(LOGIN, '1'); } catch {} }
const KIREC = '#FAF5F0';
/** Anahtar deliği (MONO çizim birimleri): üstte daire, altta yamuk. */
const HOLE = { ax: 506.5, bx: 552.7, y: 696.9, r: 80, cx: 562.6, dx: 496.6, by: 764.3, mid: { x: 529.6, y: 680 } };

const INTRO = 520, HOLD = 260, ZOOM = 920;
/** Hareketi azaltma tercihinde: yakınlaşma yok, logo görünür ve ekran yumuşakça solar. */
const FADE = 900;
const clamp = (v: number) => Math.max(0, Math.min(1, v));
const outCubic = (p: number) => 1 - Math.pow(1 - p, 3);

/** Deliğin ekran koordinatlarında yolu: (tx, ty) ötelemesi ve s ölçeğiyle. */
function hole(tx: number, ty: number, s: number) {
  const P = (x: number, y: number) => `${tx + s * x},${ty + s * y}`;
  return `M${P(HOLE.ax, HOLE.y)} A${HOLE.r * s},${HOLE.r * s} 0 1,1 ${P(HOLE.bx, HOLE.y)} L${P(HOLE.cx, HOLE.by)} L${P(HOLE.dx, HOLE.by)} Z`;
}

export default function OpenSplash() {
  const reduced = useReducedMotion();
  const { width: w, height: h } = useWindowDimensions();
  // Her girişte (giriş/kayıt işareti bırakır) ve sekmede ilk açılışta oynar; sayfa yenilemelerinde tekrarlanmaz.
  const [show, setShow] = useState(() => {
    if (Platform.OS !== 'web') return true;
    try {
      const fresh = sessionStorage.getItem(LOGIN) || !sessionStorage.getItem(SEEN);
      sessionStorage.removeItem(LOGIN); sessionStorage.setItem(SEEN, '1');
      return !!fresh;
    } catch { return true; }
  });
  const [ms, setMs] = useState(0);

  useEffect(() => {
    if (!show) return;
    let raf = 0;
    const t0 = Date.now();
    const tick = () => {
      const t = Date.now() - t0;
      if (t >= (reduced ? FADE : INTRO + HOLD + ZOOM)) { setShow(false); return; }
      setMs(t);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    // Güvenlik: kare döngüsü durursa (arka plan sekmesi) panel yine açılır.
    const id = setTimeout(() => setShow(false), INTRO + HOLD + ZOOM + 900);
    return () => { cancelAnimationFrame(raf); clearTimeout(id); };
  }, [show, reduced]);

  if (!show || !w || !h) return null;

  // "a" karosu (1000 birim) ekranın ortasında; yazı karoda translate(180,190) scale(0.64) ile durur.
  const tile = Math.max(170, Math.min(340, Math.min(w, h) * 0.6));
  const k = tile / 1000;
  const ox = w / 2 - tile / 2, oy = h / 2 - tile / 2;
  const gx = ox + k * 180, gy = oy + k * 190, gs = k * 0.64;
  const kx = gx + gs * HOLE.mid.x, ky = gy + gs * HOLE.mid.y;

  const intro = reduced ? 1 : outCubic(clamp(ms / INTRO));
  const zp = reduced ? 0 : clamp((ms - INTRO - HOLD) / ZOOM);
  const fade = reduced ? 1 - clamp((ms - 450) / (FADE - 450)) : 1;
  // Delik ekranın en uzak köşesini aşana kadar büyür; ölçek logaritmik ilerler (hız hissi sabit, sonda ivmelenir).
  const far = Math.max(Math.hypot(kx, ky), Math.hypot(w - kx, ky), Math.hypot(kx, h - ky), Math.hypot(w - kx, h - ky));
  const end = (far / (HOLE.r * gs)) * 1.15;
  const s = (0.94 + 0.06 * intro) * Math.exp(Math.log(end) * zp * zp);
  const lift = 14 * (1 - intro);
  // Deliğin merkezine göre ölçekleme.
  const tx = kx + s * (gx - kx), ty = ky + s * (gy - ky) + lift, sc = s * gs;
  const glow = intro * (1 - clamp(zp / 0.28));
  const d = hole(tx, ty, sc);

  return (
    <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
      style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 999, opacity: fade }}>
      <Svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
        <Defs>
          <RadialGradient id="op-bg" cx="50%" cy="46%" r="75%">
            <Stop offset="0" stopColor="#D23B37" />
            <Stop offset="1" stopColor="#A9221F" />
          </RadialGradient>
          <RadialGradient id="op-glow" cx={tx + sc * 529.6} cy={ty + sc * 640} r={sc * 150} gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor="#FFF4DA" />
            <Stop offset="0.55" stopColor="#F7DDB0" />
            <Stop offset="1" stopColor="#F2B544" />
          </RadialGradient>
        </Defs>
        {/* Tuğla zemin; anahtar deliği kadar delik: panel bu pencereden görünür. */}
        <Path d={`M0,0 H${w} V${h} H0 Z ${d}`} fill="url(#op-bg)" fillRule="evenodd" />
        <G opacity={intro} transform={`translate(${tx},${ty}) scale(${sc})`}>
          <Path d={MONO} fill={KIREC} fillRule="evenodd" />
        </G>
        {/* Deliğin ardındaki ışık; yakınlaşma başlarken söner. */}
        {glow > 0.01 ? <Path d={d} fill="url(#op-glow)" opacity={glow} /> : null}
      </Svg>
    </View>
  );
}

