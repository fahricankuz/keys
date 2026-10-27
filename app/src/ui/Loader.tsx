/* Yükleme göstergesi (Uiverse "pl" örneği, anahtar renkleriyle): dört halka birbirinin içinden
   geçerek dolar ve boşalır. Her halkanın çizgi uzunluğu, kalınlığı ve kayması anahtar karelerden
   doğrusal olarak hesaplanır; "hareketi azalt" açıksa halkalar durağan, tam çizgi olarak görünür. */
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import { useColors } from './theme';

type Key = [number, number, number, number]; // [yüzde, çizgi uzunluğu, kalınlık, kayma]

const RINGS: { cx: number; r: number; total: number; keys: Key[] }[] = [
  { cx: 120, r: 105, total: 660, keys: [[0, 0, 20, -330], [4, 0, 20, -330], [12, 60, 30, -335], [32, 60, 30, -595], [40, 0, 20, -660], [54, 0, 20, -660], [62, 60, 30, -665], [82, 60, 30, -925], [90, 0, 20, -990], [100, 0, 20, -990]] },
  { cx: 120, r: 35, total: 220, keys: [[0, 0, 20, -110], [12, 0, 20, -110], [20, 20, 30, -115], [40, 20, 30, -195], [48, 0, 20, -220], [62, 0, 20, -220], [70, 20, 30, -225], [90, 20, 30, -305], [98, 0, 20, -330], [100, 0, 20, -330]] },
  { cx: 85, r: 70, total: 440, keys: [[0, 0, 20, 0], [8, 40, 30, -5], [28, 40, 30, -175], [36, 0, 20, -220], [58, 0, 20, -220], [66, 40, 30, -225], [86, 40, 30, -395], [94, 0, 20, -440], [100, 0, 20, -440]] },
  { cx: 155, r: 70, total: 440, keys: [[0, 0, 20, 0], [8, 0, 20, 0], [16, 40, 30, -5], [36, 40, 30, -175], [44, 0, 20, -220], [50, 0, 20, -220], [58, 40, 30, -225], [78, 40, 30, -395], [86, 0, 20, -440], [100, 0, 20, -440]] }
];

function at(keys: Key[], p: number): [number, number, number] {
  for (let i = 1; i < keys.length; i++) {
    if (p <= keys[i][0]) {
      const [p0, d0, w0, o0] = keys[i - 1], [p1, d1, w1, o1] = keys[i];
      const k = p1 === p0 ? 1 : (p - p0) / (p1 - p0);
      return [d0 + (d1 - d0) * k, w0 + (w1 - w0) * k, o0 + (o1 - o0) * k];
    }
  }
  const l = keys[keys.length - 1];
  return [l[1], l[2], l[3]];
}

/** size: kenar uzunluğu (px). Renkler: turuncu, limon, lacivert (temaya göre), mor. */
export function Loader({ size = 96, label, mono }: { size?: number; label?: string; mono?: string }) {
  const c = useColors();
  const reduced = useReducedMotion();
  const [p, setP] = useState(reduced ? 45 : 0);
  useEffect(() => {
    if (reduced) return;
    let raf = 0;
    const t0 = Date.now();
    const step = () => { setP((((Date.now() - t0) % 2000) / 2000) * 100); raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [reduced]);
  const colors = mono ? [mono, mono, mono, mono] : [c.accent, c.lemon, c.ink, '#F0CFC8'];
  return (
    <View accessibilityRole="progressbar" accessibilityLabel={label || 'Yükleniyor'} style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox="0 0 240 240">
        {RINGS.map((r, i) => {
          const [d, w, o] = at(r.keys, p);
          return <Circle key={i} cx={r.cx} cy={120} r={r.r} fill="none" stroke={colors[i]} strokeWidth={w} strokeLinecap="round" strokeDasharray={`${Math.max(0, d)} ${Math.max(0, r.total - d)}`} strokeDashoffset={o} />;
        })}
      </Svg>
    </View>
  );
}

/** Ekranı kaplayan, ortada yükleme gösteren zemin. */
export function FullLoader({ label }: { label?: string }) {
  const c = useColors();
  return <View style={{ flex: 1, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center' }}><Loader size={110} label={label} /></View>;
}
