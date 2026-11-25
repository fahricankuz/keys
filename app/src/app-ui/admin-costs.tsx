/* Yönetici paneli → Gider: elle girilen giderler (altyapı, mağaza komisyonu, sanal POS, vergi, pazarlama, hizmet).
   Ay seçilir; o ayın toplamı TL (dövizli kayıt o günün TCMB satış kuruyla), KDV ayrımı, kategoriye göre dağılım,
   yaklaşan düzenli giderler; ekle, düzenle, sil (her işlem İşlem kaydı'na düşer). Hesap: domain/admin-finance.js. */
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { t } from '../domain/i18n';
import { humanError } from '../domain/backend';
import { host } from '../domain/host';
import { COST_CATEGORIES, deleteCost, loadCosts, monthCosts, saveCost, upcoming } from '../domain/admin-finance';
import { fmtMoney, fmtShort } from '../domain/money';
import { fmtFull, mkey, monthYear, parse } from '../domain/util';
import { Button, Field, Text } from '../ui/kit';
import { Loader } from '../ui/Loader';
import { fonts, useBreakpoint, useColors } from '../ui/theme';
import { Card, Empty, H2, Icon, Label, MonthStepper, Muted, Row, Seg, Stack } from './blocks';
import { PressScale } from '../ui/kit';
import Svg, { Circle as SvgCircle, Path } from 'react-native-svg';
import { MonthChart, type MonthRow } from './admin-charts';
import { useMoney } from './admin-money';
import { ATable } from './admin-table';
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
  return { costs, err, reload, table, ready, sum: costs ? monthCosts(costs, month, table) : null };   // table: yıl görünümü de kullanır
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
  const [period, setPeriod] = useState<'month' | 'year'>(() => { try { return globalThis.localStorage?.getItem('adminPeriod') === 'year' ? 'year' : 'month'; } catch { return 'month'; } });
  const { costs, err, reload, sum: monthSum, ready, table } = useCosts(period === 'year' ? (new Date().getFullYear() - 1) + '-12' : month);
  // Yıl: 1 Ocak'tan bu aya ayların toplamı (kategori ve ay ay).
  const yearMonths = Array.from({ length: new Date().getMonth() + 1 }, (_, i) => new Date().getFullYear() + '-' + String(i + 1).padStart(2, '0'));
  const yearRows = costs && period === 'year' ? yearMonths.map((m) => ({ m, s: monthCosts(costs, m, table) })) : [];
  const sum: any = period === 'year' && costs ? yearRows.reduce((a: any, r: any) => {
    a.total += r.s.total; a.net += r.s.net; a.vat += r.s.vat; a.missing = a.missing || r.s.missing;
    Object.entries(r.s.byCat).forEach(([k, v]: any) => { a.byCat[k] = (a.byCat[k] || 0) + v; });
    a.items.push(...r.s.items); return a;
  }, { total: 0, net: 0, vat: 0, byCat: {}, items: [], missing: false }) : monthSum;
  const [edit, setEdit] = useState<any>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const { money, conv, cur, fmtc } = useMoney();
  const { desktop } = useBreakpoint();
  const M = (n: any, d?: string) => money(n, d || (period === 'year' ? undefined : month));
  // Toplamlar ve kategori dağılımı: her gider kendi gününün kuruyla çevrilip toplanır (TL'de aynı).
  const C = (it: any, k: 'gross' | 'net' | 'vat' = 'gross') => (it.missing ? 0 : cur === 'TRY' ? Number(it[k]) || 0 : conv(Number(it[k]) || 0, it.day) ?? 0);
  const remove = async (x: any) => {
    if (!await host.ask({ title: t('“{x}” silinsin mi?', { x: x.title }), body: t('Bu gider bütün aylardan kalkar. İşlem kaydına yazılır.'), ok: t('Sil'), danger: true })) return;
    try { await deleteCost(x.id); setMsg(t('Gider silindi.')); reload(); } catch (e) { setMsg(humanError(e)); }
  };
  if (err) return <Text v="small" color={c.badInk}>{err}</Text>;
  if (!costs || !sum) return <View style={{ alignItems: 'center', paddingVertical: 30 }}><Loader size={72} /></View>;
  const conCats: Record<string, number> = {};
  (sum.items || []).forEach((it: any) => { conCats[it.cost.category] = (conCats[it.cost.category] || 0) + C(it); });
  const tot = { total: (sum.items || []).reduce((a: number, it: any) => a + C(it), 0), net: (sum.items || []).reduce((a: number, it: any) => a + C(it, 'net'), 0), vat: (sum.items || []).reduce((a: number, it: any) => a + C(it, 'vat'), 0) };
  const cats = Object.entries(conCats).sort((a, b) => b[1] - a[1]);
  const soon = upcoming(costs);
  const dark = c.bg === '#1D1A19';
  const PAL = dark ? ['#E5625F', '#F2B544', '#7FC495', '#7DB3F0', '#B994EC', '#C9BDB6'] : ['#C8302E', '#E0A21B', '#2A6B3A', '#1F5FAD', '#5E2EA0', '#9A8F8A'];
  // Yılın aylık gider grafiği (her ay kendi kuruyla seçilen para birimine).
  const y = new Date().getFullYear(), nowM = mkey(new Date());
  const chartRows: MonthRow[] = Array.from({ length: 12 }, (_, i) => {
    const m = y + '-' + String(i + 1).padStart(2, '0');
    return m > nowM ? { m, up: 0, future: true } : { m, up: conv(monthCosts(costs, m, table).total, m) ?? 0 };
  });
  const icon = (name: string, label: string, onPress: () => void) => (
    <PressScale onPress={onPress} accessibilityRole="button" accessibilityLabel={label} scaleTo={0.92}
      style={{ width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: c.line, backgroundColor: c.surface }}>
      <Icon name={name} size={15} color={c.muted} />
    </PressScale>
  );
  return (
    <Stack>
      <Row between wrap>
        <Row gap={10} wrap>
          <Seg value={period} onChange={(v: any) => { setPeriod(v); try { globalThis.localStorage?.setItem('adminPeriod', v); } catch { /* yok say */ } }}
            options={[['month', t('Ay')], ['year', t('Bu yıl (1 Ocak’tan bugüne)')]]} />
          {period === 'month' ? <MonthStepper value={month} onChange={setMonth} /> : null}
        </Row>
        {!edit ? <Button title={t('Gider ekle')} onPress={() => { setMsg(null); setEdit(blank()); }} /> : null}
      </Row>
      {edit ? <CostForm init={edit} cancel={() => setEdit(null)} done={() => { setEdit(null); setMsg(t('Gider kaydedildi.')); reload(); }} /> : null}
      {msg ? <Muted>{msg}</Muted> : null}
      <View style={{ flexDirection: desktop ? 'row' : 'column', gap: 16, alignItems: desktop ? 'stretch' : undefined }}>
        <Card gap={10} style={desktop ? { flex: 1, minWidth: 0 } : undefined}>
          <Label>{period === 'year' ? t('{y} giderleri (1 Ocak’tan bugüne)', { y }) : t('{m} giderleri', { m: monthYear(month) })}</Label>
          <Row gap={18} wrap align="center">
            <Donut parts={cats.map(([k, v], i) => [v, PAL[i % PAL.length]] as [number, string])} center={fmtc(tot.total)} />
            <View style={{ flex: 1, minWidth: 180, gap: 10 }}>
              {cats.length ? cats.map(([k, v], i) => (
                <Row key={k} gap={8}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: PAL[i % PAL.length] }} />
                  <Text v="small" style={{ flex: 1, fontFamily: fonts.bodyBold }}>{categoryLabel(k)}</Text>
                  <Text v="small" style={{ fontFamily: fonts.bodyXBold, fontVariant: ['tabular-nums'] }}>{fmtc(v)}</Text>
                  <Text v="small" muted style={{ width: 40, textAlign: 'right', fontVariant: ['tabular-nums'] }}>{'%' + Math.round((v / (sum.total || 1)) * 100)}</Text>
                </Row>
              )) : <Empty>{t('Bu ay gider yok.')}</Empty>}
            </View>
          </Row>
          <Muted>{t('KDV hariç {n} · KDV {v}', { n: fmtc(tot.net), v: fmtc(tot.vat) })}{!ready ? ' · ' + t('Kurlar yükleniyor…') : sum.missing ? ' · ' + t('Bazı dövizli giderlerin günü için kur yok; toplama katılmadı.') : ''}</Muted>
        </Card>
        <View style={desktop ? { flex: 1.3, minWidth: 0 } : undefined}>
          <MonthChart title={t('{y} aylık gider', { y })} rows={chartRows} labels={{ up: t('Gider') }} fmt={(v) => fmtMoney(v, cur)} axisFmt={(v) => fmtShort(v, cur)} height={200}
            summary={t('Yıl toplamı: {v}', { v: fmtMoney(chartRows.reduce((a, r) => a + r.up, 0), cur) })} />
        </View>
      </View>
      <ATable label={period === 'year' ? t('Bu yılın kalemleri') : t('Bu ayın kalemleri')} title={<H2>{period === 'year' ? t('Bu yılın kalemleri') : t('Bu ayın kalemleri')}</H2>}
        cols={[{ label: t('Kalem'), flex: 2.4 }, { label: t('Tutar'), align: 'right', flex: 1 }, { label: '', align: 'right', width: 80 }]}
        keys={sum.items.map((x: any) => x.cost.id + x.day)}
        rows={sum.items.length ? sum.items.map((x: any) => [
          <View key="a" style={{ gap: 2 }}>
            <Text v="small" style={{ fontFamily: fonts.bodyXBold }}>{x.cost.title}</Text>
            <Muted>{[categoryLabel(x.cost.category), recurLabel(x.cost.recurrence), day(x.day),
              x.cost.currency !== 'TRY' ? fmtMoney(x.cost.amount, x.cost.currency, 2) + (x.rate ? ' × ' + x.rate.toLocaleString('tr-TR', { maximumFractionDigits: 4 }) : '') : ''].filter(Boolean).join(' · ')}</Muted>
          </View>,
          <View key="b" style={{ alignItems: 'flex-end' }}>
            <Text v="small" style={{ fontFamily: fonts.bodyXBold, fontVariant: ['tabular-nums'] }}>{x.missing ? t('kur yok') : M(x.gross, x.day)}</Text>
            <Muted>{x.cost.vat_included ? t('KDV dahil') : t('KDV hariç %{r}', { r: x.cost.vat_rate })}</Muted>
          </View>,
          <Row key="c" gap={6}>
            {icon('pen', t('Düzenle'), () => { setMsg(null); setEdit({ ...x.cost, amount: String(x.cost.amount).replace('.', ','), vat_rate: String(x.cost.vat_rate), end_on: x.cost.end_on || '' }); })}
            {icon('x', t('Sil'), () => remove(x.cost))}
          </Row>,
        ]) : [[<Empty key="e">{t('Bu ay gider yok.')}</Empty>, null, null]]} />
      <Card gap={4}>
        <H2>{t('Yaklaşan düzenli giderler (30 gün)')}</H2>
        {soon.length ? soon.map((x, i) => (
          <Row key={x.cost.id + x.day} between style={{ paddingVertical: 10, borderTopWidth: 1, borderColor: c.line }}>
            <Text v="small" style={{ flex: 1 }}><Text v="small" style={{ fontFamily: fonts.bodyBold }}>{x.cost.title}</Text><Text v="small" muted>{'  ' + day(x.day)}</Text></Text>
            <Text v="small" style={{ fontFamily: fonts.bodyBold, fontVariant: ['tabular-nums'] }}>{fmtMoney(x.cost.amount, x.cost.currency, x.cost.currency === 'TRY' ? 0 : 2)}</Text>
          </Row>
        )) : <Muted>{t('Önümüzdeki 30 günde düzenli gider yok.')}</Muted>}
      </Card>
      <Muted>{t('Yalnız anahtar yöneticileri görür. Dövizli giderler o günün TCMB döviz satış kuruyla TL’ye çevrilir; hafta sonu ve tatilde son iş günü.')}</Muted>
    </Stack>
  );
}

/** Halka grafik: dilimler [değer, renk]; ortada toplam. */
function Donut({ parts, center, size = 150 }: { parts: [number, string][]; center: string; size?: number }) {
  const c = useColors();
  const tot = parts.reduce((a, [v]) => a + v, 0);
  const r = size / 2 - 14, cx = size / 2, sw = 20;
  let a0 = -Math.PI / 2;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <SvgCircle cx={cx} cy={cx} r={r} stroke={c.line} strokeWidth={sw} fill="none" />
        {tot ? parts.map(([v, col], i) => {
          const a1 = a0 + (2 * Math.PI * v) / tot, large = a1 - a0 > Math.PI ? 1 : 0;
          const d = parts.length === 1 ? `M${cx},${cx - r} A${r},${r} 0 1 1 ${cx - 0.01},${cx - r}` : `M${cx + r * Math.cos(a0)},${cx + r * Math.sin(a0)} A${r},${r} 0 ${large} 1 ${cx + r * Math.cos(a1)},${cx + r * Math.sin(a1)}`;
          a0 = a1;
          return <Path key={i} d={d} stroke={col} strokeWidth={sw} fill="none" />;
        }) : null}
      </Svg>
      <Text style={{ fontFamily: fonts.siteBold, fontSize: 17, color: c.ink, fontVariant: ['tabular-nums'], maxWidth: size - 50, textAlign: 'center' }} numberOfLines={1}>{center}</Text>
    </View>
  );
}
