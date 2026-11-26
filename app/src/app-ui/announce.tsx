/* Uygulama içi duyuru (yönetici paneli › Duyurular): önemli duyuru ortada kart (bir kez), hafif duyuru ana sayfanın üstünde şerit (✕ ile kapanır).
   Görüldü / kapatıldı / tıklandı sunucuya yazılır (announcement_mark); telefonda ve webde tekrar çıkmaz. Her rolde çalışır (AppShell içinde). */
import { useEffect, useState } from 'react';
import { Linking, Modal, Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { kindLabel, localized, markAnnouncement, myAnnouncements } from '../domain/announce';
import { LIVE } from '../domain/config';
import { useAuth } from '../auth/auth';
import { t } from '../domain/i18n';
import { Button, PressScale, Text } from '../ui/kit';
import { Wordmark } from '../ui/Wordmark';
import { fonts, radius, useColors } from '../ui/theme';

type A = { id: number; kind: string; view: 'card' | 'banner'; title: string; body: string; title_en?: string; body_en?: string; cta?: string; cta_en?: string; url?: string; seen?: boolean };

// Oturum (kullanıcı) başına bir kez yüklenir; kart ve şerit aynı isteği paylaşır.
let cache: A[] | null = null, cacheFor = '', pending: Promise<A[]> | null = null;

function useAnnouncements() {
  const { user } = useAuth();
  const uid = user?.id || '';
  const [list, setList] = useState<A[]>(cacheFor === uid && cache ? cache : []);
  useEffect(() => {
    if (!LIVE || !uid) return;
    if (cacheFor !== uid) { cache = null; pending = null; cacheFor = uid; }
    if (cache) { setList(cache); return; }
    let on = true;
    pending = pending || myAnnouncements().then((l: A[]) => (cache = l));
    pending.then((l) => { if (on) setList(l); });
    return () => { on = false; };
  }, [uid]);
  const drop = (id: number) => { cache = (cache || []).filter((x) => x.id !== id); setList(cache); };
  const seen = (id: number) => { cache = (cache || []).map((x) => (x.id === id ? { ...x, seen: true } : x)); setList(cache); };
  return { list, drop, seen };
}

function useOpen() {
  const router = useRouter();
  return (url?: string) => {
    if (!url) return;
    if (/^https:\/\//.test(url)) Linking.openURL(url).catch(() => {});
    else router.push(url as any);
  };
}

/** Ortada kart: görülmemiş ilk kart duyurusu açılışta bir kez. */
export function AnnounceCard() {
  const c = useColors();
  const go = useOpen();
  const { list, seen } = useAnnouncements();
  const a = list.find((x) => x.view === 'card' && !x.seen);
  useEffect(() => { if (a) markAnnouncement(a.id, 'seen'); }, [a?.id]);
  if (!a) return null;
  const L = localized(a);
  const close = () => seen(a.id);
  return (
    <Modal visible transparent animationType="fade" onRequestClose={close} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: 'rgba(20,19,17,0.55)', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <Pressable accessibilityLabel={t('Kapat')} onPress={close} style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }} />
        <View accessibilityRole="alert" style={{ width: '100%', maxWidth: 380, backgroundColor: c.surface, borderRadius: 28, overflow: 'hidden' }}>
          <View style={{ backgroundColor: '#1D1A19', paddingHorizontal: 20, paddingVertical: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Wordmark size={24} variant="cream" />
            <PressScale onPress={close} accessibilityRole="button" accessibilityLabel={t('Kapat')} scaleTo={0.9} style={{ padding: 4 }}>
              <Text v="body" color="#FAF5F0" style={{ fontSize: 18 }}>✕</Text>
            </PressScale>
          </View>
          <View style={{ padding: 20, gap: 10 }}>
            <View style={{ alignSelf: 'flex-start', backgroundColor: c.butter, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 }}>
              <Text v="small" color={c.warnInk} style={{ fontFamily: fonts.bodyBold, fontSize: 12 }}>{kindLabel(a.kind)}</Text>
            </View>
            <Text v="h2">{L.title}</Text>
            {L.body ? <Text v="body" muted>{L.body}</Text> : null}
            <View style={{ gap: 6, marginTop: 6 }}>
              {L.cta && a.url
                ? <Button block title={L.cta} onPress={() => { markAnnouncement(a.id, 'click'); close(); go(a.url); }} />
                : <Button block title={t('Tamam')} onPress={close} />}
              {L.cta && a.url ? <Button block kind="quiet" title={t('Daha sonra')} onPress={close} /> : null}
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

/** Sayfa içi şerit: ana sayfaların üstünde; ✕ ile kapanır (bir daha çıkmaz). */
export function AnnounceBanner() {
  const c = useColors();
  const go = useOpen();
  const { list, drop } = useAnnouncements();
  const items = list.filter((x) => x.view === 'banner');
  useEffect(() => { items.filter((x) => !x.seen).forEach((x) => markAnnouncement(x.id, 'seen')); }, [items.map((x) => x.id).join()]);
  if (!items.length) return null;
  return (
    <View style={{ paddingHorizontal: 14, paddingTop: 10, gap: 8 }}>
      {items.slice(0, 2).map((a) => {
        const L = localized(a);
        const dark = a.kind !== 'maintenance';
        return (
          <View key={a.id} accessibilityRole="summary" style={{ flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: radius.lg, padding: 12,
            backgroundColor: dark ? '#1D1A19' : c.surface, borderWidth: dark ? 0 : 1, borderColor: c.line }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text v="body" color={dark ? '#FAF5F0' : c.ink} style={{ fontFamily: fonts.bodyBold }} numberOfLines={2}>{L.title}</Text>
              {L.body ? <Text v="small" color={dark ? '#BDB1AB' : c.muted} numberOfLines={2}>{L.body}</Text> : null}
            </View>
            {a.url ? (
              <PressScale onPress={() => { markAnnouncement(a.id, 'click'); go(a.url); }} accessibilityRole="button" scaleTo={0.95}
                style={{ backgroundColor: c.butter, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 }}>
                <Text v="small" color={c.warnInk} style={{ fontFamily: fonts.bodyBold }}>{L.cta || t('Gör')}</Text>
              </PressScale>
            ) : null}
            <PressScale onPress={() => { markAnnouncement(a.id, 'dismiss'); drop(a.id); }} accessibilityRole="button" accessibilityLabel={t('Duyuruyu kapat')} scaleTo={0.9} style={{ padding: 4 }}>
              <Text v="body" color={dark ? '#FAF5F0' : c.muted}>✕</Text>
            </PressScale>
          </View>
        );
      })}
    </View>
  );
}
