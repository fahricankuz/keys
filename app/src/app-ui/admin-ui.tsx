/* Yönetici paneli tasarım parçaları (tanıtım sitesinin dilinden): koyu yan menü, bölüm başlığı,
   renkli simgeli gösterge kutusu ve grup başlığı. */
import { ReactNode, useState } from 'react';
import { Platform, ScrollView, Text as RNText, View } from 'react-native';
import { useRouter } from 'expo-router';
import { t } from '../domain/i18n';
import { AdminUI, Button, Chip, PressScale, Text } from '../ui/kit';
import { Wordmark } from '../ui/Wordmark';
import { fonts, radius, useBreakpoint, useColors } from '../ui/theme';
import { Icon } from './blocks';

export type NavItem = { key: string; label: string; icon: string; badge?: number; group?: string };

/** Menü grupları (sırasıyla); öğe grubu yoksa en üstte, başlıksız. */
type NavGroup = { name: string; items: NavItem[] };
function groupsOf(items: NavItem[]): NavGroup[] {
  const out: NavGroup[] = [];
  items.forEach((it) => {
    const name = it.group || '';
    const g = out.find((x) => x.name === name) || (out.push({ name, items: [] }), out[out.length - 1]);
    g.items.push(it);
  });
  return out;
}
const CLOSED_KEY = 'adminNavClosed';
const readClosed = (): string[] => { try { return JSON.parse(globalThis.localStorage?.getItem(CLOSED_KEY) || '[]') || []; } catch { return []; } };
const writeClosed = (v: string[]) => { try { globalThis.localStorage?.setItem(CLOSED_KEY, JSON.stringify(v)); } catch { /* yok say */ } };

/** Masaüstünde koyu yan menü, telefonda üst şerit + açılır bölüm menüsü (basınca açılır, seçince kapanır). İçerik sağda / altta. */
export function AdminShell({ items, active, onPick, email, onReload, onSignOut, busy, children }: {
  items: NavItem[]; active: string; onPick: (k: string) => void; email?: string;
  onReload: () => void; onSignOut: () => void; busy?: boolean; children: ReactNode;
}) {
  const c = useColors();
  const router = useRouter();
  const { desktop } = useBreakpoint();
  const [menu, setMenu] = useState(false);
  // Kapalı menü grupları tarayıcıda hatırlanır; açık sayfanın grubu her zaman açıktır.
  const [closed, setClosed] = useState<string[]>(readClosed);
  const toggle = (name: string) => setClosed((x) => { const v = x.includes(name) ? x.filter((y) => y !== name) : [...x, name]; writeClosed(v); return v; });
  if (!desktop) {
    const cur = items.find((x) => x.key === active) || items[0];
    return (
      <View style={{ flex: 1, backgroundColor: c.bg }}>
        <View style={{ backgroundColor: c.deepA, paddingTop: 14, paddingBottom: 10, gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <PressScale onPress={() => router.push('/' as any)} accessibilityRole="link" accessibilityLabel={t('Ana sayfa')} style={{ alignSelf: 'flex-start' }}><Wordmark size={22} variant="cream" bg={c.deepA} /></PressScale>
              <Chip tone="warn" label={t('Yönetici')} />
            </View>
            <Button kind="onDark" title={t('Çıkış yap')} onPress={onSignOut} style={{ minHeight: 38, paddingHorizontal: 14 }} />
          </View>
          <View style={{ paddingHorizontal: 16, gap: 6 }}>
            <PressScale onPress={() => setMenu((o) => !o)} accessibilityRole="button" aria-expanded={menu} accessibilityLabel={t('Bölümler') + ': ' + cur.label} scaleTo={0.98}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, minHeight: 46, borderRadius: radius.pill, backgroundColor: c.lemon }}>
              <Icon name={cur.icon} size={16} color="#1D1A19" />
              <RNText style={{ flex: 1, fontFamily: fonts.bodyBold, fontSize: 14.5, color: '#1D1A19' }}>{cur.label}{cur.badge ? ' (' + cur.badge + ')' : ''}</RNText>
              <RNText style={{ fontSize: 16, color: '#1D1A19' }}>{menu ? '▴' : '▾'}</RNText>
            </PressScale>
            {menu ? (
              <ScrollView style={{ maxHeight: 360, borderRadius: 18, backgroundColor: 'rgba(250,245,240,0.08)' }} contentContainerStyle={{ padding: 6, gap: 2 }}>
                {groupsOf(items).map((g) => [
                  g.name ? <RNText key={'g' + g.name} style={{ fontFamily: fonts.bodyBold, fontSize: 11, letterSpacing: 0.8, textTransform: 'uppercase', color: c.heroMuted, paddingHorizontal: 12, paddingTop: 10, paddingBottom: 2 }}>{g.name}</RNText> : null,
                  ...g.items.map((it) => {
                  const on = it.key === active;
                  return (
                    <PressScale key={it.key} onPress={() => { onPick(it.key); setMenu(false); }} accessibilityRole="button" accessibilityState={{ selected: on }} scaleTo={0.98}
                      accessibilityLabel={it.label + (it.badge ? ' (' + it.badge + ')' : '')}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, minHeight: 46, borderRadius: 14, backgroundColor: on ? 'rgba(250,245,240,0.14)' : 'transparent' }}>
                      <View style={{ width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? c.lemon : 'rgba(250,245,240,0.08)' }}>
                        <Icon name={it.icon} size={16} color={on ? '#1D1A19' : c.heroInk} />
                      </View>
                      <RNText style={{ flex: 1, fontFamily: on ? fonts.bodyXBold : fonts.bodyMedium, fontSize: 14.5, color: c.heroInk }}>{it.label}</RNText>
                      {it.badge ? (
                        <View style={{ minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, backgroundColor: c.lemon, alignItems: 'center', justifyContent: 'center' }}>
                          <RNText style={{ fontFamily: fonts.bodyXBold, fontSize: 12, color: '#1D1A19' }}>{it.badge}</RNText>
                        </View>
                      ) : null}
                    </PressScale>
                  );
                })])}
              </ScrollView>
            ) : null}
          </View>
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }}><AdminUI.Provider value={true}>{children}</AdminUI.Provider></ScrollView>
      </View>
    );
  }
  return (
    <View style={{ flex: 1, flexDirection: 'row', backgroundColor: c.bg }}>
      {/* Yan menü ekran yüksekliğine sığar: bölümler kendi içinde kayar, e-posta ve çıkış düğmeleri altta sabit kalır (Safari dahil). */}
      <View style={{ width: 260, backgroundColor: c.deepA, paddingTop: 26, paddingBottom: 18, paddingHorizontal: 16, minHeight: 0 }}>
        <ScrollView style={{ flex: 1, minHeight: 0 }} contentContainerStyle={{ gap: 26, paddingBottom: 30 }} showsVerticalScrollIndicator={false}>
          <View style={{ gap: 10, paddingHorizontal: 8 }}>
            <PressScale onPress={() => router.push('/' as any)} accessibilityRole="link" accessibilityLabel={t('Ana sayfa')} style={{ alignSelf: 'flex-start' }}><Wordmark size={26} variant="cream" bg={c.deepA} /></PressScale>
            <View style={{ alignSelf: 'flex-start' }}><Chip tone="warn" label={t('Yönetici paneli')} /></View>
          </View>
          <View style={{ gap: 14 }} role="navigation" aria-label={t('Yönetici bölümleri')}>
            {groupsOf(items).map((g) => {
              const hasActive = g.items.some((x) => x.key === active);
              const open = !g.name || hasActive || !closed.includes(g.name);
              const badge = g.items.reduce((a, x) => a + (x.badge || 0), 0);
              return (
                <View key={g.name || '_'} style={{ gap: 2 }}>
                  {g.name ? (
                    <PressScale onPress={() => toggle(g.name)} accessibilityRole="button" aria-expanded={open} accessibilityLabel={g.name} scaleTo={0.99}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 4 }}>
                      <RNText style={{ flex: 1, fontFamily: fonts.bodyBold, fontSize: 11, letterSpacing: 0.9, textTransform: 'uppercase', color: c.heroMuted }}>{g.name}</RNText>
                      {!open && badge ? <View style={{ minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 5, backgroundColor: c.lemon, alignItems: 'center', justifyContent: 'center' }}><RNText style={{ fontFamily: fonts.bodyXBold, fontSize: 11, color: '#1D1A19' }}>{badge}</RNText></View> : null}
                      <RNText style={{ fontSize: 11, color: c.heroMuted }}>{open ? '▾' : '▸'}</RNText>
                    </PressScale>
                  ) : null}
                  {open ? g.items.map((it) => {
                    const on = it.key === active;
                    return (
                      <PressScale key={it.key} onPress={() => onPick(it.key)} accessibilityRole="button" accessibilityState={{ selected: on }} scaleTo={0.98}
                        accessibilityLabel={it.label + (it.badge ? ' (' + it.badge + ')' : '')}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, minHeight: 40, borderRadius: 12, backgroundColor: on ? 'rgba(250,245,240,0.10)' : 'transparent' }}>
                        <View style={{ width: 28, height: 28, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? c.accent : 'rgba(250,245,240,0.06)' }}>
                          <Icon name={it.icon} size={15} color={on ? '#fff' : c.heroInk} />
                        </View>
                        <RNText style={{ flex: 1, fontFamily: on ? fonts.bodyXBold : fonts.bodyMedium, fontSize: 14, color: on ? c.heroInk : c.heroMuted }}>{it.label}</RNText>
                        {it.badge ? (
                          <View style={{ minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, backgroundColor: c.lemon, alignItems: 'center', justifyContent: 'center' }}>
                            <RNText style={{ fontFamily: fonts.bodyXBold, fontSize: 12, color: '#1D1A19' }}>{it.badge}</RNText>
                          </View>
                        ) : null}
                      </PressScale>
                    );
                  }) : null}
                </View>
              );
            })}
          </View>
        </ScrollView>
        {/* Menü kayıyorsa altta soluklaşma: devamı olduğu anlaşılır. */}
        <View pointerEvents="none" style={[{ height: 28, marginTop: -28 }, Platform.OS === 'web' ? ({ backgroundImage: `linear-gradient(to bottom, rgba(0,0,0,0), ${c.deepA})` } as any) : null]} />
        <View style={{ gap: 10, paddingHorizontal: 8, paddingTop: 12, flexShrink: 0, borderTopWidth: 1, borderTopColor: 'rgba(250,245,240,0.10)' }}>
          {email ? <RNText numberOfLines={1} style={{ fontFamily: fonts.body, fontSize: 13, color: c.heroMuted }}>{email}</RNText> : null}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button kind="onDark" title={t('Yenile')} onPress={onReload} loading={busy} style={{ flex: 1, minHeight: 42, paddingHorizontal: 12 }} />
            <Button kind="onDark" title={t('Çıkış yap')} onPress={onSignOut} style={{ flex: 1, minHeight: 42, paddingHorizontal: 12 }} />
          </View>
        </View>
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 40, paddingVertical: 34, paddingBottom: 80 }}>
        <View style={{ width: '100%', maxWidth: 1180, alignSelf: 'center' }}><AdminUI.Provider value={true}>{children}</AdminUI.Provider></View>
      </ScrollView>
    </View>
  );
}

/** Bölüm başlığı: kırmızı küçük etiket, büyük başlık, açıklama; sağda isteğe bağlı araçlar. */
export function PageHead({ label, title, sub, right }: { label?: string; title: string; sub?: string; right?: ReactNode }) {
  const c = useColors();
  const { phone } = useBreakpoint();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 14, marginBottom: phone ? 16 : 24 }}>
      <View style={{ flex: 1, minWidth: 240, gap: 4 }}>
        {label ? <Text v="label" color={c.accentText} style={{ fontSize: 12.5, letterSpacing: 0.4 }}>{label}</Text> : null}
        <RNText style={{ fontFamily: fonts.siteBold, fontSize: phone ? 28 : 40, lineHeight: phone ? 32 : 44, letterSpacing: phone ? -0.6 : -1.2, color: c.ink }}>{title}</RNText>
        {/* Telefonda uzun açıklama yer kaplar; yalnız geniş ekranda. */}
        {sub && !phone ? <Text v="small" muted style={{ fontSize: 14.5 }}>{sub}</Text> : null}
      </View>
      {right}
    </View>
  );
}

/** Grup başlığı (Büyüme, Gelir, …). */
export function GroupTitle({ children }: { children: string }) {
  const c = useColors();
  return <RNText style={{ fontFamily: fonts.siteBold, fontSize: 19, color: c.ink, letterSpacing: -0.3, marginTop: 8 }}>{children}</RNText>;
}

const TONES = { peach: ['#F0CFC8', '#A8231F'], butter: ['#F6DFA6', '#6B4A00'], sage: ['#D5EBD7', '#2A6B3A'], sky: ['#E8DDD5', '#5C4F4A'], ink: ['#1D1A19', '#FAF5F0'] } as const;
export type Tone = keyof typeof TONES;

/** Gösterge kutusu: renkli simge, etiket, büyük değer, alt bilgi; isteğe bağlı değişim oku. */
export function Kpi({ icon, tone = 'sky', label, value, sub, trend }: { icon: string; tone?: Tone; label: string; value: string; sub?: string; trend?: string }) {
  const c = useColors();
  const { phone } = useBreakpoint();
  const [bg, fg] = TONES[tone];
  const up = trend && trend.startsWith('+'), down = trend && trend.startsWith('−');
  return (
    // Telefonda iki sütun: kutular yan yana, sayfa kısa kalır.
    <View style={{ flexGrow: 1, flexBasis: phone ? '46%' : 200, minWidth: 0, backgroundColor: c.surface, borderRadius: phone ? 18 : 22, borderWidth: 1, borderColor: c.line, padding: phone ? 14 : 18, gap: phone ? 8 : 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ width: phone ? 30 : 36, height: phone ? 30 : 36, borderRadius: 10, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}><Icon name={icon} size={phone ? 15 : 18} color={fg} /></View>
        {trend ? (
          <View style={{ backgroundColor: up ? c.okBg : down ? c.badBg : c.surface2, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3 }}>
            <RNText style={{ fontFamily: fonts.bodyBold, fontSize: 12, color: up ? c.okInk : down ? c.badInk : c.muted }}>{trend}</RNText>
          </View>
        ) : null}
      </View>
      <View style={{ gap: 2 }}>
        <Text v="small" muted style={{ fontSize: phone ? 12.5 : 13.5 }}>{label}</Text>
        <RNText numberOfLines={1} style={{ fontFamily: fonts.siteBold, fontSize: phone ? 24 : 30, lineHeight: phone ? 28 : 34, letterSpacing: -0.8, color: c.ink }}>{value}</RNText>
        {sub ? <Text v="small" muted style={{ fontSize: phone ? 11.5 : 12.5 }}>{sub}</Text> : null}
      </View>
    </View>
  );
}

export const KpiGrid = ({ children }: { children: ReactNode }) => <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>{children}</View>;
