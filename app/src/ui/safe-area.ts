/* Güvenli alan boşlukları (durum çubuğu, Dynamic Island, ana ekran çubuğu). Web'de tarayıcı kendi alanını yönetir: hepsi 0, düzen değişmez.
   Telefon sürümü safe-area.native.ts'dedir (react-native-safe-area-context). */
export type Insets = { top: number; bottom: number; left: number; right: number };
const NONE: Insets = { top: 0, bottom: 0, left: 0, right: 0 };
export const useInsets = (): Insets => NONE;
