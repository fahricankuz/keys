import { ReactNode, useEffect, useRef, useState } from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

/** Kaydırınca beliren blok: ekrana girene kadar hafif aşağıda ve bulanık durur. İlk ekranda görünen içerik hiç gizlenmez. */
export function Reveal({ children, delay = 0, y = 28, style, accessibilityRole }: { children?: ReactNode; delay?: number; y?: number; style?: StyleProp<ViewStyle>; accessibilityRole?: any }) {
  const reduced = useReducedMotion();
  const ref = useRef<any>(null);
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    if (reduced || typeof IntersectionObserver === 'undefined') return;
    const el = ref.current;
    if (!el || !el.getBoundingClientRect) return;
    if (el.getBoundingClientRect().top < window.innerHeight * 0.9) return;
    setHidden(true);
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { setHidden(false); io.disconnect(); } }, { rootMargin: '0px 0px -8% 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [reduced]);
  const anim: any = { transitionProperty: 'opacity, transform, filter', transitionDuration: '900ms', transitionTimingFunction: 'cubic-bezier(0.32,0.72,0,1)', transitionDelay: `${delay}ms` };
  const state: any = hidden ? { opacity: 0, transform: [{ translateY: y }], filter: 'blur(8px)' } : { opacity: 1, transform: [{ translateY: 0 }], filter: 'blur(0px)' };
  return <View ref={ref} accessibilityRole={accessibilityRole} style={[style, anim, state]}>{children}</View>;
}
