/* Büyüme → Ayrılan aboneler (churn) ve Kohort analizi. Hesaplar: domain/churn.js. */
import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { t } from '../domain/i18n';
import { humanError } from '../domain/backend';
import { atRisk, churnByMonth, churnKinds, cohortGrid, cohortSummary, loadChurn, payingGrid } from '../domain/churn';
import { periodMonths } from '../domain/admin-finance';
import { fmtFull, monthYear, parse, tl } from '../domain/util';
import { Button, Text } from '../ui/kit';
import { Loader } from '../ui/Loader';
import { fonts, useColors } from '../ui/theme';
import { Card, Empty, H2, Muted, Row, Seg, Stack } from './blocks';
import { Kpi, KpiGrid } from './admin-ui';
import { MonthChart, SERIES, type MonthRow } from './admin-charts';
import type { Period } from './admin-finance-ui';

const pct = (v: number | null) => (v == null ? '—' : '%' + (Math.round(v * 1000) / 10).toLocaleString('tr-TR'));
const day = (v?: string) => (v ? fmtFull(parse(String(v).slice(0, 10))) : '—');
const GroupTitle = ({ children }: { children: string }) => <Text v="h3" style={{ fontFamily: fonts.siteBold, marginTop: 8 }}>{children}</Text>;

export function useChurn() {
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { loadChurn().then(setD).catch((e) => setErr(humanError(e))); }, []);
  return { d, err };
}

/** Ayrılan aboneler: göstergeler, ayrılış türleri, erken uyarı listesi ve aylık yeni / ayrılan ödeyen grafiği. */
export function ChurnSection({ d, period, onCrm }: { d: any; period: Period; onCrm?: (s: any) => void }) {
  const c = useColors();
  const pm = periodMonths(period);
  const cur = churnByMonth(d.events, d.subs, pm.cur);
  const prev = churnByMonth(d.events, d.subs, pm.prev);
  const sum = (rows: any[], k: string) => rows.reduce((a, r) => a + (r[k] || 0), 0);
  const ended = sum(cur, 'ended'), started = sum(cur, 'started'), lost = sum(cur, 'lostMrr');
  const base = cur[0]?.payersStart || 0;
  const rate = base ? ended / base : null;
  const prevRate = prev[0]?.payersStart ? sum(prev, 'ended') / prev[0].payersStart : null;
  const kinds = churnKinds(d.events, d.subs, pm.cur);
  const risk = atRisk(d.subs);
  const y = new Date().getFullYear();
  const months = Array.from({ length: 12 }, (_, i) => y + '-' + String(i + 1).padStart(2, '0'));
  const now = new Date().toISOString().slice(0, 7);
  const yr = churnByMonth(d.events, d.subs, months);
  const rows: MonthRow[] = yr.map((r) => ({ m: r.m, up: r.started, down: r.ended, future: r.m > now }));
  const approx = d.events.some((e: any) => e.backfill);
  const riskRow = (s: any, why: string) => (
    <Row key={s.id + why} between wrap style={{ paddingVertical: 8, borderTopWidth: 1, borderTopColor: c.line }}>
      <View style={{ flex: 1, minWidth: 200, gap: 2 }}>
        <Text v="small" style={{ fontFamily: fonts.bodyBold }}>{s.name || s.email}</Text>
        <Muted>{[s.email, why, t('bitiş {d}', { d: day(s.expires_at) })].filter(Boolean).join(' · ')}</Muted>
      </View>
      {onCrm ? <Button kind="ghost" title={t('CRM’e ekle')} onPress={() => onCrm(s)} style={{ minHeight: 38 }} /> : null}
    </Row>
  );
  return (
    <Stack gap={12}>
      <GroupTitle>{t('Ayrılan aboneler')}</GroupTitle>
      <KpiGrid>
        <Kpi icon="flag" tone="peach" label={period === 'year' ? t('Ayrılan (bu yıl)') : t('Ayrılan (bu ay)')} value={String(ended)} sub={t('Dönem başında {n} ödeyen', { n: base })} />
        <Kpi icon="chart" tone="sky" label={t('Churn oranı')} value={pct(rate)} sub={t('Önceki dönem: {p}', { p: pct(prevRate) })} />
        <Kpi icon="card" tone="butter" label={t('Kaybedilen aylık gelir')} value={tl(lost)} sub={t('Ayrılanların paket fiyatından')} />
        <Kpi icon="plus" tone="sage" label={t('Net abone değişimi')} value={(started - ended >= 0 ? '+' : '−') + Math.abs(started - ended)} sub={t('{a} yeni ödeyen · {b} ayrılan', { a: started, b: ended })} />
      </KpiGrid>
      <Card gap={8}>
        <H2>{t('Ayrılış türleri')}</H2>
        {[[t('Denemesi bitip ödemeyen'), kinds.trialLost], [t('Yenilemeyi kapatıp süresi biten'), kinds.cancel], [t('Ödemesi alınamayan'), kinds.payment], [t('Diğer / bilinmeyen'), kinds.other]].map(([l, n]: any) => (
          <Row key={l} between><Text v="small">{l}</Text><Text v="small" style={{ fontFamily: fonts.bodyXBold, fontVariant: ['tabular-nums'] }}>{n}</Text></Row>
        ))}
      </Card>
      <Card gap={4}>
        <H2>{t('Erken uyarı: kurtarılabilir aboneler')}</H2>
        <Muted>{t('Yenilemeyi kapatan ama süresi bitmemiş ya da ödemesi alınamayan ödeyenler. Bitiş tarihi yakın olan üstte.')}</Muted>
        {risk.cancelled.length + risk.billing.length ? (
          <>
            {risk.billing.slice(0, 20).map((s: any) => riskRow(s, t('ödeme sorunu')))}
            {risk.cancelled.slice(0, 20).map((s: any) => riskRow(s, t('yenileme kapalı')))}
          </>
        ) : <Empty>{t('Şu an risk görünen ödeyen yok.')}</Empty>}
      </Card>
      <MonthChart title={t('{y} ödeyen abone: yeni ve ayrılan', { y })} rows={rows} int height={220}
        labels={{ up: t('Yeni ödeyen'), down: t('Ayrılan'), net: t('Net'), netLong: t('Net abone değişimi') }} fmt={(v) => String(Math.round(v))}
        summary={t('Yıl toplamı: {a} yeni ödeyen · {b} ayrılan', { a: sum(yr, 'started'), b: sum(yr, 'ended') })} />
      {approx ? <Muted>{t('Abonelik geçmişi bu sürümle tutulmaya başladı; önceki ayrılışlar bitiş tarihlerinden yaklaşık dolduruldu. Ayrılıp sonra geri dönenler eski aylarda görünmez.')}</Muted> : null}
    </Stack>
  );
}

/** Kohort analizi: kayıt ayına göre, sonraki aylarda etkin (ya da ödeyen) kalanların oranı. */
export function CohortSection({ d }: { d: any }) {
  const c = useColors();
  const [kind, setKind] = useState<'active' | 'paying'>('active');
  const [role, setRole] = useState('all');
  const dark = c.bg === '#1D1A19';
  const hue = dark ? SERIES.dark.up : SERIES.light.up;
  const grid = kind === 'active' ? cohortGrid(d.cohorts, role) : payingGrid(d.events, d.subs);
  const s = cohortSummary(grid);
  const K = 12;
  const cell = (v: number | null, key: string) => (
    <View key={key} style={{ width: 52, height: 34, borderRadius: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: v == null ? 'transparent' : c.surface }}>
      {v != null ? <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, borderRadius: 6, backgroundColor: hue, opacity: 0.1 + v * 0.9 }} /> : null}
      <Text v="small" style={{ fontSize: 12, fontVariant: ['tabular-nums'], color: v != null && v >= 0.7 ? '#FFFFFF' : c.ink, fontFamily: fonts.bodyBold }}>{v == null ? '' : '%' + Math.round(v * 100)}</Text>
    </View>
  );
  return (
    <Stack gap={12}>
      <GroupTitle>{t('Kohort analizi')}</GroupTitle>
      <Card gap={10}>
        <Row between wrap>
          <Seg value={kind} onChange={(v: any) => setKind(v)} options={[['active', t('Etkin kalan')], ['paying', t('Ödeyen')]]} />
          {kind === 'active' ? <Seg value={role} onChange={setRole} options={[['all', t('Hepsi')], ['landlord', t('Mülk sahibi')], ['tenant', t('Kiracı')]]} /> : <Muted>{t('Yalnız mülk sahipleri')}</Muted>}
        </Row>
        <Muted>{kind === 'active'
          ? t('Satır: kayıt ayı. Sütun: kayıttan sonraki ay (0 = kayıt ayı). Hücre: o ay en az bir işlem yapanların oranı.')
          : t('Satır: kayıt ayı. Sütun: kayıttan sonraki ay. Hücre: o ay ödeyen abone olanların oranı.')}</Muted>
        {grid.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator>
            <View style={{ gap: 4 }}>
              <Row gap={4}>
                <View style={{ width: 132 }}><Muted>{t('Kayıt ayı')}</Muted></View>
                {Array.from({ length: K }, (_, k) => <View key={k} style={{ width: 52, alignItems: 'center' }}><Muted>{t('{k}. ay', { k })}</Muted></View>)}
              </Row>
              {grid.map((r: any) => (
                <Row key={r.cohort} gap={4}>
                  <View style={{ width: 132 }}><Text v="small" style={{ fontFamily: fonts.bodyBold }}>{monthYear(r.cohort)}</Text><Muted>{t('{n} kişi', { n: r.size })}</Muted></View>
                  {r.cells.map((v: number | null, k: number) => cell(v, r.cohort + k))}
                </Row>
              ))}
            </View>
          </ScrollView>
        ) : <Empty>{t('Henüz kohort verisi yok.')}</Empty>}
        {s.curve[1] != null ? (
          <Text v="small" style={{ fontFamily: fonts.bodyBold }}>
            {[t('Ortalama: 1. ay {a}, 3. ay {b}.', { a: pct(s.curve[1]), b: pct(s.curve[3]) }),
              s.drop && s.drop.d > 0 ? t('En büyük düşüş {k}. ayda ({p} puan).', { k: s.drop.k, p: Math.round(s.drop.d * 100) }) : ''].filter(Boolean).join(' ')}
          </Text>
        ) : null}
      </Card>
    </Stack>
  );
}

export function ChurnAndCohorts({ period, onCrm }: { period: Period; onCrm?: (s: any) => void }) {
  const c = useColors();
  const { d, err } = useChurn();
  if (err) return <Text v="small" color={c.badInk}>{err}</Text>;
  if (!d) return <View style={{ alignItems: 'center', paddingVertical: 20 }}><Loader size={48} /></View>;
  return (
    <Stack gap={16}>
      <ChurnSection d={d} period={period} onCrm={onCrm} />
      <CohortSection d={d} />
    </Stack>
  );
}
