/* Yönetici paneli → Gider: elle girilen giderler (altyapı, mağaza komisyonu, sanal POS, vergi, pazarlama, hizmet).
   Ay seçilir; o ayın toplamı TL (dövizli kayıt o günün TCMB satış kuruyla), KDV ayrımı, kategoriye göre dağılım,
   yaklaşan düzenli giderler; ekle, düzenle, sil (her işlem İşlem kaydı'na düşer). Hesap: domain/admin-finance.js. */
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { t } from '../domain/i18n';
import { humanError } from '../domain/backend';
import { host } from '../domain/host';
import { COST_CATEGORIES, deleteCost, loadCosts, monthCosts, saveCost, upcoming } from '../domain/admin-finance';
import { fmtMoney } from '../domain/money';
import { fmtFull, mkey, monthYear, parse } from '../domain/util';
import { Button, Field, Text } from '../ui/kit';
import { Loader } from '../ui/Loader';
import { fonts, useColors } from '../ui/theme';
import { Card, Empty, H2, Label, MonthStepper, Muted, Row, Seg, Stack } from './blocks';
import { useFx } from './fx-ui';

export const categoryLabel = (k: string) => ({
  altyapi: t('Altyapı'), magaza: t('Mağaza komisyonu'), odeme: t('Ödeme (sanal POS)'), vergi: t('Vergi'),
  pazarlama: t('Pazarlama'), hizmet: t('Hizmet / personel'), diger: t('Diğer')
} as Record<string, string>)[k] || k;
const RECUR = () => [['once', t('Tek seferlik')], ['monthly', t('Aylık')], ['yearly', t('Yıllık')]] as [string, string][];
const recurLabel = (k: string) => (RECUR().find((x) => x[0] === k) || ['', ''])[1];
const day = (v?: string) => (v ? fmtFull(parse(String(v).slice(0, 10))) : '—');
const today = () => new Date().toISOString().slice(0, 10);
const blank = () => ({ id: '', title: '', category: 'altyapi', amount: '', currency: 'TRY', vat_included: true, vat_rate: '20', recurrence: 'monthly', start_on: today(), end_on: '', note: '' });

/** Ekranda ve "Net" satırında kullanılmak üzere giderler ve kur tablosu. */
export function useCosts(month: string) {
  const [costs, setCosts] = useState<any[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const reload = useCallback(() => loadCosts().then((x) => { setCosts(x); setErr(null); }).catch((e) => setErr(humanError(e))), []);
  useEffect(() => { reload(); }, [reload]);
  const from = (() => { const d = parse(month + '-01'); d.setMonth(d.getMonth() - 1); return mkey(d) + '-01'; })();
  const { table, ready } = useFx(from);
  return { costs, err, reload, table, ready, sum: costs ? monthCosts(costs, month, table) : null };
}

function CostForm({ init, done, cancel }: { init: any; done: () => void; cancel: () => void }) {
  const c = useColors();
  const [f, setF] = useState<any>(init);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: string, v: any) => setF({ ...f, [k]: v });
  const save = async () => {
    setErr(null);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f.start_on) || (f.end_on && !/^\d{4}-\d{2}-\d{2}$/.test(f.end_on))) { setErr(t('Tarihleri YYYY-AA-GG biçiminde yaz.')); return; }
    setBusy(true);
    try {
      // "1.250,50" (Türkçe) ya da "25.5": virgül varsa ondalık virgüldür, noktalar binlik ayırıcıdır.
      const num = (v: any) => { const x = String(v).trim(); return x.includes(',') ? x.replace(/\./g, '').replace(',', '.') : x; };
      await saveCost({ ...f, id: f.id || null, amount: num(f.amount), vat_rate: num(f.vat_rate), end_on: f.end_on || null });
      done();
    } catch (e) { setErr(humanError(e)); }
    setBusy(false);
  };
  return (
    <Card gap={10}>
      <H2>{f.id ? t('Gideri düzenle') : t('Gider ekle')}</H2>
      <Field label={t('Başlık')} value={f.title} onChangeText={(v) => set('title', v)} maxLength={120} placeholder={t('ör. Supabase Pro')} />
      <View style={{ gap: 4 }}><Label>{t('Kategori')}</Label>
        <Seg wrap value={f.category} onChange={(v) => set('category', v)} options={COST_CATEGORIES.map((k) => [k, categoryLabel(k)] as [string, string])} /></View>
      <Row gap={10} wrap align="flex-end">
        <View style={{ flexGrow: 1, flexBasis: 140 }}><Field label={t('Tutar')} value={String(f.amount)} onChangeText={(v) => set('amount', v.replace(/[^\d.,]/g, ''))} keyboardType="decimal-pad" /></View>
        <View style={{ gap: 4 }}><Label>{t('Para birimi')}</Label><Seg value={f.currency} onChange={(v) => set('currency', v)} options={[['TRY', '₺'], ['USD', '$'], ['EUR', '€']]} /></View>
      </Row>
      <Row gap={10} wrap align="flex-end">
        <View style={{ gap: 4 }}><Label>{t('KDV')}</Label>
          <Seg value={f.vat_included ? 'in' : 'out'} onChange={(v) => set('vat_included', v === 'in')} options={[['in', t('KDV dahil')], ['out', t('KDV hariç')]]} /></View>
        <View style={{ flexGrow: 1, flexBasis: 100, maxWidth: 160 }}><Field label={t('KDV oranı (%)')} value={String(f.vat_rate)} onChangeText={(v) => set('vat_rate', v.replace(/[^\d.,]/g, ''))} keyboardType="decimal-pad" /></View>
      </Row>
      <View style={{ gap: 4 }}><Label>{t('Tekrar')}</Label><Seg value={f.recurrence} onChange={(v) => set('recurrence', v)} options={RECUR()} /></View>
      <Row gap={10} wrap align="flex-end">
        <View style={{ flexGrow: 1, flexBasis: 160 }}><Field label={t('Başlangıç (YYYY-AA-GG)')} value={f.start_on} onChangeText={(v) => set('start_on', v)} maxLength={10} /></View>
        {f.recurrence !== 'once' ? <View style={{ flexGrow: 1, flexBasis: 160 }}><Field label={t('Bitiş (isteğe bağlı)')} value={f.end_on || ''} onChangeText={(v) => set('end_on', v)} maxLength={10} placeholder="2027-12-31" /></View> : null}
      </Row>
      <Field label={t('Not (isteğe bağlı)')} value={f.note} onChangeText={(v) => set('note', v)} maxLength={1000} />
      <Row wrap>
        <Button title={f.id ? t('Kaydet') : t('Gideri ekle')} loading={busy} disabled={!f.title.trim() || !f.amount} onPress={save} />
        <Button kind="ghost" title={t('Vazgeç')} onPress={cancel} />
      </Row>
      {err ? <Text v="small" color={c.badInk}>{err}</Text> : null}
    </Card>
  );
}

export function Costs() {
  const c = useColors();
  const [month, setMonth] = useState(mkey(new Date()));
  const { costs, err, reload, sum, ready } = useCosts(month);
  const [edit, setEdit] = useState<any>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const M = (n: any) => fmtMoney(n, 'TRY');
  const remove = async (x: any) => {
    if (!await host.ask({ title: t('“{x}” silinsin mi?', { x: x.title }), body: t('Bu gider bütün aylardan kalkar. İşlem kaydına yazılır.'), ok: t('Sil'), danger: true })) return;
    try { await deleteCost(x.id); setMsg(t('Gider silindi.')); reload(); } catch (e) { setMsg(humanError(e)); }
  };
  if (err) return <Text v="small" color={c.badInk}>{err}</Text>;
  if (!costs || !sum) return <View style={{ alignItems: 'center', paddingVertical: 30 }}><Loader size={72} /></View>;
  const cats = Object.entries(sum.byCat).sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...cats.map(([, v]) => v));
  const soon = upcoming(costs);
  return (
    <Stack>
      <Row between wrap>
        <MonthStepper value={month} onChange={setMonth} />
        {!edit ? <Button title={t('Gider ekle')} onPress={() => { setMsg(null); setEdit(blank()); }} /> : null}
      </Row>
      {edit ? <CostForm init={edit} cancel={() => setEdit(null)} done={() => { setEdit(null); setMsg(t('Gider kaydedildi.')); reload(); }} /> : null}
      {msg ? <Muted>{msg}</Muted> : null}
      <Card gap={8}>
        <Label>{t('{m} giderleri', { m: monthYear(month) })}</Label>
        <Text v="h1" style={{ fontVariant: ['tabular-nums'] }}>{M(sum.total)}</Text>
        <Muted>{t('KDV hariç {n} · KDV {v}', { n: M(sum.net), v: M(sum.vat) })}{!ready ? ' · ' + t('Kurlar yükleniyor…') : sum.missing ? ' · ' + t('Bazı dövizli giderlerin günü için kur yok; toplama katılmadı.') : ''}</Muted>
        {cats.length ? cats.map(([k, v]) => (
          <View key={k} style={{ gap: 3 }}>
            <Row between><Text v="small" style={{ fontFamily: fonts.bodyBold }}>{categoryLabel(k)}</Text><Text v="small" style={{ fontFamily: fonts.bodyXBold, fontVariant: ['tabular-nums'] }}>{M(v)}</Text></Row>
            <View style={{ height: 6, borderRadius: 3, backgroundColor: c.line }}><View style={{ width: `${Math.round((v / max) * 100)}%`, height: 6, borderRadius: 3, backgroundColor: c.accent }} /></View>
          </View>
        )) : <Empty>{t('Bu ay gider yok.')}</Empty>}
      </Card>
      <Card gap={4}>
        <H2>{t('Bu ayın kalemleri')}</H2>
        {sum.items.length ? sum.items.map((x: any, i: number) => (
          <Row key={x.cost.id + x.day} between wrap style={{ paddingVertical: 8, borderTopWidth: i ? 1 : 0, borderColor: c.line }}>
            <View style={{ flex: 1, minWidth: 180 }}>
              <Text v="small" style={{ fontFamily: fonts.bodyXBold }}>{x.cost.title}</Text>
              <Muted>{[categoryLabel(x.cost.category), recurLabel(x.cost.recurrence), day(x.day),
                x.cost.currency !== 'TRY' ? fmtMoney(x.cost.amount, x.cost.currency, 2) + (x.rate ? ' × ' + x.rate.toLocaleString('tr-TR', { maximumFractionDigits: 4 }) : '') : '',
                x.cost.vat_included ? t('KDV dahil') : t('KDV hariç %{r}', { r: x.cost.vat_rate })].filter(Boolean).join(' · ')}</Muted>
            </View>
            <Row gap={6}>
              <Text v="small" style={{ fontFamily: fonts.bodyXBold, fontVariant: ['tabular-nums'] }}>{x.missing ? t('kur yok') : M(x.gross)}</Text>
              <Button kind="quiet" title={t('Düzenle')} onPress={() => { setMsg(null); setEdit({ ...x.cost, amount: String(x.cost.amount).replace('.', ','), vat_rate: String(x.cost.vat_rate), end_on: x.cost.end_on || '' }); }} />
              <Button kind="quiet" title={t('Sil')} onPress={() => remove(x.cost)} />
            </Row>
          </Row>
        )) : <Empty>{t('Bu ay gider yok.')}</Empty>}
      </Card>
      <Card gap={4}>
        <H2>{t('Yaklaşan düzenli giderler (30 gün)')}</H2>
        {soon.length ? soon.map((x, i) => (
          <Row key={x.cost.id + x.day} between style={{ paddingVertical: 6, borderTopWidth: i ? 1 : 0, borderColor: c.line }}>
            <Text v="small">{x.cost.title} · {day(x.day)}</Text>
            <Text v="small" style={{ fontFamily: fonts.bodyBold, fontVariant: ['tabular-nums'] }}>{fmtMoney(x.cost.amount, x.cost.currency, x.cost.currency === 'TRY' ? 0 : 2)}</Text>
          </Row>
        )) : <Muted>{t('Önümüzdeki 30 günde düzenli gider yok.')}</Muted>}
      </Card>
      <Muted>{t('Yalnız anahtar yöneticileri görür. Dövizli giderler o günün TCMB döviz satış kuruyla TL’ye çevrilir; hafta sonu ve tatilde son iş günü.')}</Muted>
    </Stack>
  );
}
