import { ReactNode, useState } from 'react';
import { Platform, TextInput, View } from 'react-native';
import { t } from '../domain/i18n';
import { Button, Field, PressScale, Text } from '../ui/kit';
import { fonts, radius, useColors } from '../ui/theme';
import { Icon, Muted, Row } from './blocks';
import { Picked, pickDocument, pickImages, takePhoto } from './media';

export type Vals = Record<string, any>;

/** Form durumu: değerler tek nesnede; alan başına küçük bir bağlayıcı. */
export function useVals(initial: Vals) {
  const [v, setV] = useState<Vals>(initial);
  const set = (k: string, x: any) => setV((s) => ({ ...s, [k]: x }));
  return { v, set, setV };
}

export function Title({ children }: { children: ReactNode }) {
  return <Text v="h2">{children}</Text>;
}

export function Text2({ label, v, set, k, ...rest }: { label: string; v: Vals; set: (k: string, x: any) => void; k: string } & Record<string, any>) {
  return <Field label={label} value={String(v[k] ?? '')} onChangeText={(x) => set(k, x)} {...rest} />;
}

export function NumField({ label, v, set, k, hint }: { label: string; v: Vals; set: (k: string, x: any) => void; k: string; hint?: string }) {
  return <Field label={label} hint={hint} value={String(v[k] ?? '')} keyboardType="numeric" inputMode="numeric"
    onChangeText={(x) => set(k, x.replace(/[^0-9.,]/g, '').replace(',', '.'))} />;
}

/** Tarih: web'de yerel tarih seçici, cihazda GG.AA.YYYY maskeli metin (değer YYYY-AA-GG). */
export function DateField({ label, v, set, k, max }: { label: string; v: Vals; set: (k: string, x: any) => void; k: string; max?: string }) {
  const c = useColors();
  if (Platform.OS === 'web') {
    const El: any = 'input';
    return (
      <View style={{ gap: 8 }}>
        <Text v="small" style={{ fontFamily: fonts.bodyBold }}>{label}</Text>
        <El type="date" value={v[k] || ''} max={max} aria-label={label} onChange={(e: any) => set(k, e.target.value)}
          style={{ minHeight: 50, borderRadius: radius.md, padding: '0 16px', color: c.ink, backgroundColor: c.surface, border: `1.5px solid ${c.line}`, fontFamily: fonts.body, fontSize: 16, boxSizing: 'border-box' }} />
      </View>
    );
  }
  const iso = String(v[k] || '');
  const shown = iso ? iso.split('-').reverse().join('.') : '';
  return (
    <Field label={label} hint={t('GG.AA.YYYY')} value={shown} keyboardType="numeric" maxLength={10}
      onChangeText={(x) => {
        const d = x.replace(/\D/g, '').slice(0, 8);
        const dd = d.slice(0, 2), mm = d.slice(2, 4), yy = d.slice(4, 8);
        set(k, d.length === 8 ? `${yy}-${mm}-${dd}` : '');
      }} />
  );
}

/** Kısa seçenek listesi: dokunmayla seçilen hap düğmeler. */
export function Choice({ label, options, v, set, k, render }: { label: string; options: string[]; v: Vals; set: (k: string, x: any) => void; k: string; render?: (o: string) => string }) {
  const c = useColors();
  return (
    <View style={{ gap: 8 }}>
      <Text v="small" style={{ fontFamily: fonts.bodyBold }}>{label}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {options.map((o) => {
          const on = v[k] === o;
          return (
            <PressScale key={o} onPress={() => set(k, o)} accessibilityRole="radio" aria-checked={on} accessibilityState={{ selected: on }} scaleTo={0.96}
              style={{ paddingHorizontal: 14, minHeight: 40, borderRadius: radius.pill, justifyContent: 'center', backgroundColor: on ? c.accent : c.surface, borderWidth: 1, borderColor: on ? c.accent : c.line }}>
              <Text v="small" color={on ? c.accentInk : c.ink} style={{ fontFamily: fonts.bodyXBold }}>{render ? render(o) : o}</Text>
            </PressScale>
          );
        })}
      </View>
    </View>
  );
}

export function Toggle({ label, on, onChange }: { label: ReactNode; on: boolean; onChange: (b: boolean) => void }) {
  const c = useColors();
  return (
    <PressScale onPress={() => onChange(!on)} accessibilityRole="switch" aria-checked={on} accessibilityState={{ checked: on }} scaleTo={0.99}
      style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 6 }}>
      <Text v="small" style={{ flex: 1, fontFamily: fonts.bodyBold }}>{label}</Text>
      <View style={{ width: 48, height: 28, borderRadius: 14, backgroundColor: on ? c.accent : c.line, padding: 3, alignItems: on ? 'flex-end' : 'flex-start' }}>
        <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: '#fff' }} />
      </View>
    </PressScale>
  );
}

/** Dosya alanı: belge/dekont (görsel ya da PDF) ya da fotoğraflar. */
export function FileField({ label, files, setFiles, kind = 'doc', max = 4, camera }: { label: string; files: Picked[]; setFiles: (f: Picked[]) => void; kind?: 'doc' | 'photos'; max?: number; camera?: boolean }) {
  const c = useColors();
  return (
    <View style={{ gap: 8 }}>
      <Text v="small" style={{ fontFamily: fonts.bodyBold }}>{label}</Text>
      <Row wrap>
        <Button kind="ghost" title={files.length ? t('Değiştir') : kind === 'doc' ? t('Dosya seç') : t('Fotoğraf seç')} icon={<Icon name={kind === 'doc' ? 'doc' : 'cam'} size={16} />}
          onPress={async () => {
            if (kind === 'doc') { const f = await pickDocument(); if (f) setFiles([f]); }
            else { const f = await pickImages(max); if (f.length) setFiles(f); }
          }} />
        {camera && Platform.OS !== 'web' && <Button kind="ghost" title={t('Kamerayla çek')} icon={<Icon name="cam" size={16} />} onPress={async () => { const f = await takePhoto(); if (f.length) setFiles([...files, ...f].slice(0, max)); }} />}
      </Row>
      {files.length ? <Muted>{files.map((f) => f.name).join(', ')}</Muted> : null}
    </View>
  );
}

export function Actions({ onCancel, submitLabel, onSubmit, busy, danger }: { onCancel: () => void; submitLabel: string; onSubmit: () => void; busy?: boolean; danger?: boolean }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: 'row', gap: 10 }}>
      <Button kind="ghost" title={t('Vazgeç')} onPress={onCancel} style={{ flex: 1 }} />
      {danger
        ? <PressScale onPress={onSubmit} accessibilityRole="button" style={{ flex: 1, minHeight: 52, borderRadius: radius.pill, backgroundColor: c.badInk, alignItems: 'center', justifyContent: 'center' }}><Text v="small" color="#fff" style={{ fontFamily: fonts.bodyXBold, fontSize: 15 }}>{submitLabel}</Text></PressScale>
        : <Button title={submitLabel} onPress={onSubmit} loading={busy} style={{ flex: 1 }} />}
    </View>
  );
}

export function Area({ label, v, set, k, placeholder }: { label: string; v: Vals; set: (k: string, x: any) => void; k: string; placeholder?: string }) {
  const c = useColors();
  return (
    <View style={{ gap: 8 }}>
      <Text v="small" style={{ fontFamily: fonts.bodyBold }}>{label}</Text>
      <TextInput value={String(v[k] ?? '')} onChangeText={(x) => set(k, x)} multiline maxLength={600} placeholder={placeholder} placeholderTextColor={c.muted}
        accessibilityLabel={label}
        style={[{ minHeight: 96, borderRadius: radius.md, padding: 14, color: c.ink, backgroundColor: c.surface, borderWidth: 1.5, borderColor: c.line, fontFamily: fonts.body, fontSize: 16, textAlignVertical: 'top' }, { outlineStyle: 'none' } as any]} />
    </View>
  );
}
