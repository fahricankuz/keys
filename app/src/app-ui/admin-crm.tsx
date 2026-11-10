/* Yönetici paneli → CRM: potansiyel aboneler aşama sütunlarında (Yeni → İletişime geçildi → Görüşme → Teklif → Kazanıldı /
   Kaybedildi). Kart: kurum, paket × adet, potansiyel aylık getiri, takip uyarısı; sütunlar arasında taşıma. Kişi formu: bilgiler,
   tek tıkla Ara / WhatsApp / E-posta (panel penceresi), not geçmişi. Hatırlatmalar sunucuda (crm_reminders) yöneticilere gider. */
import { useCallback, useEffect, useState } from 'react';
import { Linking, ScrollView, View } from 'react-native';
import { t } from '../domain/i18n';
import { humanError } from '../domain/backend';
import { host } from '../domain/host';
import { OPEN_STAGES, SOURCES, STAGES, addLeadNote, deleteLead, followUp, loadLeads, pipeline, potential, saveLead, setStage, stageLabel } from '../domain/crm';
import { planLabel } from '../domain/plans';
import { SECTORS } from '../domain/org';
import { waLink } from '../domain/wa';
import { fmtFull, parse, tl } from '../domain/util';
import { Button, Chip, Field, PressScale, Text } from '../ui/kit';
import { Loader } from '../ui/Loader';
import { fonts, useBreakpoint, useColors } from '../ui/theme';
import { Card, Empty, H2, Label, Muted, Row, Seg, Stack } from './blocks';
import { Kpi, KpiGrid } from './admin-ui';
import { MailComposer } from './admin-mail';

const day = (v?: string) => (v ? fmtFull(parse(String(v).slice(0, 10))) : '');
const blank = (o: any = {}) => ({ name: '', phone: '', email: '', company: '', sector: '', plan: 'bes', units: '1', yearly: false, monthly_value: '', stage: 'yeni', source: 'diger', next_at: '', lost_reason: '', note: '', ...o });

function LeadCard({ l, onOpen, onMove }: { l: any; onOpen: () => void; onMove: (dir: -1 | 1) => void }) {
  const c = useColors();
  const p = potential(l);
  const fu = followUp(l);
  const i = OPEN_STAGES.indexOf(l.stage);
  return (
    <Card gap={6}>
      <Row between>
        <PressScale onPress={onOpen} accessibilityRole="button" accessibilityLabel={t('{name} kişisini aç', { name: l.name })} style={{ flex: 1 }}>
          <Text v="small" numberOfLines={1} style={{ fontFamily: fonts.bodyXBold }}>{l.name}</Text>
        </PressScale>
        {fu ? <Chip tone={fu === 'due' ? 'bad' : 'warn'} label={fu === 'due' ? t('Takip günü') : t('30+ gün sessiz')} /> : null}</Row>
      {l.company ? <Muted>{l.company}</Muted> : null}
      <Muted>{planLabel(l.plan)}{l.plan !== 'kurumsal' ? ' · ' + t('{n} mülk', { n: l.units }) : ''}{l.next_at ? ' · ' + t('takip {d}', { d: day(l.next_at) }) : ''}</Muted>
      <Text v="small" style={{ fontFamily: fonts.bodyBold, fontVariant: ['tabular-nums'] }}>{p ? tl(p.monthly) + ' ' + t('/ ay') : t('Tutar girilmedi')}</Text>
      <Row gap={6} wrap>
        <Button kind="quiet" title={t('Aç')} onPress={onOpen} style={{ minHeight: 30, paddingHorizontal: 10 }} />
          {i > 0 ? <Button kind="quiet" title="‹" onPress={() => onMove(-1)} style={{ minHeight: 30, paddingHorizontal: 10 }} /> : null}
          {i >= 0 ? <Button kind="quiet" title={i < OPEN_STAGES.length - 1 ? stageLabel(OPEN_STAGES[i + 1]) + ' ›' : t('Kazanıldı') + ' ›'} onPress={() => onMove(1)} style={{ minHeight: 30, paddingHorizontal: 10 }} /> : null}
      </Row>
    </Card>
  );
}

function LeadForm({ init, notes, onDone, onClose }: { init: any; notes: any[]; onDone: () => void; onClose: () => void }) {
  const c = useColors();
  const [f, setF] = useState<any>({ ...init, units: String(init.units ?? 1), monthly_value: init.monthly_value == null ? '' : String(init.monthly_value), next_at: init.next_at || '' });
  const [note, setNote] = useState('');
  const [mail, setMail] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: any) => setF({ ...f, [k]: v });
  const p = potential({ ...f, units: Number(f.units) || 1, monthly_value: Number(String(f.monthly_value).replace(',', '.')) || null });
  const save = async () => {
    if (f.next_at && !/^\d{4}-\d{2}-\d{2}$/.test(f.next_at)) { setErr(t('Tarihleri YYYY-AA-GG biçiminde yaz.')); return; }
    setBusy(true); setErr(null);
    try { await saveLead(f); onDone(); } catch (e) { setErr(humanError(e)); }
    setBusy(false);
  };
  const addNote = async () => {
    try { await addLeadNote(f.id, note); setNote(''); onDone(); } catch (e) { setErr(humanError(e)); }
  };
  return (
    <Card gap={10} style={{ borderWidth: 2, borderColor: c.ink }}>
      <Row between wrap><H2>{f.id ? f.name : t('Yeni potansiyel abone')}</H2><Button kind="quiet" title={t('Kapat')} onPress={onClose} /></Row>
      <Row gap={10} wrap>
        <View style={{ flexGrow: 1, flexBasis: 200 }}><Field label={t('Ad soyad')} value={f.name} onChangeText={(v) => set('name', v)} maxLength={120} /></View>
        <View style={{ flexGrow: 1, flexBasis: 160 }}><Field label={t('Telefon')} value={f.phone} onChangeText={(v) => set('phone', v)} keyboardType="phone-pad" maxLength={40} /></View>
        <View style={{ flexGrow: 1, flexBasis: 200 }}><Field label={t('E-posta')} value={f.email} onChangeText={(v) => set('email', v)} keyboardType="email-address" autoCapitalize="none" maxLength={200} /></View>
        <View style={{ flexGrow: 1, flexBasis: 200 }}><Field label={t('Kurum')} value={f.company} onChangeText={(v) => set('company', v)} maxLength={160} /></View>
      </Row>
      <View style={{ gap: 4 }}><Label>{t('Sektör')}</Label>
        <Seg scroll value={f.sector} onChange={(v) => set('sector', v)} options={[['bireysel', t('Bireysel')], ...SECTORS().map((s: any) => [s.key, s.label] as [string, string])]} /></View>
      <View style={{ gap: 4 }}><Label>{t('Düşündüğü paket')}</Label>
        <Seg value={f.plan} onChange={(v) => set('plan', v)} options={[['tek', planLabel('tek')], ['bes', planLabel('bes')], ['kurumsal', planLabel('kurumsal')]]} /></View>
      <Row gap={10} wrap align="flex-end">
        <View style={{ flexGrow: 1, flexBasis: 130 }}><Field label={t('Mülk / birim adedi')} value={f.units} onChangeText={(v) => set('units', v.replace(/\D/g, '').slice(0, 7))} keyboardType="number-pad" /></View>
        {f.plan === 'kurumsal'
          ? <View style={{ flexGrow: 1, flexBasis: 160 }}><Field label={t('Aylık tutar (₺, teklif)')} value={f.monthly_value} onChangeText={(v) => set('monthly_value', v.replace(/[^\d.,]/g, ''))} keyboardType="decimal-pad" /></View>
          : <View style={{ gap: 4 }}><Label>{t('Dönem')}</Label><Seg value={f.yearly ? 'y' : 'm'} onChange={(v) => set('yearly', v === 'y')} options={[['m', t('Aylık')], ['y', t('Yıllık')]]} /></View>}
        <View style={{ flexGrow: 1, flexBasis: 160 }}><Field label={t('Sonraki takip (YYYY-AA-GG)')} value={f.next_at} onChangeText={(v) => set('next_at', v)} maxLength={10} /></View>
      </Row>
      <Text v="small" style={{ fontFamily: fonts.bodyBold }}>{p ? t('Potansiyel: {m} / ay · {y} / yıl', { m: tl(p.monthly), y: tl(p.yearly) }) : t('Potansiyel: Kurumsal için aylık tutarı gir.')}</Text>
      <View style={{ gap: 4 }}><Label>{t('Aşama')}</Label>
        <Seg scroll value={f.stage} onChange={(v) => set('stage', v)} options={STAGES().map((s) => [s.key, s.label] as [string, string])} /></View>
      {f.stage === 'kaybedildi' ? <Field label={t('Kaybedilme nedeni')} value={f.lost_reason} onChangeText={(v) => set('lost_reason', v)} maxLength={300} /> : null}
      <View style={{ gap: 4 }}><Label>{t('Kaynak')}</Label><Seg scroll value={f.source} onChange={(v) => set('source', v)} options={SOURCES() as [string, string][]} /></View>
      <Field label={t('Not')} value={f.note} onChangeText={(v) => set('note', v)} multiline maxLength={2000} />
      <Row wrap>
        <Button title={t('Kaydet')} loading={busy} disabled={!f.name.trim()} onPress={save} />
        {f.phone ? <Button kind="ghost" title={t('Ara')} onPress={() => Linking.openURL('tel:' + String(f.phone).replace(/\s/g, '')).catch(() => {})} /> : null}
        {f.phone ? <Button kind="ghost" title={t('WhatsApp')} onPress={() => Linking.openURL(waLink(f.phone, t('Merhaba {name}, anahtar’dan yazıyorum.', { name: String(f.name).split(' ')[0] }))).catch(() => {})} /> : null}
        {f.email && f.id ? <Button kind="ghost" title={t('E-posta')} onPress={() => setMail(!mail)} /> : null}
        {f.id ? <Button kind="quiet" title={t('Sil')} onPress={async () => {
          if (await host.ask({ title: t('“{x}” silinsin mi?', { x: f.name }), body: t('Kişi ve not geçmişi silinir.'), ok: t('Sil'), danger: true })) { try { await deleteLead(f.id); onDone(); onClose(); } catch (e) { setErr(humanError(e)); } }
        }} /> : null}
      </Row>
      {mail ? <MailComposer target={{ to: f.email, name: f.name, subject: t('anahtar') }} onSent={async () => { try { await addLeadNote(f.id, t('E-posta gönderildi')); onDone(); } catch { /* yok say */ } }} onClose={() => setMail(false)} /> : null}
      {err ? <Text v="small" color={c.badInk}>{err}</Text> : null}
      {f.id ? (
        <View style={{ gap: 6 }}>
          <Label>{t('Görüşme geçmişi')}</Label>
          <Row gap={8} wrap align="flex-end">
            <View style={{ flexGrow: 1, flexBasis: 220 }}><Field label={t('Görüşme notu')} value={note} onChangeText={setNote} maxLength={2000} placeholder={t('Ör. aradım, demo istedi')} /></View>
            <Button kind="dark" title={t('Notu ekle')} disabled={!note.trim()} onPress={addNote} style={{ minHeight: 52 }} />
          </Row>
          {notes.length ? notes.map((n) => <Muted key={n.id}>{day(n.created_at)}: {n.note}</Muted>) : <Muted>{t('Henüz görüşme notu yok.')}</Muted>}
        </View>
      ) : null}
    </Card>
  );
}

/** CRM sayfası. seed: Talepler'den aktarılan kişi (form dolu açılır). */
export function Crm({ seed, clearSeed }: { seed?: any; clearSeed?: () => void }) {
  const c = useColors();
  const { phone } = useBreakpoint();
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState<any>(seed ? blank(seed) : null);
  const [q, setQ] = useState('');
  const [f, setF] = useState('all');
  const load = useCallback(() => loadLeads().then((x) => { setD(x); setErr(null); }).catch((e) => setErr(humanError(e))), []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (seed) { setOpen(blank(seed)); clearSeed?.(); } }, [seed]);
  if (err) return <Text v="small" color={c.badInk}>{err}</Text>;
  if (!d) return <View style={{ alignItems: 'center', paddingVertical: 30 }}><Loader size={64} /></View>;
  const pl = pipeline(d.leads);
  const match = (l: any) => (f === 'all' || (f === 'follow' ? !!followUp(l) : true))
    && (!q.trim() || [l.name, l.company, l.email, l.phone].some((v) => String(v || '').toLocaleLowerCase('tr').includes(q.trim().toLocaleLowerCase('tr'))));
  const leads = d.leads.filter(match);
  const due = d.leads.filter((l: any) => followUp(l)).length;
  const move = async (l: any, dir: -1 | 1) => {
    const i = OPEN_STAGES.indexOf(l.stage);
    const next = dir > 0 ? (OPEN_STAGES[i + 1] || 'kazanildi') : OPEN_STAGES[Math.max(0, i - 1)];
    try { await setStage(l.id, next); load(); } catch (e) { setErr(humanError(e)); }
  };
  return (
    <Stack gap={14}>
      <KpiGrid>
        <Kpi icon="chart" tone="sage" label={t('Pipeline değeri (aylık)')} value={tl(pl.openMonthly)} sub={t('Yıllık {v} · açık aşamalar', { v: tl(pl.openYearly) })} />
        <Kpi icon="landlord" tone="sky" label={t('Açık potansiyel abone')} value={String(OPEN_STAGES.reduce((a, k) => a + pl.by[k].count, 0))} sub={t('{n} kazanıldı · {m} kaybedildi', { n: pl.by.kazanildi.count, m: pl.by.kaybedildi.count })} />
        <Kpi icon="bell" tone="peach" label={t('Takip bekleyen')} value={String(due)} sub={t('Takip günü gelen ya da 30 günden uzun süredir aranmayan')} />
        <Kpi icon="check" tone="butter" label={t('Kazanma oranı')} value={pl.winRate == null ? '—' : '%' + Math.round(pl.winRate * 100)} sub={t('Kapanan görüşmelerde')} />
      </KpiGrid>
      <Row between wrap>
        <Row gap={8} wrap>
          <Seg value={f} onChange={setF} options={[['all', t('Hepsi')], ['follow', t('Takip bekleyen') + (due ? ' · ' + due : '')]]} />
          <View style={{ flexGrow: 1, flexBasis: 220, maxWidth: 320, minWidth: 0 }}><Field label={t('Ara')} value={q} onChangeText={setQ} placeholder={t('Ad, kurum, telefon')} /></View>
        </Row>
        {!open ? <Button title={t('Kişi ekle')} onPress={() => setOpen(blank())} /> : null}
      </Row>
      {open ? <LeadForm key={open.id || 'yeni'} init={open} notes={d.notes.filter((n: any) => n.lead_id === open.id)} onDone={() => { load(); }} onClose={() => setOpen(null)} /> : null}
      <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={{ gap: 12, paddingBottom: 8 }}>
        {STAGES().map((s) => {
          const items = leads.filter((l: any) => l.stage === s.key);
          return (
            <View key={s.key} style={{ width: phone ? 260 : 250, gap: 8, backgroundColor: c.tile, borderRadius: 18, padding: 10, minHeight: 140 }}>
              <View style={{ gap: 2 }}>
                <Row between><Text v="small" style={{ fontFamily: fonts.bodyXBold }}>{s.label}</Text><Muted>{items.length}</Muted></Row>
                <Muted>{tl(pl.by[s.key].monthly)} {t('/ ay')}</Muted>
              </View>
              {items.length ? items.map((l: any) => (
                <LeadCard key={l.id} l={l} onOpen={() => setOpen(l)} onMove={(dir) => move(l, dir)} />
              )) : s.key === STAGES()[0].key && !open
                ? <Button kind="ghost" title={t('İlk kişiyi ekle')} onPress={() => setOpen(blank())} style={{ alignSelf: 'stretch' }} />
                : <Muted>{t('Bu aşamada kimse yok.')}</Muted>}
            </View>
          );
        })}
      </ScrollView>
      <Muted>{t('Hatırlatma: takip günü gelince ve 30, 60, 90 gün aranmayınca yöneticilere bildirim gider. Kişiye otomatik e-posta gönderilmez; e-postayı buradan sen gönderirsin.')}</Muted>
    </Stack>
  );
}

/** Talepler'den CRM'e aktarma: talebin bilgileriyle form. */
export function leadFromRequest(r: any) {
  return { name: r.name || r.email || '', phone: r.phone || '', email: r.email || '', company: r.company || '', plan: r.kind === 'kurumsal' ? 'kurumsal' : 'bes',
    units: String(r.units || 1), source: r.source === 'web' ? 'web' : 'diger', note: r.message || '', request_id: r.id };
}
