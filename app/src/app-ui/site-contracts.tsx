// Hizmet ve tedarikçi sözleşmeleri (asansör bakımı, sigorta, temizlik…): liste, ekleme/düzenleme, yenileme. Bitiş hatırlatmasını
// sunucu gönderir (site_contract_reminders); bu ekran yalnız kayıtları tutar ve yaklaşan bitişleri öne çıkarır.
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { t } from '../domain/i18n';
import { humanError } from '../domain/backend';
import { CONTRACT_KINDS, CONTRACT_PERIODS, contractKindLabel, daysLeft, deleteContract, loadContracts, parseRemind, renewed, saveContract } from '../domain/contracts';
import { fmtFull, parse, tl } from '../domain/util';
import { Button, Chip, Field, Text } from '../ui/kit';
import { fonts, useColors } from '../ui/theme';
import { Card, Empty, H2, LinkBtn, Muted, Note, Row, Stack } from './blocks';
import { DateField, MoneyField, useVals } from './forms';
import { Pill } from './org';

const EMPTY = { id: '', kind: 'asansor', vendor: '', phone: '', starts_on: '', ends_on: '', amount: '', period: 'yillik', remind_days: '30, 15, 7', note: '' };

function left(n: number) {
  if (n < 0) return { label: t('Bitti'), tone: 'bad' as const };
  if (n === 0) return { label: t('Bugün bitiyor'), tone: 'bad' as const };
  return { label: t('{n} gün kaldı', { n }), tone: n <= 7 ? 'bad' as const : n <= 30 ? 'warn' as const : 'neutral' as const };
}

function ContractForm({ oid, init, done }: { oid: string; init: any; done: (msg?: string) => void }) {
  const { v, set } = useVals({ ...EMPTY, ...init, amount: init.amount == null ? '' : String(init.amount), remind_days: Array.isArray(init.remind_days) ? init.remind_days.join(', ') : init.remind_days || EMPTY.remind_days });
  const c = useColors();
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setErr(null); setBusy(true);
    try { await saveContract(oid, v); done(v.id ? t('Sözleşme güncellendi.') : t('Sözleşme eklendi.')); } catch (e) { setErr(humanError(e)); }
    setBusy(false);
  };
  return (
    <Card gap={12}>
      <H2>{v.id ? t('Sözleşmeyi düzenle') : t('Sözleşme ekle')}</H2>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {CONTRACT_KINDS().map(([k, l]) => <Pill key={k} label={l} on={v.kind === k} onPress={() => set('kind', k)} />)}
      </View>
      <Row gap={10} wrap align="flex-start">
        <View style={{ flexGrow: 1, flexBasis: 200 }}><Field label={t('Firma')} value={v.vendor} onChangeText={(x) => set('vendor', x)} maxLength={120} /></View>
        <View style={{ flexGrow: 1, flexBasis: 160 }}><Field label={t('Telefon (isteğe bağlı)')} value={v.phone} onChangeText={(x) => set('phone', x)} keyboardType="phone-pad" maxLength={30} /></View>
      </Row>
      <Row gap={10} wrap align="flex-start">
        <View style={{ flexGrow: 1, flexBasis: 160 }}><DateField label={t('Başlangıç (isteğe bağlı)')} v={v} set={set} k="starts_on" /></View>
        <View style={{ flexGrow: 1, flexBasis: 160 }}><DateField label={t('Bitiş')} v={v} set={set} k="ends_on" /></View>
      </Row>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {CONTRACT_PERIODS().map(([k, l]) => <Pill key={k} label={l} on={v.period === k} onPress={() => set('period', k)} />)}
      </View>
      <Row gap={10} wrap align="flex-start">
        <View style={{ flexGrow: 1, flexBasis: 160 }}><MoneyField label={t('Tutar (₺, isteğe bağlı)')} value={v.amount} onChange={(x) => set('amount', x)} /></View>
        <View style={{ flexGrow: 1, flexBasis: 160 }}><Field label={t('Kaç gün önce hatırlatılsın')} value={v.remind_days} onChangeText={(x) => set('remind_days', x)} maxLength={30}
          hint={t('Virgülle ayır: {d}', { d: parseRemind(v.remind_days).join(', ') || '—' })} /></View>
      </Row>
      <Field label={t('Not (isteğe bağlı)')} value={v.note} onChangeText={(x) => set('note', x)} maxLength={500} multiline />
      {err ? <Text v="small" color={c.badInk}>{err}</Text> : null}
      <Row wrap>
        <Button title={t('Kaydet')} loading={busy} disabled={!String(v.vendor).trim() || !v.ends_on} onPress={save} />
        <Button kind="ghost" title={t('Vazgeç')} onPress={() => done()} />
      </Row>
    </Card>
  );
}

export function Contracts({ oid, can }: { oid: string; can: (p: string) => boolean }) {
  const c = useColors();
  const [list, setList] = useState<any[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [form, setForm] = useState<any>(null);
  const [ask, setAsk] = useState('');
  const write = can('expenses.manage');
  const load = () => loadContracts(oid).then((x) => { setList(x || []); setErr(null); }).catch((e) => { setList([]); setErr(humanError(e)); });
  useEffect(() => { load(); }, [oid]);
  const act = async (fn: () => Promise<any>, ok: string) => { setErr(null); setMsg(null); try { await fn(); setMsg(ok); load(); } catch (e) { setErr(humanError(e)); } };
  const soon = (list || []).filter((x) => { const n = daysLeft(x); return n >= 0 && n <= 30; });
  return (
    <Stack>
      <Muted>{t('Asansör bakımı, sigorta, temizlik gibi sözleşmelerin bitişinden önce sana bildirim ve e-posta gelir.')}</Muted>
      {soon.length ? <Note warn>{t('{n} sözleşme 30 gün içinde bitiyor.', { n: soon.length })}</Note> : null}
      {err ? <Text v="small" color={c.badInk}>{err}</Text> : null}
      {msg ? <Text v="small" color={c.okInk}>{msg}</Text> : null}
      {write && !form ? <Button style={{ alignSelf: 'flex-start' }} title={t('Sözleşme ekle')} onPress={() => { setMsg(null); setForm({}); }} /> : null}
      {form ? <ContractForm oid={oid} init={form} done={(m) => { setForm(null); if (m) { setMsg(m); load(); } }} /> : null}
      {list === null ? null : !list.length ? <Empty>{t('Henüz sözleşme yok.')}</Empty> : (
        <Card gap={0} style={{ padding: 0, overflow: 'hidden' }}>
          {list.map((x, i) => {
            const st = left(daysLeft(x));
            return (
              <View key={x.id} style={{ padding: 14, gap: 6, borderTopWidth: i ? 1 : 0, borderColor: c.line }}>
                <Row between wrap>
                  <View style={{ flex: 1, minWidth: 160 }}>
                    <Text style={{ fontFamily: fonts.bodyBold }}>{x.vendor}</Text>
                    <Muted>{[contractKindLabel(x.kind), (x.starts_on ? fmtFull(parse(x.starts_on)) + ' – ' : t('Bitiş') + ' ') + fmtFull(parse(x.ends_on)),
                      x.amount != null ? tl(x.amount) + (x.period === 'aylik' ? t('/ay') : x.period === 'yillik' ? t('/yıl') : '') : '', x.phone].filter(Boolean).join(' · ')}</Muted>
                    {x.note ? <Muted>{x.note}</Muted> : null}
                  </View>
                  <Chip label={st.label} tone={st.tone} />
                </Row>
                {write ? (ask === x.id ? (
                  <Row gap={8} wrap><Muted>{t('Bu sözleşme silinsin mi?')}</Muted>
                    <LinkBtn danger label={t('Evet, sil')} onPress={() => { setAsk(''); act(() => deleteContract(x.id), t('Sözleşme silindi.')); }} />
                    <LinkBtn label={t('Vazgeç')} onPress={() => setAsk('')} /></Row>
                ) : (
                  <Row gap={14} wrap>
                    <LinkBtn label={x.period === 'aylik' ? t('1 ay uzat') : t('1 yıl uzat')} onPress={() => act(() => saveContract(oid, { ...x, ...renewed(x) }), t('Sözleşme yenilendi; hatırlatmalar yeni bitişe göre kuruldu.'))} />
                    <LinkBtn label={t('Düzenle')} onPress={() => { setMsg(null); setForm(x); }} />
                    <LinkBtn danger label={t('Sil')} onPress={() => setAsk(x.id)} />
                  </Row>
                )) : null}
              </View>
            );
          })}
        </Card>
      )}
    </Stack>
  );
}
