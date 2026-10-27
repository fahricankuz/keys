/* İnce dane (grain) dokusu: koyu yüzeylere derinlik verir. Yalnız web'de çizilir, dokunmayı engellemez.
   Düz bir zemin yerine hafif tanecik: gradyan bantlaşmasını da gizler. */
import { Platform, View } from 'react-native';

const SVG = "<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'><filter id='n' x='0' y='0' width='100%' height='100%'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.9 0'/></filter><rect width='100%' height='100%' filter='url(#n)'/></svg>";
const URL_ = `url("data:image/svg+xml;utf8,${encodeURIComponent(SVG)}")`;

export function Grain({ opacity = 0.09 }: { opacity?: number }) {
  if (Platform.OS !== 'web') return null;
  const web: any = { backgroundImage: URL_, backgroundSize: '180px 180px', opacity };
  return <View pointerEvents="none" style={[{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }, web]} />;
}
