/* Site yönetimi ekranları (kurumsal yol planı Faz 2).
   SiteAdminScreen: site yönetiminin ekranı (özet, daireler, tahakkuk, giderler, duyurular, talepler); sekmeler rol yetkisine göre.
   ResidentSiteScreen ("Sitem"): malik ya da kiracının dairesi, tahakkukları, dekont yükleme, duyurular ve yönetime talep. */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { TextInput, View } from 'react-native';
import { t } from '../domain/i18n';
import { humanError, inviteLink, fileUrl } from '../domain/backend';
import { myOrgs, orgCan, hasModule, sectorSections, PORTFOLIO_SECTORS } from '../domain/org';
import {
  KINDS, MODES, kindLabel, unitLabel, distribute, unpaidOf, lateFee, loadSiteAdmin, saveUnit, deleteUnit, parseUnits, importUnits,
  saveResident, deleteResident, createCharges, deleteCharge, decideCharge, markPaid, addExpense, deleteExpense, announce, deleteAnnouncement,
  answerRequest, mySiteUnits, loadMySite, payCharge, openSiteRequest, loadUnitCharges, budgetTotal, budgetAidat, saveBudget,
  applyBudgetAidat, loadBudgets, siteReport, unitPays, payerText, depositKindLabel, cashbook, saveCash, SITE_EXPENSE_CATS, saveRecurring, setRecurringActive, deleteRecurring, setCashSharing, loadCashSummary, isCommercial, overdue, occupancy, ciroDiff, reportTurnover, loadTurnovers, decideTurnover,
  dueIncreases, applyIncrease, rentCharge, nextAuto, saveAuto, cardReady, cardTotal, uploadSiteDoc, deleteSiteDoc, loadSiteDocs
} from '../domain/site';
import { loadRates } from '../domain/cpi';
import { terms, sectorOf } from '../domain/org';
import { percent, tl, monthYear, fmtFull, parse, mkey, iso } from '../domain/util';
import { Button, Chip, Field, PressScale, Text } from '../ui/kit';
import { Loader } from '../ui/Loader';
import { fonts, radius, useColors } from '../ui/theme';
import { LinkBtn, Card, DownloadLink, Empty, H2, Label, MonthStepper, Muted, Note, Row, Seg, Stack, StatusChip, Stepper } from './blocks';
import { useBreakpoint } from '../ui/theme';
import { ui } from '../domain/state';
import { Overview } from './site-overview';
import { Units } from './site-units';
import { FileField, MoneyField } from './forms';
import { useStore } from './hooks';
import { Picked } from './media';
import { host } from '../domain/host';
import { Pill } from './org';
import { Page } from './screens';
import { Meetings, ResidentMeetings } from './site-meetings';
import { CurrencySwitch, FxNote, RevenueChart, useFx, useReportCurrency } from './fx-ui';
import { fmtMoney } from '../domain/money';
import { amountIn } from '../domain/fx-report';
import { InvestorReport } from './investor';
import { RequestThread, ResidentProjects, SiteProjects } from './site-projects';
import { MediaList, MediaPicker } from './site-media';

// Tarihler yerel saatle (Türkiye UTC+3; ISO dönüşümü gece yarısından sonra bir önceki güne/aya kayardı).
const thisMonth = () => mkey(new Date());
const today = () => iso(new Date());
const day = (v?: string) => (v ? fmtFull(parse(String(v).slice(0, 10))) : '—');
/** Tahakkuk durumu → ortak durum çipi (ödendi, onay bekliyor, kısmi, reddedildi, bekliyor, gecikti). */
const stOf = (c: any) => (c.status === 'paid' ? 'approved' : c.status === 'open' ? (overdue(c) ? 'late' : 'pending') : c.status);
/** Döviz kirası için tutar: "$2.000", "€1.500"; TL için ₺. */
const money = (n: any, cur?: string) => (!cur || cur === 'TRY' ? tl(n) : (cur === 'USD' ? '$' : '€') + Number(n || 0).toLocaleString('tr-TR', { maximumFractionDigits: 2 }));
const CURS: [string, string][] = [['TRY', '₺ TL'], ['USD', '$ USD'], ['EUR', '€ EUR']];
/** Bu ekranın açıldığı kurum türleri: site yönetimi ve ticari portföy (AVM, depo, GYO). */
export { PORTFOLIO_SECTORS };
/** Kurum paneli bölümlerinin adresleri (/uygulama/site/<bölüm>); menü org.js → sectorSections. */
export const SECTION_KEYS = ['ozet', 'birimler', 'tahakkuk', 'ciro', 'artis', 'giderler', 'butce', 'duyurular', 'genelkurul', 'projeler', 'belgeler', 'talepler', 'rapor', 'yatirimci'];
export const sectionPath = (k: string) => (k === 'ozet' ? '/uygulama/site' : '/uygulama/site/' + k);
/** Kişinin yönettiği sektör kurumu (birden çoksa seçili olan). */
export function currentPortfolioOrg() {
  const sites = myOrgs().filter((o: any) => PORTFOLIO_SECTORS.includes(o.sector));
  // Rol seçicide "Mülk sahibi" ya da "Kiracı" seçiliyse kurum paneli değil, o rolün paneli açılır (ui.ctx boşsa eskisi gibi kurum paneli).
  if (ui.ctx && !String(ui.ctx).startsWith('site:')) return null;
  return sites.find((o: any) => o.id === ui.siteOrg) || sites[0] || null;
}
const REQ = () => [t('Açıldı'), t('Görüldü'), t('İşlemde'), t('Çözüldü')];
const REQ_CAT: Record<string, string> = { ariza: 'Arıza', aidat: 'Aidat', genel: 'Genel' };
const Spin = () => <View style={{ alignItems: 'center', paddingVertical: 20 }}><Loader size={64} /></View>;

function Err({ e }: { e: string | null }) {
  const c = useColors();
  return e ? <Text v="small" color={c.badInk}>{e}</Text> : null;
}

/** Ödeme kaydı. row: listede tek satır (daire · tür, tutar, durum); dokununca işlemler açılır. Onay bekleyen açık gelir. */
function ChargeRow({ x, unit, can, reload, row, first }: { x: any; unit: any; can: (p: string) => boolean; reload: () => void; row?: boolean; first?: boolean }) {
  const c = useColors();
  const [why, setWhy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [opened, setOpened] = useState(!row || x.status === 'review');
  const [askDel, setAskDel] = useState(false);
  const act = async (fn: () => Promise<any>) => { setErr(null); try { await fn(); reload(); } catch (e) { setErr(humanError(e)); } };
  const open = async () => { const u = await fileUrl('sb:' + x.receipt_path); if (u && typeof window !== 'undefined') window.open(u, '_blank'); };
  const head = unit ? unitLabel(unit) + ' · ' + kindLabel(x.kind, x.title) : kindLabel(x.kind, x.title);
  const detail = monthYear(x.month) + ' · ' + tl(x.amount) + (x.orig_amount != null && x.currency !== 'TRY' ? ' (' + money(x.orig_amount, x.currency) + ' × ' + String(x.fx).replace('.', ',') + ')' : '')
    + (x.status === 'review' || x.status === 'partial' ? ' · ' + t('Ödenen') + ' ' + tl(x.paid_amount) : '') + (x.paid_on ? ' · ' + day(x.paid_on) : x.due_on ? ' · ' + t('Vade') + ' ' + day(x.due_on) : '');
  const actions = [
    x.receipt_path ? <Button key="o" kind="ghost" title={t('Dekontu aç')} onPress={open} /> : null,
    x.receipt_path ? <DownloadLink key="d" path={'sb:' + x.receipt_path} label={x.receipt_name || t('dekont')} /> : null,
    can('payments.approve') && x.status === 'review' ? <Button key="a" title={t('Onayla')} onPress={() => act(() => decideCharge(x, true))} /> : null,
    can('payments.approve') && x.status === 'review' ? <Button key="r" kind="ghost" title={t('Reddet')} onPress={() => setWhy(why == null ? '' : null)} /> : null,
    can('payments.approve') && ['open', 'partial', 'rejected'].includes(x.status) ? <Button key="p" kind="ghost" title={t('Ödendi işaretle')} onPress={() => act(() => markPaid(x, x.amount))} /> : null,
    can('charges.manage') && x.status === 'open' ? (askDel
      ? <Row key="s" gap={8} wrap><Muted>{t('Bu ödeme kaydı silinsin mi?')}</Muted>
          <LinkBtn danger label={t('Evet, sil')} onPress={() => { setAskDel(false); act(() => deleteCharge(x.id)); }} />
          <LinkBtn label={t('Vazgeç')} onPress={() => setAskDel(false)} /></Row>
      : <LinkBtn key="s" danger label={t('Sil')} onPress={() => setAskDel(true)} />) : null
  ].filter(Boolean);
  const body = (
    <>
      {x.reject_reason ? <Text v="small" color={c.badInk}>{x.reject_reason}</Text> : null}
      {actions.length ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>{actions}</View> : null}
      {why != null ? (
        <Row gap={10} wrap align="flex-end">
          <View style={{ flexGrow: 1, flexBasis: 220 }}><Field label={t('Red gerekçesi')} value={why} onChangeText={setWhy} maxLength={200} /></View>
          <Button kind="ghost" title={t('Reddet')} disabled={!why.trim()} onPress={() => act(() => decideCharge(x, false, why))} />
        </Row>
      ) : null}
      <Err e={err} />
    </>
  );
  if (row) return (
    <View style={{ borderTopWidth: first ? 0 : 1, borderColor: c.line }}>
      <PressScale onPress={() => setOpened(!opened)} accessibilityRole="button" accessibilityState={{ expanded: opened }} accessibilityLabel={head + ' · ' + tl(x.amount)} scaleTo={0.995}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: opened ? c.surface2 : 'transparent' }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text v="small" numberOfLines={1} style={{ fontFamily: fonts.bodyXBold }}>{head}</Text>
          <Text v="small" muted numberOfLines={1}>{detail}</Text>
        </View>
        <StatusChip st={stOf(x)} />
        <Text v="body" color={c.muted} style={{ transform: [{ rotate: opened ? '90deg' : '0deg' }] }}>›</Text>
      </PressScale>
      {opened && (actions.length || x.reject_reason || err) ? <View style={{ paddingHorizontal: 16, paddingBottom: 12, gap: 8, backgroundColor: c.surface2 }}>{body}</View> : null}
    </View>
  );
  return (
    <Card gap={8}>
      <Row between wrap>
        <View style={{ flex: 1, minWidth: 160 }}>
          <Text v="small" style={{ fontFamily: fonts.bodyXBold }}>{head}</Text>
          <Muted>{detail}</Muted>
        </View>
        <StatusChip st={stOf(x)} />
      </Row>
      {body}
    </Card>
  );
}

/** Otomatik aidat: ayın seçilen gününde dairelerin aylık aidatı kendiliğinden tahakkuk edilir (schema.sql 29. bölüm). */
/** Aylık aidat kira gibi otomatiktir: her dairenin aidatı her ay kendiliğinden yazılır; yönetici yalnız son ödeme gününü seçer. */
function AutoAidat({ d, oid, can, reload }: { d: any; oid: string; can: (p: string) => boolean; reload: () => void }) {
  const c = useColors();
  const a = d.auto;
  const [open, setOpen] = useState(false);
  const [due, setDue] = useState(String(a?.due_day || 10));
  const [err, setErr] = useState<string | null>(null);
  const next = nextAuto(a);
  // Ticari portföy (AVM, depo, GYO): kiracısı olan ve sözleşmesi süren birimlerin kirası ve ortak gideri (sunucu: site_auto_run).
  const commercial = isCommercial(d.sector);
  const units = commercial ? d.units.filter((u: any) => Number(u.rent) > 0) : d.units.filter((u: any) => Number(u.aidat) > 0);
  const total = units.reduce((s: number, u: any) => s + Number(u.aidat), 0);
  const manage = can('charges.manage');
  const save = async (enabled: boolean) => {
    const n = Number(due);
    if (!(n >= 1 && n <= 28)) { setErr(t('Gün 1 ile 28 arasında olmalı.')); return; }
    setErr(null);
    try { await saveAuto(oid, { enabled, run_day: 1, due_day: n }, a); setOpen(false); reload(); } catch (e) { setErr(humanError(e)); }
  };
  return (
    <Card gap={10}>
      <Row between wrap>
        <View style={{ flex: 1, minWidth: 200, gap: 2 }}>
          <Row gap={8}><H2>{commercial ? t('Aylık kira ve ortak gider') : t('Aylık aidat')}</H2><Chip tone={a?.enabled ? 'ok' : 'neutral'} label={a?.enabled ? t('Otomatik') : t('Kapalı')} /></Row>
          <Muted>{commercial
            ? (a?.enabled
              ? t('Kiracısı olan ve sözleşmesi süren her birimin kirası ve ortak gideri her ayın 1’inde kendiliğinden yazılır; vade, sözleşmedeki ödeme günü.')
              : t('Otomatik kira kapalı. Açarsan kiracısı olan ve sözleşmesi süren her birimin kirası ve ortak gideri her ay kendiliğinden yazılır.'))
            : a?.enabled
              ? t('Her dairenin aylık aidatı her ay kendiliğinden yazılır; son ödeme günü ayın {due}’i.', { due: a.due_day })
              : t('Otomatik aidat kapalı. Açarsan her dairenin aylık aidatı her ay kendiliğinden yazılır.')}</Muted>
        </View>
        {manage && !open ? <Button kind={a?.enabled ? 'ghost' : 'primary'} title={a?.enabled ? t('Değiştir') : commercial ? t('Otomatik kirayı aç') : t('Otomatik aidatı aç')} onPress={() => setOpen(true)} /> : null}
      </Row>
      {a?.enabled && next ? (
        <View style={{ backgroundColor: c.surface2, borderRadius: radius.md, padding: 12, gap: 2 }}>
          <Text v="small" style={{ fontFamily: fonts.bodyBold }}>{commercial ? t('Sonraki kira: {month}', { month: monthYear(String(next.date).slice(0, 7)) })
            : t('Sonraki aidat: {month} · son ödeme {due}', { month: monthYear(String(next.date).slice(0, 7)), due: day(next.due) })}</Text>
          <Muted>{commercial
            ? (units.length ? t('{n} birimde kira tanımlı; dövizli kira o günün TCMB satış kuruyla TL’ye çevrilir, KDV ve stopaj sözleşmeye göre.', { n: units.length }) : t('Birimlerde kira tanımlı değil.'))
            : units.length ? t('{n} daire · toplam {sum}', { n: units.length, sum: tl(total) }) : t('Dairelerde aylık aidat tanımlı değil; tutarları Daireler ekranından gir.')}</Muted>
          <Muted>{t('Hatırlatmalar: son ödemeden 3 gün önce, son gün, 5 ve 15 gün sonra.')}</Muted>
        </View>
      ) : null}
      {open ? (
        <Stack gap={10}>
          {commercial ? <Muted>{t('Tutar her birimin sözleşmesindeki kira ve ortak gider avansıdır; vade sözleşmedeki ödeme günü. Ciro farkı onaydan sonra ayrıca yazılır. Aynı ay elle oluşturulmuş kayıt varsa ikinci kez yazılmaz.')}</Muted> : <>
          <View style={{ maxWidth: 220 }}><MoneyField label={t('Son ödeme günü (1–28)')} value={due} decimals={0} onChange={(x) => setDue(x.slice(0, 2))} /></View>
          <Muted>{t('Tutar her dairenin kendi aylık aidatıdır (Daireler ekranı). Yakıt, demirbaş gibi tek seferlik toplamaları aşağıdaki Ek ödeme iste ile istersin.')}</Muted>
          </>}
          <Err e={err} />
          <Row wrap>
            <Button title={a?.enabled ? t('Kaydet') : t('Aç ve kaydet')} onPress={() => save(true)} />
            {a?.enabled ? <Button kind="ghost" title={commercial ? t('Otomatik kirayı kapat') : t('Otomatik aidatı kapat')} onPress={() => save(false)} /> : null}
            <Button kind="quiet" title={t('Vazgeç')} onPress={() => setOpen(false)} />
          </Row>
        </Stack>
      ) : null}
    </Card>
  );
}

function Charges({ d, oid, can, reload, seed }: { d: any; oid: string; can: (p: string) => boolean; reload: () => void; seed?: any }) {
  const c = useColors();
  const commercial = isCommercial(d.sector);
  const [month, setMonth] = useState(seed?.month || thisMonth());
  const autoOn = !commercial && !!d.auto?.enabled;
  // Site: aidat otomatikken buradaki form yalnız ek ödemeler içindir (yakıt, demirbaş, özel toplama).
  const [kind, setKind] = useState(seed?.kind || (commercial ? 'kira' : !autoOn && (d.modules || []).includes('aidat') ? 'aidat' : 'ozel'));
  const [extra, setExtra] = useState(!!seed);
  const [title, setTitle] = useState(seed?.title || '');
  // Ek ödemede (yakıt, demirbaş, özel toplama) varsayılan "her daireye aynı tutar"; "dairenin aidatı" yalnız aidat yazarken.
  const [mode, setMode] = useState(seed?.mode || (commercial ? 'rent' : kind === 'aidat' ? 'unit' : 'fixed'));
  const [confirm, setConfirm] = useState(false);
  const [value, setValue] = useState(seed?.value ? String(seed.value) : '');
  const [fx, setFx] = useState<Record<string, string>>({ USD: '', EUR: '' });
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [view, setView] = useState(thisMonth());
  const fxNum = { USD: Number(fx.USD.replace(',', '.')) || 0, EUR: Number(fx.EUR.replace(',', '.')) || 0 };
  // Döviz kirası olan birimler: tahakkuk için kur girilmeli (birim kirası × kur).
  const curs = mode === 'rent' ? [...new Set(d.units.filter((u: any) => Number(u.rent) > 0 && u.currency && u.currency !== 'TRY').map((u: any) => u.currency))] as string[] : [];
  const fxMissing = curs.some((k) => !(fxNum as any)[k]);
  const plan = distribute(d.units, mode, Number(String(value).replace(',', '.')) || 0, fxNum);
  const word = commercial ? t('birime') : t('daireye');
  const sum = plan.reduce((a, x) => a + x.amount, 0);
  const unitBy: Record<string, any> = Object.fromEntries(d.units.map((u: any) => [u.id, u]));
  const months = [...new Set([thisMonth(), ...d.charges.map((x: any) => x.month)])].sort().reverse() as string[];
  const list = d.charges.filter((x: any) => x.month === view);
  const [filter, setFilter] = useState('all');
  const [more, setMore] = useState(50);
  // Onay bekleyenler en üstte, sonra ödenmemişler, sonra daire sırası.
  const rank = (x: any) => (x.status === 'review' ? 0 : x.status === 'paid' ? 2 : 1);
  const unitOrder: Record<string, number> = Object.fromEntries(d.units.map((u: any, i: number) => [u.id, i]));
  const shownList = list.filter((x: any) => filter === 'all' || (filter === 'wait' ? x.status === 'review' : filter === 'paid' ? x.status === 'paid' : ['open', 'partial', 'rejected'].includes(x.status)))
    .sort((a: any, b: any) => rank(a) - rank(b) || (unitOrder[a.unit_id] ?? 0) - (unitOrder[b.unit_id] ?? 0));
  // Tutar boşken (₺0) gönderilemez: her daireye düşen tutar sıfırdan büyük olmalı (sunucu da reddeder, migration site_tahakkuk_koruma).
  const valid = /^\d{4}-(0[1-9]|1[0-2])$/.test(month) && (kind !== 'ozel' || title.trim()) && plan.length > 0 && sum > 0 && plan.every((x) => x.amount > 0) && !fxMissing;
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setErr(null); setMsg(null); setBusy(true);
    try {
      const n = await createCharges(oid, { month, kind, title: title.trim(), mode, value: Number(String(value).replace(',', '.')) || 0, units: d.units, existing: d.charges, fx: fxNum });
      setMsg(n ? (commercial ? t('{n} birime eklendi.', { n }) : t('{n} daireye eklendi.', { n }))
        : commercial ? t('Bu ay ve tür için tüm birimlerde zaten var.') : t('Bu ay ve tür için tüm dairelerde zaten var.'));
      // Aynı ödeme ikinci kez istenmesin: tutar ve başlık temizlenir.
      if (n) { setValue(''); setTitle(''); }
      setView(month); reload();
    } catch (e) { setErr(humanError(e)); } finally { setBusy(false); setConfirm(false); }
  };
  // Seçili ayın tahsilatı ödeme yoluna göre: kartla (sanal POS) ve dekont / havale / elden.
  const got = (x: any) => (x.status === 'paid' ? Number(x.amount) : x.status === 'partial' ? Number(x.paid_amount) || 0 : 0);
  const byCard = list.filter((x: any) => x.method === 'pos').reduce((a: number, x: any) => a + got(x), 0);
  const byOther = list.filter((x: any) => x.method !== 'pos').reduce((a: number, x: any) => a + got(x), 0);
  const owed = list.reduce((a: number, x: any) => a + Number(x.amount), 0);
  return (
    <Stack>
      {(!commercial && (d.modules || []).includes('aidat')) || (commercial && (d.modules || []).includes('kira')) ? <AutoAidat d={d} oid={oid} can={can} reload={reload} /> : null}
      {can('charges.manage') && !commercial && !extra ? (
        <Row wrap gap={8}>
          <Button kind="ghost" title={t('Ek ödeme iste')} onPress={() => setExtra(true)} />
          <Muted style={{ flex: 1, minWidth: 200 }}>{t('Yakıt, demirbaş ya da özel bir toplama için tek seferlik.')}</Muted>
        </Row>
      ) : null}
      {can('charges.manage') && (commercial || extra) ? (
        <Card gap={10}>
          <Row between><H2>{commercial ? t('Kira ve ortak gider oluştur') : t('Ek ödeme iste')}</H2>{!commercial ? <Button kind="quiet" title={t('Kapat')} onPress={() => setExtra(false)} /> : null}</Row>
          {!commercial ? <Muted>{t('Seçtiğin ay için dairelere tek seferlik ödeme yazılır; sakinler bildirim alır.')}</Muted> : null}
          <Row gap={10} wrap align="flex-end">
            <View style={{ flexGrow: 1, flexBasis: 140 }}><Field label={t('Ay (YYYY-AA)')} value={month} onChangeText={setMonth} maxLength={7} /></View>
            {kind === 'ozel' ? <View style={{ flexGrow: 2, flexBasis: 200 }}><Field label={t('Başlık')} value={title} onChangeText={setTitle} maxLength={120} placeholder={t('ör. Çatı onarımı')} /></View> : null}
          </Row>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{KINDS(d.sector).filter((k) => (k.key !== 'aidat' || ((d.modules || []).includes('aidat') && !autoOn)) && (k.key !== 'ortak_gider' || (d.modules || []).includes('ortak_gider'))).map((k) => <Pill key={k.key} label={k.label} on={kind === k.key} onPress={() => { setKind(k.key); if (commercial) setMode(k.key === 'kira' ? 'rent' : k.key === 'ortak_gider' ? 'unit' : 'area');
            else if (k.key === 'aidat') setMode('unit'); else if (mode === 'unit') setMode('fixed'); setConfirm(false); }} />)}</View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{MODES(d.sector).map((k) => <Pill key={k.key} label={k.label} on={mode === k.key} onPress={() => setMode(k.key)} />)}</View>
          {mode !== 'unit' && mode !== 'rent' ? <MoneyField label={mode === 'fixed' ? (commercial ? t('Birim başına tutar (₺)') : t('Daire başına tutar (₺)')) : t('Dağıtılacak toplam (₺)')} value={value} onChange={(v) => setValue(v)} /> : null}
          {curs.length ? (
            <Row gap={10} wrap align="flex-end">
              {curs.map((k) => <View key={k} style={{ flexGrow: 1, flexBasis: 140 }}><MoneyField label={t('{cur} kuru (₺)', { cur: k })} value={(fx as any)[k]} decimals={4} onChange={(v) => setFx({ ...fx, [k]: v })} placeholder={k === 'USD' ? '34,50' : '37,20'} /></View>)}
            </Row>
          ) : null}
          {mode === 'rent' ? <Muted>{t('Döviz kirası girilen kurla TL’ye çevrilir; KDV’li sözleşmede %20 eklenir, stopajlı sözleşmede kiracının keseceği %20 düşülür. Vade, sözleşmedeki ödeme günüdür.')}</Muted> : null}
          <Muted>{fxMissing ? t('Döviz kirası olan birimler için kuru yaz.') : plan.length && sum > 0 ? t('{n} {word} toplam {sum}', { n: plan.length, word, sum: tl(sum) })
            : mode === 'unit' ? (commercial ? t('Birimlerde ortak gider avansı tanımlı değil.') : t('Dairelerde aylık aidat tanımlı değil.'))
            : mode === 'rent' ? t('Birimlerde kira tanımlı değil.') : t('Tutar yaz.')}</Muted>
          {confirm && valid ? (
            <Note>{commercial
              ? t('{n} birime toplam {sum} yazılacak. Onaylıyor musun?', { n: plan.length, sum: tl(sum) })
              : t('{n} daireye toplam {sum} yazılacak ve sakinlere bildirim gidecek. Onaylıyor musun?', { n: plan.length, sum: tl(sum) })}</Note>
          ) : null}
          {confirm && valid ? (
            <Row wrap gap={8}>
              <Button title={t('Onayla ve gönder')} loading={busy} disabled={busy} onPress={submit} />
              <Button kind="quiet" title={t('Vazgeç')} onPress={() => setConfirm(false)} />
            </Row>
          ) : <Button title={commercial ? t('Oluştur') : t('Ödemeyi iste')} disabled={!valid} onPress={() => { setMsg(null); setConfirm(true); }} style={{ alignSelf: 'flex-start' }} />}
          <Err e={err} />
          {msg ? <Text v="small" color={c.okInk}>{msg}</Text> : null}
        </Card>
      ) : null}
      <Row between wrap>
        <MonthStepper value={view} onChange={setView} min={months[Math.min(12, months.length) - 1]} max={months[0]} />
        {list.length ? <Muted>{t('Tahsil edilen {got} / {owed} · kartla {card} · dekont ve havale {other}', { got: tl(byCard + byOther), owed: tl(owed), card: tl(byCard), other: tl(byOther) })}</Muted> : null}
      </Row>
      {list.length ? (
        <>
          <Seg scroll value={filter} onChange={setFilter} options={[['all', t('Tümü') + ' · ' + list.length], ['wait', t('Onay bekleyen') + ' · ' + list.filter((x: any) => x.status === 'review').length],
            ['open', t('Ödenmedi') + ' · ' + list.filter((x: any) => ['open', 'partial', 'rejected'].includes(x.status)).length], ['paid', t('Ödendi') + ' · ' + list.filter((x: any) => x.status === 'paid').length]]} />
          {shownList.length ? (
            <Card gap={0} style={{ padding: 0, overflow: 'hidden' }}>
              {shownList.slice(0, more).map((x: any, i: number) => <ChargeRow key={x.id} row first={i === 0} x={x} unit={unitBy[x.unit_id]} can={can} reload={reload} />)}
              {shownList.length > more ? <View style={{ borderTopWidth: 1, borderColor: c.line, padding: 12, alignItems: 'center' }}><Button kind="ghost" title={t('Daha fazla göster ({n} kaldı)', { n: shownList.length - more })} onPress={() => setMore(more + 50)} /></View> : null}
            </Card>
          ) : <Empty>{t('Bu filtrede kayıt yok.')}</Empty>}
        </>
      ) : <Empty>{commercial ? t('Bu ay için kayıt yok.') : t('Bu ay için aidat ya da ödeme yok.')}</Empty>}
    </Stack>
  );
}

/** Kasa (aidat havuzu): devreden + tahsil edilen aidat − giderler = kalan. Açılış bakiyesini tahakkuk ya da gider yetkisi olan girer. */
function CashCard({ d, oid, can, reload, from, to, title }: { d: any; oid: string; can: (p: string) => boolean; reload: () => void; from: string; to: string; title: string }) {
  const c = useColors();
  const k = cashbook(d, from, to);
  const [edit, setEdit] = useState(false);
  const [amount, setAmount] = useState(String(d.cash?.opening ?? ''));
  const [on, setOn] = useState(String(d.cash?.opening_on || today()));
  const [err, setErr] = useState<string | null>(null);
  const may = can('charges.manage') || can('expenses.manage');
  const cell = (label: string, v: number, bold?: boolean) => (
    <View style={{ flex: 1, minWidth: 120, gap: 2 }}>
      <Muted>{label}</Muted>
      <Text v={bold ? 'h3' : 'body'} color={bold && v < 0 ? c.badInk : c.ink} style={{ fontFamily: bold ? fonts.displayBold : fonts.bodyXBold, fontVariant: ['tabular-nums'] }}>{tl(v)}</Text>
    </View>
  );
  return (
    <Card gap={10}>
      <Row between wrap>
        <H2>{title}</H2>
        {may && !edit ? <Button kind="quiet" title={d.cash ? t('Açılış bakiyesini değiştir') : t('Açılış bakiyesi gir')} onPress={() => setEdit(true)} /> : null}
      </Row>
      <Row wrap>
        {cell(t('Devreden'), k.carry)}
        {cell(t('Tahsil edilen'), k.income)}
        {cell(t('Giderler'), k.spent)}
        {cell(t('Kasada kalan'), k.left, true)}
      </Row>
      <Muted>{d.cash ? t('Açılış: {v} ({d}). Tahsilat: aidat ve site toplamaları; giderler kasadan ödenir.', { v: tl(k.opening), d: day(k.openingOn) })
        : t('Açılış bakiyesi girilmedi; kasa sıfırdan başlar. Sitenin anahtar’a geçtiği gün kasadaki tutarı gir.')}</Muted>
      {may && oid ? (
        <View style={{ gap: 6 }}>
          <Label>{t('Sakinlere şeffaflık')}</Label>
          <Row gap={6} wrap>
            <Pill label={t('Sakinler kasa ve gider özetini görsün')} on={!!d.cash?.share_summary}
              onPress={() => setCashSharing(oid, d.cash, { share_summary: !d.cash?.share_summary, ...(d.cash?.share_summary ? { share_receipts: false } : {}) }).then(reload).catch((e) => setErr(humanError(e)))} />
            {d.cash?.share_summary ? <Pill label={t('Faturaları da görsün')} on={!!d.cash?.share_receipts}
              onPress={() => setCashSharing(oid, d.cash, { share_receipts: !d.cash?.share_receipts }).then(reload).catch((e) => setErr(humanError(e)))} /> : null}
          </Row>
          <Muted>{d.cash?.share_summary ? t('Sakinler Sitem ekranında aylık kasa özetini ve kategori toplamlarını görür.') : t('Kapalı: sakinler kasa ve gider bilgisi görmez.')}</Muted>
        </View>
      ) : null}
      {!edit ? <Err e={err} /> : null}
      {edit ? (
        <Stack gap={8}>
          <Row gap={10} wrap align="flex-end">
            <View style={{ flexGrow: 1, flexBasis: 140 }}><MoneyField label={t('Açılış bakiyesi (₺)')} value={amount} onChange={setAmount} /></View>
            <View style={{ flexGrow: 1, flexBasis: 160 }}><Field label={t('Açılış günü (YYYY-AA-GG)')} value={on} onChangeText={setOn} maxLength={10} /></View>
          </Row>
          <Err e={err} />
          <Row wrap>
            <Button title={t('Kaydet')} onPress={async () => {
              if (!/^\d{4}-\d{2}-\d{2}$/.test(on)) { setErr(t('Tarihleri YYYY-AA-GG biçiminde yaz.')); return; }
              setErr(null);
              try { await saveCash(oid, String(amount).replace(',', '.'), on); setEdit(false); reload(); } catch (e) { setErr(humanError(e)); }
            }} />
            <Button kind="quiet" title={t('Vazgeç')} onPress={() => setEdit(false)} />
          </Row>
        </Stack>
      ) : null}
    </Card>
  );
}

/** Düzenli giderler (ör. personel maaşı): her ay seçilen günde kendiliğinden kayda düşer (sunucu: site_recurring_run). */
/** Sakinin ekranı: yönetim paylaştıysa sitenin aylık kasa özeti ve kategori toplamları (faturalar ayrıca açılırsa). */
function ResidentCash({ units }: { units: any[] }) {
  const c = useColors();
  const orgs = [...new Map(units.filter((u: any) => !isCommercial(u.sector)).map((u: any) => [u.org_id, u.org])).entries()];
  const [month, setMonth] = useState(thisMonth());
  const [data, setData] = useState<Record<string, any>>({});
  useEffect(() => {
    let live = true;
    Promise.all(orgs.map(([oid]) => loadCashSummary(oid, month).then((x) => [oid, x] as const)))
      .then((rows) => { if (live) setData(Object.fromEntries(rows)); });
    return () => { live = false; };
  }, [month, orgs.map((x) => x[0]).join()]);
  const shown = orgs.filter(([oid]) => data[oid]);
  if (!shown.length) return null;
  return (
    <Stack gap={8}>
      <Row between wrap><H2>{t('Site kasası')}</H2><MonthStepper value={month} onChange={setMonth} max={thisMonth()} /></Row>
      {shown.map(([oid, name]) => {
        const k = data[oid];
        return (
          <Card key={oid} gap={8}>
            <Label>{name}</Label>
            <Row wrap>
              {[[t('Devreden'), k.carry], [t('Tahsil edilen'), k.income], [t('Giderler'), k.spent], [t('Kasada kalan'), k.left]].map(([a, v]: any, i: number) => (
                <View key={a} style={{ flex: 1, minWidth: 110, gap: 2 }}>
                  <Muted>{a}</Muted>
                  <Text v={i === 3 ? 'h3' : 'body'} color={i === 3 && v < 0 ? c.badInk : c.ink} style={{ fontFamily: fonts.bodyXBold, fontVariant: ['tabular-nums'] }}>{tl(v)}</Text>
                </View>
              ))}
            </Row>
            {k.byCat?.length ? k.byCat.map((x: any) => (
              <Row key={x.cat} between><Text v="small">{x.cat}</Text><Text v="small" style={{ fontFamily: fonts.bodyBold, fontVariant: ['tabular-nums'] }}>{tl(x.total)}</Text></Row>
            )) : <Muted>{t('Bu ay gider yok.')}</Muted>}
            {k.receipts?.length ? (
              <View style={{ gap: 2 }}>
                <Label>{t('Faturalar')}</Label>
                {k.receipts.map((x: any) => (
                  <Row key={x.path} between><Text v="small">{x.cat} · {day(x.day)} · {tl(x.amount)}</Text><DownloadLink path={x.path} label={x.name || t('Fatura')} /></Row>
                ))}
              </View>
            ) : null}
            <Muted>{t('Yönetimin paylaştığı özet: aidat tahsilatı ve kasadan ödenen giderler.')}</Muted>
          </Card>
        );
      })}
    </Stack>
  );
}

function RecurringCard({ d, oid, can, reload }: { d: any; oid: string; can: (p: string) => boolean; reload: () => void }) {
  const c = useColors();
  const may = can('expenses.manage');
  const [open, setOpen] = useState(false);
  const [r, setR] = useState<any>({ cat: '', amount: '', day: '1', note: '', start_month: thisMonth(), end_month: '' });
  const [err, setErr] = useState<string | null>(null);
  const act = async (fn: () => Promise<any>) => { setErr(null); try { await fn(); reload(); } catch (x) { setErr(humanError(x)); } };
  const list = d.recurring || [];
  if (!may && !list.length) return null;
  return (
    <Card gap={8}>
      <Row between wrap>
        <H2>{t('Düzenli giderler')}</H2>
        {may && !open ? <Button kind="ghost" title={t('Düzenli gider ekle')} onPress={() => setOpen(true)} /> : null}
      </Row>
      <Muted>{t('Her ay seçilen günde kendiliğinden gider olarak yazılır; tek seferlik giderleri aşağıdan elle gir.')}</Muted>
      {list.map((x: any, i: number) => (
        <Row key={x.id} between wrap style={{ paddingVertical: 8, borderTopWidth: i ? 1 : 0, borderColor: c.line }}>
          <View style={{ flex: 1, minWidth: 180 }}>
            <Text v="small" style={{ fontFamily: fonts.bodyXBold }}>{x.cat}{x.note ? ' · ' + x.note : ''}</Text>
            <Muted>{[t('Her ayın {d}’i', { d: x.day }), t('{m} başlangıç', { m: monthYear(x.start_month) }), x.end_month ? t('{m} bitiş', { m: monthYear(x.end_month) }) : '', x.active ? '' : t('Durduruldu')].filter(Boolean).join(' · ')}</Muted>
          </View>
          <Row gap={6}>
            <Text v="small" style={{ fontFamily: fonts.bodyXBold, fontVariant: ['tabular-nums'] }}>{tl(x.amount)}</Text>
            {may ? <Button kind="quiet" title={x.active ? t('Durdur') : t('Sürdür')} onPress={() => act(() => setRecurringActive(x.id, !x.active))} /> : null}
            {may ? <Button kind="quiet" title={t('Sil')} onPress={() => act(() => deleteRecurring(x.id))} /> : null}
          </Row>
        </Row>
      ))}
      {open ? (
        <Stack gap={8}>
          <View style={{ gap: 4 }}><Label>{t('Kategori')}</Label>
            <Seg wrap value={r.cat} onChange={(v: any) => setR({ ...r, cat: v })} options={SITE_EXPENSE_CATS().map((k) => [k, k] as [string, string])} /></View>
          <Row gap={10} wrap align="flex-end">
            <View style={{ flexGrow: 1, flexBasis: 130 }}><MoneyField label={t('Aylık tutar (₺)')} value={r.amount} onChange={(v) => setR({ ...r, amount: v })} /></View>
            <View style={{ flexGrow: 1, flexBasis: 110 }}><MoneyField label={t('Ayın günü (1–28)')} value={r.day} decimals={0} onChange={(v) => setR({ ...r, day: v.slice(0, 2) })} /></View>
            <View style={{ flexGrow: 1, flexBasis: 140 }}><Field label={t('Başlangıç (YYYY-AA)')} value={r.start_month} onChangeText={(v) => setR({ ...r, start_month: v })} maxLength={7} /></View>
            <View style={{ flexGrow: 1, flexBasis: 140 }}><Field label={t('Bitiş (isteğe bağlı, YYYY-AA)')} value={r.end_month} onChangeText={(v) => setR({ ...r, end_month: v })} maxLength={7} /></View>
          </Row>
          <Field label={t('Açıklama (isteğe bağlı)')} value={r.note} onChangeText={(v) => setR({ ...r, note: v })} maxLength={500} placeholder={t('ör. Kapıcı maaşı')} />
          <Row wrap>
            <Button title={t('Kaydet')} disabled={!r.cat || !r.amount || !(Number(r.day) >= 1 && Number(r.day) <= 28)}
              onPress={() => act(async () => {
                if (!/^\d{4}-\d{2}$/.test(r.start_month) || (r.end_month && !/^\d{4}-\d{2}$/.test(r.end_month))) throw new Error(t('Ayları YYYY-AA biçiminde yaz.'));
                await saveRecurring(oid, { ...r, amount: String(r.amount).replace(',', '.') });
                setOpen(false); setR({ cat: '', amount: '', day: '1', note: '', start_month: thisMonth(), end_month: '' });
              })} />
            <Button kind="quiet" title={t('Vazgeç')} onPress={() => setOpen(false)} />
          </Row>
        </Stack>
      ) : null}
      <Err e={err} />
    </Card>
  );
}

function Expenses({ d, oid, can, reload, onDistribute }: { d: any; oid: string; can: (p: string) => boolean; reload: () => void; onDistribute?: (e: any) => void }) {
  const [e, setE] = useState<any>({ cat: '', amount: '', spent_on: today(), note: '', kind: 'isletme' });
  const [files, setFiles] = useState<Picked[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const act = async (fn: () => Promise<any>) => { setErr(null); try { await fn(); reload(); } catch (x) { setErr(humanError(x)); } };
  const m = thisMonth();
  // Ticari portföyde gider türü: ortak alan gideri (kiracıya yansır) ya da işletme gideri (NOI hesabı, yatırımcı raporu).
  const typed = isCommercial(d.sector);
  const kindName = (k: string) => (k === 'ortak' ? t('Ortak gider') : t('İşletme gideri'));
  const monthTotal = d.expenses.filter((x: any) => String(x.spent_on).startsWith(m)).reduce((a: number, x: any) => a + Number(x.amount), 0);
  // Sitede giderler kasadan (aidat havuzundan) ödenir; dairelere ayrıca yazmak istisnadır ("Ek toplama yap", onayla).
  const extraCollect = async (x: any) => {
    if (!onDistribute) return;
    if (typed) { onDistribute(x); return; }
    if (await host.ask({ title: t('Ek toplama yapılsın mı?'), body: t('Bu gider kasadan değil, dairelerden ayrıca toplanır: tutar dairelere ek ödeme olarak yazılır. Kasada yeterli para varsa genelde gerekmez; dış cephe boyası gibi büyük, tek seferlik harcamalar içindir.'), ok: t('Ek toplama yap') })) onDistribute(x);
  };
  return (
    <Stack>
      {!typed ? <CashCard d={d} oid={oid} can={can} reload={reload} from={m + '-01'} to={m + '-31'} title={t('{month} kasası', { month: monthYear(m) })} /> : null}
      {!typed ? <RecurringCard d={d} oid={oid} can={can} reload={reload} /> : null}
      {can('expenses.manage') ? (
        <Card gap={10}>
          <H2>{t('Gider ekle')}</H2>
          <Row gap={10} wrap align="flex-end">
            {typed ? <View style={{ flexGrow: 2, flexBasis: 200 }}><Field label={t('Kalem')} value={e.cat} onChangeText={(v) => setE({ ...e, cat: v })} maxLength={60} placeholder={t('ör. Asansör bakımı')} /></View> : null}
            <View style={{ flexGrow: 1, flexBasis: 120 }}><MoneyField label={t('Tutar (₺)')} value={e.amount} onChange={(v) => setE({ ...e, amount: v })} /></View>
            <View style={{ flexGrow: 1, flexBasis: 140 }}><Field label={t('Tarih (YYYY-AA-GG)')} value={e.spent_on} onChangeText={(v) => setE({ ...e, spent_on: v })} maxLength={10} /></View>
          </Row>
          {!typed ? (
            <View style={{ gap: 4 }}>
              <Label>{t('Kategori')}</Label>
              <Seg wrap value={e.cat} onChange={(v: any) => setE({ ...e, cat: v })} options={SITE_EXPENSE_CATS().map((k) => [k, k] as [string, string])} />
            </View>
          ) : null}
          {typed ? (
            <View style={{ gap: 4 }}>
              <Label>{t('Gider türü')}</Label>
              <Seg value={e.kind} onChange={(v: any) => setE({ ...e, kind: v })} options={[['isletme', t('İşletme gideri')], ['ortak', t('Ortak gider (kiracıya yansır)')]]} wrap />
            </View>
          ) : null}
          <Field label={!typed && e.cat === t('Diğer') ? t('Açıklama') : t('Not (isteğe bağlı)')} value={e.note} onChangeText={(v) => setE({ ...e, note: v })} maxLength={500} />
          <FileField label={t('Fatura ya da fiş (isteğe bağlı)')} files={files} setFiles={setFiles} camera max={1} />
          <Button title={t('Gideri ekle')} style={{ alignSelf: 'flex-start' }} disabled={!e.cat.trim() || !e.amount}
            onPress={() => act(async () => {
              await addExpense(oid, { ...e, kind: typed ? e.kind : 'isletme', amount: e.amount.replace(',', '.'), file: files[0] || null });
              setE({ cat: '', amount: '', spent_on: today(), note: '', kind: e.kind }); setFiles([]);
            })} />
          <Err e={err} />
        </Card>
      ) : null}
      <Muted>{t('{month} giderleri: {sum}', { month: monthYear(m), sum: tl(monthTotal) })}</Muted>
      {d.expenses.length ? d.expenses.map((x: any) => (
        <Card key={x.id} gap={6}>
          <Row between wrap>
            <View style={{ flex: 1, minWidth: 160 }}><Text v="small" style={{ fontFamily: fonts.bodyXBold }}>{x.cat}</Text><Muted>{day(x.spent_on)}{typed ? ' · ' + kindName(x.kind) : ''}{x.note ? ' · ' + x.note : ''}</Muted></View>
            <Row gap={10}>
              {x.receipt_path ? <DownloadLink path={x.receipt_path} label={x.receipt_name || t('Fatura')} /> : null}
              <Text v="small" style={{ fontFamily: fonts.bodyXBold }}>{tl(x.amount)}</Text>
            </Row>
          </Row>
          {can('expenses.manage') ? (
            <Row wrap>
              {can('charges.manage') && onDistribute ? <Button kind="ghost" title={typed ? t('Birimlere dağıt') : t('Ek toplama yap')} onPress={() => extraCollect(x)} /> : null}
              <Button kind="quiet" title={t('Sil')} onPress={() => act(() => deleteExpense(x.id))} />
            </Row>
          ) : null}
        </Card>
      )) : <Empty>{t('Henüz gider yok.')}</Empty>}
    </Stack>
  );
}

function Notes({ d, oid, can, reload }: { d: any; oid: string; can: (p: string) => boolean; reload: () => void }) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const act = async (fn: () => Promise<any>) => { setErr(null); try { await fn(); reload(); } catch (x) { setErr(humanError(x)); } };
  return (
    <Stack>
      {can('announce') ? (
        <Card gap={10}>
          <H2>{t('Duyuru yap')}</H2>
          <Field label={t('Başlık')} value={title} onChangeText={setTitle} maxLength={120} />
          <Field label={t('Duyuru metni')} value={body} onChangeText={setBody} multiline maxLength={4000} />
          <Muted>{t('Duyuru, hesabı bağlı tüm malik ve kiracılara bildirim olarak gider.')}</Muted>
          <Button title={t('Duyur')} style={{ alignSelf: 'flex-start' }} disabled={title.trim().length < 2} onPress={() => act(async () => { await announce(oid, title, body); setTitle(''); setBody(''); })} />
          <Err e={err} />
        </Card>
      ) : null}
      {d.notes.length ? d.notes.map((x: any) => (
        <Card key={x.id} gap={6}>
          <Row between wrap><H2>{x.title}</H2><Muted>{day(x.created_at)}</Muted></Row>
          {x.body ? <Text v="small">{x.body}</Text> : null}
          {can('announce') ? <Button kind="quiet" title={t('Sil')} onPress={() => act(() => deleteAnnouncement(x.id))} style={{ alignSelf: 'flex-start' }} /> : null}
        </Card>
      )) : <Empty>{t('Henüz duyuru yok.')}</Empty>}
    </Stack>
  );
}

/** Talep kartı: başlık satırı her zaman görünür; ayrıntı, durum, yanıt ve yazışma dokununca açılır (bekleyen ilk talepler açık gelir). */
function RequestCard({ x, unit, who, can, reload, initialOpen = true }: { x: any; unit: any; who?: string; can: (p: string) => boolean; reload: () => void; initialOpen?: boolean }) {
  const c = useColors();
  const [open, setOpen] = useState(initialOpen);
  const [st, setSt] = useState<number>(x.status);
  const [reply, setReply] = useState<string>(x.reply || '');
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const dirty = st !== x.status || reply !== (x.reply || '');
  return (
    <Card gap={8}>
      <PressScale onPress={() => setOpen(!open)} accessibilityRole="button" accessibilityState={{ expanded: open }} accessibilityLabel={x.title + ' · ' + REQ()[x.status]} scaleTo={0.995}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Label accent>{t(REQ_CAT[x.cat] || x.cat)}{unit ? ' · ' + unitLabel(unit) : ''}{who ? ' · ' + who : ''}</Label>
          <Text v="body" numberOfLines={open ? undefined : 2} style={{ fontFamily: fonts.bodyXBold }}>{x.title}</Text>
          <Muted>{day(x.created_at)}</Muted>
        </View>
        <Chip tone={x.status === 3 ? 'ok' : x.status === 0 ? 'warn' : 'neutral'} label={REQ()[x.status]} />
        <Text v="body" color={c.muted} style={{ transform: [{ rotate: open ? '90deg' : '0deg' }] }}>›</Text>
      </PressScale>
      {open ? <>
      {x.body ? <Text v="small">{x.body}</Text> : null}
      <MediaList paths={x.media} />
      {can('requests.manage') ? (
        <>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{REQ().map((l, i) => <Pill key={l} label={l} on={st === i} onPress={() => { setSt(i); setSaved(false); }} />)}</View>
          <Field label={t('Kısa yanıt (talep kartında görünür)')} value={reply} onChangeText={(v) => { setReply(v); setSaved(false); }} multiline maxLength={4000} />
          <Button title={t('Kaydet')} disabled={!dirty} style={{ alignSelf: 'flex-start' }} onPress={async () => { setErr(null); try { await answerRequest(x.id, st, reply); setSaved(true); reload(); } catch (e) { setErr(humanError(e)); } }} />
          {saved && !dirty ? <Text v="small" color={c.okInk}>{t('Kaydedildi; sakine bildirim gitti.')}</Text> : null}
          <Err e={err} />
        </>
      ) : null}
      <RequestThread req={x} canWrite={can('requests.manage')} mgmt who={who || (unit ? unitLabel(unit) : undefined)} />
      </> : null}
    </Card>
  );
}

const METHOD_LABEL = () => [['share', t('Arsa payına göre')], ['area', t('m²’ye göre')], ['equal', t('Eşit')]] as [string, string][];

/** İşletme projesi: yıllık gider kalemleri, dağıtım anahtarı, dairelerin aylık aidatı ve "aidatları güncelle". */
/** Yönetim kurulu raporu: dönem seçilir, ekranda gösterilir, "Yazdır / PDF" ile çıktı alınır. */
function Report({ d, org }: { d: any; org: string }) {
  const c = useColors();
  const [period, setPeriod] = useState<'month' | 'year'>('month');
  const [ref, setRef] = useState(thisMonth() + '-01');
  const months = Array.from({ length: 12 }, (_, i) => { const x = new Date(); x.setDate(1); x.setMonth(x.getMonth() - i); return mkey(x) + '-01'; });
  const years = [0, 1, 2].map((i) => (new Date().getFullYear() - i) + '-01-01');
  const [pc, setPc] = useReportCurrency();
  const { table } = useFx(period === 'year' ? (Number(ref.slice(0, 4)) - 1) + '-01-01' : (() => { const x = parse(ref); x.setMonth(x.getMonth() - 12); return mkey(x) + '-01'; })());
  const M = (n: any) => fmtMoney(n, pc);
  const r = siteReport(d, period, ref, pc, table);
  const endMonth = period === 'year' ? ref.slice(0, 4) + '-12' : ref.slice(0, 7);
  const charged = r.charges.reduce((a: number, x: any) => a + x.charged, 0);
  const got = r.charges.reduce((a: number, x: any) => a + x.collected, 0);
  const spent = r.expenses.reduce((a: number, x: any) => a + x.total, 0);
  const share = period === 'year' ? 1 : 1 / 12;
  const periodEnd = iso(new Date(Number(endMonth.slice(0, 4)), Number(endMonth.slice(5, 7)), 0));
  const line = (a: string, b: string, i: number, bad?: boolean) => (
    <Row key={a + i} between style={{ paddingVertical: 9, borderTopWidth: i ? 1 : 0, borderColor: c.line }}>
      <Text v="small" style={{ fontFamily: fonts.bodyBold, flex: 1 }}>{a}</Text><Text v="small" style={{ fontFamily: fonts.bodyXBold }} color={bad ? c.badInk : c.ink}>{b}</Text>
    </Row>
  );
  const title = period === 'year' ? t('{year} yıllık yönetim raporu', { year: ref.slice(0, 4) }) : t('{month} yönetim raporu', { month: monthYear(ref.slice(0, 7)) });
  return (
    <Stack>
      <Row wrap>
        <Seg value={period} onChange={(v: any) => { setPeriod(v); setRef(v === 'year' ? years[0] : months[0]); }} options={[['month', t('Aylık')], ['year', t('Yıllık')]]} />
        <CurrencySwitch value={pc} onChange={setPc} />
      </Row>
      {period === 'year'
        ? <Stepper name={t('yıl')} label={ref.slice(0, 4)} prev={ref > years[years.length - 1]} next={ref < years[0]}
            onPrev={() => setRef((Number(ref.slice(0, 4)) - 1) + '-01-01')} onNext={() => setRef((Number(ref.slice(0, 4)) + 1) + '-01-01')} />
        : <MonthStepper value={ref.slice(0, 7)} onChange={(m) => setRef(m + '-01')} min={months[months.length - 1].slice(0, 7)} max={months[0].slice(0, 7)} />}
      <Card gap={12}>
        <View style={{ gap: 2 }}><Label>{org} · {t('{n} daire', { n: r.units })}</Label><Text v="h3">{title}</Text></View>
        <Row wrap>
          <View style={{ flex: 1, minWidth: 130 }}><Muted>{t('İstenen')}</Muted><Text v="h3">{M(charged)}</Text></View>
          <View style={{ flex: 1, minWidth: 130 }}><Muted>{t('Tahsil edilen')}</Muted><Text v="h3">{M(got)}</Text><Muted>{charged ? percent((got / charged) * 100, 0) : '—'}</Muted></View>
          <View style={{ flex: 1, minWidth: 130 }}><Muted>{t('Giderler')}</Muted><Text v="h3">{M(spent)}</Text></View>
        </Row>
        {r.charges.length ? <View><Label>{t('İstenen ve tahsil edilen')}</Label>{r.charges.map((x: any, i: number) => line(kindLabel(x.kind), M(x.collected) + ' / ' + M(x.charged), i))}
          {Math.round(r.fxDiff) ? line(t('Kur farkı'), M(r.fxDiff), r.charges.length, r.fxDiff < 0) : null}</View> : null}
        {r.expenses.length ? <View><Label>{t('Giderler')}</Label>{r.expenses.map((x: any, i: number) => line(x.cat, M(x.total), i))}</View> : null}
        {r.budget ? (
          <View><Label>{t('İşletme projesi {year} · harcanan / öngörülen', { year: r.budget.year })}</Label>
            {r.budget.items.map((it: any, i: number) => {
              const used = r.expenses.filter((e: any) => e.cat.toLocaleLowerCase('tr') === String(it.cat).toLocaleLowerCase('tr')).reduce((a: number, e: any) => a + e.total, 0);
              const plan = amountIn(Number(it.amount) * share, periodEnd, pc, table);
              return line(it.cat, M(used) + ' / ' + M(plan), i, plan != null && used > plan);
            })}
          </View>
        ) : null}
        <View><Label>{t('Borçlu daireler')}</Label>{r.debtors.length ? r.debtors.map((x: any, i: number) => line(x.unit, M(x.unpaid), i, true)) : <Muted>{t('Gecikmiş borç yok.')}</Muted>}</View>
        <Muted>{t('Talepler')}: {t('{n} açıldı', { n: r.requests.opened })} · {t('{n} açık bekliyor', { n: r.requests.open })}</Muted>
        {pc !== 'TRY' || Math.round(r.fxDiff) || r.fxMissing ? <FxNote cur={pc} missing={r.fxMissing} /> : null}
      </Card>
      {!isCommercial(d.sector) ? <CashCard d={d} oid="" can={() => false} reload={() => {}} from={r.from} to={periodEnd}
        title={period === 'year' ? t('{year} kasası', { year: ref.slice(0, 4) }) : t('{month} kasası', { month: monthYear(ref.slice(0, 7)) })} /> : null}
      <RevenueChart charges={d.charges} endMonth={endMonth} cur={pc} table={table} />
      {typeof window !== 'undefined' && (window as any).print ? <Button kind="ghost" title={t('Yazdır / PDF')} onPress={() => (window as any).print()} style={{ alignSelf: 'flex-start' }} /> : null}
      <Muted>{t('Bu rapor her ayın 1’inde (yıllığı 1 Ocak’ta) “Raporlar” yetkisi olan yöneticilere e-postayla da gider.')}</Muted>
    </Stack>
  );
}

/** Ciro bildirimleri: kiracının bildirdiği aylık ciro; onayda "cironun %X'i sabit kirayı aşarsa fark" ciro tahakkuku olur. */
function Turnovers({ d, can, reload }: { d: any; can: (p: string) => boolean; reload: () => void }) {
  const c = useColors();
  const unitBy: Record<string, any> = Object.fromEntries(d.units.map((u: any) => [u.id, u]));
  const [fx, setFx] = useState<Record<string, string>>({ USD: '', EUR: '' });
  const [why, setWhy] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  const fxNum = { USD: Number(fx.USD.replace(',', '.')) || 0, EUR: Number(fx.EUR.replace(',', '.')) || 0 };
  const needFx = [...new Set(d.turnovers.filter((x: any) => x.status === 'reported').map((x: any) => unitBy[x.unit_id]?.currency).filter((k: any) => k && k !== 'TRY'))] as string[];
  const act = async (fn: () => Promise<any>) => { setErr(null); try { await fn(); reload(); } catch (e) { setErr(humanError(e)); } };
  const rated = d.units.filter((u: any) => Number(u.turnover_rate) > 0);
  return (
    <Stack>
      <Muted>{t('Ciro kirası olan birimlerde kiracı her ay cirosunu bildirir. Onayladığında cironun sözleşmedeki oranı sabit kirayı aşarsa aradaki fark o ayın “Ciro farkı” tahakkuku olur.')}</Muted>
      {!rated.length ? <Note>{t('Ciro kirası tanımlı birim yok. Birimler sekmesinde sözleşmeye ciro oranı ekleyebilirsin.')}</Note> : null}
      {needFx.length ? (
        <Row gap={10} wrap align="flex-end">
          {needFx.map((k) => <View key={k} style={{ flexGrow: 1, flexBasis: 140 }}><MoneyField label={t('{cur} kuru (₺)', { cur: k })} value={(fx as any)[k]} decimals={4} onChange={(v) => setFx({ ...fx, [k]: v })} /></View>)}
        </Row>
      ) : null}
      <Err e={err} />
      {d.turnovers.length ? d.turnovers.map((x: any) => {
        const u = unitBy[x.unit_id] || {};
        const cur = u.currency || 'TRY';
        const ready = cur === 'TRY' || (fxNum as any)[cur] > 0;
        const diff = ready ? ciroDiff(u, x.amount, fxNum) : null;
        return (
          <Card key={x.id} gap={8}>
            <Row between wrap>
              <View style={{ flex: 1, minWidth: 180 }}>
                <Text v="small" style={{ fontFamily: fonts.bodyXBold }}>{unitLabel(u)} · {monthYear(x.month)}</Text>
                <Muted>{t('Ciro')} {tl(x.amount)} · %{u.turnover_rate || 0} = {tl(Number(x.amount) * (Number(u.turnover_rate) || 0) / 100)} · {t('Sabit kira')} {money(u.rent, cur)}</Muted>
                <Muted>{diff == null ? t('Farkı görmek için kuru yaz.') : diff > 0 ? t('Ciro farkı: {sum}', { sum: tl(diff) }) : t('Fark yok: sabit kira yüksek.')}</Muted>
                {x.reject_reason ? <Text v="small" color={c.badInk}>{x.reject_reason}</Text> : null}
              </View>
              <Chip tone={x.status === 'approved' ? 'ok' : x.status === 'rejected' ? 'bad' : 'warn'} label={x.status === 'approved' ? t('Onaylandı') : x.status === 'rejected' ? t('Reddedildi') : t('Onay bekliyor')} />
            </Row>
            {can('charges.manage') && x.status === 'reported' ? (
              <Row gap={8} wrap align="flex-end">
                <Button title={t('Onayla')} disabled={!ready} onPress={() => act(() => decideTurnover(x, true, { unit: u, fx: fxNum }))} />
                <View style={{ flexGrow: 1, flexBasis: 200 }}><Field label={t('Red gerekçesi')} value={why[x.id] || ''} onChangeText={(v) => setWhy({ ...why, [x.id]: v })} maxLength={200} /></View>
                <Button kind="ghost" title={t('Reddet')} disabled={!(why[x.id] || '').trim()} onPress={() => act(() => decideTurnover(x, false, { reason: why[x.id] }))} />
              </Row>
            ) : null}
          </Card>
        );
      }) : <Empty>{t('Henüz ciro bildirimi yok.')}</Empty>}
    </Stack>
  );
}

/** Kira artışları: sözleşme yıldönümü gelen (30 gün içinde ya da uygulanmamış) birimler ve artış geçmişi. */
function Increases({ d, oid, can, reload }: { d: any; oid: string; can: (p: string) => boolean; reload: () => void }) {
  const c = useColors();
  const [rates, setRates] = useState<any>(null);
  const [edit, setEdit] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { loadRates().then(setRates).catch(() => setRates({})); }, []);
  if (!rates) return <Spin />;
  const list = dueIncreases(d.units, d.rentChanges, rates);
  const unitBy: Record<string, any> = Object.fromEntries(d.units.map((u: any) => [u.id, u]));
  const act = async (fn: () => Promise<any>) => { setErr(null); try { await fn(); reload(); } catch (e) { setErr(humanError(e)); } };
  return (
    <Stack>
      <Muted>{t('Sözleşme yıldönümünde kira; TÜFE’ye bağlı sözleşmede yıldönümünden önceki ayın 12 aylık ortalamasıyla, sabit oranlı sözleşmede o oranla artar. Önerilen tutarı değiştirip uygulayabilirsin.')}</Muted>
      <Err e={err} />
      {list.length ? list.map((x: any) => {
        const val = edit[x.unit.id] ?? (x.next != null ? String(x.next) : '');
        return (
          <Card key={x.unit.id} gap={8}>
            <Row between wrap>
              <View style={{ flex: 1, minWidth: 180 }}>
                <Text v="small" style={{ fontFamily: fonts.bodyXBold }}>{unitLabel(x.unit)} · {day(x.date)}</Text>
                <Muted>{t('Şu anki kira')} {money(x.unit.rent, x.unit.currency)} · {x.rate == null ? t('{m} TÜFE oranı henüz yok', { m: x.source }) : (x.source === 'sabit' ? t('Sabit oran') : t('TÜFE {m}', { m: x.source })) + ' %' + String(x.rate).replace('.', ',')}</Muted>
              </View>
              <Chip tone={x.date <= today() ? 'warn' : 'neutral'} label={x.date <= today() ? t('Uygulanmadı') : t('Yaklaşıyor')} />
            </Row>
            {can('charges.manage') ? (
              <Row gap={10} wrap align="flex-end">
                <View style={{ flexGrow: 1, flexBasis: 160 }}><MoneyField label={t('Yeni kira ({cur})', { cur: x.unit.currency || 'TRY' })} value={val} onChange={(v) => setEdit({ ...edit, [x.unit.id]: v })} /></View>
                <Button title={t('Artışı uygula')} disabled={!Number(String(val).replace(',', '.'))} onPress={() => act(() => applyIncrease(oid, x, Number(String(val).replace(',', '.')),
                  x.source === 'sabit' ? t('Sözleşmedeki sabit oran') : t('TÜFE 12 aylık ortalama ({m})', { m: x.source })))} />
              </Row>
            ) : null}
          </Card>
        );
      }) : <Empty>{t('Yakın zamanda yıldönümü gelen sözleşme yok.')}</Empty>}
      {d.rentChanges.length ? (
        <Stack gap={8}>
          <H2>{t('Artış geçmişi')}</H2>
          <Card gap={0}>
            {d.rentChanges.map((x: any, i: number) => (
              <Row key={x.id} between style={{ paddingVertical: 10, borderTopWidth: i ? 1 : 0, borderColor: c.line }}>
                <View style={{ flex: 1 }}><Text v="small" style={{ fontFamily: fonts.bodyBold }}>{unitBy[x.unit_id] ? unitLabel(unitBy[x.unit_id]) : '—'} · {day(x.from_date)}</Text><Muted>{x.reason}</Muted></View>
                <Text v="small" style={{ fontFamily: fonts.bodyXBold }}>{money(x.old_amount, x.currency)} → {money(x.new_amount, x.currency)}</Text>
              </Row>
            ))}
          </Card>
        </Stack>
      ) : null}
    </Stack>
  );
}

/** Kurumun birim/tahakkuk ekranı: site yönetimi ya da ticari portföy (AVM, depo, GYO). Birden çok kurum varsa üstte seçilir. */
const cache: { org: string | null; data: any } = { org: null, data: null };

export function SiteAdminScreen({ section: sec = 'ozet' }: { section?: string }) {
  useStore();
  const section = sec === 'butce' ? 'projeler' : sec;          // işletme projesi artık Projeler'de (eski adres yönlenir)
  const router = useRouter();
  const { desktop } = useBreakpoint();
  const sites = myOrgs().filter((o: any) => PORTFOLIO_SECTORS.includes(o.sector));
  const org = currentPortfolioOrg();
  // Bölümler ayrı sayfa: son okunan veri bölüm değişince hemen gösterilir, arkada tazelenir.
  const [d, setD] = useState<any>(() => (org && cache.org === org.id ? cache.data : null));
  const [err, setErr] = useState<string | null>(null);
  const [seed] = useState<any>(() => { const s = ui.siteSeed; ui.siteSeed = null; return s; });
  const load = useCallback(async () => {
    if (!org) return;
    try {
      const x: any = await loadSiteAdmin(org.id); x.modules = org.modules || [];
      cache.org = org.id; cache.data = x; setD(x); setErr(null);
    } catch (e) { setErr(humanError(e)); }
  }, [org?.id]);
  useEffect(() => { if (!(org && cache.org === org.id)) setD(null); load(); }, [load]);
  if (!org) return <Page title={t('Site')}><Note>{t('Bir site yönetiminin yöneticisi değilsin.')}</Note></Page>;
  const can = (p: string) => orgCan(org, p);
  const commercial = isCommercial(org.sector);
  const sections = sectorSections(org);
  const cur = sections.find((x) => x.key === section) || sections[0];
  const go = (k: string) => router.push(sectionPath(k) as any);
  const unitBy: Record<string, any> = d ? Object.fromEntries(d.units.map((u: any) => [u.id, u])) : {};
  const count = d ? (commercial ? t('{n} birim', { n: d.units.length }) : t('{n} daire', { n: d.units.length })) : '';
  return (
    <Page title={cur.key === 'ozet' ? org.name : cur.label} sub={[cur.key === 'ozet' ? sectorOf(org.sector).label : org.name, count].filter(Boolean).join(' · ')}>
      {sites.length > 1 ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{sites.map((o: any) => <Pill key={o.id} label={o.name} on={o.id === org.id} onPress={() => { ui.siteOrg = o.id; setD(null); }} />)}</View> : null}
      {org.status !== 'active' ? <Note warn>{t('Kurum askıda. Yeniden etkinleşene kadar değişiklik yapılamaz; anahtar ile iletişime geç.')}</Note> : null}
      {/* Telefonda menü alt çubuğa sığmaz: bölümler kaydırılabilir şeritte. */}
      {/* Telefonda bölümler alt çubukta: dört ana bölüm ve "Diğer" listesi (AppShell → TabBar). */}
      {err ? <Note warn>{err}</Note> : null}
      {!d ? (err ? null : <Spin />) : (
        <>
          {cur.key === 'ozet' && <Overview d={d} org={org} can={can} reload={load} go={go} ChargeRow={ChargeRow} />}
          {cur.key === 'birimler' && <Units d={d} oid={org.id} org={org.name} orgRow={org} can={can} reload={load} />}
          {cur.key === 'tahakkuk' && <Charges key={seed ? seed.title + seed.value : 'x'} d={d} oid={org.id} can={can} reload={load} seed={seed} />}
          {cur.key === 'ciro' && <Turnovers d={d} can={can} reload={load} />}
          {cur.key === 'artis' && <Increases d={d} oid={org.id} can={can} reload={load} />}
          {cur.key === 'giderler' && <Expenses d={d} oid={org.id} can={can} reload={load}
            onDistribute={(commercial ? hasModule(org, 'ortak_gider') : hasModule(org, 'gider_dagitim')) ? (x: any) => {
              // Sitede gider arsa payına göre özel toplama; ticaride m²'ye göre ortak alan gideri olarak dağıtılır.
              ui.siteSeed = commercial ? { month: String(x.spent_on).slice(0, 7), kind: 'ortak_gider', title: '', mode: 'area', value: x.amount }
                : { month: String(x.spent_on).slice(0, 7), kind: 'ozel', title: String(x.note || x.cat).slice(0, 120), mode: 'share', value: x.amount };   // başlık: açıklama, yoksa kategori
              go('tahakkuk');
            } : undefined} />}
          {cur.key === 'rapor' && <Report d={d} org={org.name} />}
          {cur.key === 'yatirimci' && <InvestorReport d={d} org={org} />}
          {cur.key === 'duyurular' && <Notes d={d} oid={org.id} can={can} reload={load} />}
          {cur.key === 'genelkurul' && <Meetings d={d} org={org} can={can} />}
          {cur.key === 'projeler' && <SiteProjects oid={org.id} can={can} d={d} reloadAll={load} />}
          {cur.key === 'belgeler' && <SiteDocs d={d} oid={org.id} can={can} reload={load} />}
          {cur.key === 'talepler' && (d.requests.length ? d.requests.map((x: any, i: number) => <RequestCard key={x.id} initialOpen={x.status < 3 && i < 3} x={x} unit={unitBy[x.unit_id]} who={(d.residents.find((r: any) => r.user_id && r.user_id === x.user_id) || {}).name} can={can} reload={load} />) : <Empty>{t('Talep yok.')}</Empty>)}
        </>
      )}
    </Page>
  );
}

/* ================================================================== */
/* Sakin: "Sitem"                                                      */
/* ================================================================== */

function PayCharge({ x, done }: { x: any; done: () => void }) {
  const c = useColors();
  const left = unpaidOf(x);
  const [amount, setAmount] = useState(String(left));
  const [date, setDate] = useState(today());
  const [files, setFiles] = useState<Picked[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const card = cardTotal(Number(amount) || left);
  const ready = cardReady();
  return (
    <Stack gap={10} style={{ backgroundColor: c.surface2, borderRadius: radius.md, padding: 14 }}>
      {/* Kartla ödeme: işlem ücreti (%2,5) ödeyene yansır; ödeme kuruluşu bağlanana kadar "yakında". */}
      <View style={{ borderRadius: radius.md, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface, padding: 12, gap: 4, opacity: ready ? 1 : 0.75 }}>
        <Row between wrap>
          <Text v="small" style={{ fontFamily: fonts.bodyXBold }}>{t('Kartla öde · {sum}', { sum: tl(card.total) })}</Text>
          {ready ? null : <Chip label={t('Yakında')} />}
        </Row>
        <Muted>{t('{amount} + {fee} işlem ücreti (%2,5) · 3D Secure', { amount: tl(card.amount), fee: tl(card.fee) })}</Muted>
        {ready ? null : <Muted>{t('Kartla ödeme yakında açılıyor; şimdilik dekontla öde.')}</Muted>}
      </View>
      <Text v="small" style={{ fontFamily: fonts.bodyXBold }}>{t('Dekont yükle (ücretsiz)')}</Text>
      <Row gap={10} wrap align="flex-end">
        <View style={{ flexGrow: 1, flexBasis: 140 }}><MoneyField label={t('Ödenen tutar (₺)')} value={amount} onChange={(v) => setAmount(v)} /></View>
        <View style={{ flexGrow: 1, flexBasis: 140 }}><Field label={t('Ödeme tarihi (YYYY-AA-GG)')} value={date} onChangeText={setDate} maxLength={10} /></View>
      </Row>
      <FileField label={t('Dekont (görsel ya da PDF)')} files={files} setFiles={setFiles} camera />
      <Err e={err} />
      <Row wrap>
        <Button title={t('Yönetime gönder')} loading={busy} onPress={async () => {
          if (!files.length) { setErr(t('Dekont dosyası seç.')); return; }
          setBusy(true); setErr(null);
          try { await payCharge(x, { amount: amount.replace(',', '.'), date, note: '', file: files[0] }); done(); } catch (e) { setErr(humanError(e)); }
          setBusy(false);
        }} />
        <Button kind="quiet" title={t('Vazgeç')} onPress={done} />
      </Row>
    </Stack>
  );
}

function MyCharge({ x, payer, reload, site = true }: { x: any; payer: boolean; reload: () => void; site?: boolean }) {
  const c = useColors();
  const [paying, setPaying] = useState(false);
  // Gecikme tazminatı (KMK md. 20) yalnızca sitede; ticari sözleşmede gecikme yalnızca durumla gösterilir.
  const fee = site ? lateFee(x) : 0;
  const late = overdue(x);
  return (
    <View style={{ paddingVertical: 10, gap: 8, borderTopWidth: 1, borderColor: c.line }}>
      <Row between wrap>
        <View style={{ flex: 1, minWidth: 150 }}>
          <Text v="small" style={{ fontFamily: fonts.bodyXBold }}>{monthYear(x.month)} · {kindLabel(x.kind, x.title)}</Text>
          <Muted>{tl(x.amount)}{x.status === 'partial' ? ' · ' + t('Ödenen') + ' ' + tl(x.paid_amount) : ''}{fee ? ' · ' + t('Gecikme tazminatı') + ' ' + tl(fee) : ''}</Muted>
          {x.reject_reason ? <Text v="small" color={c.badInk}>{t('Red gerekçesi:')} {x.reject_reason}</Text> : null}
        </View>
        <StatusChip st={stOf(x)} />
      </Row>
      {payer && ['open', 'partial', 'rejected'].includes(x.status) && !paying
        ? <Button kind={late ? 'primary' : 'ghost'} title={t('Dekont yükle')} onPress={() => setPaying(true)} style={{ alignSelf: 'flex-start' }} /> : null}
      {paying ? <PayCharge x={x} done={() => { setPaying(false); reload(); }} /> : null}
    </View>
  );
}

/** Mülke bağlı site dairesinin tahakkukları (mülkün Ödemeler ekranında kira kartının yanında). */
export function SiteUnitCharges({ unitId }: { unitId: string }) {
  useStore();
  const c = useColors();
  const u = mySiteUnits().find((x: any) => x.unit_id === unitId);
  const [list, setList] = useState<any[] | null>(null);
  const load = useCallback(async () => setList(await loadUnitCharges(unitId)), [unitId]);
  useEffect(() => { load(); }, [load]);
  if (!u) return null;
  const payer = unitPays(u);
  const due = (list || []).reduce((a, x) => a + unpaidOf(x), 0);
  return (
    <Stack gap={6}>
      <Row between align="flex-start">
        <View style={{ flex: 1, gap: 2 }}>
          <Label>{t('Site aidatı')} · {u.org}</Label>
          <Text v="h3">{unitLabel(u)}</Text>
          <Muted>{payerText(u.payer, u.payer_effective)}{payer ? '' : ' · ' + t('takip için görünür')}</Muted>
        </View>
        <View style={{ alignItems: 'flex-end' }}><Muted>{t('Ödenmemiş')}</Muted><Text v="h3" color={due ? c.badInk : c.okInk}>{tl(due)}</Text></View>
      </Row>
      {!list ? <Spin /> : list.length ? <View>{list.slice(0, 6).map((x) => <MyCharge key={x.id} x={x} payer={payer} reload={load} site={!isCommercial(u.sector)} />)}</View> : <Muted>{t('Ödeme kaydı yok.')}</Muted>}
    </Stack>
  );
}

/** Panelde kısa site kartı: sitede dairesi olan kiracı ya da malik "Sitem"e buradan geçer. */
export function SiteTeaser({ go }: { go: (p: string) => void }) {
  useStore();
  const units = mySiteUnits();
  if (!units.length) return null;
  return (
    <Card onPress={() => go('/uygulama/sitem')} gap={4}>
      <Row between>
        <View style={{ flex: 1 }}>
          <Label>{residentTitle(units)} · {units.map((u: any) => u.org).filter((x: string, i: number, a: string[]) => a.indexOf(x) === i).join(', ')}</Label>
          <Text v="body" style={{ fontFamily: fonts.bodyBold }}>{units.map((u: any) => unitLabel(u)).join(', ')}</Text>
          <Muted>{units.some((u: any) => !isCommercial(u.sector)) ? t('Aidat, duyurular ve yönetime talep') : t('Kira, duyurular ve yönetime talep')}</Muted>
        </View>
        <Muted>›</Muted>
      </Row>
    </Card>
  );
}

/** Sakinin gördüğü işletme projesi: bu yılın kalemleri ve dairesinin aylık payı. */
/** Malik ya da kiracının site ekranı. */
/** Kiracının ekran adı: sitede "Sitem", AVM'de "Mağazam", diğer ticari birimlerde "Kiraladığım birim". */
export function residentTitle(units: any[]) {
  if (!units.length || units.some((u) => !isCommercial(u.sector))) return t('Sitem');
  return units.every((u) => u.sector === 'avm') ? t('Mağazam') : t('Kiraladığım birim');
}

/** Ciro bildirimi (ciro kirası olan ticari birimde kiracı): ay ve tutar; düzeltme yeniden onaya düşer. */
function TurnoverBox({ u }: { u: any }) {
  const c = useColors();
  const prev = (() => { const x = new Date(); x.setDate(1); x.setMonth(x.getMonth() - 1); return mkey(x); })();
  const [month, setMonth] = useState(prev);
  const [amount, setAmount] = useState('');
  const [list, setList] = useState<any[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const load = useCallback(async () => setList(await loadTurnovers(u.unit_id)), [u.unit_id]);
  useEffect(() => { load(); }, [load]);
  return (
    <View style={{ gap: 8, paddingTop: 8, borderTopWidth: 1, borderColor: c.line }}>
      <Text v="small" style={{ fontFamily: fonts.bodyXBold }}>{t('Ciro bildirimi')} · %{u.turnover_rate}</Text>
      <Muted>{t('Aylık cironu bildir. Cironun %{n}’i sabit kirayı aşarsa aradaki fark yönetim onayıyla kiraya eklenir.', { n: u.turnover_rate })}</Muted>
      <Row gap={10} wrap align="flex-end">
        <View style={{ flexGrow: 1, flexBasis: 120 }}><Field label={t('Ay (YYYY-AA)')} value={month} onChangeText={setMonth} maxLength={7} /></View>
        <View style={{ flexGrow: 1, flexBasis: 160 }}><MoneyField label={t('Ciro (₺, KDV hariç)')} value={amount} onChange={(v) => setAmount(v)} /></View>
        <Button title={t('Ciroyu bildir')} disabled={!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || !amount} onPress={async () => {
          setErr(null); setMsg(null);
          try { await reportTurnover(u, month, amount.replace(',', '.')); setAmount(''); setMsg(t('Ciron yönetime iletildi.')); load(); } catch (e) { setErr(humanError(e)); }
        }} />
      </Row>
      <Err e={err} />
      {msg ? <Text v="small" color={c.okInk}>{msg}</Text> : null}
      {list.slice(0, 6).map((x) => (
        <Row key={x.id} between>
          <Text v="small">{monthYear(x.month)} · {tl(x.amount)}</Text>
          <Chip tone={x.status === 'approved' ? 'ok' : x.status === 'rejected' ? 'bad' : 'warn'} label={x.status === 'approved' ? t('Onaylandı') : x.status === 'rejected' ? t('Reddedildi') : t('Onay bekliyor')} />
        </Row>
      ))}
    </View>
  );
}

type ResidentPart = 'all' | 'home' | 'pay' | 'req' | 'docs';

/** Sakinin site ekranı. part: 'home' (özet), 'pay' (ödemeler), 'req' (talepler), 'docs' (belgeler); 'all' tek sayfada hepsi
    (kendi mülkü de olan kişi "Sitem" menüsünden açar). */
export function ResidentSiteScreen({ part = 'all' }: { part?: ResidentPart }) {
  useStore();
  const router = useRouter();
  const units = mySiteUnits();
  const home = residentTitle(units);
  const title = part === 'pay' ? t('Ödemeler') : part === 'req' ? t('Talepler') : part === 'docs' ? t('Belgeler') : home;
  const anySite = units.some((u: any) => !isCommercial(u.sector));
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [req, setReq] = useState<any>({ cat: 'ariza', title: '', body: '', unit: '' });
  const [reqFiles, setReqFiles] = useState<Picked[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const c = useColors();
  const load = useCallback(async () => { try { setD(await loadMySite()); setErr(null); } catch (e) { setErr(humanError(e)); } }, [units.length]);
  useEffect(() => { load(); }, [load]);
  if (!units.length) return <Page title={title}><Note>{t('Bir siteye bağlı değilsin. Site yönetiminden aldığın davet kodunu girerek bağlanabilirsin.')}</Note></Page>;
  const target = units.find((u: any) => u.unit_id === req.unit) || units[0];
  const show = (p: ResidentPart) => part === 'all' || part === p;
  const open = (x: any) => x.status !== 'paid';
  return (
    <Page title={title} sub={[...new Set(units.map((u: any) => u.org))].join(', ')}>
      {err ? <Note warn>{err}</Note> : null}
      {show('home') || show('pay') ? units.map((u: any) => {
        const payer = unitPays(u);
        const all = (d?.charges || []).filter((x: any) => x.unit_id === u.unit_id);
        // Özette yalnız ödenmemişler (en çok 3); Ödemeler'de geçmişin tamamı.
        const mine = part === 'home' ? all.filter(open).slice(0, 3) : all;
        const due = all.reduce((a: number, x: any) => a + unpaidOf(x), 0);
        return (
          <Card key={u.unit_id} gap={10}>
            <Row between align="flex-start">
              <View style={{ flex: 1, gap: 2 }}>
                <Label>{u.org}</Label>
                <Text v="h3">{unitLabel(u)}</Text>
                <Muted>{isCommercial(u.sector)
                  ? [t('Kiracı'), u.rent != null ? t('Kira') + ' ' + money(u.rent, u.currency) + ' ' + t('/ ay') : '', u.lease_end ? t('Sözleşme bitişi') + ' ' + day(u.lease_end) : '',
                     u.deposit && Number(u.deposit.amount) > 0 ? t('Depozito') + ' ' + money(u.deposit.amount, u.deposit.currency) + ' (' + depositKindLabel(u.deposit.kind)
                       + (u.deposit.kind === 'teminat' && u.deposit.until ? ', ' + t('bitiş {d}', { d: day(u.deposit.until) }) : '') + ')'
                       + (u.deposit.returned_on ? ' · ' + t('{d} iade edildi: {v}', { d: day(u.deposit.returned_on), v: money(u.deposit.returned ?? 0, u.deposit.currency) })
                         + (u.deposit.cut_reason ? ' · ' + t('kesinti: {r}', { r: u.deposit.cut_reason }) : '') : '') : ''].filter(Boolean).join(' · ')
                  : (u.role === 'malik' ? t('Malik') : t('Kiracı')) + ' · ' + payerText(u.payer, u.payer_effective)}</Muted>
              </View>
              <View style={{ alignItems: 'flex-end' }}><Muted>{t('Ödenmemiş')}</Muted><Text v="h3" color={due ? c.badInk : c.okInk}>{tl(due)}</Text></View>
            </Row>
            {!payer ? <Muted>{u.role === 'malik'
              ? t('Aidatı kiracın öder; dairenin aidat durumunu buradan izleyebilirsin.')
              : t('Aidatı malik öder. Sana aidat yazılırsa aşağıdaki talep formundan yönetime bildirebilirsin.')}</Muted> : null}
            {!d ? <Spin /> : mine.length ? <View>{mine.map((x: any) => <MyCharge key={x.id} x={x} payer={payer} reload={load} site={!isCommercial(u.sector)} />)}</View>
              : <Muted>{part === 'home' && all.length ? t('Bekleyen ödemen yok.') : t('Ödeme kaydı yok.')}</Muted>}
            {part === 'home' && all.length ? <Button kind="ghost" title={t('Tüm ödemeler')} onPress={() => router.push('/uygulama/odemeler' as any)} /> : null}
            {show('pay') && isCommercial(u.sector) && Number(u.turnover_rate) > 0 && u.role === 'kiraci' ? <TurnoverBox u={u} /> : null}
          </Card>
        );
      }) : null}

      {show('home') ? (
        <Stack gap={8}>
          <H2>{t('Duyurular')}</H2>
          {d?.notes?.length ? d.notes.slice(0, part === 'home' ? 5 : 10).map((x: any) => (
            <Card key={x.id} gap={4}><Row between wrap><Text v="body" style={{ fontFamily: fonts.bodyXBold }}>{x.title}</Text><Muted>{day(x.created_at)}</Muted></Row>{x.body ? <Text v="small">{x.body}</Text> : null}</Card>
          )) : <Empty>{t('Henüz duyuru yok.')}</Empty>}
        </Stack>
      ) : null}

      {show('home') ? <ResidentProjects units={units} /> : null}
      {show('home') ? <ResidentMeetings /> : null}
      {show('home') ? <ResidentCash units={units} /> : null}

      {show('req') ? (
        <Stack gap={8}>
          {part === 'all' ? <H2>{t('Yönetime talep')}</H2> : null}
          <Card gap={10}>
            {units.length > 1 ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{units.map((u: any) => <Pill key={u.unit_id} label={unitLabel(u)} on={target.unit_id === u.unit_id} onPress={() => setReq({ ...req, unit: u.unit_id })} />)}</View> : null}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {Object.entries(REQ_CAT).filter(([k]) => anySite || k !== 'aidat').map(([k, l]) => <Pill key={k} label={t(l)} on={req.cat === k} onPress={() => setReq({ ...req, cat: k })} />)}
            </View>
            {req.cat === 'aidat' ? <Muted>{t('Aidatı sen ödemiyorsan (ör. sözleşmeye göre malik ödüyorsa) buradan yönetime bildir; yönetim dairenin ödeyenini değiştirir.')}</Muted> : null}
            <Field label={t('Başlık')} value={req.title} onChangeText={(v) => setReq({ ...req, title: v })} maxLength={120} />
            <Field label={t('Açıklama')} value={req.body} onChangeText={(v) => setReq({ ...req, body: v })} multiline maxLength={4000} />
            <MediaPicker files={reqFiles} setFiles={setReqFiles} />
            <Button title={t('Talebi gönder')} style={{ alignSelf: 'flex-start' }} disabled={req.title.trim().length < 2} onPress={async () => {
              setErr(null); setMsg(null);
              try { await openSiteRequest(target.org_id, target.unit_id, { ...req, files: reqFiles }); setReq({ ...req, title: '', body: '' }); setReqFiles([]); setMsg(t('Talebin yönetime iletildi.')); load(); } catch (e) { setErr(humanError(e)); }
            }} />
            {msg ? <Text v="small" color={c.okInk}>{msg}</Text> : null}
          </Card>
          {(d?.requests || []).map((x: any) => (
            <Card key={x.id} gap={8}>
              <Row between wrap><Text v="small" style={{ fontFamily: fonts.bodyXBold }}>{x.title}</Text><Chip tone={x.status === 3 ? 'ok' : 'warn'} label={REQ()[x.status]} /></Row>
              {x.body ? <Muted>{x.body}</Muted> : null}
              <MediaList paths={x.media} />
              {x.reply ? <Muted>{t('Yönetimin yanıtı')}: {x.reply}</Muted> : null}
              {/* Talebin sahibi yönetimle yazışır; çözülmüş talebe yazınca talep yeniden açılır. */}
              <RequestThread req={x} canWrite mgmt={false} />
            </Card>
          ))}
        </Stack>
      ) : null}

      {show('docs') ? <ResidentDocs units={units} titled={part === 'all'} /> : null}
    </Page>
  );
}

/** Sakinin belgeleri: yönetimin siteye ve dairesine yüklediği belgeler; yönetime belge gönderme. */
function ResidentDocs({ units, titled }: { units: any[]; titled?: boolean }) {
  const c = useColors();
  const [docs, setDocs] = useState<any[] | null>(null);
  const [title, setTitle] = useState('');
  const [files, setFiles] = useState<Picked[]>([]);
  const [unit, setUnit] = useState(units[0]?.unit_id || '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const oids = [...new Set(units.map((u: any) => u.org_id))] as string[];
  const load = useCallback(async () => { setDocs(await loadSiteDocs(oids)); }, [oids.join()]);
  useEffect(() => { load(); }, [load]);
  const target = units.find((u: any) => u.unit_id === unit) || units[0];
  const unitBy = Object.fromEntries(units.map((u: any) => [u.unit_id, u]));
  const shared = (docs || []).filter((x) => x.audience !== 'yonetim');
  const sent = (docs || []).filter((x) => x.audience === 'yonetim');
  return (
    <Stack gap={8}>
      {titled ? <H2>{t('Belgeler')}</H2> : null}
      {!docs ? <Spin /> : shared.length ? shared.map((x) => (
        <Card key={x.id} gap={4}>
          <Row between wrap><Text v="body" style={{ fontFamily: fonts.bodyXBold, flexShrink: 1 }}>{x.title}</Text><Muted>{day(x.created_at)}</Muted></Row>
          <Muted>{x.audience === 'daire' && unitBy[x.unit_id] ? t('Dairene özel') + ' · ' + unitLabel(unitBy[x.unit_id]) : t('Site yönetiminden')}</Muted>
          <DownloadLink path={x.path} label={x.name || x.title} />
        </Card>
      )) : <Empty>{t('Yönetimin paylaştığı belge yok.')}</Empty>}
      <Card gap={10}>
        <H2>{t('Yönetime belge gönder')}</H2>
        <Muted>{t('Kira sözleşmesi, ikametgâh, sayaç fotoğrafı gibi yönetimin istediği belgeleri buradan gönder; yalnız yönetim görür.')}</Muted>
        {units.length > 1 ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{units.map((u: any) => <Pill key={u.unit_id} label={unitLabel(u)} on={target?.unit_id === u.unit_id} onPress={() => setUnit(u.unit_id)} />)}</View> : null}
        <Field label={t('Belgenin adı')} value={title} onChangeText={setTitle} maxLength={160} placeholder={t('ör. Kira sözleşmesi')} />
        <FileField label={t('Dosya (görsel ya da PDF)')} files={files} setFiles={setFiles} camera max={1} />
        <Button title={t('Gönder')} loading={busy} disabled={title.trim().length < 2 || !files.length} style={{ alignSelf: 'flex-start' }} onPress={async () => {
          setBusy(true); setErr(null); setMsg(null);
          try { await uploadSiteDoc(target.org_id, { title, file: files[0], audience: 'yonetim', unitId: target.unit_id }); setTitle(''); setFiles([]); setMsg(t('Belgen yönetime gönderildi.')); load(); }
          catch (e) { setErr(humanError(e)); }
          setBusy(false);
        }} />
        {err ? <Text v="small" color={c.badInk}>{err}</Text> : null}
        {msg ? <Text v="small" color={c.okInk}>{msg}</Text> : null}
      </Card>
      {sent.length ? <Stack gap={6}>
        <Label>{t('Gönderdiklerin')}</Label>
        {sent.map((x) => (
          <Card key={x.id} gap={4}>
            <Row between wrap><Text v="small" style={{ fontFamily: fonts.bodyXBold, flexShrink: 1 }}>{x.title}</Text><Muted>{day(x.created_at)}</Muted></Row>
            <Row wrap gap={12}><DownloadLink path={x.path} label={x.name || x.title} />
              <LinkBtn danger label={t('Sil')} onPress={async () => { try { await deleteSiteDoc(x.id); load(); } catch (e) { setErr(humanError(e)); } }} /></Row>
          </Card>
        ))}
      </Stack> : null}
    </Stack>
  );
}

/** Yönetim: sakinlerle paylaşılan belgeler (bütün site ya da tek daire) ve sakinlerden gelenler. */
export function SiteDocs({ d, oid, can, reload }: { d: any; oid: string; can: (p: string) => boolean; reload: () => void }) {
  const c = useColors();
  const commercial = isCommercial(d.sector);
  const [title, setTitle] = useState('');
  const [files, setFiles] = useState<Picked[]>([]);
  const [scope, setScope] = useState<'herkes' | 'daire'>('herkes');
  const [adding, setAdding] = useState(false);   // önce liste; form düğmeyle açılır
  const [q, setQ] = useState('');
  const [unitId, setUnitId] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const unitBy: Record<string, any> = Object.fromEntries(d.units.map((u: any) => [u.id, u]));
  const docs = d.documents || [];
  const incoming = docs.filter((x: any) => x.audience === 'yonetim');
  const shared = docs.filter((x: any) => x.audience !== 'yonetim');
  const hits = q.trim() ? d.units.filter((u: any) => unitLabel(u).toLocaleLowerCase('tr').includes(q.trim().toLocaleLowerCase('tr'))).slice(0, 6) : [];
  const manage = can('documents.manage');
  const row = (x: any, from?: boolean) => (
    <Card key={x.id} gap={4}>
      <Row between wrap><Text v="body" style={{ fontFamily: fonts.bodyXBold, flexShrink: 1 }}>{x.title}</Text><Muted>{day(x.created_at)}</Muted></Row>
      <Muted>{from ? (unitBy[x.unit_id] ? unitLabel(unitBy[x.unit_id]) : '') : x.audience === 'daire' ? (unitBy[x.unit_id] ? unitLabel(unitBy[x.unit_id]) : '') : commercial ? t('Bütün kiracılar') : t('Bütün site')}</Muted>
      <Row wrap gap={12}><DownloadLink path={x.path} label={x.name || x.title} />
        {manage ? <LinkBtn danger label={t('Sil')} onPress={async () => {
          if (await host.ask({ title: t('Belge silinsin mi?'), body: x.title, ok: t('Sil'), danger: true })) { try { await deleteSiteDoc(x.id); reload(); } catch (e) { setErr(humanError(e)); } }
        }} /> : null}</Row>
    </Card>
  );
  return (
    <Stack>
      {manage && !adding ? <Button title={t('Belge paylaş')} onPress={() => setAdding(true)} /> : null}
      {manage && adding ? (
        <Card gap={10}>
          <Row between><H2>{t('Belge paylaş')}</H2><Button kind="quiet" title={t('Kapat')} onPress={() => setAdding(false)} /></Row>
          <Seg value={scope} onChange={(v) => setScope(v as any)} options={[['herkes', commercial ? t('Bütün kiracılar') : t('Bütün site')], ['daire', commercial ? t('Bir birim') : t('Bir daire')]]} />
          {scope === 'daire' ? (
            <View style={{ gap: 6 }}>
              <Field label={commercial ? t('Birim') : t('Daire')} value={unitId && unitBy[unitId] ? unitLabel(unitBy[unitId]) : q} onChangeText={(v) => { setUnitId(''); setQ(v); }} placeholder={commercial ? 'Z-12' : 'A Blok No 1'} />
              {!unitId && hits.length ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{hits.map((u: any) => <Pill key={u.id} label={unitLabel(u)} on={false} onPress={() => { setUnitId(u.id); setQ(''); }} />)}</View> : null}
            </View>
          ) : null}
          <Field label={t('Belgenin adı')} value={title} onChangeText={setTitle} maxLength={160} placeholder={t('ör. 2027 işletme projesi')} />
          <FileField label={t('Dosya (görsel ya da PDF)')} files={files} setFiles={setFiles} max={1} />
          <Muted>{scope === 'herkes' ? (commercial ? t('Bütün kiracılar görür ve bildirim alır.') : t('Sitenin bütün sakinleri görür ve bildirim alır.')) : t('Yalnız seçtiğin dairenin sakinleri görür.')}</Muted>
          <Button title={t('Paylaş')} loading={busy} disabled={title.trim().length < 2 || !files.length || (scope === 'daire' && !unitId)} style={{ alignSelf: 'flex-start' }} onPress={async () => {
            setBusy(true); setErr(null);
            try { await uploadSiteDoc(oid, { title, file: files[0], audience: scope, unitId: (scope === 'daire' ? unitId : null) as any }); setTitle(''); setFiles([]); setUnitId(''); setAdding(false); reload(); }
            catch (e) { setErr(humanError(e)); }
            setBusy(false);
          }} />
          <Err e={err} />
        </Card>
      ) : null}
      {incoming.length ? <Stack gap={6}><H2>{commercial ? t('Kiracılardan gelenler') : t('Sakinlerden gelenler')}</H2>{incoming.map((x: any) => row(x, true))}</Stack> : null}
      <Stack gap={6}>
        <H2>{t('Paylaşılanlar')}</H2>
        {shared.length ? shared.map((x: any) => row(x)) : <Empty>{t('Henüz paylaşılan belge yok.')}</Empty>}
      </Stack>
    </Stack>
  );
}
