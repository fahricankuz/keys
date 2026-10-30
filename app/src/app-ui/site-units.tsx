/* Kurum panelinde birimler (sitede daireler, AVM'de mağazalar, depoda depolar, GYO'da birimler): kurulum sihirbazı, tek ve
   toplu ekleme, satır satır liste (birim, aidat ya da kira, malik ve kiracılar ile davet durumu), düzenleme ve kişi daveti.
   Kişi ekleme ve davet alt sayfada (site-people.tsx): e-posta kendiliğinden gider, WhatsApp hazır mesajla açılır. */
import { useMemo, useState } from 'react';
import { TextInput, View } from 'react-native';
import { t } from '../domain/i18n';
import { humanError } from '../domain/backend';
import { saveUnit, deleteUnit, parseUnits, importUnits, unitLabel, isCommercial, inviteState } from '../domain/site';
import { tl, fmtFull, parse, match } from '../domain/util';
import { Button, Chip, Field, PressScale, Text } from '../ui/kit';
import { fonts, radius, useBreakpoint, useColors } from '../ui/theme';
import { Card, Empty, Muted, Note, Row, Seg, Stack } from './blocks';
import { SetupWizard } from './site-overview';
import { MoneyField } from './forms';
import { Pill } from './org';
import { host } from '../domain/host';

const day = (v?: string) => (v ? fmtFull(parse(String(v).slice(0, 10))) : '—');
const money = (n: any, cur?: string) => (!cur || cur === 'TRY' ? tl(n) : (cur === 'USD' ? '$' : '€') + Number(n || 0).toLocaleString('tr-TR', { maximumFractionDigits: 2 }));
const CURS: [string, string][] = [['TRY', '₺ TL'], ['USD', '$ USD'], ['EUR', '€ EUR']];

function Err({ e }: { e: string | null }) {
  const c = useColors();
  return e ? <Text v="small" color={c.badInk}>{e}</Text> : null;
}

/** Sitede dairenin bilgileri: blok, no, m² (zorunlu), arsa payı, aylık aidat. */
function FlatForm({ u, oid, done }: { u: any; oid: string; done: () => void }) {
  const str = (v: any) => (v == null ? '' : String(v));
  const [f, setF] = useState<any>({ block: str(u.block), no: str(u.no), area: str(u.area), share: str(u.share), aidat: str(u.aidat) });
  const [err, setErr] = useState<string | null>(null);
  const num = (k: string) => (v: string) => setF({ ...f, [k]: v.replace(/[^0-9.,]/g, '') });
  const n = (v: string) => (v === '' ? null : Number(v.replace(',', '.')));
  return (
    <Card gap={10}>
      <Row gap={10} wrap align="flex-end">
        <View style={{ flexGrow: 1, flexBasis: 90 }}><Field label={t('Blok')} value={f.block} onChangeText={(v) => setF({ ...f, block: v })} maxLength={40} /></View>
        <View style={{ flexGrow: 1, flexBasis: 90 }}><Field label={t('Daire no')} value={f.no} onChangeText={(v) => setF({ ...f, no: v })} maxLength={20} /></View>
        <View style={{ flexGrow: 1, flexBasis: 90 }}><MoneyField label={t('m² (zorunlu)')} value={f.area} onChange={num('area')} /></View>
        <View style={{ flexGrow: 1, flexBasis: 90 }}><Field label={t('Arsa payı')} value={f.share} onChangeText={num('share')} keyboardType="decimal-pad" /></View>
        <View style={{ flexGrow: 1, flexBasis: 110 }}><MoneyField label={t('Aylık aidat (₺)')} value={f.aidat} onChange={num('aidat')} /></View>
      </Row>
      <Err e={err} />
      <Row wrap>
        <Button title={t('Kaydet')} disabled={!f.no.trim() || !(Number(n(f.area)) > 0)} onPress={async () => {
          try { await saveUnit(oid, { ...u, block: f.block.trim(), no: f.no.trim(), area: n(f.area), share: n(f.share), aidat: n(f.aidat) }); done(); } catch (e) { setErr(humanError(e)); }
        }} />
        <Button kind="quiet" title={t('Vazgeç')} onPress={done} />
      </Row>
    </Card>
  );
}

/** Ticari birimin kira sözleşmesi: kira ve para birimi, ciro oranı, başlangıç/bitiş, artış, KDV/stopaj, ödeme günü, ortak gider avansı. */
function LeaseForm({ u, oid, done }: { u: any; oid: string; done: () => void }) {
  const str = (v: any) => (v == null ? '' : String(v));
  const [f, setF] = useState<any>({ rent: str(u.rent), currency: u.currency || 'TRY', turnover_rate: str(u.turnover_rate), lease_start: str(u.lease_start), lease_end: str(u.lease_end),
    index_kind: u.index_kind || 'tufe', index_rate: str(u.index_rate), vat: !!u.vat, stopaj: !!u.stopaj, due_day: str(u.due_day), aidat: str(u.aidat), area: str(u.area) });
  const [err, setErr] = useState<string | null>(null);
  const num = (k: string) => (v: string) => setF({ ...f, [k]: v.replace(/[^0-9.,]/g, '') });
  const okDate = (v: string) => !v || /^\d{4}-\d{2}-\d{2}$/.test(v);
  return (
    <Stack gap={10}>
      <Row gap={10} wrap align="flex-end">
        <View style={{ flexGrow: 1, flexBasis: 130 }}><MoneyField label={t('Aylık kira')} value={f.rent} onChange={num('rent')} /></View>
        <View style={{ flexDirection: 'row', gap: 6, paddingBottom: 6 }}>{CURS.map(([k, l]) => <Pill key={k} label={l} on={f.currency === k} onPress={() => setF({ ...f, currency: k })} />)}</View>
      </Row>
      <Row gap={10} wrap align="flex-end">
        <View style={{ flexGrow: 1, flexBasis: 120 }}><MoneyField label={t('m² (zorunlu)')} value={f.area} onChange={num('area')} /></View>
        <View style={{ flexGrow: 1, flexBasis: 120 }}><Field label={t('Ciro kirası (%)')} value={f.turnover_rate} onChangeText={num('turnover_rate')} keyboardType="decimal-pad" placeholder={t('yoksa boş')} /></View>
        <View style={{ flexGrow: 1, flexBasis: 140 }}><MoneyField label={t('Ortak gider avansı (₺/ay)')} value={f.aidat} onChange={num('aidat')} /></View>
        <View style={{ flexGrow: 1, flexBasis: 110 }}><Field label={t('Ödeme günü')} value={f.due_day} onChangeText={(v) => setF({ ...f, due_day: v.replace(/\D/g, '').slice(0, 2) })} keyboardType="number-pad" placeholder="5" /></View>
      </Row>
      <Row gap={10} wrap align="flex-end">
        <View style={{ flexGrow: 1, flexBasis: 160 }}><Field label={t('Sözleşme başlangıcı (YYYY-AA-GG)')} value={f.lease_start} onChangeText={(v) => setF({ ...f, lease_start: v })} maxLength={10} /></View>
        <View style={{ flexGrow: 1, flexBasis: 160 }}><Field label={t('Sözleşme bitişi (YYYY-AA-GG)')} value={f.lease_end} onChangeText={(v) => setF({ ...f, lease_end: v })} maxLength={10} /></View>
      </Row>
      <Text v="small" style={{ fontFamily: fonts.bodyBold }}>{t('Yıllık artış')}</Text>
      <Row gap={6} wrap>
        <Pill label={t('TÜFE (12 aylık ortalama)')} on={f.index_kind === 'tufe'} onPress={() => setF({ ...f, index_kind: 'tufe' })} />
        <Pill label={t('Sabit oran')} on={f.index_kind === 'sabit'} onPress={() => setF({ ...f, index_kind: 'sabit' })} />
        <Pill label={t('Artış yok')} on={f.index_kind === 'yok'} onPress={() => setF({ ...f, index_kind: 'yok' })} />
      </Row>
      {f.index_kind === 'sabit' ? <Field label={t('Yıllık artış oranı (%)')} value={f.index_rate} onChangeText={num('index_rate')} keyboardType="decimal-pad" /> : null}
      <Row gap={6} wrap>
        <Pill label={t('KDV eklenir (%20)')} on={f.vat} onPress={() => setF({ ...f, vat: !f.vat, stopaj: false })} />
        <Pill label={t('Kiracı stopaj keser (%20)')} on={f.stopaj} onPress={() => setF({ ...f, stopaj: !f.stopaj, vat: false })} />
      </Row>
      <Err e={err} />
      <Row wrap>
        <Button title={t('Sözleşmeyi kaydet')} disabled={!(Number(String(f.area).replace(',', '.')) > 0)} onPress={async () => {
          if (!okDate(f.lease_start) || !okDate(f.lease_end)) { setErr(t('Tarihleri YYYY-AA-GG biçiminde yaz.')); return; }
          setErr(null);
          try { await saveUnit(oid, { ...u, ...f }); done(); } catch (e) { setErr(humanError(e)); }
        }} />
        <Button kind="quiet" title={t('Vazgeç')} onPress={done} />
      </Row>
    </Stack>
  );
}

const initials = (n: string) => String(n || '?').trim().split(/\s+/).slice(0, 2).map((w) => w.charAt(0).toLocaleUpperCase('tr')).join('') || '?';

/** Kişi satırı: baş harfler, ad, rol ve davet durumu; dokununca davet alt sayfası (WhatsApp, bağlantı, e-posta, sil). */
function Person({ p, onPress }: { p: any; onPress?: () => void }) {
  const c = useColors();
  const st = inviteState(p);
  const body = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 }}>
      <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: p.role === 'malik' ? c.surface2 : c.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
        <Text v="small" style={{ fontFamily: fonts.bodyXBold, fontSize: 12 }}>{initials(p.name)}</Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text v="small" numberOfLines={1} style={{ fontFamily: fonts.bodyBold }}>{p.name || '—'}</Text>
        <Muted>{p.role === 'malik' ? t('Malik') : t('Kiracı')}{p.phone ? ' · ' + p.phone : ''}</Muted>
      </View>
      {p.linked ? <Chip label={t('Ev sahibi üzerinden')} />
        : st === 'linked' ? <Chip tone="ok" label={t('Hesabı bağlı')} />
        : st === 'invited' ? <Chip tone="warn" label={t('Davet gönderildi')} />
        : <Chip label={t('Davet edilmedi')} />}
    </View>
  );
  return onPress ? <PressScale onPress={onPress} accessibilityRole="button" accessibilityLabel={(p.name || '—') + ' · ' + t('davet')} scaleTo={0.99}>{body}</PressScale> : body;
}

/** Birimin satırı: geniş ekranda sütunlar (birim · aidat ya da kira · kişiler · işlemler), telefonda alt alta. */
function UnitRow({ u, d, oid, org, can, reload, first }: { u: any; d: any; oid: string; org: string; can: (p: string) => boolean; reload: () => void; first: boolean }) {
  const c = useColors();
  const { phone } = useBreakpoint();
  const commercial = isCommercial(d.sector);
  const [menu, setMenu] = useState(false);
  const [edit, setEdit] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const people = d.residents.filter((x: any) => x.unit_id === u.id);
  const linked = (d.linked || []).filter((x: any) => x.unit_id === u.id).map((x: any) => ({ ...x, role: 'kiraci', linked: true }));
  const act = async (fn: () => Promise<any>) => { setErr(null); try { await fn(); reload(); } catch (e) { setErr(humanError(e)); } };
  const label = unitLabel(u);
  const sheet = (person?: any) => host.openSheet('site-kisi', { oid, org, unit: u, commercial, person, manage: can('residents.manage'), reload });
  const sub = (commercial
    ? [u.area ? u.area + ' m²' : '', u.lease_end ? t('Bitiş') + ' ' + day(u.lease_end) : '', u.turnover_rate ? t('Ciro %{n}', { n: u.turnover_rate }) : '']
    : [u.area ? u.area + ' m²' : '', u.share ? t('Arsa payı') + ' ' + u.share : '']).filter(Boolean).join(' · ');
  const pay = commercial
    ? (u.rent != null ? t('Kira') + ' ' + money(u.rent, u.currency) + (u.vat ? ' + ' + t('KDV') : u.stopaj ? ' · ' + t('Stopaj') : '') : t('Sözleşme yok'))
    : (u.aidat != null ? tl(u.aidat) : t('Aidat yok'));
  const paySub = commercial ? (u.aidat != null ? t('Ortak gider') + ' ' + tl(u.aidat) : '') : (u.payer === 'malik' ? t('Malik öder') : t('Kiracı öder'));
  return (
    <View style={{ borderTopWidth: first ? 0 : 1, borderColor: c.line, paddingHorizontal: 16, paddingVertical: 12, gap: 10 }}>
      <View style={{ flexDirection: phone ? 'column' : 'row', gap: phone ? 8 : 16, alignItems: phone ? 'stretch' : 'center' }}>
        <View style={{ flex: phone ? undefined : 1.1, minWidth: 0 }}>
          <Row gap={8}><Text v="body" style={{ fontFamily: fonts.bodyXBold }}>{label}</Text>{!(Number(u.area) > 0) ? <Chip tone="warn" label={t('m² eksik')} /> : null}</Row>
          {sub ? <Muted>{sub}</Muted> : null}
        </View>
        <View style={{ flex: phone ? undefined : 0.9, minWidth: 0 }}>
          <Text v="small" style={{ fontFamily: fonts.bodyBold }}>{pay}</Text>
          {paySub ? <Muted>{paySub}</Muted> : null}
        </View>
        <View style={{ flex: phone ? undefined : 1.7, minWidth: 0 }}>
          {[...people, ...linked].length ? [...people, ...linked].map((p: any, i: number) => <Person key={p.id || 'l' + i} p={p} onPress={p.linked ? undefined : () => sheet(p)} />)
            : <Muted>{commercial ? t('Kiracı eklenmedi') : t('Kimse eklenmedi')}</Muted>}
        </View>
        <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: phone ? 'flex-start' : 'flex-end' }}>
          {can('residents.manage') ? <Button kind="ghost" title={commercial ? t('Kiracı ekle') : t('Kişi ekle')} onPress={() => sheet()} /> : null}
          {can('units.manage') ? (
            <PressScale onPress={() => setMenu(!menu)} accessibilityRole="button" accessibilityLabel={t('{x} için diğer işlemler', { x: label })} accessibilityState={{ expanded: menu }} scaleTo={0.92}
              style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: menu ? c.surface2 : 'transparent', borderWidth: 1, borderColor: c.line }}>
              <Text v="body" style={{ fontFamily: fonts.bodyXBold, lineHeight: 20 }}>⋯</Text>
            </PressScale>
          ) : null}
        </View>
      </View>
      {menu ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center', backgroundColor: c.surface2, borderRadius: radius.md, padding: 10 }}>
          <Button kind="ghost" title={commercial ? t('Sözleşmeyi düzenle') : t('Düzenle')} onPress={() => { setEdit(!edit); setMenu(false); }} />
          {!commercial ? <>
            <Pill label={t('Aidatı kiracı öder')} on={u.payer !== 'malik'} onPress={() => act(() => saveUnit(oid, { ...u, payer: 'kiraci' }))} />
            <Pill label={t('Aidatı malik öder')} on={u.payer === 'malik'} onPress={() => act(() => saveUnit(oid, { ...u, payer: 'malik' }))} />
          </> : null}
          {!people.length ? <Button kind="quiet" title={commercial ? t('Birimi sil') : t('Daireyi sil')} onPress={async () => {
            if (await host.ask({ title: t('{x} silinsin mi?', { x: label }), body: t('Tahakkukları da silinir. Bu işlem geri alınamaz.'), ok: t('Sil'), danger: true })) act(() => deleteUnit(u.id));
          }} /> : <Muted>{t('Kişisi olan kayıt silinmez; önce kişileri kaldır.')}</Muted>}
        </View>
      ) : null}
      {edit ? (commercial ? <LeaseForm u={u} oid={oid} done={() => { setEdit(false); reload(); }} />
        : <FlatForm u={u} oid={oid} done={() => { setEdit(false); reload(); }} />) : null}
      <Err e={err} />
    </View>
  );
}

export function Units({ d, oid, org, orgRow, can, reload }: { d: any; oid: string; org: string; orgRow?: any; can: (p: string) => boolean; reload: () => void }) {
  const c = useColors();
  const { phone } = useBreakpoint();
  const commercial = isCommercial(d.sector);
  const [mode, setMode] = useState<'' | 'one' | 'bulk'>('');
  const [u, setU] = useState<any>({ block: '', no: '', area: '', share: '', aidat: '', rent: '', currency: 'TRY' });
  const [bulk, setBulk] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const parsed = useMemo(() => parseUnits(bulk, commercial), [bulk, commercial]);
  const blocks = [...new Set(d.units.map((x: any) => x.block))] as string[];
  const [b, setB] = useState('all');
  const peopleOf = (id: string) => d.residents.filter((r: any) => r.unit_id === id);
  const waiting = d.residents.filter((r: any) => !r.user_id).length;
  const shown = d.units.filter((x: any) => (b === 'all' || (b === '__davet' ? peopleOf(x.id).some((r: any) => inviteState(r) === 'none') || !peopleOf(x.id).length : x.block === b))
    && (!q.trim() || match([unitLabel(x), ...peopleOf(x.id).map((r: any) => r.name + ' ' + r.phone)].join(' '), q)));
  const act = async (fn: () => Promise<any>) => { setErr(null); setMsg(null); try { await fn(); reload(); } catch (e) { setErr(humanError(e)); } };
  // m² zorunlu: gider dağıtımı ve doluluk m²'ye dayanır. Toplu listede m²'si eksik satırlar eklenmeden önce gösterilir.
  const noArea = parsed.rows.filter((r: any) => !(Number(String(r.area || '').replace(',', '.')) > 0));
  const missingArea = d.units.filter((x: any) => !(Number(x.area) > 0)).length;
  const limit = Number(orgRow?.units) || 0;
  const W = commercial ? t('birim') : t('daire');
  const head = (s: string, flex: number) => <View style={{ flex: flex, minWidth: 0 }}><Text v="small" muted style={{ fontFamily: fonts.bodyBold, fontSize: 12, letterSpacing: 0.4 }}>{s}</Text></View>;
  return (
    <Stack>
      {can('units.manage') && !d.units.length ? <SetupWizard d={d} oid={oid} limit={limit} reload={reload} /> : null}
      {limit && d.units.length > limit ? <Note warn>{t('Sözleşmendeki birim sayısı {n}; şu an {m} kayıt var. Sözleşmeyi güncellemek için anahtar ekibine yaz.', { n: limit, m: d.units.length })}</Note> : null}
      {missingArea ? <Note warn>{commercial ? t('{n} birimin m²’si eksik. Ortak gider dağıtımı ve doluluk m²’ye göre hesaplanır.', { n: missingArea }) : t('{n} dairenin m²’si eksik. m²’ye göre dağıtım bu daireleri atlar.', { n: missingArea })}</Note> : null}
      {d.units.length || can('units.manage') ? (
        <Row between wrap>
          <Muted>{[t('{n} {w}', { n: d.units.length, w: W }), t('{n} kişi', { n: d.residents.length }), waiting ? t('{n} davet bekliyor', { n: waiting }) : ''].filter(Boolean).join(' · ')}</Muted>
          {can('units.manage') ? (
            <Row wrap>
              <Button kind={mode === 'bulk' ? 'primary' : 'ghost'} title={t('Toplu ekle')} onPress={() => setMode(mode === 'bulk' ? '' : 'bulk')} />
              <Button kind={mode === 'one' ? 'ghost' : 'primary'} title={commercial ? t('Birim ekle') : t('Daire ekle')} onPress={() => setMode(mode === 'one' ? '' : 'one')} />
            </Row>
          ) : null}
        </Row>
      ) : null}
      {mode === 'one' ? (
        <Card gap={10}>
          <Row gap={10} wrap align="flex-start">
            <View style={{ flexGrow: 1, flexBasis: 100 }}><Field label={d.sector === 'gyo' ? t('Varlık / bina') : commercial ? t('Kat / bölüm') : t('Blok')} value={u.block} onChangeText={(v) => setU({ ...u, block: v })} maxLength={40} placeholder={commercial ? t('Zemin kat') : 'A'} /></View>
            <View style={{ flexGrow: 1, flexBasis: 100 }}><Field label={commercial ? t('Birim no') : t('Daire no')} value={u.no} onChangeText={(v) => setU({ ...u, no: v })} maxLength={20} /></View>
            <View style={{ flexGrow: 1, flexBasis: 100 }}><MoneyField label={t('m² (zorunlu)')} value={u.area} onChange={(v) => setU({ ...u, area: v })} /></View>
            {commercial ? (
              <View style={{ flexGrow: 1, flexBasis: 120 }}><MoneyField label={t('Aylık kira')} value={u.rent} onChange={(v) => setU({ ...u, rent: v })} /></View>
            ) : (
              <>
                <View style={{ flexGrow: 1, flexBasis: 100 }}><Field label={t('Arsa payı')} value={u.share} onChangeText={(v) => setU({ ...u, share: v.replace(/[^0-9.,]/g, '') })} keyboardType="decimal-pad" /></View>
                <View style={{ flexGrow: 1, flexBasis: 120 }}><MoneyField label={t('Aylık aidat (₺)')} value={u.aidat} onChange={(v) => setU({ ...u, aidat: v })} /></View>
              </>
            )}
          </Row>
          {commercial ? <View style={{ flexDirection: 'row', gap: 6 }}>{CURS.map(([k, l]) => <Pill key={k} label={l} on={u.currency === k} onPress={() => setU({ ...u, currency: k })} />)}</View> : null}
          <Row wrap>
            <Button title={commercial ? t('Birimi ekle') : t('Daireyi ekle')} disabled={!u.no.trim() || !(Number(u.area) > 0)} onPress={() => act(async () => {
              await saveUnit(oid, { ...u, share: u.share.replace(',', '.'), aidat: u.aidat === '' ? null : u.aidat });
              setU({ ...u, no: '' }); setMsg(commercial ? t('Birim eklendi.') : t('Daire eklendi.'));
            })} />
          </Row>
        </Card>
      ) : null}
      {mode === 'bulk' ? (
        <Card gap={10}>
          <Muted>{commercial
            ? t('Her satıra bir birim: Kat; No; m²; Aylık kira; Para birimi (TRY, USD, EUR); Kiracı; Telefon. Excel’den kopyalayıp yapıştırabilirsin.')
            : t('Her satıra bir daire: Blok; No; m²; Arsa payı; Aidat; Malik adı; Malik telefonu. Excel’den kopyalayıp yapıştırabilirsin.')}</Muted>
          <TextInput value={bulk} onChangeText={setBulk} multiline accessibilityLabel={commercial ? t('Birim listesi') : t('Daire listesi')}
            placeholder={commercial ? 'Zemin kat;Z-12;200;2000;USD;Moda Giyim A.Ş.;0212…\n1. kat;101;120;85000;TRY' : 'A;1;120;2;1500;Ayşe Yılmaz;0532…\nA;2;80;1;1000'} placeholderTextColor={c.muted}
            style={{ minHeight: 140, borderRadius: radius.md, borderWidth: 1.5, borderColor: c.line, padding: 14, color: c.ink, backgroundColor: c.bg, fontFamily: fonts.body, fontSize: 15, textAlignVertical: 'top' } as any} />
          <Muted>{commercial ? t('{n} birim okundu', { n: parsed.rows.length }) : t('{n} daire okundu', { n: parsed.rows.length })}{parsed.skipped.length ? ' · ' + t('{n} satır atlandı (daire no yok)', { n: parsed.skipped.length }) : ''}</Muted>
          {noArea.length ? <Note warn>{t('m²’si eksik satırlar: {list}. m² ekleyip yeniden dene.', { list: noArea.slice(0, 8).map((r: any) => [r.block, r.no].filter(Boolean).join(' ')).join(', ') + (noArea.length > 8 ? '…' : '') })}</Note> : null}
          <Button title={commercial ? t('Birimleri ekle') : t('Daireleri ekle')} disabled={!parsed.rows.length || noArea.length > 0} onPress={() => act(async () => {
            const n = await importUnits(oid, parsed.rows, commercial); setBulk(''); setMsg(commercial ? t('{n} birim eklendi.', { n }) : t('{n} daire eklendi.', { n }));
          })} />
        </Card>
      ) : null}
      <Err e={err} />
      {msg ? <Text v="small" color={c.okInk}>{msg}</Text> : null}
      {d.units.length ? (
        <View style={{ flexDirection: phone ? 'column' : 'row', gap: 10, alignItems: phone ? 'stretch' : 'center' }}>
          <View style={{ flex: phone ? undefined : 1, minWidth: 0 }}>
            <Seg scroll value={b} onChange={setB} options={[['all', t('Tümü')], ...(blocks.length > 1 ? blocks.map((x) => [x, x ? (commercial ? x : x + ' ' + t('Blok')) : t('Bloksuz')] as [string, string]) : []), ['__davet', t('Davet edilmemiş')]]} />
          </View>
          <View style={{ width: phone ? undefined : 240 }}>
            <TextInput value={q} onChangeText={setQ} placeholder={commercial ? t('Birim ya da kiracı ara') : t('Daire ya da kişi ara')} placeholderTextColor={c.muted} accessibilityLabel={t('Ara')}
              style={{ minHeight: 42, borderRadius: radius.pill, borderWidth: 1, borderColor: c.line, paddingHorizontal: 16, color: c.ink, backgroundColor: c.surface, fontFamily: fonts.body, fontSize: 15 } as any} />
          </View>
        </View>
      ) : null}
      {shown.length ? (
        <Card gap={0} style={{ padding: 0, overflow: 'hidden' }}>
          {!phone ? (
            <View style={{ flexDirection: 'row', gap: 16, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderColor: c.line, backgroundColor: c.surface2 }}>
              {head(commercial ? t('BİRİM') : t('DAİRE'), 1.1)}{head(commercial ? t('KİRA') : t('AİDAT'), 0.9)}{head(commercial ? t('KİRACI') : t('MALİK / KİRACI'), 1.7)}<View style={{ width: 150 }} />
            </View>
          ) : null}
          {shown.map((x: any, i: number) => <UnitRow key={x.id} u={x} d={d} oid={oid} org={org} can={can} reload={reload} first={i === 0} />)}
        </Card>
      ) : d.units.length ? <Empty>{t('Bu filtrede kayıt yok.')}</Empty>
        : <Empty>{commercial ? t('Henüz birim yok. Birim ekle ya da listeni toplu yapıştır.') : t('Henüz daire yok. Daire ekle ya da listeni toplu yapıştır.')}</Empty>}
    </Stack>
  );
}
