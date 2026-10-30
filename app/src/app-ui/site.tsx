/* Site yönetimi ekranları (kurumsal yol planı Faz 2).
   SiteAdminScreen: site yönetiminin ekranı (özet, daireler, tahakkuk, giderler, duyurular, talepler); sekmeler rol yetkisine göre.
   ResidentSiteScreen ("Sitem"): malik ya da kiracının dairesi, tahakkukları, dekont yükleme, duyurular ve yönetime talep. */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { TextInput, View } from 'react-native';
import { t } from '../domain/i18n';
import { humanError, inviteLink, fileUrl } from '../domain/backend';
import { myOrgs, orgCan, hasModule, sectorSections } from '../domain/org';
import {
  KINDS, MODES, kindLabel, unitLabel, distribute, unpaidOf, lateFee, loadSiteAdmin, saveUnit, deleteUnit, parseUnits, importUnits,
  saveResident, deleteResident, createCharges, deleteCharge, decideCharge, markPaid, addExpense, deleteExpense, announce, deleteAnnouncement,
  answerRequest, mySiteUnits, loadMySite, payCharge, openSiteRequest, loadUnitCharges, budgetTotal, budgetAidat, saveBudget,
  applyBudgetAidat, loadBudgets, siteReport, isCommercial, overdue, occupancy, ciroDiff, reportTurnover, loadTurnovers, decideTurnover,
  dueIncreases, applyIncrease, rentCharge, nextAuto, saveAuto, cardReady, cardTotal
} from '../domain/site';
import { loadRates } from '../domain/cpi';
import { terms, sectorOf } from '../domain/org';
import { tl, monthYear, fmtFull, parse, mkey, iso } from '../domain/util';
import { Button, Chip, Field, Text } from '../ui/kit';
import { Loader } from '../ui/Loader';
import { fonts, radius, useColors } from '../ui/theme';
import { Card, Empty, H2, Label, MonthStepper, Muted, Note, Row, Seg, Stack, StatusChip, Stepper } from './blocks';
import { useBreakpoint } from '../ui/theme';
import { ui } from '../domain/state';
import { Overview } from './site-overview';
import { Units } from './site-units';
import { FileField, MoneyField } from './forms';
import { useStore } from './hooks';
import { Picked } from './media';
import { Pill } from './org';
import { Page } from './screens';

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
export const PORTFOLIO_SECTORS = ['site', 'avm', 'depo', 'gyo'];
/** Kurum paneli bölümlerinin adresleri (/uygulama/site/<bölüm>); menü org.js → sectorSections. */
export const SECTION_KEYS = ['ozet', 'birimler', 'tahakkuk', 'ciro', 'artis', 'giderler', 'butce', 'duyurular', 'talepler', 'rapor'];
export const sectionPath = (k: string) => (k === 'ozet' ? '/uygulama/site' : '/uygulama/site/' + k);
/** Kişinin yönettiği sektör kurumu (birden çoksa seçili olan). */
export function currentPortfolioOrg() {
  const sites = myOrgs().filter((o: any) => PORTFOLIO_SECTORS.includes(o.sector));
  return sites.find((o: any) => o.id === ui.siteOrg) || sites[0] || null;
}
const REQ = () => [t('Açıldı'), t('Görüldü'), t('İşlemde'), t('Çözüldü')];
const REQ_CAT: Record<string, string> = { ariza: 'Arıza', aidat: 'Aidat', genel: 'Genel' };
const Spin = () => <View style={{ alignItems: 'center', paddingVertical: 20 }}><Loader size={64} /></View>;

function Err({ e }: { e: string | null }) {
  const c = useColors();
  return e ? <Text v="small" color={c.badInk}>{e}</Text> : null;
}

function ChargeRow({ x, unit, can, reload }: { x: any; unit: any; can: (p: string) => boolean; reload: () => void }) {
  const c = useColors();
  const [why, setWhy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const act = async (fn: () => Promise<any>) => { setErr(null); try { await fn(); reload(); } catch (e) { setErr(humanError(e)); } };
  const open = async () => { const u = await fileUrl('sb:' + x.receipt_path); if (u && typeof window !== 'undefined') window.open(u, '_blank'); };
  return (
    <Card gap={8}>
      <Row between wrap>
        <View style={{ flex: 1, minWidth: 160 }}>
          <Text v="small" style={{ fontFamily: fonts.bodyXBold }}>{unit ? unitLabel(unit) : '—'} · {kindLabel(x.kind, x.title)}</Text>
          <Muted>{monthYear(x.month)} · {tl(x.amount)}{x.orig_amount != null && x.currency !== 'TRY' ? ' (' + money(x.orig_amount, x.currency) + ' × ' + String(x.fx).replace('.', ',') + ')' : ''}{x.status === 'review' || x.status === 'partial' ? ' · ' + t('Ödenen') + ' ' + tl(x.paid_amount) : ''}{x.paid_on ? ' · ' + day(x.paid_on) : x.due_on ? ' · ' + t('Vade') + ' ' + day(x.due_on) : ''}</Muted>
          {x.reject_reason ? <Text v="small" color={c.badInk}>{x.reject_reason}</Text> : null}
        </View>
        <StatusChip st={stOf(x)} />
      </Row>
      <Row wrap>
        {x.receipt_path ? <Button kind="ghost" title={t('Dekontu aç')} onPress={open} /> : null}
        {can('payments.approve') && x.status === 'review' ? <>
          <Button title={t('Onayla')} onPress={() => act(() => decideCharge(x, true))} />
          <Button kind="ghost" title={t('Reddet')} onPress={() => setWhy(why == null ? '' : null)} />
        </> : null}
        {can('payments.approve') && ['open', 'partial', 'rejected'].includes(x.status) ? <Button kind="ghost" title={t('Ödendi işaretle')} onPress={() => act(() => markPaid(x, x.amount))} /> : null}
        {can('charges.manage') && x.status === 'open' ? <Button kind="quiet" title={t('Sil')} onPress={() => act(() => deleteCharge(x.id))} /> : null}
      </Row>
      {why != null ? (
        <Row gap={10} wrap align="flex-end">
          <View style={{ flexGrow: 1, flexBasis: 220 }}><Field label={t('Red gerekçesi')} value={why} onChangeText={setWhy} maxLength={200} /></View>
          <Button kind="ghost" title={t('Reddet')} disabled={!why.trim()} onPress={() => act(() => decideCharge(x, false, why))} style={{ minHeight: 52 }} />
        </Row>
      ) : null}
      <Err e={err} />
    </Card>
  );
}

/** Otomatik aidat: ayın seçilen gününde dairelerin aylık aidatı kendiliğinden tahakkuk edilir (schema.sql 29. bölüm). */
function AutoAidat({ d, oid, can, reload }: { d: any; oid: string; can: (p: string) => boolean; reload: () => void }) {
  const c = useColors();
  const a = d.auto;
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ run_day: String(a?.run_day || 1), due_day: String(a?.due_day || 10) });
  const [err, setErr] = useState<string | null>(null);
  const next = nextAuto(a);
  const units = d.units.filter((u: any) => Number(u.aidat) > 0);
  const total = units.reduce((s: number, u: any) => s + Number(u.aidat), 0);
  const manage = can('charges.manage');
  const save = async (enabled: boolean) => {
    const run = Number(f.run_day), due = Number(f.due_day);
    if (!(run >= 1 && run <= 28) || !(due >= 1 && due <= 28)) { setErr(t('Günler 1 ile 28 arasında olmalı.')); return; }
    setErr(null);
    try { await saveAuto(oid, { enabled, run_day: run, due_day: due }, a); setOpen(false); reload(); } catch (e) { setErr(humanError(e)); }
  };
  const dayField = (v: string) => <View style={{ flexGrow: 1, flexBasis: 140 }}><MoneyField label={v === 'run_day' ? t('Tahakkuk günü (1–28)') : t('Son ödeme günü (1–28)')} value={(f as any)[v]} decimals={0}
    onChange={(x) => setF({ ...f, [v]: x.slice(0, 2) })} /></View>;
  return (
    <Card gap={10}>
      <Row between wrap>
        <View style={{ flex: 1, minWidth: 200, gap: 2 }}>
          <Row gap={8}><H2>{t('Otomatik aidat')}</H2><Chip tone={a?.enabled ? 'ok' : 'neutral'} label={a?.enabled ? t('Açık') : t('Kapalı')} /></Row>
          <Muted>{a?.enabled
            ? t('Her ayın {run}. günü tahakkuk edilir, son ödeme ayın {due}. günü.', { run: a.run_day, due: a.due_day })
            : t('Ayın seçtiğin gününde dairelerin aylık aidatı kendiliğinden tahakkuk edilir; her ay elle girmezsin.')}</Muted>
        </View>
        {manage && !open ? <Button kind={a?.enabled ? 'ghost' : 'primary'} title={a?.enabled ? t('Ayarla') : t('Otomatik aidatı aç')} onPress={() => setOpen(true)} /> : null}
      </Row>
      {a?.enabled && next ? (
        <View style={{ backgroundColor: c.surface2, borderRadius: radius.md, padding: 12, gap: 2 }}>
          <Text v="small" style={{ fontFamily: fonts.bodyBold }}>{t('Sonraki tahakkuk: {date}', { date: day(next.date) })}</Text>
          <Muted>{units.length ? t('{n} daire · toplam {sum} · son ödeme {due}', { n: units.length, sum: tl(total), due: day(next.due) }) : t('Dairelerde aylık aidat tanımlı değil; tutarları Daireler ekranından gir.')}</Muted>
          <Muted>{t('Hatırlatmalar: son ödemeden 3 gün önce, son gün, 5 ve 15 gün sonra.')}</Muted>
        </View>
      ) : null}
      {open ? (
        <Stack gap={10}>
          <Row gap={10} wrap align="flex-start">{dayField('run_day')}{dayField('due_day')}</Row>
          <Muted>{t('Tutar her dairenin kendi aylık aidatıdır. Yakıt, demirbaş gibi ek toplamaları aşağıdan girersin.')}</Muted>
          <Err e={err} />
          <Row wrap>
            <Button title={a?.enabled ? t('Kaydet') : t('Aç ve kaydet')} onPress={() => save(true)} />
            {a?.enabled ? <Button kind="ghost" title={t('Otomatik aidatı kapat')} onPress={() => save(false)} /> : null}
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
  const [kind, setKind] = useState(seed?.kind || (commercial ? 'kira' : (d.modules || []).includes('aidat') ? 'aidat' : 'ozel'));
  const [title, setTitle] = useState(seed?.title || '');
  const [mode, setMode] = useState(seed?.mode || (commercial ? 'rent' : 'unit'));
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
  const valid = /^\d{4}-(0[1-9]|1[0-2])$/.test(month) && (kind !== 'ozel' || title.trim()) && plan.length > 0 && !fxMissing;
  const submit = async () => {
    setErr(null); setMsg(null);
    try {
      const n = await createCharges(oid, { month, kind, title: title.trim(), mode, value: Number(String(value).replace(',', '.')) || 0, units: d.units, existing: d.charges, fx: fxNum });
      setMsg(n ? (commercial ? t('{n} birime tahakkuk edildi.', { n }) : t('{n} daireye tahakkuk edildi.', { n }))
        : commercial ? t('Bu ay ve tür için tüm birimlere zaten tahakkuk edilmiş.') : t('Bu ay ve tür için tüm dairelere zaten tahakkuk edilmiş.'));
      setView(month); reload();
    } catch (e) { setErr(humanError(e)); }
  };
  // Seçili ayın tahsilatı ödeme yoluna göre: kartla (sanal POS) ve dekont / havale / elden.
  const got = (x: any) => (x.status === 'paid' ? Number(x.amount) : x.status === 'partial' ? Number(x.paid_amount) || 0 : 0);
  const byCard = list.filter((x: any) => x.method === 'pos').reduce((a: number, x: any) => a + got(x), 0);
  const byOther = list.filter((x: any) => x.method !== 'pos').reduce((a: number, x: any) => a + got(x), 0);
  const owed = list.reduce((a: number, x: any) => a + Number(x.amount), 0);
  return (
    <Stack>
      {!commercial && (d.modules || []).includes('aidat') ? <AutoAidat d={d} oid={oid} can={can} reload={reload} /> : null}
      {can('charges.manage') ? (
        <Card gap={10}>
          <H2>{!commercial && d.auto?.enabled ? t('Ek tahakkuk') : t('Toplu tahakkuk')}</H2>
          {!commercial && d.auto?.enabled ? <Muted>{t('Yakıt, demirbaş, özel toplama ya da otomatik aidatın dışında kalan bir ay için.')}</Muted> : null}
          <Row gap={10} wrap align="flex-end">
            <View style={{ flexGrow: 1, flexBasis: 140 }}><Field label={t('Ay (YYYY-AA)')} value={month} onChangeText={setMonth} maxLength={7} /></View>
            {kind === 'ozel' ? <View style={{ flexGrow: 2, flexBasis: 200 }}><Field label={t('Başlık')} value={title} onChangeText={setTitle} maxLength={120} placeholder={t('ör. Çatı onarımı')} /></View> : null}
          </Row>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{KINDS(d.sector).filter((k) => (k.key !== 'aidat' || (d.modules || []).includes('aidat')) && (k.key !== 'ortak_gider' || (d.modules || []).includes('ortak_gider'))).map((k) => <Pill key={k.key} label={k.label} on={kind === k.key} onPress={() => { setKind(k.key); if (commercial) setMode(k.key === 'kira' ? 'rent' : k.key === 'ortak_gider' ? 'unit' : 'area'); }} />)}</View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{MODES(d.sector).map((k) => <Pill key={k.key} label={k.label} on={mode === k.key} onPress={() => setMode(k.key)} />)}</View>
          {mode !== 'unit' && mode !== 'rent' ? <MoneyField label={mode === 'fixed' ? (commercial ? t('Birim başına tutar (₺)') : t('Daire başına tutar (₺)')) : t('Dağıtılacak toplam (₺)')} value={value} onChange={(v) => setValue(v)} /> : null}
          {curs.length ? (
            <Row gap={10} wrap align="flex-end">
              {curs.map((k) => <View key={k} style={{ flexGrow: 1, flexBasis: 140 }}><MoneyField label={t('{cur} kuru (₺)', { cur: k })} value={(fx as any)[k]} decimals={4} onChange={(v) => setFx({ ...fx, [k]: v })} placeholder={k === 'USD' ? '34,50' : '37,20'} /></View>)}
            </Row>
          ) : null}
          {mode === 'rent' ? <Muted>{t('Döviz kirası girilen kurla TL’ye çevrilir; KDV’li sözleşmede %20 eklenir, stopajlı sözleşmede kiracının keseceği %20 düşülür. Vade, sözleşmedeki ödeme günüdür.')}</Muted> : null}
          <Muted>{fxMissing ? t('Döviz kirası olan birimler için kuru yaz.') : plan.length ? t('{n} {word} toplam {sum}', { n: plan.length, word, sum: tl(sum) })
            : mode === 'unit' ? (commercial ? t('Birimlerde ortak gider avansı tanımlı değil.') : t('Dairelerde aylık aidat tanımlı değil.'))
            : mode === 'rent' ? t('Birimlerde kira tanımlı değil.') : t('Tutar yaz.')}</Muted>
          <Button title={t('Tahakkuk et')} disabled={!valid} onPress={submit} style={{ alignSelf: 'flex-start' }} />
          <Err e={err} />
          {msg ? <Text v="small" color={c.okInk}>{msg}</Text> : null}
        </Card>
      ) : null}
      <Row between wrap>
        <MonthStepper value={view} onChange={setView} min={months[Math.min(12, months.length) - 1]} max={months[0]} />
        {list.length ? <Muted>{t('Tahsil edilen {got} / {owed} · kartla {card} · dekont ve havale {other}', { got: tl(byCard + byOther), owed: tl(owed), card: tl(byCard), other: tl(byOther) })}</Muted> : null}
      </Row>
      {list.length ? list.map((x: any) => <ChargeRow key={x.id} x={x} unit={unitBy[x.unit_id]} can={can} reload={reload} />) : <Empty>{t('Bu ay için tahakkuk yok.')}</Empty>}
    </Stack>
  );
}

function Expenses({ d, oid, can, reload, onDistribute }: { d: any; oid: string; can: (p: string) => boolean; reload: () => void; onDistribute?: (e: any) => void }) {
  const [e, setE] = useState<any>({ cat: '', amount: '', spent_on: today(), note: '' });
  const [err, setErr] = useState<string | null>(null);
  const act = async (fn: () => Promise<any>) => { setErr(null); try { await fn(); reload(); } catch (x) { setErr(humanError(x)); } };
  const m = thisMonth();
  const monthTotal = d.expenses.filter((x: any) => String(x.spent_on).startsWith(m)).reduce((a: number, x: any) => a + Number(x.amount), 0);
  return (
    <Stack>
      {can('expenses.manage') ? (
        <Card gap={10}>
          <H2>{t('Gider ekle')}</H2>
          <Row gap={10} wrap align="flex-end">
            <View style={{ flexGrow: 2, flexBasis: 200 }}><Field label={t('Kalem')} value={e.cat} onChangeText={(v) => setE({ ...e, cat: v })} maxLength={60} placeholder={t('ör. Asansör bakımı')} /></View>
            <View style={{ flexGrow: 1, flexBasis: 120 }}><MoneyField label={t('Tutar (₺)')} value={e.amount} onChange={(v) => setE({ ...e, amount: v })} /></View>
            <View style={{ flexGrow: 1, flexBasis: 140 }}><Field label={t('Tarih (YYYY-AA-GG)')} value={e.spent_on} onChangeText={(v) => setE({ ...e, spent_on: v })} maxLength={10} /></View>
          </Row>
          <Field label={t('Not (isteğe bağlı)')} value={e.note} onChangeText={(v) => setE({ ...e, note: v })} maxLength={500} />
          <Button title={t('Gideri ekle')} style={{ alignSelf: 'flex-start' }} disabled={!e.cat.trim() || !e.amount}
            onPress={() => act(async () => { await addExpense(oid, { ...e, amount: e.amount.replace(',', '.') }); setE({ cat: '', amount: '', spent_on: today(), note: '' }); })} />
          <Err e={err} />
        </Card>
      ) : null}
      <Muted>{t('{month} giderleri: {sum}', { month: monthYear(m), sum: tl(monthTotal) })}</Muted>
      {d.expenses.length ? d.expenses.map((x: any) => (
        <Card key={x.id} gap={6}>
          <Row between wrap>
            <View style={{ flex: 1, minWidth: 160 }}><Text v="small" style={{ fontFamily: fonts.bodyXBold }}>{x.cat}</Text><Muted>{day(x.spent_on)}{x.note ? ' · ' + x.note : ''}</Muted></View>
            <Text v="small" style={{ fontFamily: fonts.bodyXBold }}>{tl(x.amount)}</Text>
          </Row>
          {can('expenses.manage') ? (
            <Row wrap>
              {can('charges.manage') && onDistribute ? <Button kind="ghost" title={isCommercial(d.sector) ? t('Birimlere dağıt') : t('Dairelere dağıt')} onPress={() => onDistribute(x)} /> : null}
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

function RequestCard({ x, unit, can, reload }: { x: any; unit: any; can: (p: string) => boolean; reload: () => void }) {
  const [st, setSt] = useState<number>(x.status);
  const [reply, setReply] = useState<string>(x.reply || '');
  const [err, setErr] = useState<string | null>(null);
  const dirty = st !== x.status || reply !== (x.reply || '');
  return (
    <Card gap={8}>
      <Row between wrap>
        <View style={{ flex: 1, minWidth: 160 }}>
          <Label accent>{t(REQ_CAT[x.cat] || x.cat)}{unit ? ' · ' + unitLabel(unit) : ''}</Label>
          <Text v="body" style={{ fontFamily: fonts.bodyXBold }}>{x.title}</Text>
        </View>
        <Muted>{day(x.created_at)}</Muted>
      </Row>
      {x.body ? <Text v="small">{x.body}</Text> : null}
      {can('requests.manage') ? (
        <>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{REQ().map((l, i) => <Pill key={l} label={l} on={st === i} onPress={() => setSt(i)} />)}</View>
          <Field label={t('Yanıt')} value={reply} onChangeText={setReply} multiline maxLength={4000} />
          <Button title={t('Kaydet')} disabled={!dirty} style={{ alignSelf: 'flex-start' }} onPress={async () => { setErr(null); try { await answerRequest(x.id, st, reply); reload(); } catch (e) { setErr(humanError(e)); } }} />
          <Err e={err} />
        </>
      ) : <Chip label={REQ()[x.status]} />}
    </Card>
  );
}

const METHOD_LABEL = () => [['share', t('Arsa payına göre')], ['area', t('m²’ye göre')], ['equal', t('Eşit')]] as [string, string][];

/** İşletme projesi: yıllık gider kalemleri, dağıtım anahtarı, dairelerin aylık aidatı ve "aidatları güncelle". */
function Budget({ d, oid, can, reload }: { d: any; oid: string; can: (p: string) => boolean; reload: () => void }) {
  const c = useColors();
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);
  const saved = (d.budgets || []).find((b: any) => Number(b.year) === year);
  const blank = { year, method: 'share', note: '', approved_on: '', items: [{ cat: '', amount: '' }] };
  const [b, setB] = useState<any>(saved ? { ...saved, approved_on: saved.approved_on || '' } : blank);
  useEffect(() => { setB(saved ? { ...saved, approved_on: saved.approved_on || '' } : { ...blank, year }); }, [year, saved?.updated_at]);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const edit = can('charges.manage');
  const plan = budgetAidat(d.units, { ...b, items: b.items.map((i: any) => ({ ...i, amount: Number(String(i.amount).replace(',', '.')) || 0 })) });
  const unitBy: Record<string, any> = Object.fromEntries(d.units.map((u: any) => [u.id, u]));
  const total = budgetTotal({ items: b.items.map((i: any) => ({ amount: Number(String(i.amount).replace(',', '.')) || 0 })) });
  const setItem = (i: number, patch: any) => setB({ ...b, items: b.items.map((x: any, j: number) => (j === i ? { ...x, ...patch } : x)) });
  const act = async (fn: () => Promise<any>, ok: string) => { setErr(null); setMsg(null); try { await fn(); setMsg(ok); reload(); } catch (e) { setErr(humanError(e)); } };
  // Gerçekleşen: bu yılın giderleri, bütçe kalemleriyle (adı aynı olan) karşılaştırılır.
  const spent = (cat: string) => d.expenses.filter((e: any) => String(e.spent_on).startsWith(String(year)) && String(e.cat).toLocaleLowerCase('tr') === String(cat).toLocaleLowerCase('tr'))
    .reduce((a: number, e: any) => a + Number(e.amount), 0);
  return (
    <Stack>
      <Seg value={String(year)} onChange={(v) => setYear(Number(v))} options={[thisYear - 1, thisYear, thisYear + 1].map((y) => [String(y), String(y)] as [string, string])} />
      <Muted>{t('İşletme projesi yıllık gider tahminidir; kat malikleri kurulunca onaylanır ve (yönetim planında aksi yoksa) arsa payına göre paylaştırılır.')}</Muted>
      <Card gap={10}>
        <H2>{t('{year} işletme projesi', { year })}</H2>
        {b.items.map((it: any, i: number) => (
          <Row key={i} gap={10} wrap align="flex-end">
            <View style={{ flexGrow: 2, flexBasis: 200 }}><Field label={t('Gider kalemi')} value={it.cat} editable={edit} onChangeText={(v) => setItem(i, { cat: v })} maxLength={60} placeholder={t('ör. Asansör bakımı')} /></View>
            <View style={{ flexGrow: 1, flexBasis: 130 }}><MoneyField label={t('Yıllık tutar (₺)')} value={String(it.amount ?? '')} editable={edit} onChange={(v) => setItem(i, { amount: v })} /></View>
            <View style={{ minWidth: 110, paddingBottom: 14 }}><Muted>{t('Harcanan')} {tl(spent(it.cat))}</Muted></View>
          </Row>
        ))}
        {edit ? <Button kind="ghost" title={t('Kalem ekle')} onPress={() => setB({ ...b, items: [...b.items, { cat: '', amount: '' }] })} style={{ alignSelf: 'flex-start' }} /> : null}
        <Row between wrap><Text v="small" style={{ fontFamily: fonts.bodyXBold }}>{t('Yıllık toplam')}</Text><Text v="h3">{tl(total)}</Text></Row>
        <Text v="small" style={{ fontFamily: fonts.bodyBold }}>{t('Paylaştırma')}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{METHOD_LABEL().map(([k, l]) => <Pill key={k} label={l} on={b.method === k} onPress={edit ? () => setB({ ...b, method: k }) : undefined} disabled={!edit} />)}</View>
        <Field label={t('Kurul onay tarihi (YYYY-AA-GG, isteğe bağlı)')} value={b.approved_on || ''} editable={edit} onChangeText={(v) => setB({ ...b, approved_on: v })} maxLength={10} />
        {edit ? (
          <Row wrap>
            <Button title={t('Kaydet')} onPress={() => act(() => saveBudget(oid, { ...b, year }), t('İşletme projesi kaydedildi.'))} disabled={!total} />
            {can('units.manage') && saved ? <Button kind="ghost" title={t('Daire aidatlarını güncelle')}
              onPress={() => act(async () => { await applyBudgetAidat(oid, d.units, saved); }, t('Dairelerin aylık aidatı işletme projesine göre güncellendi.'))} /> : null}
          </Row>
        ) : null}
        <Err e={err} />
        {msg ? <Text v="small" color={c.okInk}>{msg}</Text> : null}
      </Card>
      {plan.length ? (
        <Stack gap={8}>
          <H2>{t('Dairelerin aylık payı')}</H2>
          <Card gap={0}>
            {plan.map((x, i) => (
              <Row key={x.unit_id} between style={{ paddingVertical: 10, borderTopWidth: i ? 1 : 0, borderColor: c.line }}>
                <Text v="small" style={{ fontFamily: fonts.bodyBold }}>{unitLabel(unitBy[x.unit_id])}</Text>
                <Muted>{unitBy[x.unit_id].aidat != null && Number(unitBy[x.unit_id].aidat) !== x.monthly ? t('şu an') + ' ' + tl(unitBy[x.unit_id].aidat) + ' → ' : ''}</Muted>
                <Text v="small" style={{ fontFamily: fonts.bodyXBold }}>{tl(x.monthly)} {t('/ ay')}</Text>
              </Row>
            ))}
          </Card>
        </Stack>
      ) : null}
    </Stack>
  );
}

/** Yönetim kurulu raporu: dönem seçilir, ekranda gösterilir, "Yazdır / PDF" ile çıktı alınır. */
function Report({ d, org }: { d: any; org: string }) {
  const c = useColors();
  const [period, setPeriod] = useState<'month' | 'year'>('month');
  const [ref, setRef] = useState(thisMonth() + '-01');
  const months = Array.from({ length: 12 }, (_, i) => { const x = new Date(); x.setDate(1); x.setMonth(x.getMonth() - i); return mkey(x) + '-01'; });
  const years = [0, 1, 2].map((i) => (new Date().getFullYear() - i) + '-01-01');
  const r = siteReport(d, period, ref);
  const charged = r.charges.reduce((a: number, x: any) => a + x.charged, 0);
  const got = r.charges.reduce((a: number, x: any) => a + x.collected, 0);
  const spent = r.expenses.reduce((a: number, x: any) => a + x.total, 0);
  const share = period === 'year' ? 1 : 1 / 12;
  const line = (a: string, b: string, i: number, bad?: boolean) => (
    <Row key={a + i} between style={{ paddingVertical: 9, borderTopWidth: i ? 1 : 0, borderColor: c.line }}>
      <Text v="small" style={{ fontFamily: fonts.bodyBold, flex: 1 }}>{a}</Text><Text v="small" style={{ fontFamily: fonts.bodyXBold }} color={bad ? c.badInk : c.ink}>{b}</Text>
    </Row>
  );
  const title = period === 'year' ? t('{year} yıllık yönetim raporu', { year: ref.slice(0, 4) }) : t('{month} yönetim raporu', { month: monthYear(ref.slice(0, 7)) });
  return (
    <Stack>
      <Seg value={period} onChange={(v: any) => { setPeriod(v); setRef(v === 'year' ? years[0] : months[0]); }} options={[['month', t('Aylık')], ['year', t('Yıllık')]]} />
      {period === 'year'
        ? <Stepper name={t('yıl')} label={ref.slice(0, 4)} prev={ref > years[years.length - 1]} next={ref < years[0]}
            onPrev={() => setRef((Number(ref.slice(0, 4)) - 1) + '-01-01')} onNext={() => setRef((Number(ref.slice(0, 4)) + 1) + '-01-01')} />
        : <MonthStepper value={ref.slice(0, 7)} onChange={(m) => setRef(m + '-01')} min={months[months.length - 1].slice(0, 7)} max={months[0].slice(0, 7)} />}
      <Card gap={12}>
        <View style={{ gap: 2 }}><Label>{org} · {t('{n} daire', { n: r.units })}</Label><Text v="h3">{title}</Text></View>
        <Row wrap>
          <View style={{ flex: 1, minWidth: 130 }}><Muted>{t('Tahakkuk')}</Muted><Text v="h3">{tl(charged)}</Text></View>
          <View style={{ flex: 1, minWidth: 130 }}><Muted>{t('Tahsil edilen')}</Muted><Text v="h3">{tl(got)}</Text><Muted>{charged ? Math.round((got / charged) * 100) + '%' : '—'}</Muted></View>
          <View style={{ flex: 1, minWidth: 130 }}><Muted>{t('Giderler')}</Muted><Text v="h3">{tl(spent)}</Text></View>
        </Row>
        {r.charges.length ? <View><Label>{t('Tahakkuk ve tahsilat')}</Label>{r.charges.map((x: any, i: number) => line(kindLabel(x.kind), tl(x.collected) + ' / ' + tl(x.charged), i))}</View> : null}
        {r.expenses.length ? <View><Label>{t('Giderler')}</Label>{r.expenses.map((x: any, i: number) => line(x.cat, tl(x.total), i))}</View> : null}
        {r.budget ? (
          <View><Label>{t('İşletme projesi {year} · harcanan / öngörülen', { year: r.budget.year })}</Label>
            {r.budget.items.map((it: any, i: number) => {
              const used = r.expenses.filter((e: any) => e.cat.toLocaleLowerCase('tr') === String(it.cat).toLocaleLowerCase('tr')).reduce((a: number, e: any) => a + e.total, 0);
              return line(it.cat, tl(used) + ' / ' + tl(Number(it.amount) * share), i, used > Number(it.amount) * share);
            })}
          </View>
        ) : null}
        <View><Label>{t('Borçlu daireler')}</Label>{r.debtors.length ? r.debtors.map((x: any, i: number) => line(x.unit, tl(x.unpaid), i, true)) : <Muted>{t('Gecikmiş borç yok.')}</Muted>}</View>
        <Muted>{t('Talepler')}: {t('{n} açıldı', { n: r.requests.opened })} · {t('{n} açık bekliyor', { n: r.requests.open })}</Muted>
      </Card>
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

export function SiteAdminScreen({ section = 'ozet' }: { section?: string }) {
  useStore();
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
      {!desktop ? <Seg scroll value={cur.key} onChange={go} options={sections.map((x) => [x.key, x.label] as [string, string])} /> : null}
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
                : { month: String(x.spent_on).slice(0, 7), kind: 'ozel', title: x.cat, mode: 'share', value: x.amount };
              go('tahakkuk');
            } : undefined} />}
          {cur.key === 'butce' && <Budget d={d} oid={org.id} can={can} reload={load} />}
          {cur.key === 'rapor' && <Report d={d} org={org.name} />}
          {cur.key === 'duyurular' && <Notes d={d} oid={org.id} can={can} reload={load} />}
          {cur.key === 'talepler' && (d.requests.length ? d.requests.map((x: any) => <RequestCard key={x.id} x={x} unit={unitBy[x.unit_id]} can={can} reload={load} />) : <Empty>{t('Talep yok.')}</Empty>)}
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
  const payer = u.payer === u.role;
  const due = (list || []).reduce((a, x) => a + unpaidOf(x), 0);
  return (
    <Stack gap={6}>
      <Row between align="flex-start">
        <View style={{ flex: 1, gap: 2 }}>
          <Label>{t('Site aidatı')} · {u.org}</Label>
          <Text v="h3">{unitLabel(u)}</Text>
          <Muted>{u.payer === 'malik' ? t('Aidatı malik öder') : t('Aidatı kiracı öder')}{payer ? '' : ' · ' + t('takip için görünür')}</Muted>
        </View>
        <View style={{ alignItems: 'flex-end' }}><Muted>{t('Ödenmemiş')}</Muted><Text v="h3" color={due ? c.badInk : c.okInk}>{tl(due)}</Text></View>
      </Row>
      {!list ? <Spin /> : list.length ? <View>{list.slice(0, 6).map((x) => <MyCharge key={x.id} x={x} payer={payer} reload={load} site={!isCommercial(u.sector)} />)}</View> : <Muted>{t('Tahakkuk yok.')}</Muted>}
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
function ResidentBudget({ units }: { units: any[] }) {
  const [list, setList] = useState<any[]>([]);
  const year = new Date().getFullYear();
  const key = units.map((u) => u.org_id).join();
  useEffect(() => { loadBudgets([...new Set(units.map((u) => u.org_id))]).then(setList).catch(() => {}); }, [key]);
  const mine = list.filter((b) => Number(b.year) === year);
  if (!mine.length) return null;
  return (
    <Stack gap={8}>
      <H2>{t('İşletme projesi')}</H2>
      {mine.map((b) => (
        <Card key={b.org_id} gap={6}>
          <Row between wrap><Label>{units.find((u) => u.org_id === b.org_id)?.org} · {b.year}</Label>{b.approved_on ? <Chip tone="ok" label={t('Kurulca onaylı')} /> : null}</Row>
          {b.items.map((it: any) => <Row key={it.cat} between><Text v="small">{it.cat}</Text><Text v="small" style={{ fontFamily: fonts.bodyBold }}>{tl(it.amount)}</Text></Row>)}
          <Row between><Text v="small" style={{ fontFamily: fonts.bodyXBold }}>{t('Yıllık toplam')}</Text><Text v="small" style={{ fontFamily: fonts.bodyXBold }}>{tl(budgetTotal(b))}</Text></Row>
        </Card>
      ))}
    </Stack>
  );
}

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
      <Muted>{t('Aylık cironu bildir. Cironun %{n}’i sabit kirayı aşarsa aradaki fark yönetim onayıyla tahakkuk edilir.', { n: u.turnover_rate })}</Muted>
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

export function ResidentSiteScreen() {
  useStore();
  const units = mySiteUnits();
  const title = residentTitle(units);
  const anySite = units.some((u: any) => !isCommercial(u.sector));
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [req, setReq] = useState<any>({ cat: 'ariza', title: '', body: '', unit: '' });
  const [msg, setMsg] = useState<string | null>(null);
  const c = useColors();
  const load = useCallback(async () => { try { setD(await loadMySite()); setErr(null); } catch (e) { setErr(humanError(e)); } }, [units.length]);
  useEffect(() => { load(); }, [load]);
  if (!units.length) return <Page title={title}><Note>{t('Bir siteye bağlı değilsin. Site yönetiminden aldığın davet kodunu girerek bağlanabilirsin.')}</Note></Page>;
  const target = units.find((u: any) => u.unit_id === req.unit) || units[0];
  return (
    <Page title={title} sub={[...new Set(units.map((u: any) => u.org))].join(', ')}>
      {err ? <Note warn>{err}</Note> : null}
      {units.map((u: any) => {
        const payer = u.payer === u.role;
        const mine = (d?.charges || []).filter((x: any) => x.unit_id === u.unit_id);
        const due = mine.reduce((a: number, x: any) => a + unpaidOf(x), 0);
        return (
          <Card key={u.unit_id} gap={10}>
            <Row between align="flex-start">
              <View style={{ flex: 1, gap: 2 }}>
                <Label>{u.org}</Label>
                <Text v="h3">{unitLabel(u)}</Text>
                <Muted>{isCommercial(u.sector)
                  ? [t('Kiracı'), u.rent != null ? t('Kira') + ' ' + money(u.rent, u.currency) + ' ' + t('/ ay') : '', u.lease_end ? t('Sözleşme bitişi') + ' ' + day(u.lease_end) : ''].filter(Boolean).join(' · ')
                  : (u.role === 'malik' ? t('Malik') : t('Kiracı')) + ' · ' + (u.payer === 'malik' ? t('Aidatı malik öder') : t('Aidatı kiracı öder'))}</Muted>
              </View>
              <View style={{ alignItems: 'flex-end' }}><Muted>{t('Ödenmemiş')}</Muted><Text v="h3" color={due ? c.badInk : c.okInk}>{tl(due)}</Text></View>
            </Row>
            {!payer ? <Muted>{u.role === 'malik'
              ? t('Aidatı kiracın öder; dairenin aidat durumunu buradan izleyebilirsin.')
              : t('Aidatı malik öder. Sana tahakkuk gelirse aşağıdaki talep formundan yönetime bildirebilirsin.')}</Muted> : null}
            {!d ? <Spin /> : mine.length ? <View>{mine.map((x: any) => <MyCharge key={x.id} x={x} payer={payer} reload={load} site={!isCommercial(u.sector)} />)}</View> : <Muted>{t('Tahakkuk yok.')}</Muted>}
            {isCommercial(u.sector) && Number(u.turnover_rate) > 0 && u.role === 'kiraci' ? <TurnoverBox u={u} /> : null}
          </Card>
        );
      })}

      <Stack gap={8}>
        <H2>{t('Duyurular')}</H2>
        {d?.notes?.length ? d.notes.slice(0, 10).map((x: any) => (
          <Card key={x.id} gap={4}><Row between wrap><Text v="body" style={{ fontFamily: fonts.bodyXBold }}>{x.title}</Text><Muted>{day(x.created_at)}</Muted></Row>{x.body ? <Text v="small">{x.body}</Text> : null}</Card>
        )) : <Empty>{t('Henüz duyuru yok.')}</Empty>}
      </Stack>

      <ResidentBudget units={units} />

      <Stack gap={8}>
        <H2>{t('Yönetime talep')}</H2>
        <Card gap={10}>
          {units.length > 1 ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{units.map((u: any) => <Pill key={u.unit_id} label={unitLabel(u)} on={target.unit_id === u.unit_id} onPress={() => setReq({ ...req, unit: u.unit_id })} />)}</View> : null}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {Object.entries(REQ_CAT).filter(([k]) => anySite || k !== 'aidat').map(([k, l]) => <Pill key={k} label={t(l)} on={req.cat === k} onPress={() => setReq({ ...req, cat: k })} />)}
          </View>
          {req.cat === 'aidat' ? <Muted>{t('Aidatı sen ödemiyorsan (ör. sözleşmeye göre malik ödüyorsa) buradan yönetime bildir; yönetim dairenin ödeyenini değiştirir.')}</Muted> : null}
          <Field label={t('Başlık')} value={req.title} onChangeText={(v) => setReq({ ...req, title: v })} maxLength={120} />
          <Field label={t('Açıklama')} value={req.body} onChangeText={(v) => setReq({ ...req, body: v })} multiline maxLength={4000} />
          <Button title={t('Talebi gönder')} style={{ alignSelf: 'flex-start' }} disabled={req.title.trim().length < 2} onPress={async () => {
            setErr(null); setMsg(null);
            try { await openSiteRequest(target.org_id, target.unit_id, req); setReq({ ...req, title: '', body: '' }); setMsg(t('Talebin yönetime iletildi.')); load(); } catch (e) { setErr(humanError(e)); }
          }} />
          {msg ? <Text v="small" color={c.okInk}>{msg}</Text> : null}
        </Card>
        {(d?.requests || []).map((x: any) => (
          <Card key={x.id} gap={4}>
            <Row between wrap><Text v="small" style={{ fontFamily: fonts.bodyXBold }}>{x.title}</Text><Chip tone={x.status === 3 ? 'ok' : 'warn'} label={REQ()[x.status]} /></Row>
            {x.reply ? <Muted>{t('Yönetimin yanıtı')}: {x.reply}</Muted> : null}
          </Card>
        ))}
      </Stack>
    </Page>
  );
}
