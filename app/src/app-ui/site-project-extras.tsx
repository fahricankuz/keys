/* Site projesi: sakin oylaması, teklifler ve faturalar (migration site_proje_oylama_maliyet).
   VoteBlock: oylama sorusu, süre ve eşik, sonuç çubuğu (arsa payına göre); sakin kendi dairesi adına Kabul / Ret oyu verir,
   yönetim oylamayı erken bitirir. OpenVoteForm: yönetim projeyi oylamaya sunar.
   CostsBlock: teklifler (seçilen işaretli) ve faturalar (dosyalı); yönetim teklif ve fatura ekler, seçer, siler.
   Fatura gider defterine de yazılır ve projenin harcananı faturaların toplamı olur (sunucu). */
import { useState } from 'react';
import { View } from 'react-native';
import { t } from '../domain/i18n';
import { humanError, downloadFile } from '../domain/backend';
import { SB } from '../domain/mapping';
import { openProjectVote, closeProjectVote, addProjectCost, chooseProjectQuote, deleteProjectCost, mySiteUnits, unitLabel } from '../domain/site';
import { vote } from '../domain/meeting';
import { tl, fmtFull, parse } from '../domain/util';
import { Button, Chip, Field, Text } from '../ui/kit';
import { fonts, useColors } from '../ui/theme';
import { Bar, Card, Muted, Row } from './blocks';
import { DateField, FileField, MoneyField, useVals } from './forms';
import { Picked } from './media';
import { Pill } from './org';

const day = (v?: string) => (v ? fmtFull(parse(String(v).slice(0, 10))) : '—');
const when = (v?: string) => (v ? new Date(v).toLocaleString('tr-TR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) : '');
function Err({ e }: { e: string | null }) { const c = useColors(); return e ? <Text v="small" color={c.badInk}>{e}</Text> : null; }

/** Kabul eşiğinin metni: %50 için "fazlası", diğerleri için "ve üzeri". */
const thresholdText = (pct: number) => (pct === 50 ? t('tüm arsa payının %50’sinden fazlası') : t('tüm arsa payının %{p} ve üzeri', { p: pct }));

/** Yoklama sonucundan seçenek yüzdesi (arsa payı varsa ona, yoksa daire sayısına göre; tüm site üzerinden). */
function share(r: any, i: number) {
  const o = r?.options?.[i];
  if (!o) return 0;
  const total = Number(r.share) > 0 ? Number(r.share) : Number(r.units) || 0;
  const v = Number(r.share) > 0 ? Number(o.share) : Number(o.count);
  return total > 0 ? Math.round((v * 1000) / total) / 10 : 0;
}

export function VoteBlock({ p, info, myVotes, manage, reload }: { p: any; info: any; myVotes: any[]; manage: boolean; reload: () => void }) {
  const c = useColors();
  const [err, setErr] = useState<string | null>(null);
  const poll = info?.poll, r = info?.results;
  if (!poll) return null;
  const open = p.status === 'oylama' && Date.parse(poll.ends_at) > Date.now();
  const mine = mySiteUnits().filter((u: any) => u.org_id === p.org_id && (poll.voters === 'herkes' || u.role === 'malik'));
  const yes = share(r, 0), no = share(r, 1);
  const run = async (f: () => Promise<any>) => { setErr(null); try { await f(); reload(); } catch (e) { setErr(humanError(e)); } };
  return (
    <Card gap={8} style={{ backgroundColor: c.surface2 }}>
      <Row between wrap>
        <Text v="body" style={{ fontFamily: fonts.bodyXBold }}>{t('Oylama: proje yapılsın mı?')}</Text>
        <Chip tone={open ? 'warn' : p.status === 'onay' ? 'ok' : p.status === 'red' ? 'bad' : 'neutral'}
          label={open ? t('Oylama sürüyor') : p.status === 'onay' ? t('Onaylandı') : p.status === 'red' ? t('Reddedildi') : t('Süre doldu')} />
      </Row>
      <Muted>{(poll.voters === 'herkes' ? t('Oy hakkı: malik ve kiracılar') : t('Oy hakkı: malikler')) + ' · ' + t('Bitiş') + ' ' + when(poll.ends_at) + ' · ' + t('Kabul için {x}', { x: thresholdText(p.approve_pct || 50) })}</Muted>
      {open ? (mine.length ? mine.map((u: any) => {
        const v = myVotes.find((z: any) => z.poll_id === poll.id && z.unit_id === u.unit_id);
        return (
          <View key={u.unit_id} style={{ gap: 6 }}>
            {mine.length > 1 ? <Muted>{unitLabel(u)}</Muted> : null}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {[t('Kabul'), t('Ret')].map((l, i) => <Pill key={l} label={l} on={v?.choice === i} onPress={() => run(() => vote(poll.id, u.unit_id, i))} />)}
            </View>
            {v ? <Muted>{t('Oyun kaydedildi; oylama bitene kadar değiştirebilirsin.')}</Muted> : null}
          </View>
        );
      }) : manage ? null : <Muted>{t('Bu oylamada yalnız malikler oy verir.')}</Muted>) : null}
      {r ? (
        <View style={{ gap: 6 }}>
          <Row between><Text v="small" style={{ fontFamily: fonts.bodyBold }}>{t('Kabul')}</Text><Muted>%{yes}</Muted></Row>
          <Bar pct={yes} />
          <Row between><Text v="small" style={{ fontFamily: fonts.bodyBold }}>{t('Ret')}</Text><Muted>%{no}</Muted></Row>
          <Bar pct={no} />
          <Muted>{t('Katılım: {a}/{b} daire', { a: r.voted, b: r.units })}{Number(r.share) ? ' · ' + t('arsa payına göre hesaplanır') : ''}</Muted>
        </View>
      ) : null}
      {open && manage ? <Button kind="ghost" title={t('Oylamayı bitir ve sonucu uygula')} style={{ alignSelf: 'flex-start' }} onPress={() => run(() => closeProjectVote(p.id))} /> : null}
      <Err e={err} />
    </Card>
  );
}

/** Yönetim: projeyi oylamaya sunma formu. */
export function OpenVoteForm({ p, done }: { p: any; done: (ok: boolean) => void }) {
  const [days, setDays] = useState(5);
  const [pct, setPct] = useState(50);
  const [voters, setVoters] = useState<'malik' | 'herkes'>('malik');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <Card gap={10} style={{ borderWidth: 0 }}>
      <Text v="body" style={{ fontFamily: fonts.bodyXBold }}>{t('Projeyi oylamaya sun')}</Text>
      <Muted>{t('Sakinlere "Kabul / Ret" oylaması açılır; her daire tek oy verir, ağırlık arsa payıdır. Süre bitince sonuç kendiliğinden uygulanır.')}</Muted>
      <View style={{ gap: 6 }}>
        <Muted>{t('Süre')}</Muted>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{[3, 5, 7, 14].map((n) => <Pill key={n} label={t('{n} gün', { n })} on={days === n} onPress={() => setDays(n)} />)}</View>
        <Muted>{t('Kabul eşiği')}</Muted>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {[[50, t('%50’den fazla')], [66, t('%66 ve üzeri')], [80, t('%80 ve üzeri')]].map(([n, l]) => <Pill key={String(n)} label={String(l)} on={pct === n} onPress={() => setPct(Number(n))} />)}
        </View>
        <Muted>{t('Oy hakkı')}</Muted>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          <Pill label={t('Yalnız malikler')} on={voters === 'malik'} onPress={() => setVoters('malik')} />
          <Pill label={t('Malik ve kiracılar')} on={voters === 'herkes'} onPress={() => setVoters('herkes')} />
        </View>
      </View>
      <Muted>{t('Kabul için {x} gerekir. Kat Mülkiyeti Kanunu’ndaki karar yeter sayıları işin türüne göre değişir; eşiği ona göre seç.', { x: thresholdText(pct) })}</Muted>
      <Row wrap gap={8}>
        <Button title={t('Oylamaya sun')} loading={busy} disabled={busy} onPress={async () => {
          setErr(null); setBusy(true);
          try { await openProjectVote(p.id, { days, pct, voters }); done(true); } catch (e) { setErr(humanError(e)); } finally { setBusy(false); }
        }} />
        <Button kind="quiet" title={t('Vazgeç')} onPress={() => done(false)} />
      </Row>
      <Err e={err} />
    </Card>
  );
}

/** Teklif ya da fatura ekleme formu. */
function CostForm({ oid, p, kind, done }: { oid: string; p: any; kind: 'teklif' | 'fatura'; done: (ok: boolean) => void }) {
  const { v, set } = useVals({ vendor: '', amount: '', spent_on: '', note: '', chosen: false });
  const [file, setFile] = useState<Picked[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const valid = String(v.vendor).trim().length >= 1 && Number(String(v.amount).replace(',', '.')) > 0;
  return (
    <Card gap={10} style={{ borderWidth: 0 }}>
      <Text v="body" style={{ fontFamily: fonts.bodyXBold }}>{kind === 'teklif' ? t('Teklif ekle') : t('Fatura ekle')}</Text>
      <Field label={kind === 'teklif' ? t('Firma') : t('Firma / kalem')} value={v.vendor} onChangeText={(x) => set('vendor', x)} maxLength={120} />
      <Row gap={10} wrap align="flex-end">
        <View style={{ flexGrow: 1, flexBasis: 160 }}><MoneyField label={t('Tutar (₺)')} value={v.amount} onChange={(x) => set('amount', x)} /></View>
        {kind === 'fatura' ? <View style={{ flexGrow: 1, flexBasis: 180 }}><DateField label={t('Fatura tarihi')} v={v} set={set} k="spent_on" /></View> : null}
      </Row>
      <Field label={t('Not (isteğe bağlı)')} value={v.note} onChangeText={(x) => set('note', x)} maxLength={500} />
      <FileField label={kind === 'teklif' ? t('Teklif belgesi (isteğe bağlı)') : t('Fatura (PDF ya da fotoğraf)')} files={file} setFiles={setFile} camera max={1} />
      {kind === 'teklif' ? <Pill label={t('Bu teklifi seç')} on={!!v.chosen} onPress={() => set('chosen', !v.chosen)} /> : null}
      <Muted>{kind === 'fatura' ? t('Fatura gider defterine de yazılır; projenin harcananı faturaların toplamı olur ve sakinlere bildirim gider.') : t('Teklif sakinlere görünür; seçilen teklif işaretlenir.')}</Muted>
      <Row wrap gap={8}>
        <Button title={t('Kaydet')} disabled={!valid || busy} loading={busy} onPress={async () => {
          setErr(null); setBusy(true);
          try { await addProjectCost(oid, p.id, { kind, vendor: v.vendor, amount: v.amount, spent_on: v.spent_on, note: v.note, file: file[0] || null, chosen: !!v.chosen }); done(true); }
          catch (e) { setErr(humanError(e)); } finally { setBusy(false); }
        }} />
        <Button kind="quiet" title={t('Vazgeç')} onPress={() => done(false)} />
      </Row>
      <Err e={err} />
    </Card>
  );
}

function CostRow({ x, manage, reload }: { x: any; manage: boolean; reload: () => void }) {
  const c = useColors();
  const [err, setErr] = useState<string | null>(null);
  const [ask, setAsk] = useState(false);
  const run = async (f: () => Promise<any>) => { setErr(null); try { await f(); reload(); } catch (e) { setErr(humanError(e)); } };
  return (
    <View style={{ gap: 4, padding: 10, borderRadius: 12, backgroundColor: x.chosen ? c.okBg : c.surface2 }}>
      <Row between wrap>
        <Text v="small" style={{ fontFamily: fonts.bodyXBold }}>{x.vendor}{x.chosen ? ' · ' + t('seçildi') : ''}</Text>
        <Text v="body" style={{ fontFamily: fonts.bodyXBold }}>{tl(x.amount)}</Text>
      </Row>
      {x.kind === 'fatura' ? <Muted>{day(x.spent_on)}</Muted> : null}
      {x.note ? <Muted>{x.note}</Muted> : null}
      <Row wrap gap={8}>
        {x.file ? <Button kind="ghost" title={x.kind === 'fatura' ? t('Faturayı gör') : t('Belgeyi gör')} onPress={() => downloadFile(SB + x.file, x.file_name || x.vendor)} /> : null}
        {manage && x.kind === 'teklif' && !x.chosen ? <Button kind="ghost" title={t('Bu teklifi seç')} onPress={() => run(() => chooseProjectQuote(x.id))} /> : null}
        {manage ? (ask
          ? <><Muted>{x.kind === 'fatura' ? t('Fatura ve gider kaydı silinsin mi?') : t('Teklif silinsin mi?')}</Muted>
              <Button kind="ghost" title={t('Evet, sil')} onPress={() => { setAsk(false); run(() => deleteProjectCost(x.id)); }} />
              <Button kind="quiet" title={t('Vazgeç')} onPress={() => setAsk(false)} /></>
          : <Button kind="quiet" title={x.kind === 'fatura' ? t('Faturayı sil') : t('Teklifi sil')} onPress={() => setAsk(true)} />) : null}
      </Row>
      <Err e={err} />
    </View>
  );
}

/** Teklifler ve faturalar. canQuote/canInvoice: aşamaya göre ekleme izni (sunucu da denetler). */
export function CostsBlock({ oid, p, costs, manage, reload }: { oid?: string; p: any; costs: any[]; manage: boolean; reload: () => void }) {
  const [form, setForm] = useState<null | 'teklif' | 'fatura'>(null);
  const quotes = costs.filter((x) => x.kind === 'teklif'), bills = costs.filter((x) => x.kind === 'fatura');
  const canQuote = manage && !['oylama', 'red', 'tamam'].includes(p.status);
  const canBill = manage && !['acildi', 'oylama', 'red'].includes(p.status);
  if (!quotes.length && !bills.length && !canQuote && !canBill) return null;
  const total = bills.reduce((a, x) => a + Number(x.amount), 0);
  if (form && oid) return <CostForm oid={oid} p={p} kind={form} done={(ok) => { setForm(null); if (ok) reload(); }} />;
  return (
    <View style={{ gap: 8 }}>
      {quotes.length ? <><Text v="small" style={{ fontFamily: fonts.bodyBold }}>{t('Teklifler')}</Text>{quotes.map((x) => <CostRow key={x.id} x={x} manage={manage} reload={reload} />)}</> : null}
      {bills.length ? <><Row between><Text v="small" style={{ fontFamily: fonts.bodyBold }}>{t('Faturalar')}</Text><Muted>{t('Toplam {v}', { v: tl(total) })}</Muted></Row>{bills.map((x) => <CostRow key={x.id} x={x} manage={manage} reload={reload} />)}</> : null}
      {canQuote || canBill ? (
        <Row wrap gap={8}>
          {canQuote ? <Button kind="ghost" title={t('Teklif ekle')} onPress={() => setForm('teklif')} /> : null}
          {canBill ? <Button kind="ghost" title={t('Fatura ekle')} onPress={() => setForm('fatura')} /> : null}
        </Row>
      ) : null}
    </View>
  );
}
