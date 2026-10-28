/* Mülk adresi alanları: ülke, il, ilçe, mahalle listeden (aranabilir); sokak, numara ve tarif elle. */
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, TextInput, View } from 'react-native';
import { t } from '../domain/i18n';
import { CITIES, COUNTRIES, districtsOf, cityCodeOf, hoodsOf } from '../domain/address';
import { Field, PressScale, Text } from '../ui/kit';
import { fonts, radius, useColors } from '../ui/theme';
import { Icon } from './blocks';

const lower = (s: string) => s.toLocaleLowerCase('tr');

/** Aranabilir seçim alanı. `free` açıksa listede olmayan bir değer yazılıp seçilebilir. */
function Pick({ label, value, options, onPick, disabled, placeholder, free, loading }: {
  label: string; value: string; options: string[]; onPick: (v: string) => void; disabled?: boolean; placeholder?: string; free?: boolean; loading?: boolean;
}) {
  const c = useColors();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const list = useMemo(() => { const k = lower(q.trim()); return (k ? options.filter((o) => lower(o).includes(k)) : options).slice(0, 200); }, [q, options]);
  const choose = (v: string) => { onPick(v); setOpen(false); setQ(''); };
  return (
    <View style={{ gap: 8 }}>
      <Text v="small" style={{ fontFamily: fonts.bodyBold }}>{label}</Text>
      <PressScale onPress={() => !disabled && setOpen(!open)} accessibilityRole="button" accessibilityLabel={label + (value ? ': ' + value : '')} aria-expanded={open} disabled={disabled} scaleTo={0.99}
        style={{ minHeight: 52, borderRadius: radius.md, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: disabled ? c.tile : c.surface,
          borderWidth: 1.5, borderColor: open ? c.accent : c.line, opacity: disabled ? 0.6 : 1 }}>
        <Text v="body" color={value ? c.ink : c.muted} numberOfLines={1} style={{ flex: 1 }}>{value || placeholder || t('Seç')}</Text>
        <Text v="small" muted>{loading ? '…' : open ? '▴' : '▾'}</Text>
      </PressScale>
      {open ? (
        <View style={{ borderRadius: radius.md, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface, overflow: 'hidden' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, borderBottomWidth: 1, borderColor: c.line }}>
            <Icon name="search" size={16} color={c.muted} />
            <TextInput autoFocus value={q} onChangeText={setQ} placeholder={t('Ara')} placeholderTextColor={c.muted} accessibilityLabel={label + ' ' + t('ara')}
              onSubmitEditing={() => { if (list[0]) choose(list[0]); else if (free && q.trim()) choose(q.trim()); }}
              style={[{ flex: 1, minHeight: 44, color: c.ink, fontFamily: fonts.body, fontSize: 15 }, { outlineStyle: 'none' } as any]} />
          </View>
          <ScrollView style={{ maxHeight: 240 }} nestedScrollEnabled keyboardShouldPersistTaps="handled">
            {list.map((o) => (
              <PressScale key={o} onPress={() => choose(o)} accessibilityRole="button" scaleTo={0.99}
                style={{ paddingHorizontal: 16, paddingVertical: 11, backgroundColor: o === value ? c.accentSoft : 'transparent' }}>
                <Text v="small" style={{ fontFamily: o === value ? fonts.bodyXBold : fonts.body }}>{o}</Text>
              </PressScale>
            ))}
            {free && q.trim() && !options.some((o) => lower(o) === lower(q.trim())) ? (
              <PressScale onPress={() => choose(q.trim())} accessibilityRole="button" style={{ paddingHorizontal: 16, paddingVertical: 11 }}>
                <Text v="small" color={c.accentText} style={{ fontFamily: fonts.bodyBold }}>{t('Listede yok, “{v}” olarak kullan', { v: q.trim() })}</Text>
              </PressScale>
            ) : null}
            {!list.length && !(free && q.trim()) ? <Text v="small" muted style={{ padding: 16 }}>{t('Sonuç yok.')}</Text> : null}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}

export type Address = { country: string; city: string; district: string; hood: string; street: string; no: string; unit: string; note: string };

export function AddressFields({ value: a, onChange }: { value: Address; onChange: (a: Address) => void }) {
  const set = (patch: Partial<Address>) => onChange({ ...a, ...patch });
  const tr = a.country === 'Türkiye';
  const code = tr ? cityCodeOf(a.city) : '';
  const [hoods, setHoods] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    let live = true;
    if (!code) { setHoods({}); return; }
    setLoading(true);
    hoodsOf(code).then((h: any) => { if (live) { setHoods(h || {}); setLoading(false); } });
    return () => { live = false; };
  }, [code]);
  const half = { flexGrow: 1, flexBasis: 150 } as const;
  return (
    <View style={{ gap: 14 }}>
      <Pick label={t('Ülke')} value={a.country} options={COUNTRIES} onPick={(v) => set({ country: v, city: '', district: '', hood: '' })} free />
      {tr ? (
        <>
          <Pick label={t('İl')} value={a.city} options={CITIES.map((x: any) => x.name)} onPick={(v) => set({ city: v, district: '', hood: '' })} />
          <Pick label={t('İlçe')} value={a.district} options={districtsOf(code)} disabled={!a.city} placeholder={a.city ? t('Seç') : t('Önce il seç')} onPick={(v) => set({ district: v, hood: '' })} />
          <Pick label={t('Mahalle')} value={a.hood} options={hoods[a.district] || []} disabled={!a.district} loading={loading} free
            placeholder={a.district ? t('Seç ya da yaz') : t('Önce ilçe seç')} onPick={(v) => set({ hood: v })} />
        </>
      ) : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
          <View style={half}><Field label={t('Şehir')} value={a.city} onChangeText={(v) => set({ city: v })} maxLength={80} /></View>
          <View style={half}><Field label={t('İlçe / bölge')} value={a.district} onChangeText={(v) => set({ district: v })} maxLength={80} /></View>
        </View>
      )}
      <Field label={t('Cadde / sokak')} value={a.street} onChangeText={(v) => set({ street: v })} maxLength={120} placeholder={t('Ör. Moda Cd.')} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        <View style={half}><Field label={t('Bina no')} value={a.no} onChangeText={(v) => set({ no: v })} maxLength={12} /></View>
        <View style={half}><Field label={t('Daire / kat')} value={a.unit} onChangeText={(v) => set({ unit: v })} maxLength={20} /></View>
      </View>
      <Field label={t('Adres tarifi (isteğe bağlı)')} value={a.note} onChangeText={(v) => set({ note: v })} maxLength={200} placeholder={t('Ör. site adı, blok, giriş')} />
    </View>
  );
}
