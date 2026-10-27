/* Bildirim şeridi, onay penceresi ve alt sayfa (sheet) kabuğu.
   host.* kancalarını bağlar; alan mantığı ekranı bilmeden bunları çağırır. */
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Modal, Platform, Pressable, ScrollView, Share, View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, { FadeIn, FadeInUp, FadeOut, SlideInDown } from 'react-native-reanimated';
import { t } from '../domain/i18n';
import { host } from '../domain/host';
import { Button, PressScale, Text } from '../ui/kit';
import { fonts, radius, shadows, useColors } from '../ui/theme';
import { Icon } from './blocks';
import { CelebrateBurst } from '../ui/motion';

type Toast = { id: number; title: string; body: string; icon?: string; actions?: { label: string; run: () => void }[] };
type Confirm = { title: string; body?: string; ok?: string; danger?: boolean; alone?: boolean; resolve: (v: boolean) => void };
type SheetState = { name: string; params: any } | null;

const Ctx = createContext<{ sheet: SheetState; open: (n: string, p?: any) => void; close: () => void }>(null as any);
export const useSheet = () => useContext(Ctx);

export function OverlayProvider({ children, renderSheet }: { children: ReactNode; renderSheet: (name: string, params: any, close: () => void) => ReactNode }) {
  const c = useColors();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [sheet, setSheet] = useState<SheetState>(null);
  const [cel, setCel] = useState<{ id: number; title: string } | null>(null);
  const seq = useRef(0);

  const dismiss = useCallback((id: number) => setToasts((l) => l.filter((x) => x.id !== id)), []);
  const open = useCallback((name: string, params: any = {}) => setSheet({ name, params }), []);
  const close = useCallback(() => setSheet(null), []);

  useEffect(() => {
    host.notify = (n: any) => {
      const id = ++seq.current;
      setToasts((l) => [...l.slice(-2), { id, ...n }]);
      setTimeout(() => dismiss(id), n.actions ? 12000 : 6000);
    };
    host.ask = (o: any) => new Promise<boolean>((resolve) => setConfirm({ ...o, resolve }));
    host.go = (path: string) => router.push(path as any);
    host.openSheet = (name: string, params: any) => open(name, params);
    host.closeSheet = close;
    host.celebrate = (o: any) => {
      const id = ++seq.current;
      setCel({ id, title: o?.title || '' });
      setTimeout(() => setCel((x) => (x && x.id === id ? null : x)), 2300);
    };
    host.haptic = () => { import('expo-haptics').then((H) => H.impactAsync(H.ImpactFeedbackStyle.Light)).catch(() => {}); };
    host.openUrl = (u: string) => { Linking.openURL(u).catch(() => {}); };
    host.saveFile = async (name: string, text: string | Uint8Array, type: string) => {
      if (Platform.OS === 'web') {
        const blob = new Blob([text as BlobPart], { type });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob); a.download = name;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      } else {
        if (typeof text === "string") { try { await Share.share({ message: text, title: name }); } catch {} }
      }
    };
  }, [router, open, close, dismiss]);

  const value = useMemo(() => ({ sheet, open, close }), [sheet, open, close]);
  const wide = width >= 720;

  return (
    <Ctx.Provider value={value}>
      {children}

      <Modal visible={!!sheet} transparent animationType="none" onRequestClose={close} statusBarTranslucent>
        <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(120)} style={{ flex: 1, backgroundColor: 'rgba(20,19,17,0.5)', justifyContent: wide ? 'center' : 'flex-end', alignItems: 'center' }}>
          <Pressable accessibilityLabel={t('Kapat')} onPress={close} style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }} />
          {sheet && (
            <Animated.View entering={SlideInDown.springify().damping(24).stiffness(220)}
              style={{ width: '100%', maxWidth: 560, maxHeight: '92%', backgroundColor: c.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, borderBottomLeftRadius: wide ? 28 : 0, borderBottomRightRadius: wide ? 28 : 0, overflow: 'hidden' }}>
              <View style={{ alignItems: 'center', paddingTop: 10 }}><View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: c.line }} /></View>
              <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, paddingBottom: 36, gap: 14 }}>
                {renderSheet(sheet.name, sheet.params, close)}
              </ScrollView>
            </Animated.View>
          )}
          <ToastLayer toasts={toasts} dismiss={dismiss} inModal />
          {cel && <CelebrateBurst key={cel.id} title={cel.title} />}
          <ConfirmLayer confirm={confirm} done={(v) => { confirm?.resolve(v); setConfirm(null); }} />
        </Animated.View>
      </Modal>

      {!sheet && <ToastLayer toasts={toasts} dismiss={dismiss} />}
      {!sheet && cel && <CelebrateBurst key={cel.id} title={cel.title} />}
      {!sheet && <ConfirmLayer confirm={confirm} done={(v) => { confirm?.resolve(v); setConfirm(null); }} />}
    </Ctx.Provider>
  );
}

function ToastLayer({ toasts, dismiss, inModal }: { toasts: Toast[]; dismiss: (id: number) => void; inModal?: boolean }) {
  const c = useColors();
  if (!toasts.length) return null;
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', top: 12, left: 12, right: 12, alignItems: 'center', gap: 8, zIndex: 100 }}>
      {toasts.map((n) => (
        <Animated.View key={n.id} entering={FadeInUp.springify().damping(20)} exiting={FadeOut} accessibilityRole="alert"
          style={{ width: '100%', maxWidth: 460, flexDirection: 'row', gap: 12, backgroundColor: c.surface, borderRadius: radius.lg, padding: 14, borderWidth: 1, borderColor: c.line, boxShadow: shadows.lift }}>
          <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name={n.icon || 'bell'} size={19} color={c.accentInk} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text v="small" style={{ fontFamily: fonts.bodyXBold }}>{n.title}</Text>
            <Text v="small" muted>{n.body}</Text>
            {n.actions && (
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                {n.actions.map((a, i) => <Button key={i} kind={i === 0 ? 'primary' : 'ghost'} title={a.label} onPress={() => { a.run(); dismiss(n.id); }} style={{ minHeight: 38 }} />)}
              </View>
            )}
          </View>
          <Pressable onPress={() => dismiss(n.id)} accessibilityLabel={t('Bildirimi kapat')} hitSlop={10}><Icon name="x" size={18} /></Pressable>
        </Animated.View>
      ))}
    </View>
  );
}

function ConfirmLayer({ confirm, done }: { confirm: Confirm | null; done: (v: boolean) => void }) {
  const c = useColors();
  if (!confirm) return null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => done(false)}>
      <View style={{ flex: 1, backgroundColor: 'rgba(20,19,17,0.55)', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <View accessibilityRole="alert" style={{ width: '100%', maxWidth: 400, backgroundColor: c.bg, borderRadius: radius.xl, padding: 24, gap: 10 }}>
          <Text v="h2">{confirm.title}</Text>
          {confirm.body ? <Text v="body" muted>{confirm.body}</Text> : null}
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
            {confirm.alone ? null : <Button kind="ghost" title={t('Vazgeç')} onPress={() => done(false)} style={{ flex: 1 }} />}
            <Pressable onPress={() => done(true)} accessibilityRole="button" style={{ flex: 1, minHeight: 52, borderRadius: radius.pill, backgroundColor: confirm.danger ? c.badInk : c.accent, alignItems: 'center', justifyContent: 'center' }}>
              <Text v="small" color={confirm.danger ? '#fff' : c.accentInk} style={{ fontFamily: fonts.bodyXBold, fontSize: 15 }}>{confirm.ok || t('Tamam')}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
