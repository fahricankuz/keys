/* Rol seçici: aynı e-postaya bağlı birden çok rol (mülk sahibi, kiracı, site/portföy yöneticisi) arasında geçiş.
   Giriş sonrası "anahtar" yazısının altında, menünün üstünde durur (telefonda sayfanın en üstünde). Rolün yanında paketi ya da
   bağlı yeri yazar. En az iki rol yoksa görünmez. Seçim paneli, menüyü ve sayfayı seçilen role göre günceller (bkz. ctx.ts). */
import { useEffect, useState } from 'react';
import { Text as RNText, View } from 'react-native';
import { useRouter } from 'expo-router';
import { t } from '../domain/i18n';
import { fonts, radius, useColors } from '../ui/theme';
import { PressScale } from '../ui/kit';
import { Icon } from './blocks';
import { activeCtx, myContexts, restoreCtx, selectCtx } from './ctx';

export function RoleSwitcher({ compact }: { compact?: boolean }) {
  const c = useColors();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const list = myContexts();
  useEffect(() => { restoreCtx(); });
  if (list.length < 2) return null;
  const key = activeCtx(list);
  const cur = list.find((x) => x.key === key) || list[0];
  const pick = (k: string) => { setOpen(false); if (k !== key) router.replace(selectCtx(k) as any); };
  return (
    <View style={{ marginBottom: compact ? 0 : 16, zIndex: 5 }}>
      <RNText style={{ fontFamily: fonts.bodyBold, fontSize: 11, letterSpacing: 0.6, color: c.muted, marginBottom: 6, marginLeft: 4, textTransform: 'uppercase' }}>{t('Kullandığın hesap')}</RNText>
      <PressScale onPress={() => setOpen(!open)} accessibilityRole="button" accessibilityLabel={t('Rol seç') + ': ' + cur.label} accessibilityState={{ expanded: open }} scaleTo={0.99}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: radius.md, backgroundColor: c.tile, borderWidth: 1.5, borderColor: open ? c.accent : c.line }}>
        <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center' }}><Icon name={cur.icon} size={17} color={c.accent} /></View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <RNText numberOfLines={1} style={{ fontFamily: fonts.bodyXBold, fontSize: 14, color: c.ink }}>{cur.label}</RNText>
          {cur.sub ? <RNText numberOfLines={1} style={{ fontFamily: fonts.body, fontSize: 12, color: c.muted }}>{cur.sub}</RNText> : null}
        </View>
        <RNText style={{ fontFamily: fonts.bodyXBold, fontSize: 14, color: c.muted }}>{open ? '▴' : '▾'}</RNText>
      </PressScale>
      {open ? (
        <View accessibilityRole="menu" style={{ marginTop: 6, padding: 6, borderRadius: radius.md, backgroundColor: c.surface, borderWidth: 1, borderColor: c.line, gap: 2 }}>
          {list.map((x) => {
            const on = x.key === cur.key;
            return (
              <PressScale key={x.key} onPress={() => pick(x.key)} accessibilityRole="menuitem" accessibilityLabel={x.label + (x.sub ? ', ' + x.sub : '')} accessibilityState={{ selected: on }} scaleTo={0.99}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 14, backgroundColor: on ? c.accentSoft : 'transparent' }}>
                <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: on ? c.accent : c.tile, alignItems: 'center', justifyContent: 'center' }}><Icon name={x.icon} size={15} color={on ? c.accentInk : c.muted} /></View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <RNText numberOfLines={1} style={{ fontFamily: fonts.bodyXBold, fontSize: 13.5, color: on ? c.accentText : c.ink }}>{x.label}</RNText>
                  {x.sub ? <RNText numberOfLines={1} style={{ fontFamily: fonts.body, fontSize: 11.5, color: c.muted }}>{x.sub}</RNText> : null}
                </View>
                {on ? <Icon name="check" size={16} color={c.accent} /> : null}
              </PressScale>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}
