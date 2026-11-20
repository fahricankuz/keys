/* Yönetici paneli tasarım parçaları (tanıtım sitesinin dilinden): koyu yan menü, bölüm başlığı,
   renkli simgeli gösterge kutusu ve grup başlığı. */
import { createContext, ReactNode, useContext, useState } from 'react';
import { Platform, ScrollView, Text as RNText, View } from 'react-native';
import { useRouter } from 'expo-router';
import { t } from '../domain/i18n';
import { AdminUI, Button, Chip, PressScale, Text } from '../ui/kit';
import { Wordmark } from '../ui/Wordmark';
import { fonts, radius, useBreakpoint, useColors } from '../ui/theme';
import { useInsets } from '../ui/safe-area';
import { Icon } from './blocks';
import { useStore } from './hooks';
import { S, setTheme } from '../domain/state';

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

/** Panel çerçevesi bilgisi: bildirim zili (açık şikâyet + hukuki talep) sayfa başlığında gösterilir. */
type Chrome = { alerts: number; onAlerts: () => void };
const AdminChrome = createContext<Chrome | null>(null);

/** Bildirim zili: bekleyen iş varsa kırmızı nokta; dokununca ilgili bölüme gider. */
function Bell({ chrome }: { chrome: Chrome }) {
  const c = useColors();
  const label = chrome.alerts ? t('Bildirimler ({n})', { n: chrome.alerts }) : t('Bildirimler');
  return (
    <PressScale onPress={chrome.onAlerts} accessibilityRole="button" accessibilityLabel={label} scaleTo={0.92}
      style={{ width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: c.surface, borderWidth: 1, borderColor: c.line }}>
      <Icon name="bell" size={19} color={c.muted} />
      {chrome.alerts ? <View style={{ position: 'absolute', top: 9, right: 10, width: 9, height: 9, borderRadius: 5, backgroundColor: c.accent, borderWidth: 1.5, borderColor: c.surface }} /> : null}
    </PressScale>
  );
}

/** Tema seçici (açık / koyu); seçim bu cihazda hatırlanır (ayarlardaki tema ile aynı). */
function ThemeToggle({ onDark }: { onDark?: boolean }) {
  const c = useColors();
  useStore();
  const dark = S.theme === 'dark';
  return (
    <PressScale onPress={() => setTheme(dark ? 'light' : 'dark')} accessibilityRole="button" accessibilityLabel={dark ? t('Açık temaya geç') : t('Koyu temaya geç')} scaleTo={0.92}
      style={{ width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: onDark ? 'rgba(250,245,240,0.12)' : c.line }}>
      <Icon name={dark ? 'sun' : 'moon'} size={16} color={onDark ? c.heroMuted : c.muted} />
    </PressScale>
  );
}

const Badge = ({ n }: { n: number }) => {
  const c = useColors();
  return (
    <View style={{ minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 6, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' }}>
      <RNText style={{ fontFamily: fonts.bodyXBold, fontSize: 11, color: '#FAF5F0' }}>{n}</RNText>
    </View>
  );
};

/** Telefon sekmeleri: ilk dört grup birer sekme; kalan gruplar (Sistem) ve hesap işlemleri "Diğer"de. */
const TAB_ICONS = ['grid', 'landlord', 'chat', 'safe'];

/** Masaüstünde koyu yan menü; telefonda (iPhone düzeni) üst çubuk, grup içi çipler ve alt sekme çubuğu. İçerik sağda / ortada. */
export function AdminShell({ items, active, onPick, email, onReload, onSignOut, busy, alerts = 0, onAlerts, children }: {
  items: NavItem[]; active: string; onPick: (k: string) => void; email?: string;
  onReload: () => void; onSignOut: () => void; busy?: boolean; alerts?: number; onAlerts?: () => void; children: ReactNode;
}) {
  const c = useColors();
  const router = useRouter();
  const { desktop } = useBreakpoint();
  const insets = useInsets();
  const [more, setMore] = useState(false);
  // Kapalı menü grupları tarayıcıda hatırlanır; açık sayfanın grubu her zaman açıktır.
  const [closed, setClosed] = useState<string[]>(readClosed);
  const toggle = (name: string) => setClosed((x) => { const v = x.includes(name) ? x.filter((y) => y !== name) : [...x, name]; writeClosed(v); return v; });
  const chrome: Chrome = { alerts, onAlerts: onAlerts || (() => {}) };
  const groups = groupsOf(items);
  const content = <AdminUI.Provider value={true}><AdminChrome.Provider value={chrome}>{children}</AdminChrome.Provider></AdminUI.Provider>;
  const initial = (email || 'Y').slice(0, 1).toUpperCase();

  if (!desktop) {
    const tabs = groups.slice(0, 4);
    const rest = groups.slice(4);
    const curGroup = groups.find((g) => g.items.some((x) => x.key === active)) || groups[0];
    const inRest = rest.includes(curGroup);
    const pick = (k: string) => { setMore(false); onPick(k); };
    const tabBtn = (key: string, label: string, icon: string, on: boolean, badge: number, press: () => void) => (
      <PressScale key={key} onPress={press} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={label + (badge ? ' (' + badge + ')' : '')} scaleTo={0.94}
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3, minHeight: 50 }}>
        <View>
          <Icon name={icon} size={23} color={on ? c.accent : c.muted} />
          {badge ? <View style={{ position: 'absolute', top: -5, right: -10 }}><Badge n={badge} /></View> : null}
        </View>
        <RNText numberOfLines={1} style={{ fontFamily: on ? fonts.bodyXBold : fonts.bodyMedium, fontSize: 10.5, color: on ? c.accent : c.muted }}>{label}</RNText>
      </PressScale>
    );
    return (
      <View style={{ flex: 1, backgroundColor: c.bg }}>
        <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 16, paddingBottom: 6, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: c.bg }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <PressScale onPress={() => router.push('/' as any)} accessibilityRole="link" accessibilityLabel={t('Ana sayfa')}><Wordmark size={19} /></PressScale>
            <Chip tone="warn" label={t('Yönetici')} />
          </View>
          <Bell chrome={chrome} />
        </View>
        {more ? (
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 110 + insets.bottom, gap: 16 }}>
            <RNText style={{ fontFamily: fonts.siteBold, fontSize: 32, lineHeight: 36, letterSpacing: -0.8, color: c.ink }}>{t('Diğer')}</RNText>
            {groups.map((g) => (
              <View key={g.name || '_'} style={{ gap: 8 }}>
                {g.name ? <RNText style={{ fontFamily: fonts.bodyBold, fontSize: 12, letterSpacing: 0.8, textTransform: 'uppercase', color: c.muted, paddingHorizontal: 4 }}>{g.name}</RNText> : null}
                <View style={{ backgroundColor: c.surface, borderRadius: 20, borderWidth: 1, borderColor: c.line, overflow: 'hidden' }}>
                  {g.items.map((it, i) => (
                    <PressScale key={it.key} onPress={() => pick(it.key)} accessibilityRole="button" accessibilityLabel={it.label + (it.badge ? ' (' + it.badge + ')' : '')} scaleTo={0.99}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, minHeight: 52, borderTopWidth: i ? 1 : 0, borderTopColor: c.line }}>
                      <View style={{ width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: c.accentSoft }}><Icon name={it.icon} size={16} color={c.accent} /></View>
                      <RNText style={{ flex: 1, fontFamily: fonts.bodyMedium, fontSize: 15.5, color: c.ink }}>{it.label}</RNText>
                      {it.badge ? <Badge n={it.badge} /> : null}
                      <Icon name="chev" size={16} color={c.muted} />
                    </PressScale>
                  ))}
                </View>
              </View>
            ))}
            <View style={{ backgroundColor: c.surface, borderRadius: 20, borderWidth: 1, borderColor: c.line, padding: 14, gap: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' }}><RNText style={{ fontFamily: fonts.siteBold, fontSize: 17, color: '#FAF5F0' }}>{initial}</RNText></View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <RNText style={{ fontFamily: fonts.bodyXBold, fontSize: 15, color: c.ink }}>{t('Yönetici')}</RNText>
                  {email ? <RNText numberOfLines={1} style={{ fontFamily: fonts.body, fontSize: 13, color: c.muted }}>{email}</RNText> : null}
                </View>
                <ThemeToggle />
              </View>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Button kind="ghost" title={t('Yenile')} onPress={onReload} loading={busy} style={{ flex: 1, minHeight: 44 }} />
                <Button kind="ghost" title={t('Çıkış yap')} onPress={onSignOut} style={{ flex: 1, minHeight: 44 }} />
              </View>
            </View>
          </ScrollView>
        ) : (
          <ScrollView contentContainerStyle={{ paddingBottom: 110 + insets.bottom }}>
            {curGroup.items.length > 1 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingVertical: 8 }}>
                {curGroup.items.map((it) => {
                  const on = it.key === active;
                  return (
                    <PressScale key={it.key} onPress={() => pick(it.key)} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={it.label + (it.badge ? ' (' + it.badge + ')' : '')} scaleTo={0.96}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, minHeight: 38, borderRadius: radius.pill, backgroundColor: on ? c.ink : c.surface, borderWidth: 1, borderColor: on ? c.ink : c.line }}>
                      <RNText style={{ fontFamily: fonts.bodyBold, fontSize: 13.5, color: on ? c.bg : c.muted }}>{it.label}</RNText>
                      {it.badge ? <Badge n={it.badge} /> : null}
                    </PressScale>
                  );
                })}
              </ScrollView>
            ) : null}
            <View style={{ paddingHorizontal: 16, paddingTop: 6 }}>{content}</View>
          </ScrollView>
        )}
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingBottom: Math.max(insets.bottom, 8), paddingTop: 6, flexDirection: 'row', backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: c.line }}>
          {tabs.map((g, i) => tabBtn(g.name || '_' + i, g.name, TAB_ICONS[i] || g.items[0].icon, !more && g === curGroup, g.items.reduce((a, x) => a + (x.badge || 0), 0), () => pick(g.items[0].key)))}
          {tabBtn('more', t('Diğer'), 'dots', more || inRest, rest.reduce((a, g) => a + g.items.reduce((b, x) => b + (x.badge || 0), 0), 0), () => setMore(true))}
        </View>
      </View>
    );
  }
  return (
    <View style={{ flex: 1, flexDirection: 'row', backgroundColor: c.bg }}>
      {/* Yan menü ekran yüksekliğine sığar: bölümler kendi içinde kayar, hesap ve çıkış düğmeleri altta sabit kalır (Safari dahil). */}
      <View style={{ width: 264, backgroundColor: c.deepA, paddingTop: 26, paddingBottom: 16, paddingHorizontal: 14, minHeight: 0, borderRightWidth: 1, borderRightColor: 'rgba(250,245,240,0.06)' }}>
        <ScrollView style={{ flex: 1, minHeight: 0 }} contentContainerStyle={{ gap: 22, paddingBottom: 30 }} showsVerticalScrollIndicator={false}>
          <View style={{ gap: 12, paddingHorizontal: 10 }}>
            <PressScale onPress={() => router.push('/' as any)} accessibilityRole="link" accessibilityLabel={t('Ana sayfa')} style={{ alignSelf: 'flex-start' }}><Wordmark size={26} variant="cream" bg={c.deepA} /></PressScale>
            <View style={{ alignSelf: 'flex-start' }}><Chip tone="warn" label={t('Yönetici paneli')} /></View>
          </View>
          <View style={{ gap: 14 }} role="navigation" aria-label={t('Yönetici bölümleri')}>
            {groups.map((g) => {
              const hasActive = g.items.some((x) => x.key === active);
              const open = !g.name || hasActive || !closed.includes(g.name);
              const badge = g.items.reduce((a, x) => a + (x.badge || 0), 0);
              return (
                <View key={g.name || '_'} style={{ gap: 2 }}>
                  {g.name ? (
                    <PressScale onPress={() => toggle(g.name)} accessibilityRole="button" aria-expanded={open} accessibilityLabel={g.name} scaleTo={0.99}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 4 }}>
                      <RNText style={{ flex: 1, fontFamily: fonts.bodyBold, fontSize: 11, letterSpacing: 0.9, textTransform: 'uppercase', color: '#8C807A' }}>{g.name}</RNText>
                      {!open && badge ? <Badge n={badge} /> : null}
                      <RNText style={{ fontSize: 11, color: '#8C807A' }}>{open ? '▾' : '▸'}</RNText>
                    </PressScale>
                  ) : null}
                  {open ? g.items.map((it) => {
                    const on = it.key === active;
                    return (
                      <PressScale key={it.key} onPress={() => onPick(it.key)} accessibilityRole="button" accessibilityState={{ selected: on }} scaleTo={0.98}
                        accessibilityLabel={it.label + (it.badge ? ' (' + it.badge + ')' : '')}
                        style={[{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, minHeight: 40, borderRadius: 13, backgroundColor: on ? 'rgba(216,64,61,0.16)' : 'transparent' },
                          on ? (Platform.OS === 'web' ? ({ boxShadow: 'inset 3px 0 0 #D8403D' } as any) : { borderLeftWidth: 3, borderLeftColor: '#D8403D' }) : null]}>
                        <Icon name={it.icon} size={17} color={on ? '#F28C86' : c.heroMuted} />
                        <RNText style={{ flex: 1, fontFamily: on ? fonts.bodyXBold : fonts.bodyMedium, fontSize: 14, color: on ? c.heroInk : c.heroMuted }}>{it.label}</RNText>
                        {it.badge ? <Badge n={it.badge} /> : null}
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
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 4, paddingTop: 12, flexShrink: 0, borderTopWidth: 1, borderTopColor: 'rgba(250,245,240,0.10)' }}>
          <View style={{ width: 32, height: 32, borderRadius: 11, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' }}><RNText style={{ fontFamily: fonts.siteBold, fontSize: 16, color: '#FAF5F0' }}>{initial}</RNText></View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <RNText numberOfLines={1} style={{ fontFamily: fonts.bodyXBold, fontSize: 13.5, color: c.heroInk }}>{t('Yönetici')}</RNText>
            {email ? <RNText numberOfLines={1} style={{ fontFamily: fonts.body, fontSize: 11.5, color: c.heroMuted }}>{email}</RNText> : null}
          </View>
          <ThemeToggle onDark />
          <PressScale onPress={onReload} accessibilityRole="button" accessibilityLabel={t('Yenile')} disabled={busy} scaleTo={0.92}
            style={{ width: 32, height: 32, borderRadius: 11, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(250,245,240,0.12)', opacity: busy ? 0.5 : 1 }}>
            <Icon name="refresh" size={15} color={c.heroMuted} />
          </PressScale>
          <PressScale onPress={onSignOut} accessibilityRole="button" accessibilityLabel={t('Çıkış yap')} scaleTo={0.92}
            style={{ width: 32, height: 32, borderRadius: 11, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(250,245,240,0.12)' }}>
            <Icon name="logout" size={15} color={c.heroMuted} />
          </PressScale>
        </View>
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 40, paddingVertical: 32, paddingBottom: 80 }}>
        <View style={{ width: '100%', maxWidth: 1240, alignSelf: 'center' }}>{content}</View>
      </ScrollView>
    </View>
  );
}

/** Bölüm başlığı: kırmızı küçük etiket, büyük başlık, açıklama; sağda isteğe bağlı araçlar ve (masaüstünde) bildirim zili. */
export function PageHead({ label, title, sub, right }: { label?: string; title: string; sub?: string; right?: ReactNode }) {
  const c = useColors();
  const { phone, desktop } = useBreakpoint();
  const chrome = useContext(AdminChrome);
  const bell = desktop && chrome ? <Bell chrome={chrome} /> : null;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 14, marginBottom: phone ? 14 : 22 }}>
      <View style={{ flex: 1, minWidth: 240, gap: 4 }}>
        {label ? <Text v="label" color={c.accentText} style={{ fontSize: 12.5, letterSpacing: 0.4 }}>{label}</Text> : null}
        <RNText role="heading" aria-level={1} style={{ fontFamily: fonts.siteBold, fontSize: phone ? 32 : 40, lineHeight: phone ? 36 : 44, letterSpacing: phone ? -0.8 : -1.3, color: c.ink }}>{title}</RNText>
        {sub ? <Text v="small" muted style={{ fontSize: phone ? 13.5 : 14.5, lineHeight: phone ? 19 : 21 }}>{sub}</Text> : null}
      </View>
      {right || bell ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>{right}{bell}</View> : null}
    </View>
  );
}

/** Grup başlığı (Büyüme, Gelir, …). */
export function GroupTitle({ children }: { children: string }) {
  const c = useColors();
  return <RNText style={{ fontFamily: fonts.siteBold, fontSize: 19, color: c.ink, letterSpacing: -0.3, marginTop: 8 }}>{children}</RNText>;
}

export type Tone = 'peach' | 'butter' | 'sage' | 'sky' | 'ink';
/** Simge kutusu renkleri: açık ve koyu temada okunur (temanın yumuşak tonları). */
function toneOf(c: ReturnType<typeof useColors>, tone: Tone): [string, string] {
  const dark = c.bg !== '#FAF5F0';
  switch (tone) {
    case 'peach': return [c.accentSoft, c.accentText];
    case 'butter': return dark ? ['rgba(242,181,68,0.16)', '#F2B544'] : ['#FBEBC8', '#6B4A00'];
    case 'sage': return dark ? ['rgba(127,196,149,0.15)', '#7FC495'] : ['#D5EBD7', '#2A6B3A'];
    case 'ink': return [c.ink, c.bg];
    default: return dark ? ['rgba(242,140,134,0.14)', '#F28C86'] : ['#F7E4DF', '#A8231F'];
  }
}

/** Gösterge kutusu: renkli simge, sağ üstte değişim rozeti, büyük değer, etiket ve alt bilgi. */
export function Kpi({ icon, tone = 'sky', label, value, sub, trend }: { icon: string; tone?: Tone; label: string; value: string; sub?: string; trend?: string }) {
  const c = useColors();
  const { phone } = useBreakpoint();
  const [bg, fg] = toneOf(c, tone);
  const up = trend && trend.startsWith('+'), down = trend && trend.startsWith('−');
  const dark = c.bg !== '#FAF5F0';
  const upBg = dark ? 'rgba(127,196,149,0.15)' : c.okBg, upFg = dark ? '#7FC495' : c.okInk;
  const dnBg = dark ? 'rgba(242,140,134,0.15)' : c.badBg, dnFg = dark ? '#F28C86' : c.badInk;
  return (
    // Telefonda iki sütun: kutular yan yana, sayfa kısa kalır.
    <View style={{ flexGrow: 1, flexBasis: phone ? '46%' : 200, minWidth: 0, backgroundColor: c.surface, borderRadius: phone ? 20 : 24, borderWidth: 1, borderColor: c.line, padding: phone ? 14 : 20, gap: phone ? 10 : 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ width: phone ? 34 : 42, height: phone ? 34 : 42, borderRadius: phone ? 11 : 13, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}><Icon name={icon} size={phone ? 16 : 19} color={fg} /></View>
        {trend ? (
          <View style={{ backgroundColor: up ? upBg : down ? dnBg : c.surface2, borderRadius: radius.pill, paddingHorizontal: 9, paddingVertical: 3 }}>
            <RNText style={{ fontFamily: fonts.bodyBold, fontSize: 12, color: up ? upFg : down ? dnFg : c.muted }}>{up ? '▲ ' + trend.slice(1) : down ? '▼ ' + trend.slice(1) : trend}</RNText>
          </View>
        ) : null}
      </View>
      <View style={{ gap: 2 }}>
        <RNText numberOfLines={1} style={{ fontFamily: fonts.siteBold, fontSize: phone ? 24 : 32, lineHeight: phone ? 28 : 36, letterSpacing: -0.9, color: c.ink }}>{value}</RNText>
        <Text v="small" style={{ fontSize: phone ? 12.5 : 14, fontFamily: fonts.bodyBold }}>{label}</Text>
        {sub ? <Text v="small" muted style={{ fontSize: phone ? 11.5 : 12.5 }}>{sub}</Text> : null}
      </View>
    </View>
  );
}

export const KpiGrid = ({ children }: { children: ReactNode }) => <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>{children}</View>;
