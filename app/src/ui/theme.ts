import { useEffect, useState, useSyncExternalStore } from 'react';
import { S, subscribe, snapshot } from '../domain/state';
import { useWindowDimensions } from 'react-native';

/* anahtar marka paleti: krem zemin, sıcak mürekkep, kiremit kırmızısı. */
export const light = {
  bg: '#FAF5F0', surface: '#FFFDFB', surface2: '#E8DDD5', line: '#E8DDD5', tile: '#F3ECE5',
  ink: '#1D1A19', muted: '#5C4F4A', accent: '#C8302E', accentInk: '#FAF5F0', accentSoft: '#F0CFC8',
  /** Küçük metinde vurgu rengi yerine okunur koyu ton. */
  accentText: '#A8231F',
  /** Pasif düğme/öğe. */
  offBg: '#E8DDD5', offInk: '#9A8F8A',
  hero: '#1D1A19', heroInk: '#FAF5F0', heroMuted: '#BDB1AB',
  okBg: '#D5EBD7', okInk: '#2A6B3A', badBg: '#F0CFC8', badInk: '#B42318', warnBg: '#F2B544', warnInk: '#1D1A19',
  shadow: 'rgba(29,26,25,0.10)',
  peach: '#F0CFC8', butter: '#F2B544', sage: '#D5EBD7', sky: '#E8DDD5', rose: '#F7E4DF', cream: '#FAF5F0', deepA: '#1D1A19', deepB: '#5C4F4A',
  lemon: '#F2B544', mint: '#D5EBD7', lavender: '#E8DDD5', line6: 'rgba(29,26,25,0.06)'
};
export const dark: typeof light = {
  bg: '#1D1A19', surface: '#2A2523', surface2: '#362F2C', line: '#443B37', tile: '#262120',
  ink: '#FAF5F0', muted: '#BDB1AB', accent: '#D8403D', accentInk: '#FAF5F0', accentSoft: '#4A2A28',
  accentText: '#F28C86',
  offBg: '#443B37', offInk: '#8C807A',
  hero: '#2A2523', heroInk: '#FAF5F0', heroMuted: '#BDB1AB',
  okBg: '#1E4A38', okInk: '#D5EBD7', badBg: '#4A2A28', badInk: '#F5B8B2', warnBg: '#5A4410', warnInk: '#F9D58A',
  shadow: 'rgba(0,0,0,0.5)',
  peach: '#4A2A28', butter: '#5A4410', sage: '#1E4A38', sky: '#362F2C', rose: '#3A2B28', cream: '#1D1A19', deepA: '#141110', deepB: '#5C4F4A',
  lemon: '#F2B544', mint: '#D5EBD7', lavender: '#E8DDD5', line6: 'rgba(250,245,240,0.08)'
};
export type Colors = typeof light;

export const fonts = {
  /** Marka kiti: başlık Inter Display (Inter Tight), gövde ve arayüz Inter. */
  display: 'InterTight_800ExtraBold',
  displayBold: 'InterTight_700Bold',
  displayMid: 'Inter_600SemiBold',
  body: 'Inter_400Regular',
  bodyMedium: 'Inter_500Medium',
  bodyBold: 'Inter_700Bold',
  bodyXBold: 'Inter_700Bold',
  site: 'InterTight_800ExtraBold',
  siteBold: 'InterTight_800ExtraBold'
};

/** Katmanlı yumuşak gölgeler: Gece Mürekkebi tonlu, üst üste üç katman (yakın, orta, uzak).
    Yalnız yüzen yüzeylerde (kayan kart, menü, sekme çubuğu, bildirim); düz kartlar çerçeveyle kalır. */
export const shadows = {
  soft: '0 1px 2px rgba(29,26,25,0.05), 0 4px 10px rgba(29,26,25,0.06), 0 14px 28px rgba(29,26,25,0.08)',
  lift: '0 2px 4px rgba(29,26,25,0.05), 0 8px 16px rgba(29,26,25,0.07), 0 24px 48px rgba(29,26,25,0.12)'
};

export const radius = { sm: 12, md: 20, lg: 24, xl: 28, pill: 999 };
export const space = (n: number) => n * 4;

/** Tema: ilk çizim açık (statik HTML ile aynı), bağlanınca sistem temasına geçer. */
export function useColors(): Colors {
  useSyncExternalStore(subscribe, snapshot, snapshot);
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  if (!mounted) return light;
  // Koyu tema yalnızca ayarlardan seçilince açılır; sistem teması izlenmez.
  return (S as any).theme === 'dark' ? dark : light;
}

/** Kırılım noktaları: telefon < 720 ≤ tablet < 1080 ≤ masaüstü.
    İlk çizim (statik HTML ve hidrasyon) sabit bir genişlikle yapılır; böylece sunucu ve
    istemci çıktısı aynı olur, ölçülen genişlik bağlanınca düzen güncellenir. */
export function useBreakpoint(){
  const { width: real } = useWindowDimensions();
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  const width = mounted ? real : 900;
  return { width, phone: width < 720, desktop: width >= 1080 };
}
