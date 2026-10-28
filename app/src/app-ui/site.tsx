/* Site yönetimi ekranları (kurumsal yol planı Faz 2).
   SiteAdminScreen: site yönetiminin ekranı (özet, daireler, tahakkuk, giderler, duyurular, talepler); sekmeler rol yetkisine göre.
   ResidentSiteScreen ("Sitem"): malik ya da kiracının dairesi, tahakkukları, dekont yükleme, duyurular ve yönetime talep. */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Share, TextInput, View } from 'react-native';
import { t } from '../domain/i18n';
import { humanError, inviteLink, fileUrl } from '../domain/backend';
import { myOrgs, orgCan } from '../domain/org';
import {
  KINDS, MODES, kindLabel, unitLabel, distribute, unpaidOf, lateFee, loadSiteAdmin, saveUnit, deleteUnit, parseUnits, importUnits,
  saveResident, deleteResident, createCharges, deleteCharge, decideCharge, markPaid, addExpense, deleteExpense, announce, deleteAnnouncement,
  answerRequest, mySiteUnits, loadMySite, payCharge, openSiteRequest, loadUnitCharges, budgetTotal, budgetAidat, saveBudget,
  applyBudgetAidat, loadBudgets, siteReport
} from '../domain/site';
import { tl, monthYear, fmtFull, parse } from '../domain/util';
import { Button, Chip, Field, Text } from '../ui/kit';
import { Loader } from '../ui/Loader';
import { fonts, radius, useColors } from '../ui/theme';
import { Card, Empty, H2, Label, Muted, Note, Row, Seg, Stack, StatusChip } from './blocks';
import { FileField } from './forms';
import { useStore } from './hooks';
import { Picked } from './media';
import { Pill } from './org';
import { Page } from './screens';

const thisMonth = () => new Date().toISOString().slice(0, 7);
const today = () => new Date().toISOString().slice(0, 10);
const day = (v?: string) => (v ? fmtFull(parse(String(v).slice(0, 10))) : '—');
/** Tahakkuk durumu → ortak durum çipi (ödendi, onay bekliyor, kısmi, reddedildi, bekliyor, gecikti). */
const stOf = (c: any) => (c.status === 'paid' ? 'approved' : c.status === 'open' ? (lateFee(c) > 0 ? 'late' : 'pending') : c.status);
const REQ = () => [t('Açıldı'), t('Görüldü'), t('İşlemde'), t('Çözüldü')];
const REQ_CAT: Record<string, string> = { ariza: 'Arıza', aidat: 'Aidat', genel: 'Genel' };
const Spin = () => <View style={{ alignItems: 'center', paddingVertical: 20 }}><Loader size={64} /></View>;

function Err({ e }: { e: string | null }) {
  const c = useColors();
  return e ? <Text v="small" color={c.badInk}>{e}</Text> : null;
}

async function shareCode(org: string, unit: string, code: string) {
  const msg = t('{org} sitesindeki {unit} dairen için anahtar daveti. Bağlantıdan ücretsiz hesabını aç: {url} (davet kodu: {code})', { org, unit, url: inviteLink(code), code });
  try { await Share.share({ message: msg }); } catch {}
}

/* ================================================================== */
/* Yönetim                                                             */
/* ================================================================== */

function Summary({ d, oid, can, reload }: { d: any; oid: string; can: (p: string) => boolean; reload: () => void }) {
  const c = useColors();
  const m = thisMonth();
  const cur = d.charges.filter((x: any) => x.month === m);
  const total = cur.reduce((a: number, x: any) => a + Number(x.amount), 0);
  const got = cur.reduce((a: number, x: any) => a + (x.status === 'paid' ? Number(x.amount) : x.status === 'partial' ? Number(x.paid_amount) : 0), 0);
  const waiting = d.charges.filter((x: any) => x.status === 'review');
  const unitBy: Record<string, any> = Object.fromEntries(d.units.map((u: any) => [u.id, u]));
  const debt: Record<string, { left: number; fee: number; n: number }> = {};
  d.charges.forEach((x: any) => {
    const left = unpaidOf(x), fee = lateFee(x);
    if (!fee) return;                                   // vadesi geçmemiş borç listelenmez
    const k = x.unit_id; debt[k] = debt[k] || { left: 0, fee: 0, n: 0 };
    debt[k].left += left; debt[k].fee += fee; debt[k].n += 1;
  });
  const debtors = Object.entries(debt).sort((a, b) => b[1].left - a[1].left);
  return (
    <Stack>
      <Row wrap>
        <Card style={{ flex: 1, minWidth: 150 }} gap={4}><Label>{t('{month} tahakkuku', { month: monthYear(m) })}</Label><Text v="h3">{tl(total)}</Text></Card>
        <Card style={{ flex: 1, minWidth: 150 }} gap={4}><Label>{t('Tahsil edilen')}</Label><Text v="h3">{tl(got)}</Text><Muted>{total ? Math.round((got / total) * 100) + '%' : '—'}</Muted></Card>
        <Card style={{ flex: 1, minWidth: 150 }} gap={4}><Label>{t('Onay bekleyen dekont')}</Label><Text v="h3">{waiting.length}</Text></Card>
        <Card style={{ flex: 1, minWidth: 150 }} gap={4}><Label>{t('Borçlu daire')}</Label><Text v="h3">{debtors.length}</Text></Card>
      </Row>
      {can('payments.approve') && waiting.length ? (
        <Stack gap={8}>
          <H2>{t('Onay bekleyen dekontlar')}</H2>
          {waiting.map((x: any) => <ChargeRow key={x.id} x={x} unit={unitBy[x.unit_id]} can={can} reload={reload} />)}
        </Stack>
      ) : null}
      <Stack gap={8}>
        <H2>{t('Borçlular')}</H2>
        <Muted>{t('Vadesi (ay sonu) geçmiş ödenmemiş tahakkuklar. Gecikme tazminatı Kat Mülkiyeti Kanunu’na göre aylık %5 olarak bilgi amaçlı hesaplanır.')}</Muted>
        {debtors.length ? (
          <Card gap={0}>
            {debtors.map(([uid, v], i) => (
              <Row key={uid} between style={{ paddingVertical: 12, borderTopWidth: i ? 1 : 0, borderColor: c.line }}>
                <View style={{ flex: 1 }}><Text v="small" style={{ fontFamily: fonts.bodyXBold }}>{unitBy[uid] ? unitLabel(unitBy[uid]) : '—'}</Text>
                  <Muted>{t('{n} kalem', { n: v.n })} · {t('Gecikme tazminatı')} {tl(v.fee)}</Muted></View>
                <Text v="small" style={{ fontFamily: fonts.bodyXBold }} color={c.badInk}>{tl(v.left)}</Text>
              </Row>
            ))}
          </Card>
        ) : <Empty>{t('Gecikmiş borç yok.')}</Empty>}
      </Stack>
    </Stack>
  );
}

function UnitCard({ u, d, oid, org, can, reload }: { u: any; d: any; oid: string; org: string; can: (p: string) => boolean; reload: () => void }) {
  const c = useColors();
  const [adding, setAdding] = useState(false);
  const [r, setR] = useState<any>({ role: 'kiraci', name: '', phone: '' });
  const [err, setErr] = useState<string | null>(null);
  const people = d.residents.filter((x: any) => x.unit_id === u.id);
  const linked = (d.linked || []).filter((x: any) => x.unit_id === u.id);
  const act = async (fn: () => Promise<any>) => { setErr(null); try { await fn(); reload(); } catch (e) { setErr(humanError(e)); } };
  return (
    <Card gap={8}>
      <Row between wrap>
        <View style={{ flex: 1, minWidth: 160 }}>
          <Text v="body" style={{ fontFamily: fonts.bodyXBold }}>{unitLabel(u)}</Text>
          <Muted>{[u.area ? u.area + ' m²' : '', u.share ? t('Arsa payı') + ' ' + u.share : '', u.aidat != null ? t('Aidat') + ' ' + tl(u.aidat) : ''].filter(Boolean).join(' · ') || '—'}</Muted>
        </View>
        {can('units.manage') ? (
          <Row gap={6}>
            <Pill label={t('Aidatı kiracı öder')} on={u.payer === 'kiraci'} onPress={() => act(() => saveUnit(oid, { ...u, payer: 'kiraci' }))} />
            <Pill label={t('Aidatı malik öder')} on={u.payer === 'malik'} onPress={() => act(() => saveUnit(oid, { ...u, payer: 'malik' }))} />
          </Row>
        ) : <Chip label={u.payer === 'malik' ? t('Aidatı malik öder') : t('Aidatı kiracı öder')} />}
      </Row>
      {people.map((p: any) => (
        <Row key={p.id} between wrap style={{ paddingTop: 6, borderTopWidth: 1, borderColor: c.line }}>
          <View style={{ flex: 1, minWidth: 160 }}>
            <Text v="small" style={{ fontFamily: fonts.bodyBold }}>{p.name || '—'}</Text>
            <Muted>{[p.role === 'malik' ? t('Malik') : t('Kiracı'), p.phone, p.user_id ? t('Hesabı bağlı') : t('Davet kodu') + ': ' + p.code].filter(Boolean).join(' · ')}</Muted>
          </View>
          <Row gap={6}>
            {!p.user_id ? <Button kind="ghost" title={t('Daveti gönder')} onPress={() => shareCode(org, unitLabel(u), p.code)} /> : null}
            {can('residents.manage') ? <Button kind="quiet" title={t('Sil')} onPress={() => act(() => deleteResident(p.id))} /> : null}
          </Row>
        </Row>
      ))}
      {linked.map((p: any, i: number) => (
        <View key={'l' + i} style={{ paddingTop: 6, borderTopWidth: 1, borderColor: c.line }}>
          <Text v="small" style={{ fontFamily: fonts.bodyBold }}>{p.name}</Text>
          <Muted>{t('Kiracı · ev sahibinin anahtar hesabı üzerinden bağlı')}</Muted>
        </View>
      ))}
      {can('residents.manage') ? (adding ? (
        <Stack gap={8}>
          <Row gap={6}>
            <Pill label={t('Kiracı')} on={r.role === 'kiraci'} onPress={() => setR({ ...r, role: 'kiraci' })} />
            <Pill label={t('Malik')} on={r.role === 'malik'} onPress={() => setR({ ...r, role: 'malik' })} />
          </Row>
          <Row gap={10} wrap align="flex-end">
            <View style={{ flexGrow: 1, flexBasis: 180 }}><Field label={t('Ad soyad')} value={r.name} onChangeText={(v) => setR({ ...r, name: v })} maxLength={120} /></View>
            <View style={{ flexGrow: 1, flexBasis: 140 }}><Field label={t('Telefon')} value={r.phone} onChangeText={(v) => setR({ ...r, phone: v })} keyboardType="phone-pad" maxLength={30} /></View>
          </Row>
          <Row wrap>
            <Button title={t('Kişiyi ekle')} disabled={!r.name.trim()} onPress={() => act(async () => { await saveResident(oid, { ...r, unit_id: u.id }); setAdding(false); setR({ role: 'kiraci', name: '', phone: '' }); })} />
            <Button kind="quiet" title={t('Vazgeç')} onPress={() => setAdding(false)} />
          </Row>
        </Stack>
      ) : (
        <Row wrap>
          <Button kind="ghost" title={t('Malik ya da kiracı ekle')} onPress={() => setAdding(true)} />
          {can('units.manage') && !people.length ? <Button kind="quiet" title={t('Daireyi sil')} onPress={() => act(() => deleteUnit(u.id))} /> : null}
        </Row>
      )) : null}
      <Err e={err} />
    </Card>
  );
}

function Units({ d, oid, org, can, reload }: { d: any; oid: string; org: string; can: (p: string) => boolean; reload: () => void }) {
  const c = useColors();
  const [mode, setMode] = useState<'' | 'one' | 'bulk'>('');
  const [u, setU] = useState<any>({ block: '', no: '', area: '', share: '', aidat: '' });
  const [bulk, setBulk] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const parsed = useMemo(() => parseUnits(bulk), [bulk]);
  const blocks = [...new Set(d.units.map((x: any) => x.block))] as string[];
  const [b, setB] = useState('all');
  const shown = d.units.filter((x: any) => b === 'all' || x.block === b);
  const act = async (fn: () => Promise<any>) => { setErr(null); setMsg(null); try { await fn(); reload(); } catch (e) { setErr(humanError(e)); } };
  return (
    <Stack>
      {can('units.manage') ? (
        <Row wrap>
          <Button kind={mode === 'one' ? 'primary' : 'ghost'} title={t('Daire ekle')} onPress={() => setMode(mode === 'one' ? '' : 'one')} />
          <Button kind={mode === 'bulk' ? 'primary' : 'ghost'} title={t('Toplu ekle')} onPress={() => setMode(mode === 'bulk' ? '' : 'bulk')} />
        </Row>
      ) : null}
      {mode === 'one' ? (
        <Card gap={10}>
          <Row gap={10} wrap align="flex-end">
            <View style={{ flexGrow: 1, flexBasis: 100 }}><Field label={t('Blok')} value={u.block} onChangeText={(v) => setU({ ...u, block: v })} maxLength={40} placeholder="A" /></View>
            <View style={{ flexGrow: 1, flexBasis: 100 }}><Field label={t('Daire no')} value={u.no} onChangeText={(v) => setU({ ...u, no: v })} maxLength={20} /></View>
            <View style={{ flexGrow: 1, flexBasis: 100 }}><Field label="m²" value={u.area} onChangeText={(v) => setU({ ...u, area: v.replace(/[^0-9.,]/g, '') })} keyboardType="decimal-pad" /></View>
            <View style={{ flexGrow: 1, flexBasis: 100 }}><Field label={t('Arsa payı')} value={u.share} onChangeText={(v) => setU({ ...u, share: v.replace(/[^0-9.,]/g, '') })} keyboardType="decimal-pad" /></View>
            <View style={{ flexGrow: 1, flexBasis: 120 }}><Field label={t('Aylık aidat (₺)')} value={u.aidat} onChangeText={(v) => setU({ ...u, aidat: v.replace(/[^0-9.,]/g, '') })} keyboardType="decimal-pad" /></View>
          </Row>
          <Row wrap>
            <Button title={t('Daireyi ekle')} disabled={!u.no.trim()} onPress={() => act(async () => {
              await saveUnit(oid, { ...u, area: u.area.replace(',', '.'), share: u.share.replace(',', '.'), aidat: u.aidat === '' ? null : u.aidat.replace(',', '.') });
              setU({ ...u, no: '' }); setMsg(t('Daire eklendi.'));
            })} />
          </Row>
        </Card>
      ) : null}
      {mode === 'bulk' ? (
        <Card gap={10}>
          <Muted>{t('Her satıra bir daire: Blok; No; m²; Arsa payı; Aidat; Malik adı; Malik telefonu. Excel’den kopyalayıp yapıştırabilirsin.')}</Muted>
          <TextInput value={bulk} onChangeText={setBulk} multiline accessibilityLabel={t('Daire listesi')} placeholder={'A;1;120;2;1500;Ayşe Yılmaz;0532…\nA;2;80;1;1000'} placeholderTextColor={c.muted}
            style={{ minHeight: 140, borderRadius: radius.md, borderWidth: 1.5, borderColor: c.line, padding: 14, color: c.ink, backgroundColor: c.bg, fontFamily: fonts.body, fontSize: 15, textAlignVertical: 'top' } as any} />
          <Muted>{t('{n} daire okundu', { n: parsed.rows.length })}{parsed.skipped.length ? ' · ' + t('{n} satır atlandı (daire no yok)', { n: parsed.skipped.length }) : ''}</Muted>
          <Button title={t('Daireleri ekle')} disabled={!parsed.rows.length} onPress={() => act(async () => { const n = await importUnits(oid, parsed.rows); setBulk(''); setMsg(t('{n} daire eklendi.', { n })); })} />
        </Card>
      ) : null}
      <Err e={err} />
      {msg ? <Text v="small" color={c.okInk}>{msg}</Text> : null}
      {blocks.length > 1 ? <Seg scroll value={b} onChange={setB} options={[['all', t('Tümü')], ...blocks.map((x) => [x, x ? x + ' ' + t('Blok') : t('Bloksuz')] as [string, string])]} /> : null}
      {shown.length ? shown.map((x: any) => <UnitCard key={x.id} u={x} d={d} oid={oid} org={org} can={can} reload={reload} />)
        : <Empty>{t('Henüz daire yok. Daire ekle ya da listeni toplu yapıştır.')}</Empty>}
    </Stack>
  );
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
          <Muted>{monthYear(x.month)} · {tl(x.amount)}{x.status === 'review' || x.status === 'partial' ? ' · ' + t('Ödenen') + ' ' + tl(x.paid_amount) : ''}{x.paid_on ? ' · ' + day(x.paid_on) : ''}</Muted>
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

function Charges({ d, oid, can, reload, seed }: { d: any; oid: string; can: (p: string) => boolean; reload: () => void; seed?: any }) {
  const c = useColors();
  const [month, setMonth] = useState(seed?.month || thisMonth());
  const [kind, setKind] = useState(seed?.kind || 'aidat');
  const [title, setTitle] = useState(seed?.title || '');
  const [mode, setMode] = useState(seed?.mode || 'unit');
  const [value, setValue] = useState(seed?.value ? String(seed.value) : '');
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [view, setView] = useState(thisMonth());
  const plan = distribute(d.units, mode, Number(String(value).replace(',', '.')) || 0);
  const sum = plan.reduce((a, x) => a + x.amount, 0);
  const unitBy: Record<string, any> = Object.fromEntries(d.units.map((u: any) => [u.id, u]));
  const months = [...new Set([thisMonth(), ...d.charges.map((x: any) => x.month)])].sort().reverse() as string[];
  const list = d.charges.filter((x: any) => x.month === view);
  const valid = /^\d{4}-(0[1-9]|1[0-2])$/.test(month) && (kind !== 'ozel' || title.trim()) && plan.length > 0;
  const submit = async () => {
    setErr(null); setMsg(null);
    try {
      const n = await createCharges(oid, { month, kind, title: title.trim(), mode, value: Number(String(value).replace(',', '.')) || 0, units: d.units, existing: d.charges });
      setMsg(n ? t('{n} daireye tahakkuk edildi.', { n }) : t('Bu ay ve tür için tüm dairelere zaten tahakkuk edilmiş.'));
      setView(month); reload();
    } catch (e) { setErr(humanError(e)); }
  };
  return (
    <Stack>
      {can('charges.manage') ? (
        <Card gap={10}>
          <H2>{t('Toplu tahakkuk')}</H2>
          <Row gap={10} wrap align="flex-end">
            <View style={{ flexGrow: 1, flexBasis: 140 }}><Field label={t('Ay (YYYY-AA)')} value={month} onChangeText={setMonth} maxLength={7} /></View>
            {kind === 'ozel' ? <View style={{ flexGrow: 2, flexBasis: 200 }}><Field label={t('Başlık')} value={title} onChangeText={setTitle} maxLength={120} placeholder={t('ör. Çatı onarımı')} /></View> : null}
          </Row>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{KINDS().map((k) => <Pill key={k.key} label={k.label} on={kind === k.key} onPress={() => setKind(k.key)} />)}</View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{MODES().map((k) => <Pill key={k.key} label={k.label} on={mode === k.key} onPress={() => setMode(k.key)} />)}</View>
          {mode !== 'unit' ? <Field label={mode === 'fixed' ? t('Daire başına tutar (₺)') : t('Dağıtılacak toplam (₺)')} value={value} onChangeText={(v) => setValue(v.replace(/[^0-9.,]/g, ''))} keyboardType="decimal-pad" /> : null}
          <Muted>{plan.length ? t('{n} daireye toplam {sum}', { n: plan.length, sum: tl(sum) }) : mode === 'unit' ? t('Dairelerde aylık aidat tanımlı değil.') : t('Tutar yaz.')}</Muted>
          <Button title={t('Tahakkuk et')} disabled={!valid} onPress={submit} style={{ alignSelf: 'flex-start' }} />
          <Err e={err} />
          {msg ? <Text v="small" color={c.okInk}>{msg}</Text> : null}
        </Card>
      ) : null}
      <Seg scroll value={view} onChange={setView} options={months.slice(0, 12).map((m) => [m, monthYear(m)] as [string, string])} />
      {list.length ? list.map((x: any) => <ChargeRow key={x.id} x={x} unit={unitBy[x.unit_id]} can={can} reload={reload} />) : <Empty>{t('Bu ay için tahakkuk yok.')}</Empty>}
    </Stack>
  );
}

function Expenses({ d, oid, can, reload, onDistribute }: { d: any; oid: string; can: (p: string) => boolean; reload: () => void; onDistribute: (e: any) => void }) {
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
            <View style={{ flexGrow: 1, flexBasis: 120 }}><Field label={t('Tutar (₺)')} value={e.amount} onChangeText={(v) => setE({ ...e, amount: v.replace(/[^0-9.,]/g, '') })} keyboardType="decimal-pad" /></View>
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
              {can('charges.manage') ? <Button kind="ghost" title={t('Dairelere dağıt')} onPress={() => onDistribute(x)} /> : null}
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
            <View style={{ flexGrow: 1, flexBasis: 130 }}><Field label={t('Yıllık tutar (₺)')} value={String(it.amount ?? '')} editable={edit} onChangeText={(v) => setItem(i, { amount: v.replace(/[^0-9.,]/g, '') })} keyboardType="decimal-pad" /></View>
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
  const months = Array.from({ length: 12 }, (_, i) => { const x = new Date(); x.setDate(1); x.setMonth(x.getMonth() - i); return x.toISOString().slice(0, 7) + '-01'; });
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
      <Seg scroll value={ref} onChange={setRef} options={(period === 'year' ? years : months).map((x) => [x, period === 'year' ? x.slice(0, 4) : monthYear(x.slice(0, 7))] as [string, string])} />
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

/** Site yönetiminin ekranı. Birden çok site varsa üstte seçilir. */
export function SiteAdminScreen() {
  useStore();
  const sites = myOrgs().filter((o: any) => o.sector === 'site');
  const [pick, setPick] = useState<string | null>(null);
  const org = sites.find((o: any) => o.id === pick) || sites[0];
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState('ozet');
  const [seed, setSeed] = useState<any>(null);
  const load = useCallback(async () => {
    if (!org) return;
    try { setD(await loadSiteAdmin(org.id)); setErr(null); } catch (e) { setErr(humanError(e)); }
  }, [org?.id]);
  useEffect(() => { setD(null); load(); }, [load]);
  if (!org) return <Page title={t('Site')}><Note>{t('Bir site yönetiminin yöneticisi değilsin.')}</Note></Page>;
  const can = (p: string) => orgCan(org, p);
  const tabs: [string, string][] = [['ozet', t('Özet')], ['daire', t('Daireler')], ['tahakkuk', t('Tahakkuk')]];
  if (can('expenses.manage') || can('reports.view')) tabs.push(['gider', t('Giderler')]);
  if (can('charges.manage') || can('reports.view')) tabs.push(['butce', t('Bütçe')]);
  if (can('reports.view')) tabs.push(['rapor', t('Rapor')]);
  tabs.push(['duyuru', t('Duyurular')], ['talep', t('Talepler') + (d ? ' (' + d.requests.filter((x: any) => x.status < 3).length + ')' : '')]);
  const unitBy: Record<string, any> = d ? Object.fromEntries(d.units.map((u: any) => [u.id, u])) : {};
  return (
    <Page title={org.name} sub={t('Site yönetimi') + ' · ' + (d ? t('{n} daire', { n: d.units.length }) : '')}>
      {sites.length > 1 ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{sites.map((o: any) => <Pill key={o.id} label={o.name} on={o.id === org.id} onPress={() => setPick(o.id)} />)}</View> : null}
      {org.status !== 'active' ? <Note warn>{t('Kurum askıda. Yeniden etkinleşene kadar değişiklik yapılamaz; anahtar ile iletişime geç.')}</Note> : null}
      <Seg scroll value={tab} onChange={setTab} options={tabs} />
      {err ? <Note warn>{err}</Note> : null}
      {!d ? (err ? null : <Spin />) : (
        <>
          {tab === 'ozet' && <Summary d={d} oid={org.id} can={can} reload={load} />}
          {tab === 'daire' && <Units d={d} oid={org.id} org={org.name} can={can} reload={load} />}
          {tab === 'tahakkuk' && <Charges key={seed ? seed.title + seed.value : 'x'} d={d} oid={org.id} can={can} reload={load} seed={seed} />}
          {tab === 'gider' && <Expenses d={d} oid={org.id} can={can} reload={load}
            onDistribute={(x: any) => { setSeed({ month: String(x.spent_on).slice(0, 7), kind: 'ozel', title: x.cat, mode: 'share', value: x.amount }); setTab('tahakkuk'); }} />}
          {tab === 'butce' && <Budget d={d} oid={org.id} can={can} reload={load} />}
          {tab === 'rapor' && <Report d={d} org={org.name} />}
          {tab === 'duyuru' && <Notes d={d} oid={org.id} can={can} reload={load} />}
          {tab === 'talep' && (d.requests.length ? d.requests.map((x: any) => <RequestCard key={x.id} x={x} unit={unitBy[x.unit_id]} can={can} reload={load} />) : <Empty>{t('Talep yok.')}</Empty>)}
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
  return (
    <Stack gap={10} style={{ backgroundColor: c.surface2, borderRadius: radius.md, padding: 14 }}>
      <Row gap={10} wrap align="flex-end">
        <View style={{ flexGrow: 1, flexBasis: 140 }}><Field label={t('Ödenen tutar (₺)')} value={amount} onChangeText={(v) => setAmount(v.replace(/[^0-9.,]/g, ''))} keyboardType="decimal-pad" /></View>
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

function MyCharge({ x, payer, reload }: { x: any; payer: boolean; reload: () => void }) {
  const c = useColors();
  const [paying, setPaying] = useState(false);
  const fee = lateFee(x);
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
        ? <Button kind={fee ? 'primary' : 'ghost'} title={t('Dekont yükle')} onPress={() => setPaying(true)} style={{ alignSelf: 'flex-start' }} /> : null}
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
      {!list ? <Spin /> : list.length ? <View>{list.slice(0, 6).map((x) => <MyCharge key={x.id} x={x} payer={payer} reload={load} />)}</View> : <Muted>{t('Tahakkuk yok.')}</Muted>}
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
          <Label>{t('Sitem')} · {units.map((u: any) => u.org).filter((x: string, i: number, a: string[]) => a.indexOf(x) === i).join(', ')}</Label>
          <Text v="body" style={{ fontFamily: fonts.bodyBold }}>{units.map((u: any) => unitLabel(u)).join(', ')}</Text>
          <Muted>{t('Aidat, duyurular ve yönetime talep')}</Muted>
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
export function ResidentSiteScreen() {
  useStore();
  const units = mySiteUnits();
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [req, setReq] = useState<any>({ cat: 'ariza', title: '', body: '', unit: '' });
  const [msg, setMsg] = useState<string | null>(null);
  const c = useColors();
  const load = useCallback(async () => { try { setD(await loadMySite()); setErr(null); } catch (e) { setErr(humanError(e)); } }, [units.length]);
  useEffect(() => { load(); }, [load]);
  if (!units.length) return <Page title={t('Sitem')}><Note>{t('Bir siteye bağlı değilsin. Site yönetiminden aldığın davet kodunu girerek bağlanabilirsin.')}</Note></Page>;
  const target = units.find((u: any) => u.unit_id === req.unit) || units[0];
  return (
    <Page title={t('Sitem')} sub={[...new Set(units.map((u: any) => u.org))].join(', ')}>
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
                <Muted>{u.role === 'malik' ? t('Malik') : t('Kiracı')} · {u.payer === 'malik' ? t('Aidatı malik öder') : t('Aidatı kiracı öder')}</Muted>
              </View>
              <View style={{ alignItems: 'flex-end' }}><Muted>{t('Ödenmemiş')}</Muted><Text v="h3" color={due ? c.badInk : c.okInk}>{tl(due)}</Text></View>
            </Row>
            {!payer ? <Muted>{u.role === 'malik'
              ? t('Aidatı kiracın öder; dairenin aidat durumunu buradan izleyebilirsin.')
              : t('Aidatı malik öder. Sana tahakkuk gelirse aşağıdaki talep formundan yönetime bildirebilirsin.')}</Muted> : null}
            {!d ? <Spin /> : mine.length ? <View>{mine.map((x: any) => <MyCharge key={x.id} x={x} payer={payer} reload={load} />)}</View> : <Muted>{t('Tahakkuk yok.')}</Muted>}
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
            {Object.entries(REQ_CAT).map(([k, l]) => <Pill key={k} label={t(l)} on={req.cat === k} onPress={() => setReq({ ...req, cat: k })} />)}
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
