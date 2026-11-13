/* Güvenli alan boşlukları: üstte durum çubuğu / Dynamic Island, altta ana ekran çubuğu. SafeAreaProvider'ı expo-router sağlar;
   sağlayıcı yoksa (hata ekranı gibi erken çizimlerde) atmaz, 0 döner. */
import { useContext } from 'react';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';

export type Insets = { top: number; bottom: number; left: number; right: number };
const NONE: Insets = { top: 0, bottom: 0, left: 0, right: 0 };
export const useInsets = (): Insets => useContext(SafeAreaInsetsContext) ?? NONE;
