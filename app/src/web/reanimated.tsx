/* Web için react-native-reanimated yerine geçen hafif modül (metro.config.js yalnız web derlemesinde bağlar).
   Uygulamanın kullandığı kadarı: Animated.View (entering → Web Animations API), useSharedValue, useAnimatedStyle,
   withTiming / withSpring / withDelay / withRepeat, cancelAnimation, Easing, useReducedMotion, hazır giriş animasyonları.
   Asıl kütüphane ~650 KB; bu modül birkaç KB. Telefon uygulaması gerçek reanimated'ı kullanmaya devam eder. */
import { forwardRef, useEffect, useLayoutEffect, useReducer, useRef, useState } from 'react';
import { Image, ScrollView, Text, View } from 'react-native';

/* ---------------- yumuşatma ---------------- */
type Ease = (t: number) => number;
function bezier(x1: number, y1: number, x2: number, y2: number): Ease {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx, cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const sx = (t: number) => ((ax * t + bx) * t + cx) * t, sy = (t: number) => ((ay * t + by) * t + cy) * t;
  const dx = (t: number) => (3 * ax * t + 2 * bx) * t + cx;
  return (x: number) => {
    let t = x;
    for (let i = 0; i < 8; i++) { const e = sx(t) - x; const d = dx(t); if (Math.abs(e) < 1e-5 || !d) break; t -= e / d; }
    return sy(Math.min(1, Math.max(0, t)));
  };
}
export const Easing = {
  linear: (t: number) => t, quad: (t: number) => t * t, cubic: (t: number) => t * t * t, sin: (t: number) => 1 - Math.cos((t * Math.PI) / 2),
  ease: bezier(0.25, 0.1, 0.25, 1), bezier, in: (f: Ease) => f, out: (f: Ease) => (t: number) => 1 - f(1 - t),
  inOut: (f: Ease) => (t: number) => (t < 0.5 ? f(t * 2) / 2 : 1 - f((1 - t) * 2) / 2)
};

/* ---------------- paylaşılan değer ve animasyonlar ---------------- */
type Anim = { k: 'timing'; to: number; duration: number; easing: Ease } | { k: 'spring'; to: number; damping: number; stiffness: number; mass: number }
  | { k: 'delay'; ms: number; a: Anim } | { k: 'repeat'; a: Anim; n: number; reverse: boolean };
let tracking: Set<SV> | null = null;
const raf = typeof requestAnimationFrame !== 'undefined' ? requestAnimationFrame : (f: FrameRequestCallback) => setTimeout(() => f(Date.now()), 16) as any;
const caf = typeof cancelAnimationFrame !== 'undefined' ? cancelAnimationFrame : clearTimeout;

class SV {
  v: any; subs = new Set<() => void>(); frame: any = 0; timer: any = 0;
  constructor(v: any) { this.v = v; }
  get value() { tracking?.add(this); return this.v; }
  set value(x: any) { this.stop(); if (x && typeof x === 'object' && 'k' in x) this.run(x, () => {}); else this.set(x); }
  set(x: any) { this.v = x; this.subs.forEach((f) => f()); }
  stop() { caf(this.frame); clearTimeout(this.timer); }
  run(a: Anim, done: () => void) {
    if (a.k === 'delay') { this.timer = setTimeout(() => this.run(a.a, done), a.ms); return; }
    if (a.k === 'repeat') {
      const from = this.v; let i = 0; const to = (a.a as any).to;
      const loop = () => { if (a.n > 0 && i >= a.n) return done(); const back = a.reverse && i % 2 === 1; i++;
        this.run({ ...(a.a as any), to: back ? from : to }, loop); };
      return loop();
    }
    const from = Number(this.v) || 0, t0 = Date.now();
    if (a.k === 'timing') {
      const step = () => { const p = Math.min(1, (Date.now() - t0) / Math.max(1, a.duration)); this.set(from + (a.to - from) * a.easing(p)); if (p < 1) this.frame = raf(step); else done(); };
      this.frame = raf(step); return;
    }
    let x = from, v = 0, last = t0;
    const step = () => {
      const now = Date.now(); let dt = Math.min(0.064, (now - last) / 1000); last = now;
      while (dt > 0) { const h = Math.min(dt, 0.008); const f = -a.stiffness * (x - a.to) - a.damping * v; v += (f / a.mass) * h; x += v * h; dt -= h; }
      if (Math.abs(x - a.to) < 0.001 && Math.abs(v) < 0.01) { this.set(a.to); return done(); }
      this.set(x); this.frame = raf(step);
    };
    this.frame = raf(step);
  }
}
export const useSharedValue = (v: any) => useRef(new SV(v)).current;
export const cancelAnimation = (sv: SV) => sv.stop();
export const withTiming = (to: number, o: { duration?: number; easing?: Ease } = {}, cb?: (ok: boolean) => void): Anim => ({ k: 'timing', to, duration: o.duration ?? 300, easing: o.easing ?? Easing.inOut(Easing.quad) });
export const withSpring = (to: number, o: { damping?: number; stiffness?: number; mass?: number } = {}): Anim => ({ k: 'spring', to, damping: o.damping ?? 10, stiffness: o.stiffness ?? 100, mass: o.mass ?? 1 });
export const withDelay = (ms: number, a: Anim): Anim => ({ k: 'delay', ms, a });
export const withRepeat = (a: Anim, n = 2, reverse = false): Anim => ({ k: 'repeat', a, n, reverse });
export const runOnJS = (f: any) => f;

export function useAnimatedStyle(fn: () => any) {
  const [, tick] = useReducer((x: number) => x + 1, 0);
  const seen = new Set<SV>();
  tracking = seen;
  let style: any;
  try { style = fn(); } finally { tracking = null; }
  useLayoutEffect(() => { const subs = [...seen]; subs.forEach((s) => s.subs.add(tick)); return () => subs.forEach((s) => s.subs.delete(tick)); });
  return style;
}

export function useReducedMotion() {
  const [r, setR] = useState(false);
  useEffect(() => {
    if (typeof matchMedia === 'undefined') return;
    const m = matchMedia('(prefers-reduced-motion: reduce)'); setR(m.matches);
    const f = () => setR(m.matches); m.addEventListener?.('change', f); return () => m.removeEventListener?.('change', f);
  }, []);
  return r;
}

/* ---------------- giriş animasyonları ---------------- */
const FRAMES: Record<string, Keyframe[]> = {
  FadeIn: [{ opacity: 0 }, { opacity: 1 }],
  FadeInDown: [{ opacity: 0, transform: 'translateY(-24px)' }, { opacity: 1, transform: 'none' }],
  FadeInUp: [{ opacity: 0, transform: 'translateY(24px)' }, { opacity: 1, transform: 'none' }],
  SlideInDown: [{ transform: 'translateY(100%)' }, { transform: 'none' }],
  ZoomIn: [{ opacity: 0, transform: 'scale(0.4)' }, { opacity: 1, transform: 'none' }]
};
class Layout {
  constructor(public name: string, public ms = 300, public wait = 0, public spring = false) {}
  private c(p: Partial<Layout>) { return Object.assign(new Layout(this.name, this.ms, this.wait, this.spring), p); }
  duration(ms: number) { return this.c({ ms }); }
  delay(wait: number) { return this.c({ wait }); }
  springify() { return this.c({ spring: true, ms: Math.max(this.ms, 420) }); }
  damping() { return this; }
  stiffness() { return this; }
  mass() { return this; }
}
export const FadeIn = new Layout('FadeIn'), FadeInDown = new Layout('FadeInDown'), FadeInUp = new Layout('FadeInUp'),
  SlideInDown = new Layout('SlideInDown'), ZoomIn = new Layout('ZoomIn'),
  FadeOut = new Layout('FadeOut'), FadeOutUp = new Layout('FadeOutUp'), FadeOutDown = new Layout('FadeOutDown');

function animated(C: any) {
  return forwardRef(function A({ entering, exiting, ...rest }: any, ref: any) {
    const own = useRef<any>(null);
    useEffect(() => {
      const el = own.current;
      const kf = entering && FRAMES[entering.name];
      if (!kf || !el || typeof el.animate !== 'function') return;
      if (typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      el.animate(kf, { duration: entering.ms, delay: entering.wait, easing: entering.spring ? 'cubic-bezier(0.22,1,0.36,1)' : 'cubic-bezier(0.32,0.72,0,1)', fill: 'backwards' });
    }, []);
    return <C {...rest} ref={(n: any) => { own.current = n; if (typeof ref === 'function') ref(n); else if (ref) ref.current = n; }} />;
  });
}
const Animated = { View: animated(View), Text: animated(Text), ScrollView: animated(ScrollView), Image: animated(Image), createAnimatedComponent: animated };
export const createAnimatedComponent = animated;
export default Animated;
