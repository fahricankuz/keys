/* Telefon uygulaması: yazı tipleri paketle gelir. Web'de yerine public/fonts altındaki küçük WOFF2 alt kümeleri
   kullanılır (fontFiles.ts boş; @font-face'i derlemede harden-html ekler). */
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import { InterTight_700Bold, InterTight_800ExtraBold } from '@expo-google-fonts/inter-tight';

export const FONT_FILES = { InterTight_700Bold, InterTight_800ExtraBold, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold };
