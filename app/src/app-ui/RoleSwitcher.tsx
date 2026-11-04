/* ÖNİZLEME (yayınlanmadı): aynı e-postaya bağlı birden çok rol/paket arasında geçiş. Giriş sonrası "anahtar" yazısının altında,
   menünün üstünde durur; seçim sayfayı ve paneli seçilen role göre günceller. Burada örnek veriyle gösterilir. */
import { useState } from 'react';
import { Text as RNText, View } from 'react-native';
import { fonts, radius, useColors } from '../ui/theme';
import { PressScale } from '../ui/kit';
import { Icon } from './blocks';

export type Ctx = { key: string; label: string; sub: string; icon: string };
export const DEMO_CTX: Ctx[] = [
  { key: 'ev', label: 'Mülk sahibi', sub: '3 mülk · Başlangıç paketi', icon: 'landlord' },
  { key: 'kiraci', label: 'Kiracı', sub: 'Moda Dairesi', icon: 'home' },
  { key: 'site', label: 'Site yöneticisi', sub: 'Atakum Sitesi', icon: 'grid' }
];

export function RoleSwitcher({ active, compact, startOpen }: { active: string; compact?: boolean; startOpen?: boolean }) {
  const c = useColors();
  const [open, setOpen] = useState(!!startOpen);
  const cur = DEMO_CTX.find((x) => x.key === active) || DEMO_CTX[0];
  return (
    <View style={{ marginBottom: compact ? 0 : 16, zIndex: 5 }}>
      <RNText style={{ fontFamily: fonts.bodyBold, fontSize: 11, letterSpacing: 0.6, color: c.muted, marginBottom: 6, marginLeft: 4, textTransform: 'uppercase' }}>Kullandığın hesap</RNText>
      <PressScale onPress={() => setOpen(!open)} accessibilityRole="button" accessibilityLabel={'Rol seç: ' + cur.label} scaleTo={0.99}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: radius.md, backgroundColor: c.tile, borderWidth: 1.5, borderColor: open ? c.accent : c.line }}>
        <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center' }}><Icon name={cur.icon} size={17} color={c.accent} /></View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <RNText numberOfLines={1} style={{ fontFamily: fonts.bodyXBold, fontSize: 14, color: c.ink }}>{cur.label}</RNText>
          <RNText numberOfLines={1} style={{ fontFamily: fonts.body, fontSize: 12, color: c.muted }}>{cur.sub}</RNText>
        </View>
        <RNText style={{ fontFamily: fonts.bodyXBold, fontSize: 14, color: c.muted }}>{open ? '▴' : '▾'}</RNText>
      </PressScale>
      {open ? (
        <View style={{ marginTop: 6, padding: 6, borderRadius: radius.md, backgroundColor: c.surface, borderWidth: 1, borderColor: c.line, gap: 2 }}>
          {DEMO_CTX.map((x) => {
            const on = x.key === cur.key;
            return (
              <PressScale key={x.key} onPress={() => setOpen(false)} accessibilityRole="button" accessibilityState={{ selected: on }} scaleTo={0.99}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 14, backgroundColor: on ? c.accentSoft : 'transparent' }}>
                <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: on ? c.accent : c.tile, alignItems: 'center', justifyContent: 'center' }}><Icon name={x.icon} size={15} color={on ? c.accentInk : c.muted} /></View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <RNText numberOfLines={1} style={{ fontFamily: fonts.bodyXBold, fontSize: 13.5, color: on ? c.accentText : c.ink }}>{x.label}</RNText>
                  <RNText numberOfLines={1} style={{ fontFamily: fonts.body, fontSize: 11.5, color: c.muted }}>{x.sub}</RNText>
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

/** Önizleme açık mı? Adrese ?rol-onizleme=1 (açık liste için =2) eklenince. */
export function previewMode(): 0 | 1 | 2 {
  if (typeof window === 'undefined') return 0;
  const m = /rol-onizleme=(\d)/.exec(window.location.search);
  return m ? (m[1] === '2' ? 2 : 1) : 0;
}
