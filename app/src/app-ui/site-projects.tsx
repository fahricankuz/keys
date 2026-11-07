/* Site projeleri ve talep yazışması (migration site_projeleri, site_talep_yazisma).
   SiteProjects: yönetimin "Projeler" bölümü (proje ekle/düzenle, fotoğraflı ilerleme güncellemesi). Yazma "Site projeleri" yetkisiyle.
   ResidentProjects: sakinin "Sitem" ekranındaki projeler (salt okunur: durum, ilerleme, bütçe, güncellemeler, fotoğraflar).
   RequestThread: talep kartının altında yönetim ile talebi açan sakin arasındaki yazışma. */
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { t } from '../domain/i18n';
import { humanError } from '../domain/backend';
import {
  PROJECT_STATUS, projectStatusLabel, projectSpentPct, loadProjects, saveProject, deleteProject, addProjectUpdate, deleteProjectUpdate,
  loadRequestMessages, sendRequestMessage, isCommercial
} from '../domain/site';
import { tl, fmtFull, parse } from '../domain/util';
import { Button, Chip, Field, Text } from '../ui/kit';
import { fonts, radius, useColors } from '../ui/theme';
import { Card, Empty, H2, Label, Muted, Row, Stack, Thumbs } from './blocks';
import { DateField, FileField, MoneyField, useVals } from './forms';
import { Picked } from './media';
import { Pill } from './org';

const day = (v?: string) => (v ? fmtFull(parse(String(v).slice(0, 10))) : '—');
const photoSrc = (p: string) => 'sb:' + p;
const toneOf = (s: string) => (s === 'tamam' ? 'ok' : s === 'askida' ? 'warn' : 'accent') as 'ok' | 'warn' | 'accent';

function Err({ e }: { e: string | null }) {
  const c = useColors();
  return e ? <Text v="small" color={c.badInk}>{e}</Text> : null;
}

/** İlerleme çubuğu (yüzde metniyle). */
function Progress({ value }: { value: number }) {
  const c = useColors();
  const v = Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
  return (
    <View style={{ gap: 4 }} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: v }} accessibilityLabel={t('İlerleme')}>
      <Row between><Muted>{t('İlerleme')}</Muted><Text v="small" style={{ fontFamily: fonts.bodyXBold }}>%{v}</Text></Row>
      <View style={{ height: 8, borderRadius: 4, backgroundColor: c.surface2, overflow: 'hidden' }}>
        <View style={{ width: `${v}%`, height: 8, borderRadius: 4, backgroundColor: v >= 100 ? c.okInk : c.accent }} />
      </View>
    </View>
  );
}

/** Geri alınamayan işlem için iki adımlı onay: önce "Sil", sonra "Evet, sil". */
function ConfirmDelete({ label, question, onConfirm }: { label: string; question: string; onConfirm: () => void }) {
  const [ask, setAsk] = useState(false);
  if (!ask) return <Button kind="quiet" title={label} onPress={() => setAsk(true)} />;
  return (
    <Row wrap gap={8}>
      <Muted>{question}</Muted>
      <Button kind="ghost" title={t('Evet, sil')} onPress={() => { setAsk(false); onConfirm(); }} />
      <Button kind="quiet" title={t('Vazgeç')} onPress={() => setAsk(false)} />
    </Row>
  );
}

/** Proje ekleme ve düzenleme formu. */
function ProjectForm({ oid, p, done }: { oid: string; p?: any; done: (saved: boolean) => void }) {
  const { v, set } = useVals({
    title: p?.title || '', body: p?.body || '', status: p?.status || 'plan', progress: p ? String(p.progress ?? 0) : '0',
    budget: p?.budget != null ? String(p.budget) : '', spent: p?.spent != null ? String(p.spent) : '', start_on: p?.start_on || '', end_on: p?.end_on || ''
  });
  const [cover, setCover] = useState<Picked[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const datesOk = !v.start_on || !v.end_on || v.end_on >= v.start_on;
  const valid = String(v.title).trim().length >= 2 && datesOk;
  return (
    <Card gap={10}>
      <H2>{p ? t('Projeyi düzenle') : t('Yeni proje')}</H2>
      <Field label={t('Proje adı')} value={v.title} onChangeText={(x) => set('title', x)} maxLength={160} placeholder={t('ör. Dış cephe boyası')} />
      <Field label={t('Açıklama')} value={v.body} onChangeText={(x) => set('body', x)} multiline maxLength={4000} placeholder={t('Kapsam, yüklenici, sakinleri etkileyen işler')} />
      <Label>{t('Durum')}</Label>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {PROJECT_STATUS().map((s) => <Pill key={s.key} label={s.label} on={v.status === s.key} onPress={() => { set('status', s.key); if (s.key === 'tamam') set('progress', '100'); }} />)}
      </View>
      <Row gap={10} wrap align="flex-end">
        <View style={{ flexGrow: 1, flexBasis: 120 }}><MoneyField label={t('İlerleme (%)')} decimals={0} value={v.progress} onChange={(x) => set('progress', String(Math.min(100, Number(x) || 0)))} /></View>
        <View style={{ flexGrow: 1, flexBasis: 160 }}><MoneyField label={t('Bütçe (₺, isteğe bağlı)')} value={v.budget} onChange={(x) => set('budget', x)} /></View>
        <View style={{ flexGrow: 1, flexBasis: 160 }}><MoneyField label={t('Harcanan (₺, isteğe bağlı)')} value={v.spent} onChange={(x) => set('spent', x)} /></View>
      </Row>
      <Row gap={10} wrap align="flex-end">
        <View style={{ flexGrow: 1, flexBasis: 180 }}><DateField label={t('Başlangıç')} v={v} set={set} k="start_on" /></View>
        <View style={{ flexGrow: 1, flexBasis: 180 }}><DateField label={t('Planlanan bitiş')} v={v} set={set} k="end_on" /></View>
      </Row>
      {!datesOk ? <Err e={t('Bitiş tarihi başlangıçtan önce olamaz.')} /> : null}
      <FileField label={p?.cover ? t('Kapak fotoğrafını değiştir (isteğe bağlı)') : t('Kapak fotoğrafı (isteğe bağlı)')} files={cover} setFiles={setCover} kind="photos" max={1} camera />
      <Muted>{p ? t('Değişiklik sakinlerin ekranına hemen yansır.') : t('Proje kaydedilince sitenin bütün sakinlerine bildirim gider.')}</Muted>
      <Row wrap gap={8}>
        <Button title={p ? t('Kaydet') : t('Projeyi ekle')} disabled={!valid || busy} loading={busy} onPress={async () => {
          setErr(null); setBusy(true);
          try { await saveProject(oid, { ...v, id: p?.id }, cover[0] || null); done(true); } catch (e) { setErr(humanError(e)); } finally { setBusy(false); }
        }} />
        <Button kind="quiet" title={t('Vazgeç')} onPress={() => done(false)} />
      </Row>
      <Err e={err} />
    </Card>
  );
}

/** İlerleme güncellemesi: not, (değiştiyse) durum ve yüzde, fotoğraflar. */
function UpdateForm({ oid, p, done }: { oid: string; p: any; done: (saved: boolean) => void }) {
  const [body, setBody] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [progress, setProgress] = useState('');
  const [photos, setPhotos] = useState<Picked[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const valid = body.trim().length > 0 || photos.length > 0 || !!status || progress !== '';
  return (
    <Card gap={10} style={{ borderWidth: 0 }}>
      <Text v="body" style={{ fontFamily: fonts.bodyXBold }}>{t('Güncelleme ekle')}</Text>
      <Field label={t('Ne yapıldı?')} value={body} onChangeText={setBody} multiline maxLength={4000} placeholder={t('ör. İskele kuruldu, A blok cephesi zımparalandı')} />
      <Label>{t('Yeni durum (değiştiyse)')}</Label>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {PROJECT_STATUS().map((s) => <Pill key={s.key} label={s.label} on={status === s.key} onPress={() => setStatus(status === s.key ? null : s.key)} />)}
      </View>
      <View style={{ maxWidth: 220 }}><MoneyField label={t('Yeni ilerleme (%)')} decimals={0} value={progress} placeholder={String(p.progress ?? 0)} onChange={(x) => setProgress(x === '' ? '' : String(Math.min(100, Number(x) || 0)))} /></View>
      <FileField label={t('Fotoğraflar (en çok 12)')} files={photos} setFiles={setPhotos} kind="photos" max={12} camera />
      <Muted>{t('Güncelleme sitenin bütün sakinlerine bildirim olarak gider.')}</Muted>
      <Row wrap gap={8}>
        <Button title={t('Paylaş')} disabled={!valid || busy} loading={busy} onPress={async () => {
          setErr(null); setBusy(true);
          try { await addProjectUpdate(oid, p.id, { body, status, progress: progress === '' ? null : progress, photos }); done(true); }
          catch (e) { setErr(humanError(e)); } finally { setBusy(false); }
        }} />
        <Button kind="quiet" title={t('Vazgeç')} onPress={() => done(false)} />
      </Row>
      <Err e={err} />
    </Card>
  );
}

/** Proje kartı: kapak, durum, ilerleme, bütçe, tarihler, açıklama ve güncellemeler (yeniden eskiye). */
function ProjectCard({ p, updates, oid, manage, reload }: { p: any; updates: any[]; oid?: string; manage?: boolean; reload?: () => void }) {
  const c = useColors();
  const [mode, setMode] = useState<'view' | 'edit' | 'update'>('view');
  const [all, setAll] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const pct = projectSpentPct(p);
  const shown = all ? updates : updates.slice(0, 3);
  if (mode === 'edit' && oid) return <ProjectForm oid={oid} p={p} done={(ok) => { setMode('view'); if (ok && reload) reload(); }} />;
  return (
    <Card gap={10}>
      <Row between align="flex-start" wrap>
        <View style={{ flex: 1, minWidth: 180, gap: 4 }}>
          <Text v="h3">{p.title}</Text>
          <Muted>{[p.start_on ? t('Başlangıç') + ' ' + day(p.start_on) : '', p.end_on ? t('Planlanan bitiş') + ' ' + day(p.end_on) : ''].filter(Boolean).join(' · ') || t('Tarih belirtilmedi')}</Muted>
        </View>
        <Chip tone={toneOf(p.status)} label={projectStatusLabel(p.status)} />
      </Row>
      {p.cover ? <Thumbs srcs={[photoSrc(p.cover)]} size={160} /> : null}
      <Progress value={p.progress} />
      {Number(p.budget) > 0 ? (
        <Row between wrap>
          <Muted>{t('Bütçe')} {tl(p.budget)}</Muted>
          {p.spent != null ? <Text v="small" style={{ fontFamily: fonts.bodyBold }} color={pct != null && pct > 100 ? c.badInk : undefined}>{t('Harcanan {v}', { v: tl(p.spent) })}{pct != null ? ' · %' + pct : ''}</Text> : null}
        </Row>
      ) : p.spent != null ? <Muted>{t('Harcanan {v}', { v: tl(p.spent) })}</Muted> : null}
      {p.body ? <Text v="small">{p.body}</Text> : null}
      {updates.length ? (
        <View style={{ gap: 10, borderLeftWidth: 2, borderColor: c.line, paddingLeft: 12 }}>
          {shown.map((u: any) => (
            <View key={u.id} style={{ gap: 6 }}>
              <Row wrap gap={6}>
                <Label>{day(u.created_at)}</Label>
                {u.status ? <Chip tone={toneOf(u.status)} label={projectStatusLabel(u.status)} /> : null}
                {u.progress != null ? <Chip label={'%' + u.progress} /> : null}
              </Row>
              {u.body ? <Text v="small">{u.body}</Text> : null}
              <Thumbs srcs={(u.photos || []).map(photoSrc)} size={96} />
              {manage ? <ConfirmDelete label={t('Güncellemeyi sil')} question={t('Bu güncelleme silinsin mi?')} onConfirm={async () => { setErr(null); try { await deleteProjectUpdate(u.id); reload && reload(); } catch (e) { setErr(humanError(e)); } }} /> : null}
            </View>
          ))}
          {updates.length > 3 ? <Button kind="quiet" title={all ? t('Daha az göster') : t('Tüm güncellemeler ({n})', { n: updates.length })} onPress={() => setAll(!all)} style={{ alignSelf: 'flex-start' }} /> : null}
        </View>
      ) : <Muted>{t('Henüz güncelleme yok.')}</Muted>}
      {manage && oid ? (
        mode === 'update' ? <UpdateForm oid={oid} p={p} done={(ok) => { setMode('view'); if (ok && reload) reload(); }} /> : (
          <Row wrap gap={8}>
            <Button title={t('Güncelleme ekle')} onPress={() => setMode('update')} />
            <Button kind="ghost" title={t('Düzenle')} onPress={() => setMode('edit')} />
            <ConfirmDelete label={t('Projeyi sil')} question={t('Proje ve bütün güncellemeleri silinsin mi?')} onConfirm={async () => { setErr(null); try { await deleteProject(p.id); reload && reload(); } catch (e) { setErr(humanError(e)); } }} />
          </Row>
        )
      ) : null}
      <Err e={err} />
    </Card>
  );
}

/** Yönetim: "Projeler" bölümü. */
export function SiteProjects({ oid, can }: { oid: string; can: (p: string) => boolean }) {
  const [d, setD] = useState<any>(null);
  const [adding, setAdding] = useState(false);
  const [filter, setFilter] = useState('open');
  const load = useCallback(async () => { setD(await loadProjects([oid])); }, [oid]);
  useEffect(() => { load().catch(() => setD({ projects: [], updates: [] })); }, [load]);
  const manage = can('projects.manage');
  const list = (d?.projects || []).filter((p: any) => filter === 'all' || (filter === 'done' ? p.status === 'tamam' : p.status !== 'tamam'));
  return (
    <Stack>
      <Muted>{t('Çatı onarımı, cephe boyası, otopark gibi işleri kaydet; ilerlemeyi fotoğraflarla paylaş. Sakinler süreci kendi ekranlarından izler.')}</Muted>
      {manage ? (adding ? <ProjectForm oid={oid} done={(ok) => { setAdding(false); if (ok) load(); }} />
        : <Button title={t('Yeni proje')} onPress={() => setAdding(true)} style={{ alignSelf: 'flex-start' }} />) : null}
      {d?.projects?.length ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {[['open', t('Süren')], ['done', t('Tamamlanan')], ['all', t('Tümü')]].map(([k, l]) => <Pill key={k} label={l} on={filter === k} onPress={() => setFilter(k)} />)}
        </View>
      ) : null}
      {!d ? null : list.length ? list.map((p: any) => <ProjectCard key={p.id + ':' + p.updated_at} p={p} updates={d.updates.filter((u: any) => u.project_id === p.id)} oid={oid} manage={manage} reload={load} />)
        : <Empty>{d.projects.length ? t('Bu filtrede proje yok.') : manage ? t('Henüz proje yok. İlk projeyi ekleyerek sakinlerle paylaşabilirsin.') : t('Henüz proje yok.')}</Empty>}
    </Stack>
  );
}

/** Sakin: "Sitem" ekranında sitenin projeleri (yalnız site; AVM/depo kiracısında gösterilmez). */
export function ResidentProjects({ units }: { units: any[] }) {
  const ids = [...new Set(units.filter((u: any) => !isCommercial(u.sector)).map((u: any) => u.org_id))] as string[];
  const key = ids.join();
  const [d, setD] = useState<any>(null);
  useEffect(() => { loadProjects(ids).then(setD).catch(() => setD(null)); }, [key]);
  if (!d?.projects?.length) return null;
  const many = ids.length > 1;
  return (
    <Stack gap={8}>
      <H2>{t('Site projeleri')}</H2>
      {d.projects.map((p: any) => (
        <View key={p.id} style={{ gap: 4 }}>
          {many ? <Label>{units.find((u: any) => u.org_id === p.org_id)?.org}</Label> : null}
          <ProjectCard p={p} updates={d.updates.filter((u: any) => u.project_id === p.id)} />
        </View>
      ))}
    </Stack>
  );
}

/** Talep yazışması. canWrite: yönetimde "Talepler" yetkisi, sakinde talebin sahibi. mgmt: ekranı yönetim mi görüyor. */
export function RequestThread({ req, canWrite, mgmt, who }: { req: any; canWrite: boolean; mgmt: boolean; who?: string }) {
  const c = useColors();
  const [list, setList] = useState<any[] | null>(null);
  const [body, setBody] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => { const m: any = await loadRequestMessages([req.id]); setList(m[req.id] || []); }, [req.id]);
  useEffect(() => { load().catch(() => setList([])); }, [load]);
  if (!list) return null;
  if (!list.length && !canWrite) return null;
  const side = (m: any) => (m.from_mgmt ? t('Yönetim') : mgmt ? who || t('Sakin') : t('Sen'));
  const mine = (m: any) => (mgmt ? m.from_mgmt : !m.from_mgmt);
  return (
    <View style={{ gap: 8 }}>
      {list.map((m: any) => (
        <View key={m.id} style={{ alignSelf: mine(m) ? 'flex-end' : 'flex-start', maxWidth: '88%', gap: 2, padding: 10, borderRadius: radius.md,
          backgroundColor: mine(m) ? c.accentSoft : c.surface2 }}>
          <Text v="small" style={{ fontFamily: fonts.bodyXBold }}>{side(m)} · <Text v="small" muted>{day(m.created_at)}</Text></Text>
          <Text v="small">{m.body}</Text>
        </View>
      ))}
      {canWrite ? (
        <>
          <Field label={mgmt ? t('Sakine yaz') : t('Yönetime yaz')} value={body} onChangeText={setBody} multiline maxLength={4000} />
          <Button kind="ghost" title={t('Mesaj gönder')} disabled={!body.trim() || busy} loading={busy} style={{ alignSelf: 'flex-start' }} onPress={async () => {
            setErr(null); setBusy(true);
            try { await sendRequestMessage(req, body); setBody(''); await load(); } catch (e) { setErr(humanError(e)); } finally { setBusy(false); }
          }} />
        </>
      ) : null}
      <Err e={err} />
    </View>
  );
}
