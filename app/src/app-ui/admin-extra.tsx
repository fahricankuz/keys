/* Yönetici paneli: genel bakış göstergeleri, mülk sahibi abonelikleri ve "Bize ulaş" talepleri. */
import { ReactNode, useEffect, useState } from 'react';
import { Linking, View } from 'react-native';
import { extendTrial, humanError, loadCpi, loadKpis, loadSubscriptions, loadSupport, setCpi, setPlan, setSupportStatus } from '../domain/admin';
import { CONFIG } from '../domain/config';
import { planLabel } from '../domain/plans';
import { t, locale } from '../domain/i18n';
import { tl } from '../domain/util';
import { Button, Chip, Field, Text } from '../ui/kit';
import { Loader } from '../ui/Loader';
import { fonts, radius, useBreakpoint, useColors } from '../ui/theme';
import { Card, Empty, H2, Hero, Label, Muted, Row, Seg, Stack } from './blocks';
import { GroupTitle, Kpi, KpiGrid, PageHead } from './admin-ui';

const day = (v: any) => (v ? new Date(v).toLocaleDateString(locale(), { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) + '%' : '—');
const delta = (a: number, b: number) => (b ? (a >= b ? '+' : '−') + Math.abs(Math.round(((a - b) / b) * 100)) + '%' : '');

/** Sunucudan veri yükler; reload() ile yeniden çeker. */
function useLoad<T>(fn: () => Promise<T>, deps: any[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let gone = false;
    setErr(null);
    fn().then((d) => { if (!gone) setData(d); }).catch((e) => { if (!gone) setErr(humanError(e)); });
    return () => { gone = true; };
  }, [...deps, tick]);
  return { data, err, reload: () => setTick((x) => x + 1) };
}

const Spin = () => <View style={{ alignItems: 'center', paddingVertical: 20 }}><Loader size={64} /></View>;

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  const c = useColors();
  return (
    <View style={{ flexGrow: 1, flexBasis: 160, backgroundColor: c.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: c.line, padding: 18, gap: 4 }}>
      <Text v="small" muted>{label}</Text>
      <Text v="h2" style={{ fontFamily: fonts.siteBold, fontSize: 28 }}>{value}</Text>
      {sub ? <Text v="small" muted>{sub}</Text> : null}
    </View>
  );
}
const Grid = ({ children }: { children: ReactNode }) => <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>{children}</View>;

/** Günlük yeni kayıt çubuk grafiği; üzerine gelince günün sayısı görünür. */
function Signups({ series }: { series: any[] }) {
  const c = useColors();
  const [hover, setHover] = useState<number | null>(null);
  const totals = series.map((d) => Number(d.landlords) + Number(d.tenants));
  const max = Math.max(1, ...totals);
  const cur = hover != null ? series[hover] : null;
  return (
    <Card gap={10}>
      <Row between wrap>
        <H2>{t('Günlük yeni kayıt')}</H2>
        <Muted>{cur
          ? day(cur.d) + ' · ' + t('{n} kayıt', { n: totals[hover!] }) + ' (' + t('{a} mülk sahibi, {b} kiracı/ekip', { a: cur.landlords, b: cur.tenants }) + ')'
          : t('En yüksek: {n}', { n: max })}</Muted>
      </Row>
      <View style={{ height: 140, flexDirection: 'row', alignItems: 'flex-end', gap: 3 }}>
        {totals.map((n, i) => (
          <View key={series[i].d} {...({ onMouseEnter: () => setHover(i), onMouseLeave: () => setHover(null) } as any)} onTouchStart={() => setHover(i)}
            accessible accessibilityRole="image" accessibilityLabel={day(series[i].d) + ': ' + n} style={{ flex: 1, height: '100%', justifyContent: 'flex-end' }}>
            <View style={{ height: Math.max(n ? 4 : 2, (n / max) * 132), backgroundColor: hover === i ? c.ink : n ? c.accent : c.surface2, borderRadius: 4 }} />
          </View>
        ))}
      </View>
      <Row between><Muted>{day(series[0]?.d)}</Muted><Muted>{day(series[series.length - 1]?.d)}</Muted></Row>
    </Card>
  );
}

function PlanBars({ plans, total }: { plans: Record<string, number>; total: number }) {
  const c = useColors();
  const rows = ['tek', 'bes', 'kurumsal', 'pro'].map((id) => [id, Number(plans[id] || 0)] as [string, number]).filter(([id, n]) => n || id !== 'pro');
  const max = Math.max(1, ...rows.map((r) => r[1]));
  return (
    <Card gap={10}>
      <H2>{t('Paketler')}</H2>
      {rows.map(([id, n]) => (
        <View key={id} style={{ gap: 4 }}>
          <Row between><Text v="small">{planLabel(id)}</Text><Text v="small" style={{ fontFamily: fonts.bodyBold }}>{n} · {pct(n, total)}</Text></Row>
          <View style={{ height: 8, borderRadius: 4, backgroundColor: c.surface2 }}><View style={{ width: (n / max) * 100 + '%' as any, height: 8, borderRadius: 4, backgroundColor: c.accent }} /></View>
        </View>
      ))}
    </Card>
  );
}

/** Aktivasyon hunisi: her adımda kaç mülk sahibi var ve tüm mülk sahiplerine oranı. */
function Funnel({ f }: { f: any }) {
  const c = useColors();
  const steps: [string, number][] = [
    [t('Kayıt olan mülk sahibi'), f.owners], [t('En az bir mülk ekledi'), f.withProperty],
    [t('Kiracısı bağlandı'), f.withTenant], [t('Onaylı kira ödemesi aldı'), f.withPayment]
  ];
  const max = Math.max(1, f.owners);
  return (
    <Card gap={10}>
      <H2>{t('Aktivasyon hunisi')}</H2>
      <Muted>{t('Mülk sahiplerinin ürünü gerçekten kullanmaya başlama adımları.')}</Muted>
      {steps.map(([label, n], i) => (
        <View key={label} style={{ gap: 4 }}>
          <Row between><Text v="small">{i + 1}. {label}</Text><Text v="small" style={{ fontFamily: fonts.bodyBold }}>{n} · {pct(n, f.owners)}{i ? ' · ' + t('önceki adımdan {p}', { p: pct(n, steps[i - 1][1]) }) : ''}</Text></Row>
          <View style={{ height: 10, borderRadius: 5, backgroundColor: c.surface2 }}><View style={{ width: (n / max) * 100 + '%' as any, height: 10, borderRadius: 5, backgroundColor: i === steps.length - 1 ? c.okInk : c.accent }} /></View>
        </View>
      ))}
    </Card>
  );
}

/** Genel bakış: koyu özet kartı ve Büyüme / Gelir / Kullanım / Operasyon gösterge grupları.
    `ops`: panelin yüklediği özet (denetim bekleyen, askıdaki hesap). */
export function Overview({ ops }: { ops?: { pending?: number; banned?: number } }) {
  const c = useColors();
  const { desktop } = useBreakpoint();
  const [days, setDays] = useState('30');
  const { data: k, err } = useLoad<any>(() => loadKpis(Number(days)), [days]);
  const head = <PageHead label={t('Yönetici')} title={t('Genel bakış')} sub={t('anahtar’ın büyümesi, geliri ve kullanımı tek ekranda.')}
    right={<View style={{ minWidth: 260 }}><Seg value={days} onChange={setDays} options={[['7', t('7 gün')], ['30', t('30 gün')], ['90', t('90 gün')]]} /></View>} />;
  if (err) return <Stack>{head}<Text v="small" color={c.badInk}>{err}</Text></Stack>;
  if (!k) return <Stack>{head}<Spin /></Stack>;
  const plans = k.plans || {};
  const priced = CONFIG.billing.tiers.filter((x: any) => x.price != null);
  const mrr = priced.length ? priced.reduce((a: number, x: any) => a + Number(plans[x.id] || 0) * Number(x.price), 0) : null;
  const o = k.owners;
  const extra = !!k.activeUsers;
  return (
    <Stack gap={16}>
      {head}
      {/* Özet: kira kartı tarzında koyu kart. */}
      <Hero gap={14}>
        <Label onDark>{t('Bu ay onaylı kira hacmi')}</Label>
        <Row between align="flex-end" wrap>
          <View style={{ gap: 4 }}>
            <Text v="num" color={c.heroInk} style={{ fontSize: 46, lineHeight: 50 }}>{tl(k.rent.month)}</Text>
            <Muted onDark>{[delta(k.rent.month, k.rent.prevMonth), t('geçen ay: {v}', { v: tl(k.rent.prevMonth) })].filter(Boolean).join(' · ')}</Muted>
          </View>
          <Row gap={22} wrap>
            {[[t('Üye'), String(k.users.total)], [t('Ödeyen'), String(o.paying)], [t('Aylık gelir'), mrr == null ? '—' : tl(mrr)], [t('Yönetilen mülk'), String(k.units.total)]].map(([a, b]) => (
              <View key={a} style={{ gap: 2 }}><Muted onDark>{a}</Muted><Text v="h3" color={c.heroInk} style={{ fontFamily: fonts.siteBold }}>{b}</Text></View>
            ))}
          </Row>
        </Row>
      </Hero>

      <GroupTitle>{t('Büyüme')}</GroupTitle>
      <KpiGrid>
        <Kpi icon="landlord" tone="peach" label={t('Üye')} value={String(k.users.total)} sub={t('{a} mülk sahibi · {b} kiracı · {c} ekip', { a: k.users.landlords, b: k.users.tenants, c: k.users.team })} />
        <Kpi icon="plus" tone="butter" label={t('Yeni kayıt ({n} gün)', { n: k.days })} value={String(k.signups.period)} trend={delta(k.signups.period, k.signups.prev) || undefined} sub={t('önceki dönem: {n}', { n: k.signups.prev })} />
        <Kpi icon="flag" tone="sky" label={t('Denemede')} value={String(o.trial)} sub={t('{n} tanesi 7 gün içinde bitiyor', { n: o.expiring })} />
        <Kpi icon="check" tone="sage" label={t('Ödeyen mülk sahibi')} value={String(o.paying)} sub={t('Dönüşüm: {p}', { p: pct(o.paying, o.total) })} />
      </KpiGrid>

      <GroupTitle>{t('Gelir')}</GroupTitle>
      <KpiGrid>
        <Kpi icon="chart" tone="sage" label={t('Aylık gelir (tahmini)')} value={mrr == null ? '—' : tl(mrr)} sub={mrr == null ? t('Fiyatlar tanımlanınca hesaplanır') : t('Fiyatı tanımlı paketlerden')} />
        <Kpi icon="chart" tone="butter" label={t('Yıllık gelir (ARR, tahmini)')} value={mrr == null ? '—' : tl(mrr * 12)} sub={t('Aylık gelirin 12 katı')} />
        <Kpi icon="card" tone="sky" label={t('Ödeyen başına aylık gelir')} value={mrr == null || !o.paying ? '—' : tl(mrr / o.paying)} sub={t('ARPU')} />
        <Kpi icon="bell" tone="peach" label={t('Ödeme sorunu')} value={String(k.billingIssues)} sub={t('{n} abonelik yenilenmeyecek', { n: k.cancelling })} />
      </KpiGrid>

      {extra ? (
        <>
          <GroupTitle>{t('Kullanım')}</GroupTitle>
          <KpiGrid>
            <Kpi icon="home" tone="peach" label={t('Haftalık etkin kullanıcı')} value={String(k.activeUsers.week)} sub={t('Bağlılık (haftalık / aylık): {p}', { p: pct(k.activeUsers.week, k.activeUsers.month) })} />
            <Kpi icon="calendar" tone="sky" label={t('Aylık etkin kullanıcı')} value={String(k.activeUsers.month)} sub={t('Son 30 günde en az bir işlem')} />
            <Kpi icon="send" tone="butter" label={t('Davet kabul oranı ({n} gün)', { n: k.days })} value={pct(k.invites.accepted, k.invites.created)} sub={t('{a} davet · {b} kabul', { a: k.invites.created, b: k.invites.accepted })} />
            <Kpi icon="key" tone="sage" label={t('Zamanında ödeme (geçen ay)')} value={pct(k.punctuality.onTime, k.punctuality.onTime + k.punctuality.late)} sub={t('{a} vadesinde · {b} geç', { a: k.punctuality.onTime, b: k.punctuality.late })} />
          </KpiGrid>
        </>
      ) : <Muted>{t('Ek göstergeler için Supabase’de supabase/schema.sql dosyasını yeniden çalıştır.')}</Muted>}

      <GroupTitle>{t('Operasyon')}</GroupTitle>
      <KpiGrid>
        <Kpi icon="doc" tone={ops?.pending ? 'peach' : 'sky'} label={t('Denetim bekleyen')} value={String(ops?.pending ?? 0)} sub={t('Dekont, belge ve fatura')} />
        {extra ? <Kpi icon="wrench" tone="butter" label={t('Açık arıza / tadilat talebi')} value={String(k.requests.open)} sub={t('{a} çözüldü · dönemde {b} yeni', { a: k.requests.done, b: k.requests.period })} /> : null}
        <Kpi icon="chat" tone="sky" label={t('Açık destek talebi')} value={String(k.supportOpen)} sub={t('Kurumsal, içe aktarma, genel')} />
        <Kpi icon="x" tone="peach" label={t('Askıdaki hesap')} value={String(ops?.banned ?? 0)} sub={t('Erişimi biten: {n}', { n: o.lapsed })} />
      </KpiGrid>

      <View style={{ flexDirection: desktop ? 'row' : 'column', gap: 16, alignItems: 'stretch', marginTop: 8 }}>
        <View style={{ flex: 1.3 }}><Signups series={k.series} /></View>
        <View style={{ flex: 1 }}>{extra ? <Funnel f={k.funnel} /> : <PlanBars plans={plans} total={o.paying} />}</View>
      </View>
      {extra ? <PlanBars plans={plans} total={o.paying} /> : null}
    </Stack>
  );
}

const FILTERS: [string, string][] = [['all', 'Hepsi'], ['trial', 'Denemede'], ['expiring', '7 günde bitiyor'], ['paying', 'Ödeyen'], ['issue', 'Ödeme sorunu'], ['lapsed', 'Erişimi biten']];

/** Deneme uzatma ve elle paket verme (gerekçe kayda yazılır). */
function SubActions({ s, reload }: { s: any; reload: () => void }) {
  const c = useColors();
  const [mode, setMode] = useState('');
  const [days, setDays] = useState('14');
  const [plan, setPlanId] = useState('kurumsal');
  const [until, setUntil] = useState('');
  const [why, setWhy] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const store = s.subscribed && s.store && s.store !== 'admin';
  const run = async (fn: () => Promise<any>) => {
    if (!why.trim()) { setErr(t('Gerekçe yaz.')); return; }
    setBusy(true); setErr(null);
    try { await fn(); setMode(''); setWhy(''); reload(); } catch (e) { setErr(humanError(e)); }
    setBusy(false);
  };
  if (!mode) return (
    <Row wrap>
      <Button kind="ghost" title={t('Denemeyi uzat')} onPress={() => setMode('trial')} />
      {store ? <Muted>{t('Mağaza aboneliği; paket mağazadan yönetilir.')}</Muted> : <Button kind="ghost" title={t('Paket ver')} onPress={() => setMode('plan')} />}
      {s.store === 'admin' && s.subscribed ? <Button kind="ghost" title={t('Paketi kaldır')} onPress={() => { setMode('plan'); setPlanId(''); }} /> : null}
    </Row>
  );
  return (
    <View style={{ gap: 10 }}>
      {mode === 'trial'
        ? <Field label={t('Eklenecek gün (1–90)')} value={days} onChangeText={(x) => setDays(x.replace(/\D/g, '').slice(0, 2))} keyboardType="numeric" />
        : <>
          <Seg value={plan} onChange={setPlanId} options={[['tek', planLabel('tek')], ['bes', planLabel('bes')], ['kurumsal', planLabel('kurumsal')], ['', t('Paketi kaldır')]]} />
          {plan ? <Field label={t('Bitiş tarihi (YYYY-AA-GG, boş: süresiz)')} value={until} onChangeText={setUntil} placeholder="2027-12-31" maxLength={10} /> : null}
        </>}
      <Field label={t('Gerekçe')} value={why} onChangeText={setWhy} placeholder={t('Kayda yazılır')} maxLength={240} />
      <Row wrap>
        <Button kind="ghost" title={t('Vazgeç')} onPress={() => { setMode(''); setErr(null); }} />
        <Button loading={busy} title={mode === 'trial' ? t('Uzat') : plan ? t('Paketi ver') : t('Paketi kaldır')}
          onPress={() => run(() => mode === 'trial' ? extendTrial(s.id, Number(days), why.trim()) : setPlan(s.id, plan, until ? until + 'T23:59:59Z' : null, why.trim()))} />
      </Row>
      {err ? <Text v="small" color={c.badInk}>{err}</Text> : null}
    </View>
  );
}

export function Subscriptions() {
  const c = useColors();
  const { data, err, reload } = useLoad<any[]>(() => loadSubscriptions());
  const [q, setQ] = useState('');
  const [f, setF] = useState('all');
  const soon = Date.now() + 7 * 86400000;
  const list = (data || []).filter((s) =>
    (f === 'all' || (f === 'trial' && s.in_trial) || (f === 'expiring' && s.in_trial && Date.parse(s.trial_ends) < soon) || (f === 'paying' && s.subscribed)
      || (f === 'issue' && s.billing_issue) || (f === 'lapsed' && !s.subscribed && !s.in_trial))
    && (!q.trim() || [s.name, s.email].join(' ').toLocaleLowerCase('tr').includes(q.trim().toLocaleLowerCase('tr'))));
  return (
    <Stack>
      <Field label={t('E-postayla ara')} value={q} onChangeText={setQ} placeholder={t('Ad ya da e-posta')} autoCapitalize="none" />
      <Seg scroll value={f} onChange={setF} options={FILTERS.map(([k, l]) => [k, t(l)] as [string, string])} />
      {err ? <Text v="small" color={c.badInk}>{err}</Text> : null}
      {data || err ? null : <Spin />}
      {data && !list.length ? <Empty>{t('Eşleşen mülk sahibi yok.')}</Empty> : null}
      {list.map((s) => (
        <Card key={s.id} gap={8}>
          <Row between wrap>
            <View style={{ flex: 1, minWidth: 200 }}><H2>{s.name || s.email}</H2><Muted>{s.email} · {t('Kayıt')}: {day(s.created_at)}</Muted></View>
            <Row gap={8} wrap>
              {s.subscribed ? <Chip tone="ok" label={planLabel(s.plan)} /> : s.in_trial ? <Chip tone="warn" label={t('Deneme')} /> : <Chip tone="bad" label={t('Erişim yok')} />}
              {s.billing_issue ? <Chip tone="bad" label={t('Ödeme sorunu')} /> : null}
              {s.banned ? <Chip tone="bad" label={t('Askıda')} /> : null}
            </Row>
          </Row>
          <Muted>{s.subscribed
            ? [t('Kaynak: {s}', { s: s.store === 'admin' ? t('yönetici') : s.store || '—' }), s.expires_at ? t('Bitiş: {d}', { d: day(s.expires_at) }) : t('Süresiz'), s.will_renew ? t('Yenilenecek') : t('Yenilenmeyecek')].join(' · ')
            : t('Deneme bitişi: {d}', { d: day(s.trial_ends) }) + (s.extra_days ? ' · ' + t('+{n} gün uzatıldı', { n: s.extra_days }) : '')}</Muted>
          <Muted>{t('{n} mülk', { n: s.units })} · {t('{n} kiracı', { n: s.tenants })}</Muted>
          <SubActions s={s} reload={reload} />
        </Card>
      ))}
    </Stack>
  );
}

const KIND: Record<string, string> = { kurumsal: 'Kurumsal paket', import: 'Toplu içe aktarma', upgrade: 'Paket yükseltme', genel: 'Genel' };

export function Support({ onConvert }: { onConvert?: (r: any) => void }) {
  const c = useColors();
  const [f, setF] = useState('open');
  const { data, err, reload } = useLoad<any[]>(() => loadSupport());
  const list = (data || []).filter((r) => f === 'all' || r.status === f);
  const toggle = async (r: any) => { try { await setSupportStatus(r.id, r.status === 'open' ? 'done' : 'open'); reload(); } catch {} };
  return (
    <Stack>
      <Seg value={f} onChange={setF} options={[['open', t('Açık')], ['done', t('Kapatılan')], ['all', t('Hepsi')]]} />
      {err ? <Text v="small" color={c.badInk}>{err}</Text> : null}
      {data || err ? null : <Spin />}
      {data && !list.length ? <Empty>{t('Talep yok.')}</Empty> : null}
      {list.map((r) => (
        <Card key={r.id} gap={6}>
          <Row between wrap>
            <View style={{ flex: 1, minWidth: 200 }}><H2>{r.name || r.email || '—'}{r.company ? ' · ' + r.company : ''}</H2><Muted>{[r.email, r.phone].filter(Boolean).join(' · ')}</Muted></View>
            <Row gap={8} wrap>
              <Chip tone="accent" label={t(KIND[r.kind] || r.kind)} />
              {r.source === 'web' ? <Chip tone="warn" label={t('Web formu')} /> : null}
              {r.units ? <Chip label={t('{n} mülk', { n: r.units })} /> : null}
              <Muted>{day(r.created_at)}</Muted>
            </Row>
          </Row>
          {r.details && (r.details.types?.length || r.details.role || r.details.city || r.details.timeline) ? (
            <Muted>{[r.details.types?.length ? r.details.types.map((x: string) => t(x)).join(', ') : '', r.details.role ? t(r.details.role) : '', r.details.city, r.details.timeline ? t(r.details.timeline) : ''].filter(Boolean).join(' · ')}</Muted>
          ) : null}
          {r.message ? <Text v="small" selectable>{r.message}</Text> : null}
          <Row wrap>
            {r.email ? <Button kind="ghost" title={t('E-posta gönder')} onPress={() => Linking.openURL('mailto:' + r.email + '?subject=' + encodeURIComponent(t('anahtar iletişim talebin'))).catch(() => {})} /> : null}
            {r.kind === 'kurumsal' && r.status === 'open' && onConvert ? <Button title={t('Kuruma çevir')} onPress={() => onConvert(r)} /> : null}
            <Button kind={r.status === 'open' ? 'primary' : 'ghost'} title={r.status === 'open' ? t('Kapat') : t('Yeniden aç')} onPress={() => toggle(r)} />
          </Row>
        </Card>
      ))}
    </Stack>
  );
}

/** Yasal kira artış oranları: tufe-sync fonksiyonu her ay doldurur; yönetici elle girer ya da düzeltir. */
export function CpiRates() {
  const c = useColors();
  const { data, err, reload } = useLoad<any[]>(() => loadCpi());
  const now = new Date();
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const [month, setMonth] = useState(prev.getFullYear() + '-' + String(prev.getMonth() + 1).padStart(2, '0'));
  const [rate, setRate] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const save = async (m: string, r: string) => {
    setMsg(null);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(m)) { setMsg(t('Ayı YYYY-AA biçiminde yaz (ör. 2026-09).')); return; }
    try { await setCpi(m, r.replace(',', '.')); setRate(''); reload(); } catch (e) { setMsg(humanError(e)); }
  };
  return (
    <Stack>
      <Card gap={12}>
        <H2>{t('Oran gir')}</H2>
        <Muted>{t('TÜİK bülteninde “12 aylık ortalamalara göre değişim” satırındaki TÜFE oranı. Ay, verinin ait olduğu aydır (ör. Ekim başında açıklanan Eylül verisi için 2026-09).')}</Muted>
        <Row gap={10} wrap align="flex-end">
          <View style={{ flexGrow: 1, flexBasis: 160 }}><Field label={t('Ay (YYYY-AA)')} value={month} onChangeText={setMonth} maxLength={7} /></View>
          <View style={{ flexGrow: 1, flexBasis: 160 }}><Field label={t('Oran (%)')} value={rate} onChangeText={(x) => setRate(x.replace(/[^0-9.,-]/g, ''))} keyboardType="decimal-pad" placeholder="ör. 33,45" /></View>
          <Button title={t('Kaydet')} onPress={() => save(month, rate)} disabled={!rate} style={{ minHeight: 52 }} />
        </Row>
        {msg ? <Text v="small" color={c.badInk}>{msg}</Text> : null}
      </Card>
      {err ? <Text v="small" color={c.badInk}>{err}</Text> : null}
      {data || err ? null : <Spin />}
      {data && !data.length ? <Empty>{t('Henüz oran yok. tufe-sync fonksiyonu kurulunca her ay kendiliğinden eklenir.')}</Empty> : null}
      {data && data.length ? (
        <Card gap={0}>
          {data.map((r, i) => (
            <Row key={r.month} between style={{ paddingVertical: 12, borderTopWidth: i ? 1 : 0, borderColor: c.line }}>
              <Text v="small" style={{ fontFamily: fonts.bodyBold, flex: 1 }}>{r.month}</Text>
              <Text v="small" style={{ fontFamily: fonts.bodyXBold, width: 90 }}>%{String(r.avg12).replace('.', ',')}</Text>
              <Chip tone={r.source === 'evds' ? 'ok' : 'warn'} label={r.source === 'evds' ? t('Otomatik') : t('Elle')} />
              <Button kind="quiet" title={t('Sil')} onPress={() => save(r.month, '')} />
            </Row>
          ))}
        </Card>
      ) : null}
    </Stack>
  );
}
