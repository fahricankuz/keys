/* Genel kurul ve görüş yoklaması.
   Meetings: site yönetiminin bölümü (çağrı, katılım, toplantı paketi, karar defteri notu, yoklama ve sonuçlar).
   ResidentMeetings: "Sitem" ekranında malikin katılım/vekâlet bildirimi ve oy. */
import { useCallback, useEffect, useState } from 'react';
import { TextInput, View } from 'react-native';
import { t } from '../domain/i18n';
import { humanError } from '../domain/backend';
import { unitLabel, mySiteUnits, isCommercial } from '../domain/site';
import {
  ANSWERS, loadMeetings, loadMyMeetings, saveMeeting, finishMeeting, cancelMeeting, replyMeeting, createPoll, closePoll, deletePoll,
  vote, pollRows, isOpenPoll, openMeetingPack
} from '../domain/meeting';
import { fmtFull, iso } from '../domain/util';
import { Button, Chip, Field, Text } from '../ui/kit';
import { fonts, radius, useColors } from '../ui/theme';
import { Bar, Card, Empty, H2, Muted, Note, Row, Seg, Stack } from './blocks';
import { DateField, Toggle, useVals } from './forms';
import { Pill } from './org';

const when = (v: string) => { const d = new Date(v); return fmtFull(d) + ' ' + d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }); };
const at = (date: string, time: string) => (date ? new Date(date + 'T' + (/^\d{1,2}:\d{2}$/.test(time) ? time.padStart(5, '0') : '19:00') + ':00') : null);
const LEGAL = () => t('Görüş yoklaması bağlayıcı değildir: Kat Mülkiyeti Kanunu’na göre kararlar genel kurulda alınır ve karar defterine yazılır. Yoklama, toplantı öncesi eğilimi görmek içindir.');

function Err({ e }: { e: string | null }) { const c = useColors(); return e ? <Text v="small" color={c.badInk}>{e}</Text> : null; }

function Box({ label, value, onChange, lines = 4 }: { label: string; value: string; onChange: (v: string) => void; lines?: number }) {
  const c = useColors();
  return (
    <View style={{ gap: 8 }}>
      <Text v="small" style={{ fontFamily: fonts.bodyBold }}>{label}</Text>
      <TextInput value={value} onChangeText={onChange} multiline accessibilityLabel={label} maxLength={4000}
        style={{ minHeight: 24 * lines, borderRadius: radius.md, padding: 12, color: c.ink, backgroundColor: c.surface, borderWidth: 1.5, borderColor: c.line, fontFamily: fonts.body, fontSize: 16, textAlignVertical: 'top' }} />
    </View>
  );
}

export function PollResults({ poll, r }: { poll: any; r: any }) {
  if (!r) return null;
  const list = pollRows(poll, r);
  return (
    <View style={{ gap: 8 }}>
      {list.map((o: any) => (
        <View key={o.i} style={{ gap: 4 }}>
          <Row between><Text v="small" style={{ fontFamily: fonts.bodyBold }}>{o.label}</Text>
            <Muted>{t('{n} daire', { n: o.count })}{poll.weighted ? ' · ' + t('arsa payı') + ' ' + o.share : ''} · %{o.pct}</Muted></Row>
          <Bar pct={o.pct} />
        </View>
      ))}
      <Muted>{t('Katılım: {a}/{b} daire', { a: r.voted, b: r.units })}{poll.weighted && Number(r.share) ? ' · ' + t('arsa payı {a}/{b}', { a: r.voted_share, b: r.share }) : ''}</Muted>
    </View>
  );
}

/** Yönetim: genel kurul ve yoklamalar. d: loadSiteAdmin verisi. */
export function Meetings({ d, org, can }: { d: any; org: any; can: (p: string) => boolean }) {
  const [x, setX] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const write = can('announce');
  const load = useCallback(async () => { try { setX(await loadMeetings(org.id)); } catch (e) { setErr(humanError(e)); } }, [org.id]);
  useEffect(() => { load(); }, [load]);
  const run = async (f: () => Promise<any>) => { setErr(null); try { await f(); await load(); return true; } catch (e) { setErr(humanError(e)); return false; } };
  const m = useVals({ title: t('Olağan genel kurul'), kind: 'olagan', date: '', time: '19:00', date2: '', time2: '19:00', place: '', agenda: [t('Açılış ve divan seçimi'), t('Yönetim kurulu faaliyet raporu ve hesapların okunması'), t('Yönetim ve denetçinin ibrası'), t('İşletme projesinin görüşülmesi'), t('Yönetim ve denetim kurulu seçimi'), t('Dilek ve temenniler')].join('\n') });
  const p = useVals({ question: '', options: t('Evet') + '\n' + t('Hayır'), weighted: false, voters: 'malik', ends: '', meeting: '' });
  const [minutes, setMinutes] = useState<Record<string, string>>({});
  const units = d.units.length;
  if (!x) return err ? <Note warn>{err}</Note> : <Muted>{t('Yükleniyor…')}</Muted>;
  const active = x.meetings.filter((y: any) => y.status === 'cagrildi');
  return (
    <Stack>
      <Note>{LEGAL()}</Note>
      <Err e={err} />
      {write ? (
        <Card gap={10}>
          <H2>{t('Genel kurul çağrısı')}</H2>
          <Seg value={m.v.kind} onChange={(k) => m.set('kind', k)} options={[['olagan', t('Olağan')], ['olaganustu', t('Olağanüstü')]]} />
          <Field label={t('Başlık')} value={m.v.title} onChangeText={(v) => m.set('title', v)} maxLength={120} />
          <Row wrap gap={10}>
            <View style={{ flexGrow: 1, flexBasis: 180 }}><DateField label={t('Tarih')} v={m.v} set={m.set} k="date" /></View>
            <View style={{ width: 120 }}><Field label={t('Saat')} value={m.v.time} onChangeText={(v) => m.set('time', v)} maxLength={5} /></View>
          </Row>
          <Field label={t('Yer')} value={m.v.place} onChangeText={(v) => m.set('place', v)} maxLength={200} />
          <Row wrap gap={10}>
            <View style={{ flexGrow: 1, flexBasis: 180 }}><DateField label={t('İkinci toplantı (isteğe bağlı)')} v={m.v} set={m.set} k="date2" /></View>
            <View style={{ width: 120 }}><Field label={t('Saat')} value={m.v.time2} onChangeText={(v) => m.set('time2', v)} maxLength={5} /></View>
          </Row>
          <Box label={t('Gündem (her satır bir madde)')} value={m.v.agenda} onChange={(v) => m.set('agenda', v)} lines={6} />
          <Muted>{t('Çağrı, hesabı bağlı maliklere bildirim olarak gider. Yasal bildirimi (imza karşılığı ya da taahhütlü mektup) toplantı paketiyle yap.')}</Muted>
          <Button title={t('Çağrıyı yayınla')} style={{ alignSelf: 'flex-start' }} disabled={!m.v.date || m.v.title.trim().length < 2}
            onPress={() => run(async () => {
              await saveMeeting(org.id, { title: m.v.title, kind: m.v.kind, held_at: at(m.v.date, m.v.time), second_at: at(m.v.date2, m.v.time2), place: m.v.place, agenda: String(m.v.agenda).split('\n') });
              m.setV({ ...m.v, date: '', date2: '', place: '' });
            })} />
        </Card>
      ) : null}

      {x.meetings.length ? x.meetings.map((y: any) => {
        const rs = x.replies.filter((r: any) => r.meeting_id === y.id);
        const n = (a: string) => rs.filter((r: any) => r.answer === a).length;
        return (
          <Card key={y.id} gap={8}>
            <Row between wrap><H2>{y.title}</H2><Chip tone={y.status === 'cagrildi' ? 'warn' : y.status === 'yapildi' ? 'ok' : 'bad'} label={y.status === 'cagrildi' ? t('Çağrıldı') : y.status === 'yapildi' ? t('Yapıldı') : t('İptal')} /></Row>
            <Muted>{when(y.held_at)}{y.place ? ' · ' + y.place : ''}{y.kind === 'olaganustu' ? ' · ' + t('Olağanüstü') : ''}</Muted>
            {(y.agenda || []).length ? <Text v="small">{y.agenda.map((a: string, i: number) => (i + 1) + '. ' + a).join('\n')}</Text> : null}
            <Muted>{t('Katılacak {a} · Vekâlet {b} · Katılmayacak {c} · Yanıtsız {d}', { a: n('katilacak'), b: n('vekalet'), c: n('katilmayacak'), d: Math.max(0, units - rs.length) })}</Muted>
            {y.minutes ? <View style={{ gap: 2 }}><Text v="small" style={{ fontFamily: fonts.bodyBold }}>{t('Karar defteri notu')}</Text><Text v="small">{y.minutes}</Text></View> : null}
            <Row wrap gap={8}>
              <Button kind="ghost" title={t('Toplantı paketi')} onPress={() => openMeetingPack({ org: org.name, m: y, d, replies: x.replies })} />
              {write && y.status === 'cagrildi' ? <Button kind="quiet" title={t('İptal et')} onPress={() => run(() => cancelMeeting(y.id))} /> : null}
            </Row>
            {write && y.status === 'cagrildi' ? (
              <View style={{ gap: 8 }}>
                <Box label={t('Karar defteri notu (toplantıdan sonra)')} value={minutes[y.id] || ''} onChange={(v) => setMinutes({ ...minutes, [y.id]: v })} />
                <Button title={t('Toplantı yapıldı olarak kaydet')} style={{ alignSelf: 'flex-start' }} onPress={() => run(() => finishMeeting(y.id, minutes[y.id] || ''))} />
              </View>
            ) : null}
          </Card>
        );
      }) : <Empty>{t('Henüz genel kurul çağrısı yok.')}</Empty>}

      {write ? (
        <Card gap={10}>
          <H2>{t('Görüş yoklaması aç')}</H2>
          <Field label={t('Soru')} value={p.v.question} onChangeText={(v) => p.set('question', v)} maxLength={300} />
          <Box label={t('Seçenekler (her satır bir seçenek)')} value={p.v.options} onChange={(v) => p.set('options', v)} lines={3} />
          <DateField label={t('Bitiş tarihi')} v={p.v} set={p.set} k="ends" />
          <Seg value={p.v.voters} onChange={(k) => p.set('voters', k)} options={[['malik', t('Yalnız malikler')], ['herkes', t('Malik ve kiracılar')]]} />
          <Toggle label={t('Arsa payıyla ağırlıklı sonuç')} on={!!p.v.weighted} onChange={(b) => p.set('weighted', b)} />
          {active.length ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            <Pill label={t('Toplantıya bağlama')} on={!p.v.meeting} onPress={() => p.set('meeting', '')} />
            {active.map((y: any) => <Pill key={y.id} label={y.title + ' · ' + fmtFull(y.held_at)} on={p.v.meeting === y.id} onPress={() => p.set('meeting', y.id)} />)}
          </View> : null}
          <Muted>{t('Her daire tek oy verir; bitişe kadar oy değiştirilebilir.')}</Muted>
          <Button title={t('Yoklamayı aç')} style={{ alignSelf: 'flex-start' }}
            disabled={p.v.question.trim().length < 3 || !p.v.ends || p.v.ends < iso(new Date()) || String(p.v.options).split('\n').filter((o) => o.trim()).length < 2}
            onPress={() => run(async () => {
              await createPoll(org.id, { question: p.v.question, options: String(p.v.options).split('\n'), weighted: p.v.weighted, voters: p.v.voters, meeting_id: p.v.meeting || null, ends_at: new Date(p.v.ends + 'T23:59:00') });
              p.setV({ ...p.v, question: '', ends: '' });
            })} />
        </Card>
      ) : null}

      {x.polls.length ? x.polls.map((q: any) => (
        <Card key={q.id} gap={8}>
          <Row between wrap><H2>{q.question}</H2><Chip tone={isOpenPoll(q) ? 'warn' : 'ok'} label={isOpenPoll(q) ? t('Açık') : t('Bitti')} /></Row>
          <Muted>{(q.voters === 'herkes' ? t('Malik ve kiracılar') : t('Yalnız malikler')) + ' · ' + t('Bitiş') + ' ' + when(q.ends_at)}</Muted>
          <PollResults poll={q} r={x.results[q.id]} />
          {write ? <Row wrap gap={8}>
            {isOpenPoll(q) ? <Button kind="ghost" title={t('Şimdi bitir')} onPress={() => run(() => closePoll(q.id))} /> : null}
            <Button kind="quiet" title={t('Sil')} onPress={() => run(() => deletePoll(q.id))} />
          </Row> : null}
        </Card>
      )) : <Empty>{t('Henüz yoklama yok.')}</Empty>}
    </Stack>
  );
}

/** Sakin: toplantı çağrıları (malik katılım ya da vekâlet bildirir) ve yoklamalar (daire adına oy). */
export function ResidentMeetings() {
  const units = mySiteUnits().filter((u: any) => !isCommercial(u.sector));
  const [x, setX] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [proxy, setProxy] = useState<Record<string, string>>({});
  const load = useCallback(async () => { try { setX(await loadMyMeetings()); } catch (e) { setErr(humanError(e)); } }, [units.length]);
  useEffect(() => { load(); }, [load]);
  if (!units.length || !x || (!x.meetings.length && !x.polls.length)) return null;
  const run = async (f: () => Promise<any>) => { setErr(null); try { await f(); await load(); } catch (e) { setErr(humanError(e)); } };
  const A: Record<string, string> = ANSWERS();
  return (
    <Stack gap={8}>
      <H2>{t('Genel kurul ve yoklamalar')}</H2>
      <Err e={err} />
      {x.meetings.map((y: any) => {
        const mine = units.filter((u: any) => u.org_id === y.org_id && u.role === 'malik');
        return (
          <Card key={y.id} gap={8}>
            <Row between wrap><Text v="body" style={{ fontFamily: fonts.bodyXBold }}>{y.title}</Text><Muted>{when(y.held_at)}</Muted></Row>
            {y.place ? <Muted>{y.place}</Muted> : null}
            {(y.agenda || []).length ? <Text v="small">{y.agenda.map((a: string, i: number) => (i + 1) + '. ' + a).join('\n')}</Text> : null}
            {y.minutes ? <Muted>{t('Karar defteri notu')}: {y.minutes}</Muted> : null}
            {y.status === 'cagrildi' ? mine.map((u: any) => {
              const r = x.replies.find((z: any) => z.meeting_id === y.id && z.unit_id === u.unit_id);
              const key = y.id + u.unit_id;
              return (
                <View key={u.unit_id} style={{ gap: 6 }}>
                  <Text v="small" style={{ fontFamily: fonts.bodyBold }}>{unitLabel(u)}{r ? ' · ' + A[r.answer] + (r.proxy_name ? ' (' + r.proxy_name + ')' : '') : ''}</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                    <Pill label={A.katilacak} on={r?.answer === 'katilacak'} onPress={() => run(() => replyMeeting(y.id, u.unit_id, 'katilacak'))} />
                    <Pill label={A.katilmayacak} on={r?.answer === 'katilmayacak'} onPress={() => run(() => replyMeeting(y.id, u.unit_id, 'katilmayacak'))} />
                  </View>
                  <Row wrap gap={8}>
                    <View style={{ flexGrow: 1, flexBasis: 200 }}><Field label={t('Vekilin adı soyadı')} value={proxy[key] ?? (r?.proxy_name || '')} onChangeText={(v) => setProxy({ ...proxy, [key]: v })} maxLength={120} /></View>
                    <Button kind="ghost" title={t('Vekâlet verdim')} style={{ alignSelf: 'flex-end' }} disabled={String(proxy[key] ?? '').trim().length < 2}
                      onPress={() => run(() => replyMeeting(y.id, u.unit_id, 'vekalet', proxy[key]))} />
                  </Row>
                  <Muted>{t('Vekâletname örneği toplantı paketinde; imzalı aslını vekilin toplantıya getirmesi gerekir.')}</Muted>
                </View>
              );
            }) : null}
          </Card>
        );
      })}
      {x.polls.map((q: any) => {
        const mine = units.filter((u: any) => u.org_id === q.org_id && (q.voters === 'herkes' || u.role === 'malik'));
        const open = isOpenPoll(q);
        return (
          <Card key={q.id} gap={8}>
            <Row between wrap><Text v="body" style={{ fontFamily: fonts.bodyXBold }}>{q.question}</Text><Chip tone={open ? 'warn' : 'ok'} label={open ? t('Açık') : t('Bitti')} /></Row>
            {open ? mine.map((u: any) => {
              const v = x.votes.find((z: any) => z.poll_id === q.id && z.unit_id === u.unit_id);
              return (
                <View key={u.unit_id} style={{ gap: 6 }}>
                  {mine.length > 1 ? <Muted>{unitLabel(u)}</Muted> : null}
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                    {q.options.map((o: string, i: number) => <Pill key={i} label={o} on={v?.choice === i} onPress={() => run(() => vote(q.id, u.unit_id, i))} />)}
                  </View>
                </View>
              );
            }) : null}
            {open && !mine.length ? <Muted>{t('Bu yoklamada yalnız malikler oy verir.')}</Muted> : null}
            <PollResults poll={q} r={x.results[q.id]} />
            <Muted>{LEGAL()}</Muted>
          </Card>
        );
      })}
    </Stack>
  );
}
