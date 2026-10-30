/* Hukuki süreç desteği: talep formu, talebin durumu, giriş kartları (gecikme, yenileme, çıkış), talep listesi ve
   yönetici paneli bölümü. Alan mantığı ve sunucu çağrıları domain/legal.js'te. */
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { S, ui } from '../domain/state';
import { P, ST } from '../domain/logic';
import { t, locale } from '../domain/i18n';
import { tl, monthYear } from '../domain/util';
import { humanError } from '../domain/backend';
import { storage } from '../domain/storage';
import { isTeam } from '../domain/team';
import { host } from '../domain/host';
import {
  LEGAL_PRICE, STEPS, STATUS, TOPICS, adminLegal, adminLegalNote, adminLegalSave, cancelLegal, legalContext, legalReady, legalRef,
  myLegal, openLegal, refreshLegal, topicLabel
} from '../domain/legal';
import { Button, Chip, Field, PressScale, Text } from '../ui/kit';
import { fonts, radius, useColors } from '../ui/theme';
import { Card, Empty, FileLink, H2, Icon, IconBtn, KV, Label, Muted, Note, Row, Seg, Stack } from './blocks';
import { Area, Choice, FileField, Title, Toggle, useVals } from './forms';
import { useSheet } from './overlays';
import { useStore } from './hooks';

const day = (v: any) => (v ? new Date(v).toLocaleDateString(locale(), { day: 'numeric', month: 'long', year: 'numeric' }) : '—');
const price = () => tl(LEGAL_PRICE());

/** Mülk sahibi (ekip üyesi değil) ve kiracı talep açabilir. */
export const legalAllowed = () => ui.role === 'tenant' || !isTeam();

/* ---------------- giriş noktaları ---------------- */

/** Öne çıkan kart (ör. kira 10 günden fazla gecikince). "×" ile o dönem için gizlenir. */
export function LegalNudge({ pid, topic, title, body, hideKey }: { pid?: string; topic: string; title: string; body: string; hideKey: string }) {
  const c = useColors();
  const { open } = useSheet();
  const key = 'legal-hide:' + hideKey;
  const [hidden, setHidden] = useState(() => { try { return storage.getItem(key) === '1'; } catch { return false; } });
  if (hidden || !legalAllowed()) return null;
  return (
    <View style={{ backgroundColor: c.surface, borderRadius: radius.lg, borderWidth: 2, borderColor: c.accent, padding: 16, gap: 12 }}>
      <Row align="flex-start" gap={12}>
        <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center' }}><Icon name="scale" size={20} /></View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text v="body" style={{ fontFamily: fonts.bodyXBold }}>{title}</Text>
          <Muted>{body}</Muted>
        </View>
        <IconBtn name="x" size={16} label={t('Gizle')} onPress={() => { try { storage.setItem(key, '1'); } catch {} setHidden(true); }} />
      </Row>
      <Button kind="ghost" block title={t('Hukuki destek iste · {price}', { price: price() })} onPress={() => open('hukuki', { pid, topic })} />
    </View>
  );
}

/** Kartın altında küçük bağlantı (yenileme, çıkış ve depozito). */
export function LegalLink({ pid, topic, text }: { pid?: string; topic: string; text: string }) {
  const c = useColors();
  const { open } = useSheet();
  if (!legalAllowed()) return null;
  return (
    <PressScale onPress={() => open('hukuki', { pid, topic })} accessibilityRole="button" scaleTo={0.99}
      style={{ borderRadius: radius.md, borderWidth: 1.5, borderColor: c.accentSoft, backgroundColor: c.bg, padding: 12, gap: 2 }}>
      <Muted>{text}</Muted>
      <Text v="small" color={c.accentText} style={{ fontFamily: fonts.bodyXBold }}>{t('Hukuki destek iste')} →</Text>
    </PressScale>
  );
}

/* ---------------- talep formu ---------------- */

export function LegalSheet({ pid, topic, close }: { pid?: string; topic?: string; close: () => void }) {
  useStore();
  const c = useColors();
  const { open } = useSheet();
  const props: string[] = ui.role === 'tenant' ? (S.myHome ? [S.myHome] : []) : S.order;
  const first = pid && props.includes(pid) ? pid : props[0] || '';
  const { v, set } = useVals({ pid: first, topic: topic || 'gecikme', body: '' });
  const [files, setFiles] = useState<any[]>([]);
  const [consent, setConsent] = useState(false);
  const [scope, setScope] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const p = v.pid ? P(v.pid) : null;
  const ctx = legalContext(v.pid || null);
  const send = async () => {
    setErr('');
    if (!String(v.body).trim()) { setErr(t('Durumu kısaca anlat.')); return; }
    if (!consent || !scope) { setErr(t('Devam etmek için iki onayı da ver.')); return; }
    if (!legalReady()) { setErr(t('Örnek modda talep gönderilmez. Hesabınla giriş yapınca gönderebilirsin.')); return; }
    setBusy(true);
    try {
      const row = await openLegal({ pid: v.pid || undefined, topic: v.topic, body: v.body, files });
      host.notify({ title: t('Talebin alındı'), body: t('{ref} · Ekibimiz 1 iş günü içinde ödeme bilgisini gönderir.', { ref: legalRef(row.no) }), icon: 'scale' });
      open('hukuki-talep', { id: row.id });
    } catch (e) { setErr(humanError(e)); }
    setBusy(false);
  };
  return (
    <Stack>
      <Title>{t('Hukuki süreç desteği')}</Title>
      <Muted>{t('Kira gecikmesi, kira artışı, tahliye ve depozito süreçlerinde belge ve süre takibini ekibimiz ve anlaşmalı hukuk büromuz birlikte yürütür.')}</Muted>
      {props.length > 1 ? <Choice label={t('Mülk')} options={props} v={v} set={set} k="pid" render={(id) => P(id)?.name || id} /> : p ? <KV k={t('Mülk')} v={p.name} /> : null}
      <Choice label={t('Konu')} options={TOPICS().map((x) => x.key)} v={v} set={set} k="topic" render={topicLabel} />
      <Area label={t('Kısaca anlat')} v={v} set={set} k="body" placeholder={t('Ne oldu, ne zamandır sürüyor, karşı taraf ne diyor?')} />
      {ctx.docs.length || ctx.payments.length ? (
        <View style={{ gap: 6 }}>
          <Text v="small" style={{ fontFamily: fonts.bodyBold }}>{t('Talebe eklenenler')}</Text>
          {ctx.docs.map((d: any, i: number) => <Attached key={i} label={d.name + ' (' + t(d.cat) + ')'} />)}
          {ctx.payments.length ? <Attached label={t('Son {n} ayın ödeme geçmişi', { n: ctx.payments.length })} /> : null}
        </View>
      ) : null}
      <FileField label={t('Belge ekle (isteğe bağlı)')} files={files} setFiles={setFiles} max={4} />
      <Card gap={4}>
        <Toggle on={consent} onChange={setConsent} label={t('Bu talep için bilgilerimin ve belgelerimin anlaşmalı hukuk bürosuyla paylaşılmasına açık rıza veriyorum.')} />
        <Toggle on={scope} onChange={setScope} label={t('Hizmetin idari takip ve koordinasyon olduğunu; harç, noter ve dava masraflarının ve gerekirse avukatlık ücretinin ayrıca bana ait olduğunu okudum.')} />
      </Card>
      <Row between>
        <Muted>{t('Talep başına')}</Muted>
        <Text v="h3" style={{ fontFamily: fonts.displayBold }}>{price()} <Text v="small" muted>{t('KDV dahil')}</Text></Text>
      </Row>
      {err ? <Text v="small" color={c.badInk}>{err}</Text> : null}
      <Row>
        <Button kind="ghost" title={t('Vazgeç')} onPress={close} style={{ flex: 1 }} />
        <Button title={t('Talebi gönder')} onPress={send} loading={busy} disabled={busy} style={{ flex: 1 }} />
      </Row>
      <Note>{t('Ödemeyi şimdi almıyoruz. Ekibimiz talebi inceleyip 1 iş günü içinde ödeme bilgisini gönderir; süreç ödeme alınınca başlar.')}</Note>
    </Stack>
  );
}

function Attached({ label }: { label: string }) {
  const c = useColors();
  return (
    <Row between style={{ backgroundColor: c.tile, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 8 }}>
      <Text v="small" style={{ flex: 1 }}>{label}</Text>
      <Icon name="check" size={16} color={c.okInk} />
    </Row>
  );
}

/* ---------------- talebin durumu ---------------- */

export function LegalDetailSheet({ id, close }: { id: string; close: () => void }) {
  useStore();
  const c = useColors();
  const { open } = useSheet();
  const r = myLegal().find((x: any) => x.id === id);
  useEffect(() => { if (!r) refreshLegal(); }, [id]);
  if (!r) return <Stack><Title>{t('Hukuki süreç desteği')}</Title><Muted>{t('Yükleniyor…')}</Muted></Stack>;
  const at = STEPS.indexOf(r.status);
  const when: Record<string, any> = { received: r.created_at, paid: r.paid_at, forwarded: r.forwarded_at, closed: r.closed_at };
  const stepText: Record<string, string> = {
    received: t('Talep alındı'), paid: t('Ödeme alındı · {price}', { price: tl(r.price) }), forwarded: t('Hukuk bürosuna iletildi'), closed: t('Sonuçlandı')
  };
  return (
    <Stack>
      <Title>{topicLabel(r.topic)}{r.property_name ? ' · ' + r.property_name : ''}</Title>
      <Row between><Muted>{t('Talep no {ref} · {date}', { ref: legalRef(r.no), date: day(r.created_at) })}</Muted><StatusChip st={r.status} /></Row>
      {r.status === 'cancelled' ? <Note>{t('Bu talep iptal edildi.')}</Note> : (
        <View style={{ gap: 0 }}>
          {STEPS.map((s, i) => {
            const done = i < at || (i === at && s === 'closed'), cur = i === at && s !== 'closed';
            return (
              <Row key={s} align="flex-start" gap={10} style={{ paddingBottom: 12 }}>
                <View style={{ width: 18, height: 18, borderRadius: 9, marginTop: 2, borderWidth: 2,
                  borderColor: done ? c.okInk : cur ? c.accent : c.line, backgroundColor: done ? c.okBg : cur ? c.accent : c.surface }} />
                <View style={{ flex: 1 }}>
                  <Text v="small" color={i > at ? c.muted : c.ink} style={{ fontFamily: i > at ? fonts.body : fonts.bodyBold }}>{stepText[s]}</Text>
                  {i <= at && when[s] ? <Muted>{day(when[s])}</Muted> : null}
                </View>
              </Row>
            );
          })}
        </View>
      )}
      {r.reply ? <Card gap={4}><Label>{t('Ekibimizin notu')}</Label><Text v="small" selectable>{r.reply}</Text></Card> : null}
      {r.status === 'received' ? <Note>{t('Ekibimiz talebi inceleyip 1 iş günü içinde ödeme bilgisini gönderir; süreç ödeme alınınca başlar.')}</Note> : null}
      <Card gap={6}>
        <Label>{t('Anlattıkların')}</Label>
        <Text v="small" selectable>{r.body}</Text>
        {(r.files || []).map((f: any, i: number) => <FileLink key={i} path={f.path} label={f.name} />)}
      </Card>
      <Button kind="ghost" block title={t('Ekibe mesaj yaz')} onPress={() => open('destek-talebi', { kind: 'genel', message: legalRef(r.no) + ' · ' })} />
      {r.status === 'received' ? (
        <Button kind="quiet" block title={t('Talebi iptal et')} onPress={async () => {
          if (!await host.ask({ title: t('Talep iptal edilsin mi?'), body: t('İnceleme başlamadan iptal edebilirsin; ücret alınmaz.'), ok: t('İptal et'), danger: true })) return;
          try { await cancelLegal(r.id); } catch (e) { host.notify({ title: t('İptal edilemedi'), body: humanError(e), icon: 'scale' }); }
        }} />
      ) : null}
      <Button kind="ghost" block title={t('Kapat')} onPress={close} />
    </Stack>
  );
}

function StatusChip({ st }: { st: string }) {
  const s = (STATUS() as Record<string, string[]>)[st] || [st, 'neutral'];
  return <Chip tone={s[1] as any} label={s[0]} />;
}

/* ---------------- Talepler ekranında liste ---------------- */

export function LegalList() {
  useStore();
  const { open } = useSheet();
  useEffect(() => { refreshLegal(); }, []);
  const list = myLegal();
  if (!legalAllowed() || !list.length) return null;
  return (
    <Stack gap={8}>
      <Row between><H2>{t('Hukuki destek')}</H2><Button kind="ghost" title={t('Yeni talep')} onPress={() => open('hukuki', {})} /></Row>
      {list.map((r: any) => (
        <Card key={r.id} gap={4} onPress={() => open('hukuki-talep', { id: r.id })}>
          <Row between>
            <Text v="body" style={{ fontFamily: fonts.bodyXBold, flex: 1 }}>{topicLabel(r.topic)}{r.property_name ? ' · ' + r.property_name : ''}</Text>
            <StatusChip st={r.status} />
          </Row>
          <Muted>{t('Talep no {ref} · {date}', { ref: legalRef(r.no), date: day(r.created_at) })}</Muted>
        </Card>
      ))}
    </Stack>
  );
}

/* ---------------- yönetici paneli ---------------- */

export function AdminLegal({ onCount }: { onCount?: (n: number) => void }) {
  const c = useColors();
  const [f, setF] = useState('open');
  const [rows, setRows] = useState<any[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = async () => {
    try {
      const d = await adminLegal();
      setRows(d); setErr(null);
      onCount?.(d.filter((r: any) => ['received', 'paid', 'forwarded'].includes(r.status)).length);
    } catch (e) { setErr(humanError(e)); }
  };
  useEffect(() => { load(); }, []);
  const list = (rows || []).filter((r) => f === 'all' || (f === 'open' ? ['received', 'paid', 'forwarded'].includes(r.status) : ['closed', 'cancelled'].includes(r.status)));
  return (
    <Stack>
      <Seg value={f} onChange={setF} options={[['open', t('Açık')], ['done', t('Kapatılan')], ['all', t('Hepsi')]]} />
      {err ? <Text v="small" color={c.badInk}>{err}</Text> : null}
      {rows && !list.length ? <Empty>{t('Talep yok.')}</Empty> : null}
      {list.map((r) => <AdminLegalCard key={r.id} r={r} reload={load} />)}
    </Stack>
  );
}

function AdminLegalCard({ r, reload }: { r: any; reload: () => void }) {
  const c = useColors();
  const [reply, setReply] = useState(r.reply || '');
  const [note, setNote] = useState(r.note || '');
  const [msg, setMsg] = useState('');
  const ctx = r.context || {};
  const pr = ctx.property || null;
  const late = (ctx.payments || []).filter((x: any) => x.status === 'late');
  const save = async (patch: any = {}) => {
    setMsg('');
    try {
      if (note !== (r.note || '')) await adminLegalNote(r.id, note);
      const p = { ...patch, ...(reply !== (r.reply || '') ? { reply } : {}) };
      if (Object.keys(p).length) await adminLegalSave(r.id, p);
      reload();
    } catch (e) { setMsg(humanError(e)); }
  };
  const next: [string, string][] = ([['paid', t('Ödeme alındı')], ['forwarded', t('Büroya iletildi')], ['closed', t('Sonuçlandı')]] as [string, string][])
    .filter(([s]) => STEPS.indexOf(s) > STEPS.indexOf(r.status));
  return (
    <Card gap={8}>
      <Row between wrap>
        <View style={{ flex: 1, minWidth: 220 }}>
          <H2>{legalRef(r.no)} · {r.contact?.name || r.contact?.email || '—'}</H2>
          <Muted>{[r.contact?.email, r.contact?.phone].filter(Boolean).join(' · ')}</Muted>
        </View>
        <Row gap={8} wrap>
          <Chip label={r.role === 'tenant' ? t('Kiracı') : t('Mülk sahibi')} />
          <Chip tone="accent" label={topicLabel(r.topic)} />
          <StatusChip st={r.status} />
          <Muted>{day(r.created_at)}</Muted>
        </Row>
      </Row>
      {pr ? (
        <Muted>{[pr.name, pr.addr, pr.rent ? t('Kira') + ' ' + tl(pr.rent) : '', pr.deposit ? t('Depozito') + ' ' + tl(pr.deposit) : '',
          pr.end ? t('Sözleşme bitişi') + ' ' + pr.end : '', r.role === 'tenant' ? t('Mülk sahibi') + ': ' + pr.landlord : t('Kiracı') + ': ' + pr.tenant].filter(Boolean).join(' · ')}</Muted>
      ) : null}
      <Text v="small" selectable>{r.body}</Text>
      {late.length ? <Note warn>{t('Geciken aylar:')} {late.map((x: any) => monthYear(x.month) + ' (' + tl(x.expected) + ')').join(', ')}</Note> : null}
      {(ctx.payments || []).length ? <Muted>{t('Son {n} ay:', { n: ctx.payments.length })} {ctx.payments.map((x: any) => x.month + ' ' + (((ST as any)[x.status] || [x.status])[0])).join(' · ')}</Muted> : null}
      {[...(ctx.docs || []), ...(r.files || [])].length ? (
        <Row wrap gap={12}>{[...(ctx.docs || []), ...(r.files || [])].map((d: any, i: number) => <FileLink key={i} path={d.path || undefined} label={d.name} />)}</Row>
      ) : null}
      <Muted>{t('Açık rıza ve kapsam onayı: {date}', { date: new Date(r.consent_at).toLocaleString(locale()) })} · {tl(r.price)}</Muted>
      <Field label={t('Kişiye not (bildirimle gider)')} value={reply} onChangeText={setReply} multiline maxLength={2000} />
      <Field label={t('İç not (yalnız ekip görür)')} value={note} onChangeText={setNote} multiline maxLength={4000} />
      {msg ? <Text v="small" color={c.badInk}>{msg}</Text> : null}
      <Row wrap>
        {r.status !== 'cancelled' && r.status !== 'closed' ? next.map(([s, label], i) => <Button key={s} kind={i === 0 ? 'primary' : 'ghost'} title={label} onPress={() => save({ status: s })} />) : null}
        <Button kind="ghost" title={t('Kaydet')} onPress={() => save()} />
        {r.status !== 'cancelled' && r.status !== 'closed' ? <Button kind="quiet" title={t('İptal et')} onPress={() => save({ status: 'cancelled' })} /> : null}
      </Row>
    </Card>
  );
}

