import { ReactNode } from 'react';
import { View } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { S, ui } from '../domain/state';
import { P, openReqs, newReqs, unreadMessages } from '../domain/logic';
import { can, canAny, isTeam, memberRole, roleLabel } from '../domain/team';
import { t } from '../domain/i18n';
import { toApp } from '../domain/nav';
import { PressScale, Text } from '../ui/kit';
import { fonts, radius, shadows, useBreakpoint, useColors } from '../ui/theme';
import { Icon } from './blocks';
import { Wordmark } from '../ui/Wordmark';
import { useLangTick, useStore } from './hooks';
import { OverlayProvider } from './overlays';
import OpenSplash from './OpenSplash';
import { renderSheet } from './sheets';
import { useAuth } from '../auth/auth';

type Item = { label: string; icon: string; path: string; badge?: number };
const SETTINGS = '/uygulama/ayarlar';

function items(): { tabs: Item[]; extra: Item[] } {
  if (ui.role === 'tenant') {
    const home = P(S.myHome);
    const n = home ? openReqs(home).length : 0;
    return {
      tabs: [
        { label: t('Panel'), icon: 'home', path: '/uygulama' },
        { label: t('Ödemeler'), icon: 'card', path: '/uygulama/odemeler' },
        { label: t('Talepler'), icon: 'wrench', path: '/uygulama/talepler', badge: n },
        { label: t('Mesajlar'), icon: 'chat', path: '/uygulama/mesajlar', badge: unreadMessages() },
        { label: t('Belgeler'), icon: 'doc', path: '/uygulama/belgeler' }
      ],
      extra: [{ label: t('Takvim'), icon: 'calendar', path: '/uygulama/takvim' }]
    };
  }
  const n = S.order.reduce((a: number, id: string) => a + newReqs(P(id)).length, 0);
  const team = isTeam();
  const tabs: Item[] = [
    { label: t('Portföy'), icon: 'grid', path: '/uygulama' },
    { label: t('Talepler'), icon: 'wrench', path: '/uygulama/talepler', badge: n }
  ];
  // Ekip üyesi yalnız rolünün izin verdiği sekmeleri görür (muhasebeci mesajları, personel raporu görmez).
  if (!team || canAny(S.order, 'message')) tabs.push({ label: t('Mesajlar'), icon: 'chat', path: '/uygulama/mesajlar', badge: unreadMessages(can) });
  tabs.push({ label: t('Takvim'), icon: 'calendar', path: '/uygulama/takvim' });
  if (!team || canAny(S.order, 'expense_read')) tabs.push({ label: t('Rapor'), icon: 'chart', path: '/uygulama/rapor' });
  return { tabs, extra: team ? [] : [{ label: t('Ekip'), icon: 'landlord', path: '/uygulama/ekip' }] };
}

function useActive() {
  const pathname = usePathname().replace(/\/$/, '');
  return (path: string) => (path === '/uygulama' ? pathname === '/uygulama' || pathname === '/uygulama/mulk' : pathname === path || pathname.startsWith(path + '/'));
}

function TabBar({ list }: { list: Item[] }) {
  const c = useColors();
  const router = useRouter();
  const active = useActive();
  return (
    <View accessibilityRole="tablist" style={{ flexDirection: 'row', backgroundColor: c.surface, borderWidth: 1, borderColor: c.line, borderRadius: 999, marginHorizontal: 12, marginBottom: 12, marginTop: 4, paddingVertical: 4, paddingHorizontal: 6, boxShadow: shadows.soft }}>
      {list.map((it) => {
        const on = active(it.path);
        return (
          <PressScale key={it.path} onPress={() => router.push(it.path as any)} accessibilityRole="tab" accessibilityState={{ selected: on }} scaleTo={0.92} wrapStyle={{ flex: 1 }} style={{ alignItems: 'center', gap: 3, paddingVertical: 6 }}>
            <View>
              <Icon name={it.icon} size={22} color={on ? c.accent : c.muted} />
              {it.badge ? <View style={{ position: 'absolute', top: -5, right: -10, minWidth: 17, height: 17, borderRadius: 9, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 }}><Text v="small" color={c.accentInk} style={{ fontSize: 10, lineHeight: 13, fontFamily: fonts.bodyXBold }}>{it.badge}</Text></View> : null}
            </View>
            <Text v="small" color={on ? c.accentText : c.muted} style={{ fontSize: 11, lineHeight: 14, fontFamily: on ? fonts.bodyXBold : fonts.bodyBold }}>{it.label}</Text>
          </PressScale>
        );
      })}
    </View>
  );
}

function SideNav({ list }: { list: Item[] }) {
  const c = useColors();
  const router = useRouter();
  const { user } = useAuth();
  const active = useActive();
  return (
    <View style={{ width: 272, backgroundColor: c.surface, borderWidth: 1, borderColor: c.line, borderRadius: 32, margin: 14, padding: 22, gap: 6 }}>
      <PressScale onPress={() => router.push('/' as any)} accessibilityRole="link" accessibilityLabel={t('Ana sayfa')} style={{ marginBottom: 18, alignSelf: 'flex-start' }}><Wordmark size={30} /></PressScale>
      {list.map((it) => {
        const on = active(it.path);
        return (
          <PressScale key={it.path} onPress={() => router.push(it.path as any)} accessibilityRole="link" accessibilityState={{ selected: on }} scaleTo={0.98}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, minHeight: 48, borderRadius: radius.pill, backgroundColor: on ? c.accentSoft : 'transparent' }}>
            <Icon name={it.icon} size={19} color={on ? c.accent : c.muted} />
            <Text v="small" color={on ? c.accentText : c.ink} style={{ flex: 1, fontFamily: fonts.bodyXBold }}>{it.label}</Text>
            {it.badge ? <Text v="small" color={c.accent} style={{ fontFamily: fonts.bodyXBold }}>{it.badge}</Text> : null}
          </PressScale>
        );
      })}
      <View style={{ flex: 1 }} />
      {/* Hesap kartı: ad, rol ve ayarlar (kiracı, mülk sahibi ve ekip üyesi için aynı). */}
      <PressScale onPress={() => router.push('/uygulama/ayarlar' as any)} accessibilityRole="link" accessibilityLabel={t('Ayarlar')} accessibilityState={{ selected: active(SETTINGS) }} scaleTo={0.98}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 20, backgroundColor: active(SETTINGS) ? c.accentSoft : c.tile }}>
        <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' }}>
          <Text v="small" color={c.accentInk} style={{ fontFamily: fonts.bodyXBold, fontSize: 15 }}>{(user?.name || user?.email || '?').trim().charAt(0).toLocaleUpperCase('tr')}</Text>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text v="small" numberOfLines={1} style={{ fontFamily: fonts.bodyXBold }}>{user?.name || user?.email}</Text>
          <Text v="small" muted numberOfLines={1} style={{ fontSize: 12.5 }}>{isTeam() ? (S.order.length ? roleLabel(memberRole(S.order[0])) : t('Ekip üyesi')) : ui.role === 'landlord' ? t('Mülk sahibi') : t('Kiracı')}</Text>
        </View>
        <Icon name="gear" size={18} color={active(SETTINGS) ? c.accent : c.muted} />
      </PressScale>
    </View>
  );
}

export default function AppShell({ children }: { children: ReactNode }) {
  useStore();
  useLangTick();
  const { desktop } = useBreakpoint();
  const c = useColors();
  const { tabs, extra } = items();
  return (
    <OverlayProvider renderSheet={renderSheet}>
      <View style={{ flex: 1, flexDirection: 'row', backgroundColor: c.bg }}>
        {desktop && <SideNav list={[...tabs, ...extra, { label: t('Ayarlar'), icon: 'gear', path: SETTINGS }]} />}
        <View style={{ flex: 1 }}>
          <View style={{ flex: 1 }}>{children}</View>
          {!desktop && <TabBar list={tabs} />}
        </View>
      </View>
      <OpenSplash />
    </OverlayProvider>
  );
}
