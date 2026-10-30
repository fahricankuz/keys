/* Kurum paneli: sektöre özgü Özet ve birim kurulum sihirbazı.
   Site: ayın aidatı ve tahsilatı, borçlular, işletme projesi, duyurular, talepler.
   AVM / depo / GYO: ayın kira tahakkuku (sabit kira, ciro farkı, ortak gider; döviz kurla) ve tahsilatı, geciken kiralar,
   doluluk ve WALT, ciro, kira artışları; GYO'da varlıklara göre kırılım. Kapalı modülün kartı görünmez (org.js → hasModule). */
import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { t } from '../domain/i18n';
import { humanError } from '../domain/backend';
import { hasModule, terms } from '../domain/org';
import { dueIncreases, importUnits, isCommercial, kindLabel, lateFee, occupancy, overdue, unitLabel, unitPlan, unpaidOf } from '../domain/site';
import { loadRates } from '../domain/cpi';
import { tl, monthYear, fmtFull, parse, mkey } from '../domain/util';
import { Button, Chip, Field, PressScale, Text } from '../ui/kit';
import { fonts, radius, useBreakpoint, useColors } from '../ui/theme';
import { Card, Empty, H2, Label, Muted, Note, Row, Stack } from './blocks';
import { Pill } from './org';
import { MoneyField } from './forms';

const thisMonth = () => mkey(new Date());
const day = (v?: string) => (v ? fmtFull(parse(String(v).slice(0, 10))) : '—');
const pct = (x: number | null | undefined) => (x == null ? '—' : '%' + Math.round(x * 100));
const money = (n: any, cur?: string) => (!cur || cur === 'TRY' ? tl(n) : (cur === 'USD' ? '$' : '€') + Number(n || 0).toLocaleString('tr-TR', { maximumFractionDigits: 2 }));
const daysLate = (x: any) => {
  const due = x.due_on ? new Date(x.due_on + 'T12:00:00') : (() => { const [y, m] = String(x.month).split('-').map(Number); return new Date(y, m, 0, 12); })();
  return Math.max(0, Math.floor((Date.now() - due.getTime()) / 864e5));
};

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card style={{ flexGrow: 1, flexBasis: 140, minWidth: 140 }} gap={2}>
      <Label>{label}</Label>
      <Text v="h3" numberOfLines={1} style={{ fontFamily: fonts.displayBold, fontSize: value.length > 9 ? 18 : undefined }}>{value}</Text>
      {sub ? <Muted>{sub}</Muted> : null}
    </Card>
  );
}

function Section({ title, link, onLink, children }: { title: string; link?: string; onLink?: () => void; children: any }) {
  const c = useColors();
  return (
    <Card gap={4}>
      <Row between>
        <H2>{title}</H2>
        {link && onLink ? <PressScale onPress={onLink} accessibilityRole="link"><Text v="small" color={c.accentText} style={{ fontFamily: fonts.bodyXBold }}>{link}</Text></PressScale> : null}
      </Row>
      {children}
    </Card>
  );
}

function Line({ title, sub, right, first }: { title: string; sub?: string; right?: any; first?: boolean }) {
  const c = useColors();
  return (
    <Row between style={{ paddingVertical: 9, borderTopWidth: first ? 0 : 1, borderColor: c.line }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text v="small" style={{ fontFamily: fonts.bodyBold }}>{title}</Text>
        {sub ? <Muted>{sub}</Muted> : null}
      </View>
      {typeof right === 'string' ? <Text v="small" style={{ fontFamily: fonts.bodyXBold }}>{right}</Text> : right}
    </Row>
  );
}

export function Overview({ d, org, can, reload, go, ChargeRow }: {
  d: any; org: any; can: (p: string) => boolean; reload: () => void; go: (k: string) => void; ChargeRow: any;
}) {
  const c = useColors();
  const { desktop } = useBreakpoint();
  const sector = org.sector;
  const commercial = isCommercial(sector);
  const T = terms(sector);
  const m = thisMonth();
  const unitBy: Record<string, any> = Object.fromEntries(d.units.map((u: any) => [u.id, u]));
  const cur = d.charges.filter((x: any) => x.month === m);
  const total = cur.reduce((a: number, x: any) => a + Number(x.amount), 0);
  const got = cur.reduce((a: number, x: any) => a + (x.status === 'paid' ? Number(x.amount) : x.status === 'partial' ? Number(x.paid_amount) || 0 : 0), 0);
  const byKind: Record<string, number> = {};
  cur.forEach((x: any) => { byKind[x.kind] = (byKind[x.kind] || 0) + Number(x.amount); });
  const fxUsed = cur.some((x: any) => x.currency && x.currency !== 'TRY');
  const late = d.charges.filter((x: any) => overdue(x));
  const lateUnits = new Set(late.map((x: any) => x.unit_id));
  const waiting = d.charges.filter((x: any) => x.status === 'review');
  const openReq = d.requests.filter((x: any) => x.status < 3);
  const occ = commercial && hasModule(org, 'doluluk') ? occupancy(d) : null;
  const [rates, setRates] = useState<any>(null);
  useEffect(() => { if (commercial && hasModule(org, 'endeksleme')) loadRates().then(setRates).catch(() => setRates({})); }, [commercial]);
  const increases = useMemo(() => (rates ? dueIncreases(d.units, d.rentChanges, rates) : []), [rates, d]);

  // Kurulum: henüz birim yoksa önce sihirbaz.
  if (!d.units.length) {
    return (
      <Card gap={10} style={{ borderWidth: 2, borderColor: c.accent }}>
        <H2>{Number(org.units) ? t('Sözleşmende {n} {w} var, oluşturalım.', { n: org.units, w: T.unit.toLocaleLowerCase('tr') }) : t('İlk adım: {w} kayıtlarını oluştur', { w: T.unit.toLocaleLowerCase('tr') })}</H2>
        <Muted>{t('Kurulum sihirbazı blok, kat ve numaralandırmaya göre kayıtları tek seferde açar; sonra her birini düzenleyebilirsin.')}</Muted>
        {can('units.manage') ? <Button title={t('Kuruluma başla')} onPress={() => go('birimler')} style={{ alignSelf: 'flex-start' }} /> : null}
      </Card>
    );
  }

  // Borçlu / geciken: birim başına toplam, en eski gecikme.
  const debt: Record<string, { left: number; fee: number; n: number; days: number; kinds: Set<string>; fx: string }> = {};
  late.forEach((x: any) => {
    const k = x.unit_id;
    debt[k] = debt[k] || { left: 0, fee: 0, n: 0, days: 0, kinds: new Set(), fx: '' };
    debt[k].left += unpaidOf(x); debt[k].fee += commercial ? 0 : lateFee(x); debt[k].n += 1;
    debt[k].days = Math.max(debt[k].days, daysLate(x)); debt[k].kinds.add(kindLabel(x.kind, x.title));
    if (x.currency && x.currency !== 'TRY' && x.orig_amount) debt[k].fx = money(x.orig_amount, x.currency);
  });
  const debtors = Object.entries(debt).sort((a, b) => b[1].left - a[1].left);
  const debtTotal = debtors.reduce((a, [, v]) => a + v.left, 0);

  const heroLabel = commercial ? t('{month} kira tahakkuku', { month: monthYear(m) }) : t('{month} aidatı', { month: monthYear(m) });
  const parts = commercial
    ? [byKind.kira ? t('Sabit kira') + ' ' + tl(byKind.kira) : '', byKind.ciro ? t('ciro farkı') + ' ' + tl(byKind.ciro) : '',
       byKind.ortak_gider ? t('ortak gider') + ' ' + tl(byKind.ortak_gider) : '', fxUsed ? t('dövizli sözleşmeler kurla') : ''].filter(Boolean).join(' · ')
    : t('{n} daire', { n: d.units.length }) + (byKind.aidat && total !== byKind.aidat ? ' · ' + t('aidat') + ' ' + tl(byKind.aidat) : '');
  const rate = total ? got / total : 0;

  const hero = (
    <View style={{ backgroundColor: c.hero, borderRadius: radius.lg, padding: 22, flexDirection: 'row', flexWrap: 'wrap', gap: 24, alignItems: 'flex-end' }}>
      <View style={{ flexGrow: 1, flexBasis: 280, gap: 4 }}>
        <Text v="small" color={c.heroMuted} style={{ fontFamily: fonts.bodyBold, letterSpacing: 0.6, textTransform: 'uppercase', fontSize: 11 }}>{heroLabel}</Text>
        <Text v="h1" color={c.heroInk} style={{ fontFamily: fonts.siteBold, fontSize: 36, lineHeight: 40 }}>{tl(total)}</Text>
        {parts ? <Text v="small" color={c.heroMuted}>{parts}</Text> : null}
      </View>
      <View style={{ flexGrow: 1, flexBasis: 220, gap: 4 }}>
        <Text v="small" color={c.heroMuted} style={{ fontFamily: fonts.bodyBold, letterSpacing: 0.6, textTransform: 'uppercase', fontSize: 11 }}>{t('Tahsil edilen')}</Text>
        <Text v="h2" color={c.heroInk} style={{ fontFamily: fonts.siteBold }}>{tl(got)}</Text>
        <View style={{ height: 10, borderRadius: 6, backgroundColor: 'rgba(250,245,240,0.15)', overflow: 'hidden', maxWidth: 280 }}>
          <View style={{ width: `${Math.round(Math.min(1, rate) * 100)}%`, height: '100%', backgroundColor: c.lemon }} />
        </View>
        <Text v="small" color={c.heroMuted}>{pct(rate)}{lateUnits.size ? ' · ' + (commercial ? t('{n} birimin ödemesi gecikti', { n: lateUnits.size }) : t('{n} daire ödemedi', { n: lateUnits.size })) : ''}</Text>
      </View>
    </View>
  );

  const kpis: [string, string, string?][] = [];
  if (occ) {
    kpis.push([t('Doluluk'), pct(occ.rate), t('{a}/{b} birim', { a: occ.occupied, b: occ.total }) + (occ.areaRate != null ? ' · ' + t('m² bazında {p}', { p: pct(occ.areaRate) }) : '')]);
    kpis.push([t('WALT'), occ.walt == null ? '—' : t('{n} yıl', { n: occ.walt.toFixed(1).replace('.', ',') }), t('Kira ağırlıklı kalan süre')]);
    if (sector === 'avm' && hasModule(org, 'ciro_kira')) kpis.push([t('Ciro bildirimi bekleyen'), String(d.turnovers.filter((x: any) => x.status === 'reported').length), t('Onayınla ciro farkı tahakkuk edilir')]);
    else if (sector === 'gyo') {
      const since = (() => { const x = new Date(); x.setMonth(x.getMonth() - 11); return mkey(x); })();
      kpis.push([t('Son 12 ay kira'), tl(d.charges.filter((x: any) => x.kind === 'kira' && x.month >= since).reduce((a: number, x: any) => a + Number(x.amount), 0)), t('Tahakkuk')]);
    } else kpis.push([t('Boş alan'), Math.round(occ.area - occ.occArea).toLocaleString('tr-TR') + ' m²', t('{n} birim boş', { n: occ.vacant.length })]);
    kpis.push([t('90 günde biten sözleşme'), String(occ.expiring.length), occ.expiring[0] ? unitLabel(occ.expiring[0]) + ' · ' + day(occ.expiring[0].lease_end) : t('Yenileme görüşmesi yok')]);
  } else {
    kpis.push([commercial ? t('Geciken birim') : t('Borçlu daire'), String(debtors.length), debtors.length ? t('Toplam {t}', { t: tl(debtTotal) }) : t('Gecikmiş borç yok')]);
    kpis.push([t('Onay bekleyen dekont'), String(waiting.length), '']);
    const spent = d.expenses.filter((x: any) => String(x.spent_on).slice(0, 7) === m).reduce((a: number, x: any) => a + Number(x.amount), 0);
    kpis.push([t('Bu ay gider'), tl(spent), '']);
    kpis.push([t('Açık talep'), String(openReq.length), openReq.find((x: any) => x.cat === 'ariza') ? t('Arıza var') : '']);
  }

  const debtCard = (
    <Section title={commercial ? t('Geciken kiralar') : t('Borçlular')} link={t('Tahakkuk')} onLink={() => go('tahakkuk')}>
      {debtors.length ? debtors.slice(0, 6).map(([uid, v], i) => (
        <Line key={uid} first={!i} title={unitBy[uid] ? unitLabel(unitBy[uid]) : '—'}
          sub={[[...v.kinds].join(' + '), v.fx, t('{n} gün', { n: v.days }), !commercial && v.fee ? t('Gecikme tazminatı') + ' ' + tl(v.fee) : ''].filter(Boolean).join(' · ')}
          right={<Text v="small" color={v.days > 30 ? c.badInk : c.ink} style={{ fontFamily: fonts.bodyXBold }}>{tl(v.left)}</Text>} />
      )) : <Empty>{t('Gecikmiş borç yok.')}</Empty>}
      {!commercial && debtors.length ? <Muted>{t('Gecikme tazminatı (KMK md. 20, aylık %5) bilgi amaçlı gösterilir.')}</Muted> : null}
    </Section>
  );

  const waitingCard = can('payments.approve') && waiting.length ? (
    <Section title={t('Onay bekleyen dekontlar')}>
      {waiting.slice(0, 5).map((x: any) => <ChargeRow key={x.id} x={x} unit={unitBy[x.unit_id]} can={can} reload={reload} />)}
    </Section>
  ) : null;

  const requestsCard = (
    <Section title={t('Son talepler')} link={t('Talepler')} onLink={() => go('talepler')}>
      {openReq.length ? openReq.slice(0, 4).map((x: any, i: number) => (
        <Line key={x.id} first={!i} title={x.title} sub={[unitBy[x.unit_id] ? unitLabel(unitBy[x.unit_id]) : '', day(x.created_at)].filter(Boolean).join(' · ')}
          right={<Chip tone={x.status === 0 ? 'warn' : 'neutral'} label={[t('Açıldı'), t('Görüldü'), t('İşlemde')][x.status] || ''} />} />
      )) : <Empty>{t('Açık talep yok.')}</Empty>}
    </Section>
  );

  const budget = (() => {
    const y = new Date().getFullYear();
    const b = (d.budgets || []).find((x: any) => Number(x.year) === y);
    if (!b) return null;
    const plan = (b.items || []).reduce((a: number, x: any) => a + (Number(x.amount) || 0), 0);
    const spent = d.expenses.filter((x: any) => String(x.spent_on).startsWith(String(y))).reduce((a: number, x: any) => a + Number(x.amount), 0);
    const monthsDone = new Date().getMonth() + 1;
    return (
      <Section title={t('İşletme projesi {y}', { y })} link={t('Bütçe')} onLink={() => go('butce')}>
        <Line first title={t('Yıllık bütçe')} sub={b.approved_on ? t('Kurul onayı {d}', { d: day(b.approved_on) }) : ''} right={tl(plan)} />
        <Line title={t('Harcanan ({n} ay)', { n: monthsDone })} sub={t('Plan: {p}', { p: tl((plan * monthsDone) / 12) })} right={tl(spent)} />
      </Section>
    );
  })();

  const notesCard = hasModule(org, 'duyuru') ? (
    <Section title={t('Duyurular')} link={t('Yeni duyuru')} onLink={() => go('duyurular')}>
      {d.notes.length ? d.notes.slice(0, 3).map((x: any, i: number) => <Line key={x.id} first={!i} title={x.title} sub={day(x.created_at)} />) : <Empty>{t('Duyuru yok.')}</Empty>}
    </Section>
  ) : null;

  const occMap = occ ? (
    <Section title={t('Doluluk haritası')} link={T.units} onLink={() => go('birimler')}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
        {d.units.map((u: any) => {
          const empty = occ.vacant.some((x: any) => x.id === u.id), isLate = lateUnits.has(u.id);
          return <View key={u.id} accessibilityLabel={unitLabel(u) + ' · ' + (empty ? t('Boş') : isLate ? t('Kirası gecikmiş') : t('Dolu'))}
            style={{ width: 22, height: 22, borderRadius: 6, backgroundColor: empty ? c.tile : isLate ? c.badBg : c.okBg, borderWidth: empty ? 1 : 0, borderStyle: 'dashed', borderColor: c.muted }} />;
        })}
      </View>
      <Muted>{t('Yeşil dolu · kırmızı kirası gecikmiş · kesikli boş')}</Muted>
    </Section>
  ) : null;

  const incCard = commercial && hasModule(org, 'endeksleme') ? (
    <Section title={t('Kira artışları')} link={t('Tümü')} onLink={() => go('artis')}>
      {increases.length ? increases.slice(0, 4).map((x: any, i: number) => (
        <Line key={x.unit.id + x.date} first={!i} title={unitLabel(x.unit) + ' · ' + day(x.date)}
          sub={(x.source === 'sabit' ? t('Sabit %{n}', { n: x.rate }) : x.rate != null ? t('TÜFE %{n}', { n: String(x.rate).replace('.', ',') }) : t('TÜFE oranı bekleniyor'))
            + (x.next != null ? ' · ' + money(x.unit.rent, x.unit.currency) + ' → ' + money(x.next, x.unit.currency) : '')}
          right={<Chip tone="warn" label={t('Uygula')} />} />
      )) : <Empty>{t('Önümüzdeki 30 günde artış yok.')}</Empty>}
    </Section>
  ) : null;

  const ciroCard = sector === 'avm' && hasModule(org, 'ciro_kira') ? (
    <Section title={t('Ciro kirası')} link={t('Ciro')} onLink={() => go('ciro')}>
      {d.turnovers.length ? d.turnovers.slice(0, 4).map((x: any, i: number) => (
        <Line key={x.unit_id + x.month} first={!i} title={(unitBy[x.unit_id] ? unitLabel(unitBy[x.unit_id]) : '—') + ' · ' + monthYear(x.month)}
          sub={t('Ciro {t}', { t: tl(x.amount) })}
          right={<Chip tone={x.status === 'reported' ? 'warn' : x.status === 'approved' ? 'ok' : 'neutral'} label={x.status === 'reported' ? t('Onay bekliyor') : x.status === 'approved' ? t('Onaylandı') : t('Reddedildi')} />} />
      )) : <Empty>{t('Ciro bildirimi yok.')}</Empty>}
    </Section>
  ) : null;

  const contractsCard = occ && sector === 'depo' ? (
    <Section title={t('Biten sözleşmeler')} link={T.units} onLink={() => go('birimler')}>
      {occ.expiring.length ? occ.expiring.slice(0, 4).map((u: any, i: number) => (
        <Line key={u.id} first={!i} title={unitLabel(u)} sub={t('Bitiş {d}', { d: day(u.lease_end) }) + (u.rent ? ' · ' + money(u.rent, u.currency) : '')} right={<Chip tone="warn" label={t('90 gün')} />} />
      )) : <Empty>{t('Önümüzdeki 90 günde biten sözleşme yok.')}</Empty>}
    </Section>
  ) : null;

  // GYO: "Varlık" (blok alanı) başına birim, doluluk ve bu ayın kirası.
  const assetsCard = sector === 'gyo' ? (() => {
    const groups: Record<string, { n: number; full: number; rent: number }> = {};
    d.units.forEach((u: any) => {
      const g = groups[u.block || t('Varlık belirtilmedi')] = groups[u.block || t('Varlık belirtilmedi')] || { n: 0, full: 0, rent: 0 };
      g.n++; if (occ && !occ.vacant.some((x: any) => x.id === u.id)) g.full++;
    });
    cur.forEach((x: any) => { const u = unitBy[x.unit_id]; if (u && x.kind === 'kira') groups[u.block || t('Varlık belirtilmedi')].rent += Number(x.amount); });
    return (
      <Section title={t('Varlıklara göre')} link={T.units} onLink={() => go('birimler')}>
        {Object.entries(groups).sort((a, b) => b[1].rent - a[1].rent).map(([name, g], i) => (
          <Line key={name} first={!i} title={name} sub={t('{n} birim', { n: g.n }) + (occ ? ' · ' + t('doluluk {p}', { p: pct(g.n ? g.full / g.n : 0) }) : '')} right={tl(g.rent)} />
        ))}
        <Muted>{t('Varlık, birimin “Varlık / bina” alanından gelir.')}</Muted>
      </Section>
    );
  })() : null;

  const roadmap = sector === 'gyo' ? (
    <View style={{ borderWidth: 1.5, borderStyle: 'dashed', borderColor: c.line, borderRadius: radius.md, padding: 12 }}>
      <Muted>{t('Yol planında: onay akışı (artış ve tahakkuk için çift imza), değerleme, yatırımcı raporu ve API.')}</Muted>
    </View>
  ) : null;

  const left = commercial ? [debtCard, waitingCard, sector === 'gyo' ? assetsCard : ciroCard] : [debtCard, waitingCard, requestsCard];
  const right = sector === 'site' ? [budget, notesCard]
    : sector === 'avm' ? [occMap, incCard]
    : sector === 'depo' ? [incCard, contractsCard, occMap]
    : [incCard, occMap, roadmap];

  return (
    <Stack>
      {hero}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>{kpis.map(([a, b, s]) => <Kpi key={a} label={a} value={b} sub={s} />)}</View>
      <View style={{ flexDirection: desktop ? 'row' : 'column', gap: 14, alignItems: 'flex-start' }}>
        <View style={{ flex: desktop ? 1.25 : undefined, width: desktop ? undefined : '100%', gap: 14 }}>{left.filter(Boolean)}</View>
        <View style={{ flex: desktop ? 1 : undefined, width: desktop ? undefined : '100%', gap: 14 }}>{right.filter(Boolean)}</View>
      </View>
    </Stack>
  );
}

/* ---------------- kurulum sihirbazı ---------------- */

type Group = { name: string; floors: string; perFloor: string; custom: string };

/** Sözleşmedeki birim sayısına göre kayıtları tek seferde oluşturur. Sitede yapı seçilir: apartman blokları, villalar ya da
    ikisi birden. Katlarda eşit olmayan daire sayısı "Katlardaki sayılar" alanına sırayla yazılır (ör. 4,4,4,2); oluşturulan
    her kayıt sonra tek tek düzenlenebilir ya da silinebilir. */
export function SetupWizard({ d, oid, limit, reload }: { d: any; oid: string; limit: number; reload: () => void }) {
  const c = useColors();
  const sector = d.sector;
  const commercial = isCommercial(sector);
  const site = sector === 'site';
  const T = terms(sector);
  const groupWord = site ? t('Blok') : sector === 'gyo' ? t('Varlık') : sector === 'avm' ? t('Kat') : t('Bölge');
  const [shape, setShape] = useState<'blok' | 'villa' | 'karma'>('blok');
  const [groups, setGroups] = useState<Group[]>(() => site
    ? [{ name: 'A', floors: '', perFloor: '', custom: '' }]
    : [{ name: sector === 'avm' ? t('Zemin kat') : sector === 'gyo' ? '' : 'A', floors: '1', perFloor: limit ? String(limit) : '', custom: '' }]);
  const [villas, setVillas] = useState({ count: '', naming: 'villa' });
  const [numbering, setNumbering] = useState(commercial ? 'block' : 'seq');
  const [area, setArea] = useState('');
  const [aidat, setAidat] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const withBlocks = !site || shape !== 'villa';
  const withVillas = site && shape !== 'blok';
  const rows = unitPlan({ groups: withBlocks ? groups : [], villas: withVillas ? villas : null, numbering, area: Number(area) || null,
    aidat: aidat === '' ? null : Number(aidat), commercial });
  const set = (i: number, k: keyof Group, v: string) => setGroups(groups.map((g, j) => (j === i ? { ...g, [k]: v } : g)));
  const word = (withVillas && !withBlocks ? t('Villa') : T.unit).toLocaleLowerCase('tr');
  const okArea = Number(area) > 0;
  const cell = (basis: number, grow = 1) => ({ flexGrow: grow, flexBasis: basis, minWidth: 0 });
  return (
    <Card gap={14} style={{ borderWidth: 2, borderColor: c.accent }}>
      <Label>{t('Kurulum')}</Label>
      <H2>{limit ? t('Sözleşmende {n} {w} var, oluşturalım.', { n: limit, w: T.unit.toLocaleLowerCase('tr') }) : t('{w} kayıtlarını oluşturalım.', { w: T.unit })}</H2>
      <Muted>{site
        ? t('Kayıtlar gerçek numaralarınla oluşur. Katlarda daire sayısı eşit değilse “Katlardaki sayılar” alanına sırayla yaz (ör. 4,4,4,2). Oluşturduktan sonra her birini düzenleyebilir, ekleyip silebilirsin.')
        : t('Kayıtlar gerçek numaralarınla oluşur. Oluşturduktan sonra her birini düzenleyebilir, ekleyip silebilirsin.')}</Muted>
      {site ? (
        <View style={{ gap: 8 }}>
          <Label>{t('Sitenin yapısı')}</Label>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            <Pill label={t('Apartman blokları')} on={shape === 'blok'} onPress={() => setShape('blok')} />
            <Pill label={t('Villalar')} on={shape === 'villa'} onPress={() => setShape('villa')} />
            <Pill label={t('Bloklar + villalar')} on={shape === 'karma'} onPress={() => setShape('karma')} />
          </View>
        </View>
      ) : null}
      {withBlocks ? groups.map((g, i) => (
        <Row key={i} gap={10} wrap align="flex-start">
          <View style={cell(110)}><Field label={groupWord} value={g.name} onChangeText={(v) => set(i, 'name', v)} maxLength={40} /></View>
          {site ? (
            <>
              <View style={cell(110)}><Field label={t('Kat sayısı')} value={g.floors} onChangeText={(v) => set(i, 'floors', v.replace(/\D/g, ''))} keyboardType="number-pad" /></View>
              <View style={cell(110)}><Field label={t('Katta daire')} value={g.perFloor} onChangeText={(v) => set(i, 'perFloor', v.replace(/\D/g, ''))} keyboardType="number-pad" /></View>
              <View style={cell(200, 2)}><Field label={t('Katlardaki sayılar (isteğe bağlı)')} value={g.custom} onChangeText={(v) => set(i, 'custom', v.replace(/[^0-9, ]/g, ''))} placeholder="4,4,4,2" /></View>
            </>
          ) : (
            <View style={cell(140)}><Field label={t('{w} sayısı', { w: T.unit })} value={g.perFloor} onChangeText={(v) => set(i, 'perFloor', v.replace(/\D/g, ''))} keyboardType="number-pad" /></View>
          )}
          {groups.length > 1 ? <Button kind="quiet" title={t('Kaldır')} onPress={() => setGroups(groups.filter((_, j) => j !== i))} style={{ marginTop: 28 }} /> : null}
        </Row>
      )) : null}
      {withBlocks ? (
        <Button kind="ghost" title={t('{w} ekle', { w: groupWord })} style={{ alignSelf: 'flex-start' }}
          onPress={() => setGroups([...groups, site
            ? { name: String.fromCharCode(65 + groups.length), floors: groups[groups.length - 1]?.floors || '', perFloor: groups[groups.length - 1]?.perFloor || '', custom: '' }
            : { name: '', floors: '1', perFloor: '', custom: '' }])} />
      ) : null}
      {withVillas ? (
        <Row gap={10} wrap align="flex-start">
          <View style={cell(140)}><Field label={t('Villa sayısı')} value={villas.count} onChangeText={(v) => setVillas({ ...villas, count: v.replace(/\D/g, '').slice(0, 4) })} keyboardType="number-pad" /></View>
          <View style={{ ...cell(240, 2), gap: 8 }}>
            <Text v="small" style={{ fontFamily: fonts.bodyBold }}>{t('Adlandırma')}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              <Pill label={t('Villa 1, Villa 2…')} on={villas.naming === 'villa'} onPress={() => setVillas({ ...villas, naming: 'villa' })} />
              <Pill label="V-1, V-2…" on={villas.naming === 'v'} onPress={() => setVillas({ ...villas, naming: 'v' })} />
            </View>
          </View>
        </Row>
      ) : null}
      {withBlocks ? (
        <View style={{ gap: 8 }}>
          <Label>{t('Numaralandırma')}</Label>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            <Pill label={t('1, 2, 3…')} on={numbering === 'seq'} onPress={() => setNumbering('seq')} />
            {site ? <Pill label={t('Kat + sıra (101, 102…)')} on={numbering === 'floor'} onPress={() => setNumbering('floor')} /> : null}
            <Pill label={t('{w} + no (A-1, A-2…)', { w: groupWord })} on={numbering === 'block'} onPress={() => setNumbering('block')} />
          </View>
        </View>
      ) : null}
      <Row gap={10} wrap align="flex-start">
        <View style={cell(200)}><MoneyField label={t('Varsayılan m² (zorunlu)')} value={area} onChange={setArea} hint={t('Sonra tek tek değiştirebilirsin.')} /></View>
        {!commercial ? <View style={cell(200)}><MoneyField label={t('Varsayılan aylık aidat (isteğe bağlı)')} value={aidat} onChange={setAidat} hint={t('Boş bırakırsan sonra girersin.')} /></View> : null}
      </Row>
      <Label>{t('Önizleme · {n} {w}', { n: rows.length, w: word })}</Label>
      {rows.length ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {rows.slice(0, 24).map((r, i) => <View key={i} style={{ backgroundColor: c.tile, borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 5 }}><Text v="small" style={{ fontFamily: fonts.bodyBold }}>{[r.block, r.no].filter(Boolean).join(' · ')}</Text></View>)}
          {rows.length > 24 ? <Muted>{t('+{n} daha', { n: rows.length - 24 })}</Muted> : null}
        </View>
      ) : <Muted>{t('Bilgileri gir; önizleme burada görünür.')}</Muted>}
      {limit && rows.length > limit ? <Note warn>{t('Sözleşmendeki sayı {n}, burada {m}. Fazlası da oluşturulabilir; sözleşmeyi güncellemek için anahtar ekibine yaz.', { n: limit, m: rows.length })}</Note>
        : limit && rows.length && rows.length < limit ? <Muted>{t('Sözleşmende {n} kayıt var; kalan {k} kaydı sonra ekleyebilirsin.', { n: limit, k: limit - rows.length })}</Muted> : null}
      {err ? <Text v="small" color={c.badInk}>{err}</Text> : null}
      <Button title={t('{n} {w} oluştur', { n: rows.length, w: word })} loading={busy} disabled={busy || !rows.length || !okArea || rows.length > 2000} style={{ alignSelf: 'flex-start' }}
        onPress={async () => { setBusy(true); setErr(null); try { await importUnits(oid, rows, commercial); reload(); } catch (e) { setErr(humanError(e)); } setBusy(false); }} />
    </Card>
  );
}
