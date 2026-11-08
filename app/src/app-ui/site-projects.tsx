/* Site projeleri ve talep yazışması (migration site_projeleri, site_talep_yazisma).
   SiteProjects: yönetimin "Projeler" bölümü. Proje açılır, aşama aşama ilerletilir (Proje açıldı → Teklif alındı →
   Yapıma başlandı → Tamamlandı); her aşamada not ve fotoğraf eklenir, sakinlere aşamanın adıyla bildirim gider.
   Yazma "Site projeleri" yetkisiyle (master ve yetki verilen roller).
   ResidentProjects: sakinin "Sitem" ekranındaki projeler (salt okunur: aşama çizgisi, fotoğraflı güncellemeler, bütçe).
   RequestThread: talep kartının altında yönetim ile talebi açan sakin arasındaki yazışma. */
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { t } from '../domain/i18n';
import { humanError } from '../domain/backend';
import {
  PROJECT_STATUS, projectSteps, projectStepAt, projectStatusLabel, projectLabel, projectKind, projectSpentPct, nextStage, applyBudgetAidat, approveWithoutVote, budgetTotal, loadProjects, saveProject, deleteProject,
  addProjectUpdate, deleteProjectUpdate, loadRequestMessages, sendRequestMessage, isCommercial
} from '../domain/site';
import { tl, fmtFull, parse } from '../domain/util';
import { Button, Chip, Field, Text } from '../ui/kit';
import { fonts, radius, useColors } from '../ui/theme';
import { Card, Empty, H2, Hero, Label, Muted, Row, Stack, Thumbs } from './blocks';
import { DateField, FileField, MoneyField, useVals } from './forms';
import { Picked } from './media';
import { Pill } from './org';
import { MediaList, MediaPicker } from './site-media';
import { CostsBlock, OpenVoteForm, VoteBlock } from './site-project-extras';
import { BudgetEditor, KalemCard, PayCard, SupplementForm, methodLabel } from './site-isletme';

const day = (v?: string) => (v ? fmtFull(parse(String(v).slice(0, 10))) : '—');
const photoSrc = (p: string) => 'sb:' + p;
const toneOf = (s: string) => (s === 'tamam' || s === 'onay' ? 'ok' : s === 'askida' || s === 'oylama' ? 'warn' : s === 'red' ? 'bad' : 'accent') as 'ok' | 'warn' | 'accent' | 'bad';
/** Aşamaya göre güncelleme formundaki örnek metin. */
const HINT = (s: string | null) => ({
  teklif: t('ör. Üç firmadan teklif alındı; en uygunu Örnek Yapı, ₺420.000'),
  yapim: t('ör. İskele kuruldu, A blokta işe başlandı'),
  tamam: t('ör. Cephe boyası tamamlandı, iskele söküldü'),
  askida: t('ör. Hava koşulları nedeniyle iki hafta ara verildi')
} as Record<string, string>)[s || ''] || t('ör. A blok cephesi zımparalandı');

function Err({ e }: { e: string | null }) {
  const c = useColors();
  return e ? <Text v="small" color={c.badInk}>{e}</Text> : null;
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

/** Proje açma ve düzenleme formu (aşama burada değişmez; yeni proje "Proje açıldı"da başlar). */
function ProjectForm({ oid, p, done }: { oid: string; p?: any; done: (saved: boolean) => void }) {
  const { v, set } = useVals({
    title: p?.title || '', body: p?.body || '', progress: p ? String(p.progress ?? 0) : '0',
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
      <Row gap={10} wrap align="flex-end">
        {p ? <View style={{ flexGrow: 1, flexBasis: 120 }}><MoneyField label={t('İlerleme (%)')} decimals={0} value={v.progress} onChange={(x) => set('progress', String(Math.min(100, Number(x) || 0)))} /></View> : null}
        <View style={{ flexGrow: 1, flexBasis: 160 }}><MoneyField label={t('Bütçe (₺, isteğe bağlı)')} value={v.budget} onChange={(x) => set('budget', x)} /></View>
        <View style={{ flexGrow: 1, flexBasis: 160 }}><MoneyField label={t('Harcanan (₺, isteğe bağlı)')} value={v.spent} onChange={(x) => set('spent', x)} /></View>
      </Row>
      <Row gap={10} wrap align="flex-end">
        <View style={{ flexGrow: 1, flexBasis: 180 }}><DateField label={t('Başlangıç')} v={v} set={set} k="start_on" /></View>
        <View style={{ flexGrow: 1, flexBasis: 180 }}><DateField label={t('Planlanan bitiş')} v={v} set={set} k="end_on" /></View>
      </Row>
      {!datesOk ? <Err e={t('Bitiş tarihi başlangıçtan önce olamaz.')} /> : null}
      <FileField label={p?.cover ? t('Kapak fotoğrafını değiştir (isteğe bağlı)') : t('Kapak fotoğrafı (isteğe bağlı)')} files={cover} setFiles={setCover} kind="photos" max={1} camera />
      <Muted>{p ? t('Aşamayı buradan değil, "Sonraki aşama" ile ilerlet; böylece sakinlere bildirim gider.') : t('Proje "Proje açıldı" aşamasında başlar; sitenin bütün sakinlerine bildirim gider.')}</Muted>
      <Row wrap gap={8}>
        <Button title={p ? t('Kaydet') : t('Projeyi aç')} disabled={!valid || busy} loading={busy} onPress={async () => {
          setErr(null); setBusy(true);
          try { await saveProject(oid, { ...v, id: p?.id }, cover[0] || null); done(true); } catch (e) { setErr(humanError(e)); } finally { setBusy(false); }
        }} />
        <Button kind="quiet" title={t('Vazgeç')} onPress={() => done(false)} />
      </Row>
      <Err e={err} />
    </Card>
  );
}

/** Aşama ilerletme ya da aynı aşamada güncelleme: not, fotoğraflar, (istersen) yüzde. stage: seçili gelen aşama. */
function UpdateForm({ oid, p, stage, done }: { oid: string; p: any; stage: string | null; done: (saved: boolean) => void }) {
  const [body, setBody] = useState('');
  const [status, setStatus] = useState<string | null>(stage);
  const [progress, setProgress] = useState('');
  const [photos, setPhotos] = useState<Picked[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const changes = !!status && status !== p.status;
  const valid = body.trim().length > 0 || photos.length > 0 || changes || progress !== '';
  return (
    <Card gap={10} style={{ borderWidth: 0 }}>
      <Text v="body" style={{ fontFamily: fonts.bodyXBold }}>{changes ? t('Aşamayı ilerlet: {s}', { s: projectStatusLabel(status) }) : t('Güncelleme ekle')}</Text>
      <Label>{t('Aşama')}</Label>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {PROJECT_STATUS().filter((s) => ['teklif', 'yapim', 'tamam', 'askida'].includes(s.key)).map((s) => <Pill key={s.key} label={s.label} on={status === s.key} onPress={() => setStatus(status === s.key ? null : s.key)} />)}
      </View>
      <Field label={t('Ne yapıldı?')} value={body} onChangeText={setBody} multiline maxLength={4000} placeholder={HINT(status)} />
      <FileField label={status === 'teklif' ? t('Teklif belgeleri ya da fotoğraflar (en çok 12)') : t('Fotoğraflar (en çok 12)')} files={photos} setFiles={setPhotos} kind="photos" max={12} camera />
      {status !== 'tamam' ? <View style={{ maxWidth: 220 }}><MoneyField label={t('Yeni ilerleme (%, isteğe bağlı)')} decimals={0} value={progress} placeholder={String(p.progress ?? 0)} onChange={(x) => setProgress(x === '' ? '' : String(Math.min(100, Number(x) || 0)))} /></View> : null}
      <Muted>{changes ? t('Sakinlere "{title}: {stage}" bildirimi gider.', { title: p.title, stage: projectStatusLabel(status) }) : t('Güncelleme sitenin bütün sakinlerine bildirim olarak gider.')}</Muted>
      <Row wrap gap={8}>
        <Button title={changes ? t('Aşamayı ilerlet ve paylaş') : t('Paylaş')} disabled={!valid || busy} loading={busy} onPress={async () => {
          setErr(null); setBusy(true);
          try { await addProjectUpdate(oid, p.id, { body, status: changes ? status : null, progress: progress === '' ? null : progress, photos }); done(true); }
          catch (e) { setErr(humanError(e)); } finally { setBusy(false); }
        }} />
        <Button kind="quiet" title={t('Vazgeç')} onPress={() => done(false)} />
      </Row>
      <Err e={err} />
    </Card>
  );
}

const KIND_LABEL = (p: any) => ({ proje: t('Proje'), isletme: t('İşletme projesi · {y}', { y: p.year }), ek: t('Ek ödenek · {y}', { y: p.year }) } as Record<string, string>)[projectKind(p)];
const toneOf2 = (p: any) => (['tamam', 'onay'].includes(p.status) ? 'ok' : p.status === 'red' ? 'bad' : ['askida', 'oylama'].includes(p.status) ? 'warn' : p.status === 'acildi' && projectKind(p) !== 'proje' ? 'neutral' : 'accent') as any;

/** Koyu özet kartı: tür, ad, aşama, dört ölçü ve aşama çizgisi (önizleme tasarımı). */
function ProjectHero({ p, kpis }: { p: any; kpis: [string, string][] }) {
  const c = useColors();
  const steps = projectSteps(p), at = projectStepAt(p), bad = p.status === 'red';
  return (
    <Hero gap={14}>
      <Row between wrap align="flex-start">
        <View style={{ flex: 1, minWidth: 180, gap: 4 }}>
          <Label onDark>{KIND_LABEL(p)}</Label>
          <Text v="h3" color="#fff">{p.title}</Text>
        </View>
        <Chip tone={toneOf2(p)} label={projectLabel(p)} />
      </Row>
      {p.body ? <Muted onDark>{p.body}</Muted> : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {kpis.map(([l, v]) => (
          <View key={l} style={{ flexGrow: 1, flexBasis: 130, gap: 2, padding: 10, borderRadius: radius.md, backgroundColor: 'rgba(255,255,255,0.08)' }}>
            <Label onDark>{l}</Label>
            <Text v="body" color="#fff" style={{ fontFamily: fonts.bodyXBold, fontSize: 18 }}>{v}</Text>
          </View>
        ))}
      </View>
      <View accessibilityLabel={t('Aşama: {s}', { s: projectLabel(p) })} style={{ flexDirection: 'row', gap: 6 }}>
        {steps.map((k, i) => (
          <View key={k} style={{ flex: 1, gap: 6 }}>
            <View style={{ height: 5, borderRadius: 3, backgroundColor: i < at ? c.accent : i === at ? (bad ? c.badInk : '#fff') : 'rgba(255,255,255,0.2)' }} />
            <Text v="small" color={i <= at ? '#fff' : 'rgba(255,255,255,0.55)'} style={{ fontFamily: i === at ? fonts.bodyXBold : fonts.body, fontSize: steps.length > 4 ? 11 : 12 }}>{projectLabel(p, k)}</Text>
          </View>
        ))}
      </View>
    </Hero>
  );
}

/** Proje: bütçe ve harcama çubuğu; dikey çizgi seçilen teklifi gösterir. */
function SpendCard({ p, chosen }: { p: any; chosen?: any }) {
  const c = useColors();
  const budget = Number(p.budget) || 0, spent = Number(p.spent) || 0;
  if (!(budget > 0)) return null;
  const pct = Math.min(100, (spent / budget) * 100), tick = chosen ? Math.min(100, (Number(chosen.amount) / budget) * 100) : null;
  return (
    <Card gap={10}>
      <H2>{t('Bütçe ve harcama')}</H2>
      <View style={{ height: 14, borderRadius: 7, backgroundColor: c.surface2, overflow: 'hidden' }} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(pct) }}>
        <View style={{ width: `${pct}%`, height: 14, backgroundColor: spent > budget ? c.badInk : c.accent }} />
        {tick != null ? <View style={{ position: 'absolute', left: `${tick}%`, top: 0, bottom: 0, width: 2, backgroundColor: c.ink }} /> : null}
      </View>
      <Row wrap gap={16}>
        {[[t('Harcanan'), tl(spent)], chosen ? [t('Seçilen teklif'), tl(chosen.amount)] : null, [t('Kalan bütçe'), tl(Math.max(0, budget - spent))]].filter(Boolean).map((x: any) => (
          <View key={x[0]}><Muted>{x[0]}</Muted><Text v="body" style={{ fontFamily: fonts.bodyXBold }}>{x[1]}</Text></View>
        ))}
      </Row>
    </Card>
  );
}

type Ctx = { units?: any[]; expenses?: any[]; budget?: any; mine?: any[] };

/** Proje kartı (üç tür): koyu özet, oylama, kalem ya da bütçe-harcama kartları, yönetici işlemleri, proje akışı. */
function ProjectCard({ p, updates, oid, manage, reload, costs = [], info, votes = [], ctx = {} }: { p: any; updates: any[]; oid?: string; manage?: boolean; reload?: () => void; costs?: any[]; info?: any; votes?: any[]; ctx?: Ctx }) {
  const c = useColors();
  const kind = projectKind(p);
  const [mode, setMode] = useState<'view' | 'edit' | 'update' | 'vote' | 'supp'>('view');
  const [stage, setStage] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const next = nextStage(p.status, p);
  const shown = all ? updates : updates.slice(0, 4);
  const done = (ok: boolean) => { setMode('view'); if (ok && reload) reload(); };
  const run = async (f: () => Promise<any>, ok?: string) => { setErr(null); setMsg(null); setBusy(true); try { await f(); if (ok) setMsg(ok); reload && reload(); } catch (e) { setErr(humanError(e)); } finally { setBusy(false); } };
  const oidv = oid || p.org_id;
  if (mode === 'edit' && oid) return kind === 'isletme'
    ? <BudgetEditor oid={oid} year={p.year} saved={ctx.budget} done={done} />
    : <ProjectForm oid={oid} p={p} done={done} />;

  const items = kind === 'isletme' ? (ctx.budget?.items || []) : [];
  const spentOf = ctx.expenses && p.status !== 'acildi' && p.status !== 'oylama' && p.status !== 'red'
    ? (cat: string) => ctx.expenses!.filter((e: any) => String(e.spent_on).startsWith(String(p.year)) && String(e.cat).toLocaleLowerCase('tr') === String(cat).toLocaleLowerCase('tr')).reduce((a: number, e: any) => a + Number(e.amount), 0) : undefined;
  const spentAll = spentOf ? items.reduce((a: number, i: any) => a + spentOf(i.cat), 0) : null;
  const chosen = costs.find((x: any) => x.kind === 'teklif' && x.chosen);
  const kpis: [string, string][] = kind === 'isletme'
    ? [[t('Yıllık öngörü'), tl(p.budget || 0)], [t('Gerçekleşen'), spentAll != null ? tl(spentAll) : '—'], [t('Kalan'), spentAll != null ? tl(Math.max(0, Number(p.budget || 0) - spentAll)) : '—'], [t('Aylık aidat toplamı'), tl((Number(p.budget) || 0) / 12)]]
    : kind === 'ek'
    ? [[t('Ek tutar'), tl(p.budget || 0)], [t('Gider kalemi'), p.cat || '—'], [t('Yıl'), String(p.year)]]
    : [[t('Onaylanan bütçe'), Number(p.budget) > 0 ? tl(p.budget) : '—'], [t('Seçilen teklif'), chosen ? tl(chosen.amount) : '—'], [t('Harcanan'), p.spent != null ? tl(p.spent) : '—'], [t('İlerleme'), '%' + (p.progress || 0)]];
  const canAidat = manage && kind === 'isletme' && ctx.units && ctx.budget && ['onay', 'yapim'].includes(p.status);
  return (
    <Stack gap={10}>
      <ProjectHero p={p} kpis={kpis} />
      {p.cover ? <Thumbs srcs={[photoSrc(p.cover)]} size={160} /> : null}
      {p.poll_id ? <VoteBlock p={p} info={info} myVotes={votes} manage={!!manage} reload={() => reload && reload()} /> : null}
      {kind === 'isletme' && p.status === 'onay' ? <Card gap={4} style={{ backgroundColor: c.okBg }}><Text v="small" color={c.okInk}>{t('İşletme projesi onaylandı. Yönetim daire aidatlarını güncelleyince yürürlüğe girer.')}</Text></Card> : null}
      {kind === 'proje' ? <SpendCard p={p} chosen={chosen} /> : null}
      {kind === 'proje' ? <CostsBlock oid={oidv} p={p} costs={costs} manage={!!manage} reload={() => reload && reload()} /> : null}
      {kind === 'isletme' ? <KalemCard items={items} spentOf={spentOf} /> : null}
      {kind === 'isletme' && ctx.budget && !['acildi', 'oylama', 'red'].includes(p.status) ? (
        manage && ctx.units ? <PayCard budget={ctx.budget} units={ctx.units} /> : ctx.mine && ctx.mine.length ? <PayCard budget={ctx.budget} units={[]} mine={ctx.mine} /> : null
      ) : null}
      {kind === 'ek' ? <Card gap={4}><Muted>{t('Kabul edilirse {c} kaleminin yıllık tutarına {v} eklenir.', { c: p.cat, v: tl(p.budget || 0) })}</Muted></Card> : null}
      {manage && oid ? (
        <Card gap={10} style={{ borderStyle: 'dashed', borderColor: c.accent, borderWidth: 2 }}>
          <Label accent>{t('Yönetici işlemleri')}</Label>
          {mode === 'vote' ? <OpenVoteForm p={p} done={done} />
            : mode === 'update' ? <UpdateForm oid={oid} p={p} stage={stage} done={done} />
            : mode === 'supp' ? <SupplementForm oid={oid} parent={p} done={done} />
            : (
              <Row wrap gap={8}>
                {next ? <Button title={t('Sonraki aşama: {s}', { s: projectLabel(p, next) })} onPress={() => { setStage(next); setMode('update'); }} /> : null}
                {['acildi', 'teklif', 'red'].includes(p.status) && (kind === 'proje' || Number(p.budget) > 0) ? <Button kind={kind === 'proje' ? 'ghost' : 'primary'} title={t('Oylamaya sun')} onPress={() => setMode('vote')} /> : null}
                {kind === 'isletme' && ['acildi', 'red'].includes(p.status) ? <Button kind="ghost" title={t('Kalemleri düzenle')} onPress={() => setMode('edit')} /> : null}
                {kind === 'isletme' && ['acildi', 'red'].includes(p.status) && Number(p.budget) > 0 ? <Button kind="ghost" title={t('Genel kurulda onaylandı olarak işaretle')} disabled={busy} onPress={() => run(() => approveWithoutVote(oid, p.id))} /> : null}
                {canAidat && p.status === 'onay' ? <Button title={t('Daire aidatlarını güncelle ve yürürlüğe al')} disabled={busy} loading={busy}
                  onPress={() => run(async () => { const n = await applyBudgetAidat(oid, ctx.units!, ctx.budget); await addProjectUpdate(oid, p.id, { body: t('Daire aidatları işletme projesine göre güncellendi ({n} daire).', { n }), status: 'yapim' }); }, t('Aidatlar güncellendi; işletme projesi yürürlükte.'))} /> : null}
                {canAidat && p.status === 'yapim' ? <Button kind="ghost" title={t('Daire aidatlarını yeniden hesapla')} disabled={busy}
                  onPress={() => run(async () => { await applyBudgetAidat(oid, ctx.units!, ctx.budget); }, t('Dairelerin aylık aidatı işletme projesine göre güncellendi.'))} /> : null}
                {kind === 'isletme' && p.status === 'yapim' ? <Button kind="ghost" title={t('Ek ödenek (yıl ortası ek maliyet)')} onPress={() => setMode('supp')} /> : null}
                {kind === 'isletme' && p.status === 'yapim' ? <ConfirmDelete label={t('Yılı kapat')} question={t('Yıl kapatılsın mı?')} onConfirm={() => run(() => addProjectUpdate(oid, p.id, { body: t('Yıl kapandı.'), status: 'tamam' }))} /> : null}
                {kind !== 'ek' ? <Button kind="ghost" title={t('Güncelleme ekle')} onPress={() => { setStage(null); setMode('update'); }} /> : null}
                {kind === 'proje' ? <Button kind="ghost" title={t('Düzenle')} onPress={() => setMode('edit')} /> : null}
                {kind !== 'isletme' && ['acildi', 'red'].includes(p.status) || kind === 'proje' ? <ConfirmDelete label={kind === 'ek' ? t('Ek ödeneği sil') : t('Projeyi sil')} question={t('Proje ve bütün güncellemeleri silinsin mi?')} onConfirm={() => run(() => deleteProject(p.id))} /> : null}
              </Row>
            )}
          {msg ? <Text v="small" color={c.okInk}>{msg}</Text> : null}
        </Card>
      ) : null}
      <Card gap={10}>
        <H2>{t('Proje akışı')}</H2>
        {updates.length ? (
          <View style={{ gap: 12, borderLeftWidth: 2, borderColor: c.line, paddingLeft: 12 }}>
            {shown.map((u: any) => (
              <View key={u.id} style={{ gap: 6 }}>
                <Row wrap gap={6}>
                  <Label>{day(u.created_at)}</Label>
                  {u.status ? <Chip tone={toneOf(u.status)} label={projectLabel(p, u.status)} /> : null}
                  {u.progress != null ? <Chip label={'%' + u.progress} /> : null}
                </Row>
                {u.body ? <Text v="small">{u.body}</Text> : null}
                <Thumbs srcs={(u.photos || []).map(photoSrc)} size={96} />
                {manage ? <ConfirmDelete label={t('Güncellemeyi sil')} question={t('Bu güncelleme silinsin mi?')} onConfirm={async () => { setErr(null); try { await deleteProjectUpdate(u.id); reload && reload(); } catch (e) { setErr(humanError(e)); } }} /> : null}
              </View>
            ))}
            {updates.length > 4 ? <Button kind="quiet" title={all ? t('Daha az göster') : t('Tüm güncellemeler ({n})', { n: updates.length })} onPress={() => setAll(!all)} style={{ alignSelf: 'flex-start' }} /> : null}
          </View>
        ) : <Muted>{t('Henüz güncelleme yok.')}</Muted>}
      </Card>
      <Err e={err} />
    </Stack>
  );
}

/** Yönetim: "Projeler" bölümü (işletme projesi, projeler ve ek ödenekler tek yerde). d: yönetim verisi (daireler, giderler); reloadAll: yönetim verisini tazeler. */
export function SiteProjects({ oid, can, d: admin, reloadAll }: { oid: string; can: (p: string) => boolean; d?: any; reloadAll?: () => void }) {
  const [d, setD] = useState<any>(null);
  const [adding, setAdding] = useState<null | 'proje' | number>(null);
  const [filter, setFilter] = useState('open');
  const load = useCallback(async () => { setD(await loadProjects([oid])); }, [oid]);
  useEffect(() => { load().catch(() => setD({ projects: [], updates: [], costs: [], polls: {}, votes: [], budgets: [] })); }, [load]);
  const reload = () => { load().catch(() => {}); if (reloadAll) reloadAll(); };
  const manage = can('projects.manage');
  const thisYear = new Date().getFullYear();
  const have = new Set((d?.projects || []).filter((p: any) => projectKind(p) === 'isletme').map((p: any) => Number(p.year)));
  const list = (d?.projects || []).filter((p: any) => filter === 'all' || (filter === 'done' ? p.status === 'tamam' : filter === 'isl' ? projectKind(p) === 'isletme' : p.status !== 'tamam'))
    .sort((a: any, b: any) => (projectKind(a) === 'isletme' ? 0 : 1) - (projectKind(b) === 'isletme' ? 0 : 1));
  const canBudget = can('charges.manage');
  return (
    <Stack>
      <Muted>{t('Yıllık işletme projesi, onarım ve yatırım projeleri ve ek ödenekler burada tek akışla yürür: hazırla, oylamaya sun, onaylanınca uygula, ilerlemeyi ve harcamayı sakinlerle paylaş.')}</Muted>
      {adding === 'proje' ? <ProjectForm oid={oid} done={(ok) => { setAdding(null); if (ok) reload(); }} />
        : typeof adding === 'number' ? <BudgetEditor oid={oid} year={adding} done={(ok) => { setAdding(null); if (ok) reload(); }} />
        : <Row wrap gap={8}>
            {manage ? <Button title={t('Yeni proje')} onPress={() => setAdding('proje')} /> : null}
            {canBudget ? [thisYear, thisYear + 1].filter((y) => !have.has(y)).map((y) => <Button key={y} kind="ghost" title={t('{y} işletme projesi aç', { y })} onPress={() => setAdding(y)} />) : null}
          </Row>}
      {d?.projects?.length ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {[['open', t('Süren')], ['isl', t('İşletme projesi')], ['done', t('Tamamlanan')], ['all', t('Tümü')]].map(([k, l]) => <Pill key={k} label={l} on={filter === k} onPress={() => setFilter(k)} />)}
        </View>
      ) : null}
      {!d ? null : list.length ? list.map((p: any) => (
        <ProjectCard key={p.id} p={p} updates={d.updates.filter((u: any) => u.project_id === p.id)} costs={d.costs.filter((x: any) => x.project_id === p.id)}
          info={d.polls[p.poll_id]} votes={d.votes} oid={oid} manage={manage} reload={reload}
          ctx={{ units: admin?.units, expenses: admin?.expenses, budget: (d.budgets || []).find((b: any) => Number(b.year) === Number(p.year)) }} />
      )) : <Empty>{d.projects.length ? t('Bu filtrede proje yok.') : manage ? t('Henüz proje yok. İlk projeyi ekleyerek sakinlerle paylaşabilirsin.') : t('Henüz proje yok.')}</Empty>}
    </Stack>
  );
}

/** Sakin: "Sitem" ekranında sitenin işletme projesi ve projeleri (yalnız site; AVM/depo kiracısında gösterilmez). */
export function ResidentProjects({ units }: { units: any[] }) {
  const ids = [...new Set(units.filter((u: any) => !isCommercial(u.sector)).map((u: any) => u.org_id))] as string[];
  const key = ids.join();
  const [d, setD] = useState<any>(null);
  const load = useCallback(() => { loadProjects(ids).then(setD).catch(() => setD(null)); }, [key]);
  useEffect(() => { load(); }, [load]);
  if (!d?.projects?.length) return null;
  const many = ids.length > 1;
  const list = [...d.projects].sort((a: any, b: any) => (projectKind(a) === 'isletme' ? 0 : 1) - (projectKind(b) === 'isletme' ? 0 : 1));
  return (
    <Stack gap={14}>
      <H2>{t('Site projeleri')}</H2>
      {list.map((p: any) => (
        <View key={p.id} style={{ gap: 4 }}>
          {many ? <Label>{units.find((u: any) => u.org_id === p.org_id)?.org}</Label> : null}
          <ProjectCard p={p} updates={d.updates.filter((u: any) => u.project_id === p.id)} costs={d.costs.filter((x: any) => x.project_id === p.id)} info={d.polls[p.poll_id]} votes={d.votes} reload={load}
            ctx={{ budget: (d.budgets || []).find((b: any) => b.org_id === p.org_id && Number(b.year) === Number(p.year)), mine: units.filter((u: any) => u.org_id === p.org_id) }} />
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
  const [files, setFiles] = useState<Picked[]>([]);
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
          {m.body ? <Text v="small">{m.body}</Text> : null}
          <MediaList paths={m.media} />
        </View>
      ))}
      {canWrite ? (
        <>
          <Field label={mgmt ? t('Sakine yaz') : t('Yönetime yaz')} value={body} onChangeText={setBody} multiline maxLength={4000} />
          <MediaPicker files={files} setFiles={setFiles} />
          <Button kind="ghost" title={t('Mesaj gönder')} disabled={(!body.trim() && !files.length) || busy} loading={busy} style={{ alignSelf: 'flex-start' }} onPress={async () => {
            setErr(null); setBusy(true);
            try { await sendRequestMessage(req, body, files); setBody(''); setFiles([]); await load(); } catch (e) { setErr(humanError(e)); } finally { setBusy(false); }
          }} />
        </>
      ) : null}
      <Err e={err} />
    </View>
  );
}
