/* Yönetici paneli: Ay / Yıl (1 Ocak'tan bugüne) seçici, gelir–gider–net kutusu (kırılımlarıyla) ve yılın aylık grafiği
   (gelir ve gider sütunları, yeni kayıt çizgisi). Hesap: domain/admin-finance.js. */
import { useEffect, useState } from 'react';
import { Text as RNText, View } from 'react-native';
import { t } from '../domain/i18n';
import { loadKpis } from '../domain/admin';
import { adminOrgs } from '../domain/org';
import { finance, loadCosts, loadMonthly, periodMonths, revenueEstimate, saveRevenueMonth, volumes } from '../domain/admin-finance';
import { monthYear, percent, tl } from '../domain/util';
import { fmtShort } from '../domain/money';
import { Text } from '../ui/kit';
import { fonts, useBreakpoint, useColors } from '../ui/theme';
import { Card, H2, Muted, Row, Seg } from './blocks';
import { useFx } from './fx-ui';
import { categoryLabel } from './admin-costs';
import { MonthChart, type MonthRow } from './admin-charts';
import { monthEnd, useMoney } from './admin-money';

export type Period = 'month' | 'year';
const KEY = 'adminPeriod';
const readPeriod = (): Period => { try { return globalThis.localStorage?.getItem(KEY) === 'year' ? 'year' : 'month'; } catch { return 'month'; } };

/** Dönem seçimi (sayfalar arasında ortak, tarayıcıda hatırlanır). */
export function usePeriod(): [Period, (p: Period) => void] {
  const [p, setP] = useState<Period>(readPeriod);
  return [p, (v) => { setP(v); try { globalThis.localStorage?.setItem(KEY, v); } catch { /* yok say */ } }];
}
export const PeriodSeg = ({ value, onChange }: { value: Period; onChange: (p: Period) => void }) => (
  <Seg value={value} onChange={(v: any) => onChange(v)} options={[['month', t('Bu ay')], ['year', t('Bu yıl (1 Ocak’tan bugüne)')]]} />
);

/** Dönemin karşılaştırma metni: ayda "geçen ay", yılda "geçen yıl aynı dönem". */
export const prevLabel = (p: Period) => (p === 'year' ? t('geçen yıl aynı dönem') : t('geçen ay'));
export function delta(a: number, b: number) { return b ? (a >= b ? '+' : '−') + percent(Math.abs(((a - b) / b) * 100), 0) : ''; }

/** Panel verisi: göstergeler, bu yılın ve geçen yılın aylık verisi, kurumlar, giderler ve kur tablosu. Bu ayın üyelik tahminini kaydeder. */
export function useAdminFinance() {
  const [state, setState] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const y = new Date().getFullYear();
  const { table } = useFx((y - 1) + '-01-01');
  useEffect(() => {
    let live = true;
    Promise.all([loadKpis(30), loadMonthly(y), loadMonthly(y - 1), adminOrgs().catch(() => []), loadCosts().catch(() => [])])
      .then(([k, cur, prev, orgs, costs]) => {
        if (!live) return;
        const r = revenueEstimate(k.revenueBase || []);
        saveRevenueMonth(r.mrr, k.owners?.paying || 0);
        setState({ k, monthly: [...prev, ...cur], orgs, costs, mrr: r });
      })
      .catch((e) => { if (live) setErr(String(e?.message || e)); });
    return () => { live = false; };
  }, []);
  return { data: state, err, table };
}

/** Dönemin finansı ve karşılaştırması. */
export function periodFinance(data: any, table: any, period: Period, conv?: (v: number, day: string) => number | null) {
  const pm = periodMonths(period);
  // Seçili para birimine her kalem kendi gününün kuruyla çevrilir (conv); sonuçlar seçili para birimindedir (fmtc ile biçimlenir).
  const cv = conv ? (v: number, d: string) => conv(v, d) ?? 0 : (v: number) => v;
  const args = { monthly: data.monthly, liveMrr: data.mrr.mrr, orgs: data.orgs, costs: data.costs, table, conv: cv };
  return { cur: finance({ ...args, months: pm.cur }), prev: finance({ ...args, months: pm.prev, liveMrr: 0 }), vol: volumes(data.monthly, pm.cur, cv), volPrev: volumes(data.monthly, pm.prev, cv), pm };
}

const INCOME_LABEL = (k: string) => ({ uyelik: t('Üyelik ücreti'), komisyon: t('İşlem ücreti (kartla aidat / kira)'), diger: t('Diğer (hukuki destek)') } as any)[k] || k;

/** Gelir, gider ve net: üç büyük değer ve altında kırılımlar. */
export function FinanceCard({ f, prev, period, prevDay }: { f: any; prev: any; period: Period; prevDay?: string }) {
  const c = useColors();
  const { fmtc } = useMoney();
  const tl = (v: number) => fmtc(v);           // f ve prev zaten seçili para biriminde (periodFinance, işlem günü kuru)
  const tlp = (v: number) => fmtc(v);
  const { phone } = useBreakpoint();
  const dark = c.bg !== '#FAF5F0';
  // Üç değer renkli kutularda; net kutusu marka tonunda.
  const big = (label: string, v: number, p: number, tone?: 'net') => (
    <View style={{ flexGrow: 1, flexBasis: phone ? '100%' : 150, minWidth: 0, gap: 2, borderRadius: 18, padding: 14, backgroundColor: tone === 'net' ? c.accentSoft : dark ? 'rgba(250,245,240,0.05)' : c.surface2 }}>
      <Muted>{label}</Muted>
      <RNText numberOfLines={1} style={{ fontFamily: fonts.siteBold, fontSize: phone ? 26 : 30, letterSpacing: -0.8, color: tone === 'net' && v < 0 ? c.badInk : c.ink, fontVariant: ['tabular-nums'] }}>{tl(v)}</RNText>
      <Muted>{[delta(v, p), prevLabel(period) + ': ' + tlp(p)].filter(Boolean).join(' · ')}</Muted>
    </View>
  );
  const DOTS = [c.accent, '#F2B544', c.muted, dark ? '#F28C86' : '#A8231F'];
  const part = (label: string, v: number, total: number, i: number) => {
    const share = total ? Math.round((v / total) * 100) : 0;
    const col = DOTS[i % DOTS.length];
    return (
      <View key={label} style={{ gap: 5, paddingTop: i ? 10 : 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: col }} />
          <Text v="small" style={{ flex: 1, fontFamily: fonts.bodyBold }}>{label}</Text>
          <Text v="small" style={{ fontFamily: fonts.bodyXBold, fontVariant: ['tabular-nums'] }}>{tl(v)}</Text>
          <Text v="small" muted style={{ width: 40, textAlign: 'right', fontVariant: ['tabular-nums'] }}>{'%' + share}</Text>
        </View>
        <View style={{ height: 6, borderRadius: 3, backgroundColor: c.line }}><View style={{ width: `${share}%`, height: 6, borderRadius: 3, backgroundColor: col }} /></View>
      </View>
    );
  };
  const up = f.incomeParts.find((x: any) => x.key === 'uyelik');
  return (
    <Card gap={16} style={{ flexGrow: 1 }}>
      <H2>{t('Gelir, gider ve net')}</H2>
      <Row wrap gap={10}>
        {big(t('Gelir'), f.income, prev.income)}
        {big(t('Gider'), f.expense, prev.expense)}
        {big(t('Net (gelir − gider)'), f.net, prev.net, 'net')}
      </Row>
      <View style={{ flexDirection: phone ? 'column' : 'row', gap: 18 }}>
        <View style={{ flex: phone ? undefined : 1, gap: 4 }}>
          <Muted>{t('Gelir kırılımı')}</Muted>
          {f.incomeParts.map((x: any, i: number) => part(INCOME_LABEL(x.key), x.value, f.income, i))}
          {up?.detail?.contracts ? <Muted>{t('Üyelik: paketler {a} · kurumsal sözleşmeler {b}', { a: tl(up.detail.packages), b: tl(up.detail.contracts) })}</Muted> : null}
        </View>
        <View style={{ flex: phone ? undefined : 1, gap: 4 }}>
          <Muted>{t('Gider kırılımı')}</Muted>
          {f.expenseParts.length ? f.expenseParts.map((x: any, i: number) => part(categoryLabel(x.key), x.value, f.expense, i)) : <Muted>{t('Bu dönemde gider yok.')}</Muted>}
        </View>
      </View>
      <Muted>{[t('Üyelik ücreti paket fiyatlarından tahmindir; işlem ücreti kartla ödemelerden, sanal POS payı gidere kendiliğinden yazılır.'),
        f.missingMonths ? t('{n} geçmiş ay için üyelik kaydı yok (kayıt bu aydan başlıyor).', { n: f.missingMonths }) : ''].filter(Boolean).join(' ')}</Muted>
    </Card>
  );
}

/** Yılın ayları (Ocak → Aralık); gelecek aylar işaretli. */
function yearMonths() {
  const y = new Date().getFullYear(), now = new Date().toISOString().slice(0, 7);
  return Array.from({ length: 12 }, (_, i) => { const m = y + '-' + String(i + 1).padStart(2, '0'); return { m, future: m > now }; });
}

/** Yılın aylık gelir, gider ve net grafiği (tek eksen: gelir üstte, gider altta, net çizgi). */
export function YearChart({ data, table }: { data: any; table: any }) {
  const y = new Date().getFullYear();
  const { conv, fmtc, axis } = useMoney();
  let inc = 0, exp = 0;
  const rows: MonthRow[] = yearMonths().map(({ m, future }) => {
    if (future) return { m, up: 0, down: 0, future };
    const f = finance({ monthly: data.monthly, months: [m], liveMrr: data.mrr.mrr, orgs: data.orgs, costs: data.costs, table });
    // Seçilen para birimine her ay kendi son gününün kuruyla (kur yoksa 0 sayılmaz: o ay grafikte 0, tabloda —).
    const up = conv(f.income, m) ?? 0, down = conv(f.expense, m) ?? 0;
    inc += up; exp += down;
    return { m, up, down, note: f.missingMonths ? t('Bu ay için üyelik kaydı yok; üyelik geliri dahil değil.') : undefined };
  });
  const past = rows.filter((r) => !r.future);
  const last = past[past.length - 1], before = past[past.length - 2];
  const net = (r?: MonthRow) => (r ? r.up - (r.down || 0) : 0);
  return (
    <MonthChart title={t('{y} aylık gelir, gider ve net', { y })} rows={rows}
      labels={{ up: t('Gelir'), down: t('Gider'), net: t('Net'), netLong: t('Net (gelir − gider)') }}
      fmt={fmtc} axisFmt={axis}
      headline={last ? { value: t('Net {v}', { v: fmtc(net(last)) }), delta: before ? delta(net(last), net(before)) || undefined : undefined, sub: t('{m} · bir önceki aya göre', { m: monthYear(last.m) }) } : undefined}
      summary={t('Yıl toplamı: gelir {a} · gider {b} · net {c}', { a: fmtc(inc), b: fmtc(exp), c: fmtc(inc - exp) })} />
  );
}

/** Yılın aylık yeni kayıt grafiği. */
export function SignupChart({ data }: { data: any }) {
  const y = new Date().getFullYear();
  let n = 0;
  const rows: MonthRow[] = yearMonths().map(({ m, future }) => {
    const v = future ? 0 : Number((data.monthly.find((x: any) => x.month === m) || {}).signups) || 0;
    n += v;
    return { m, up: v, future };
  });
  return <MonthChart title={t('{y} aylık yeni kayıt', { y })} rows={rows} labels={{ up: t('Yeni kayıt') }} fmt={(v) => String(Math.round(v))} height={200} int
    summary={t('Yıl toplamı: {n} yeni kayıt', { n })} />;
}
