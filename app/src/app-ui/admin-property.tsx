/* Yönetici paneli: bir müşteri adına mülk ekleme (Kurumlar ve Kullanıcılar bölümlerinde ortak form).
   Sunucu: admin_add_property (supabase/schema.sql §20). Anahtar ekibi sözleşme / paket adedini aşabilir; form önceden uyarır. */
import { useState } from 'react';
import { View } from 'react-native';
import { adminAddProperty, humanError } from '../domain/admin';
import { t } from '../domain/i18n';
import { Button, Field, Text } from '../ui/kit';
import { fonts, useColors } from '../ui/theme';
import { Card, H2, Muted, Row } from './blocks';
import { Pill } from './org';

const TYPES = ['Konut', 'Ofis', 'Mağaza', 'Depo'];
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function AddProperty({ owner, count, limit, done }: { owner: { id: string; name: string }; count?: number; limit?: number | null; done: (msg?: string, over?: { count: number; limit: number } | null) => void }) {
  const c = useColors();
  const [f, setF] = useState({ name: '', addr: '', type: 'Konut', rent: '', due: '1', deposit: '', start: '', end: '' });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const full = limit != null && count != null && count >= limit;
  const set = (k: keyof typeof f) => (v: string) => setF((x) => ({ ...x, [k]: v }));
  const save = async () => {
    setErr(null);
    if (f.name.trim().length < 2) { setErr(t('Mülk adını yaz.')); return; }
    if ((f.start && !DATE.test(f.start)) || (f.end && !DATE.test(f.end))) { setErr(t('Tarihleri YYYY-AA-GG biçiminde yaz.')); return; }
    const due = Number(f.due || 1);
    if (!Number.isInteger(due) || due < 1 || due > 28) { setErr(t('Ödeme günü 1 ile 28 arasında olmalı.')); return; }
    setBusy(true);
    try {
      const r = await adminAddProperty(owner.id, { name: f.name, addr: f.addr, prop_type: f.type, rent: f.rent.replace(',', '.'), due_day: due,
        deposit: f.deposit.replace(',', '.'), start_date: f.start, contract_end: f.end });
      done(r?.over ? t('Mülk eklendi. Sözleşme / paket adedi aşıldı ({count}/{limit}). Müşteriyle sözleşmedeki adedi güncelleyin.', { count: r.count, limit: r.limit }) : t('Mülk eklendi.'),
        r?.over ? { count: r.count, limit: r.limit } : null);
    } catch (e) { setErr(humanError(e)); }
    setBusy(false);
  };
  return (
    <Card gap={10}>
      <H2>{t('{name} adına mülk ekle', { name: owner.name })}</H2>
      {count != null ? <Muted>{limit != null ? t('Şu an {count} mülk var; sözleşmedeki adet {limit}.', { count, limit }) : t('Şu an {count} mülk var; adet sınırı yok.', { count })}</Muted> : null}
      {full ? <Text v="small" color={c.badInk}>{t('Sözleşmedeki adet dolu. Eklersen adet aşılır; müşterinin kendisi bundan sonra mülk ekleyemez.')}</Text> : null}
      <Field label={t('Mülk adı')} value={f.name} onChangeText={set('name')} maxLength={120} />
      <Field label={t('Adres (isteğe bağlı)')} value={f.addr} onChangeText={set('addr')} maxLength={300} />
      <Text v="small" style={{ fontFamily: fonts.bodyBold }}>{t('Mülk tipi')}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }} accessibilityRole="radiogroup">
        {TYPES.map((x) => <Pill key={x} label={t(x)} on={f.type === x} onPress={() => set('type')(x)} />)}
      </View>
      <Row gap={10} wrap>
        <View style={{ flexGrow: 1, flexBasis: 150 }}><Field label={t('Aylık kira')} value={f.rent} onChangeText={set('rent')} keyboardType="numeric" /></View>
        <View style={{ flexGrow: 1, flexBasis: 150 }}><Field label={t('Ödeme günü (1-28)')} value={f.due} onChangeText={set('due')} keyboardType="numeric" /></View>
        <View style={{ flexGrow: 1, flexBasis: 150 }}><Field label={t('Depozito')} value={f.deposit} onChangeText={set('deposit')} keyboardType="numeric" /></View>
      </Row>
      <Row gap={10} wrap>
        <View style={{ flexGrow: 1, flexBasis: 200 }}><Field label={t('Sözleşme başı (YYYY-AA-GG)')} value={f.start} onChangeText={set('start')} autoCapitalize="none" /></View>
        <View style={{ flexGrow: 1, flexBasis: 200 }}><Field label={t('Sözleşme sonu (YYYY-AA-GG)')} value={f.end} onChangeText={set('end')} autoCapitalize="none" /></View>
      </Row>
      {err ? <Text v="small" color={c.badInk}>{err}</Text> : null}
      <Row>
        <Button kind="ghost" title={t('Vazgeç')} onPress={() => done()} />
        <Button title={full ? t('Yine de ekle') : t('Mülk ekle')} onPress={save} loading={busy} />
      </Row>
    </Card>
  );
}
