/* Uygulama açılışı: halka "i"den "ı" üzerine sıçrar (600 ms), sonra ekran açılır. */
import { useEffect, useState } from 'react';
import { Platform, View } from 'react-native';
import Animated, { FadeOut } from 'react-native-reanimated';
import { storage } from '../domain/storage';
import { useColors } from '../ui/theme';
import { Wordmark } from '../ui/Wordmark';

export default function OpenSplash() {
  const c = useColors();
  // Web'de oturum başına bir kez; cihazda her açılışta.
  const [show, setShow] = useState(() => {
    if (Platform.OS !== 'web') return true;
    try { if (sessionStorage.getItem('kiracim-acilis')) return false; sessionStorage.setItem('kiracim-acilis', '1'); } catch {}
    return true;
  });
  useEffect(() => { if (!show) return; const id = setTimeout(() => setShow(false), 1100); return () => clearTimeout(id); }, [show]);
  if (!show) return null;
  return (
    <Animated.View exiting={FadeOut.duration(280)} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 999, backgroundColor: c.cream, alignItems: 'center', justifyContent: 'center' }}>
      <Wordmark size={64} animate />
    </Animated.View>
  );
}
