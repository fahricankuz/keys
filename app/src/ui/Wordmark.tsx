/* anahtar logosu (marka kiti v2): "a" monogramı (gözü anahtar deliği) yuvarlak köşeli Tuğla karoda
   ve küçük harfli wordmark ("t"nin tepesinde anahtar başı). Çizimler marka kitindeki SVG'lerden alındı.
   Karonun içindeki "a" zeminin rengiyle çizilir (koyu zeminde koyu, açık zeminde açık). */
import { View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { useColors } from './theme';

/** "a" monogramı: 1000 birimlik karo içinde (180,190) noktasından 0.64 ölçekle. */
export const MONO = 'M388.46 927.44C504.68 927.44 578.78 886.8800000000001 627.92 797.96H631.04V913.4000000000001H893.12V358.82000000000005C893.12 177.08000000000004 761.3 71.78000000000009 521.8399999999999 71.78000000000009C283.15999999999997 71.78000000000009 148.21999999999997 177.86 136.51999999999998 356.48H386.12C391.58 300.32000000000005 437.6 264.44000000000005 512.48 264.44000000000005C583.46 264.44000000000005 627.14 297.98 627.14 347.1200000000001V351.0200000000001C627.14 400.1600000000001 573.3199999999999 411.86000000000007 425.9 424.3400000000001C250.4 438.38000000000005 106.1 498.44000000000005 106.1 683.3000000000001C106.1 847.1000000000001 223.88 927.44 388.46 927.44Z M506.5,696.9 A80,80 0 1,1 552.7,696.9 L562.6,764.3 L496.6,764.3 Z';
/** Wordmark "anahtar" (yazı tabanı y = 1800). */
const WORD = 'M419 1818C568 1818 663 1766 726 1652H730V1800H1066V1089C1066 856 897 721 590 721C284 721 111 857 96 1086H416C423 1014 482 968 578 968C669 968 725 1011 725 1074V1079C725 1142 656 1157 467 1173C242 1191 57 1268 57 1505C57 1715 208 1818 419 1818ZM524 1593C440 1593 383 1554 383 1489C383 1420 449 1382 541 1368C626 1354 691 1341 728 1324V1420C728 1524 639 1593 524 1593Z M1572 1226C1572 1082 1642 1015 1751 1015C1860 1015 1923 1083 1923 1208V1800H2267V1136C2267 876 2133 721 1904 721C1745 721 1638 794 1568 915V744H1228V1800H1572Z M2752 1818C2901 1818 2996 1766 3059 1652H3063V1800H3399V1089C3399 856 3230 721 2923 721C2617 721 2444 857 2429 1086H2749C2756 1014 2815 968 2911 968C3002 968 3058 1011 3058 1074V1079C3058 1142 2989 1157 2800 1173C2575 1191 2390 1268 2390 1505C2390 1715 2541 1818 2752 1818ZM2857 1593C2773 1593 2716 1554 2716 1489C2716 1420 2782 1382 2874 1368C2959 1354 3024 1341 3061 1324V1420C3061 1524 2972 1593 2857 1593Z M3905 1226C3905 1082 3975 1015 4084 1015C4193 1015 4256 1083 4256 1208V1800H4600V1136C4600 876 4466 721 4237 721C4082 721 3976 791 3905 907V310H3561V1800H3905Z M5427,744 L5210,744 L5210,628.5 A172.5,172.5 0 0,0 4865,628.5 L4865,744 L4685,744 L4685,1010 L4865,1010 L4865,1503 C4865,1708 4979,1800 5232,1800 L5427,1800 L5427,1534 L5308,1534 C5231,1534 5210,1513 5210,1445 L5210,1010 L5427,1010 L5427,744 Z M4975.5,628.5 A62,62 0 1,1 5099.5,628.5 A62,62 0 1,1 4975.5,628.5 Z M5858 1818C6007 1818 6102 1766 6165 1652H6169V1800H6505V1089C6505 856 6336 721 6029 721C5723 721 5550 857 5535 1086H5855C5862 1014 5921 968 6017 968C6108 968 6164 1011 6164 1074V1079C6164 1142 6095 1157 5906 1173C5681 1191 5496 1268 5496 1505C5496 1715 5647 1818 5858 1818ZM5963 1593C5879 1593 5822 1554 5822 1489C5822 1420 5888 1382 5980 1368C6065 1354 6130 1341 6167 1324V1420C6167 1524 6078 1593 5963 1593Z M6667 1800H7011V1259C7011 1109 7096 1023 7219 1023C7269 1023 7330 1025 7355 1026V742C7327 741 7298 740 7261 740C7120 740 7041 796 7003 930H7000V744H6667Z';

const TUGLA = '#C8302E';
/** Lockup tuvali (marka kiti ile aynı): karo 0..1444, yazı 1644'ten başlar. */
const LOCK = { x: -80, y: -80, w: 9181, h: 1680 };
/** Yalnız yazı. */
const WORDBOX = { x: -80, y: 220, w: 7537, h: 1680 };

function xml(tile: boolean, ink: string, knock: string) {
  if (!tile) return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${WORDBOX.x} ${WORDBOX.y} ${WORDBOX.w} ${WORDBOX.h}"><path d="${WORD}" fill="${ink}" fill-rule="evenodd"/></svg>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${LOCK.x} ${LOCK.y} ${LOCK.w} ${LOCK.h}">`
    + `<g transform="translate(0,58) scale(1.444)"><rect width="1000" height="1000" rx="230" fill="${TUGLA}"/>`
    + `<g transform="translate(180,190) scale(0.64)"><path d="${MONO}" fill="${knock}" fill-rule="evenodd"/></g></g>`
    + `<g transform="translate(1644,-300)"><path d="${WORD}" fill="${ink}" fill-rule="evenodd"/></g></svg>`;
}

/** Yalnız monogram karosu (uygulama içi küçük işaretler, bildirim). */
export function Monogram({ size = 28, knock }: { size?: number; knock?: string }) {
  const c = useColors();
  return <SvgXml width={size} height={size} xml={`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000"><rect width="1000" height="1000" rx="230" fill="${TUGLA}"/><g transform="translate(180,190) scale(0.64)"><path d="${MONO}" fill="${knock || c.bg}" fill-rule="evenodd"/></g></svg>`} />;
}

/**
 * size: yazı yüksekliği ölçüsü (eski logo ile aynı kullanım). house: karoyu göster (adı geriye uyum için).
 * color verilirse koyu zemin varsayılır (açık yazı). animate eski imza için kabul edilir.
 */
export function Wordmark({ size = 28, color, house = true, variant, bg }: {
  size?: number; color?: string; animate?: boolean; house?: boolean; variant?: 'ink' | 'cream'; bg?: string;
}) {
  const c = useColors();
  const dark = variant ? variant === 'cream' : !!color || c.ink !== '#1D1A19';
  const ink = color || (dark ? c.heroInk : c.ink);
  const knock = bg || (dark ? c.deepA : c.bg);
  const h = size * 1.15;
  const box = house ? LOCK : WORDBOX;
  const w = h * (box.w / box.h);
  return (
    <View accessibilityRole="image" accessibilityLabel="anahtar" style={{ width: w, height: h }}>
      <SvgXml width={w} height={h} xml={xml(house, ink, knock)} />
    </View>
  );
}
