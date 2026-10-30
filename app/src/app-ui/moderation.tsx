/* Kullanıcı içeriği güvenliği: bildir / engelle penceresi, engellenen kişiler listesi ve yönetici paneli bölümleri
   (Şikâyetler, Hatalar). Alan mantığı domain/moderation.js ve domain/admin.js'te. */
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { t, locale } from '../domain/i18n';
import { S } from '../domain/state';
import { P } from '../domain/logic';
import { humanError } from '../domain/backend';
import { REASONS, adminReports, closeReport, isBlocked, myBlocks, reasonLabel, refreshBlocks, reportContent, setBlocked } from '../domain/moderation';
import { clearErrors, deleteMessage, loadErrors } from '../domain/admin';
import { host } from '../domain/host';
import { Button, Chip, Field, Text } from '../ui/kit';
import { useColors } from '../ui/theme';
import { Card, Empty, H2, LI, List, Muted, Note, Row, Seg, Stack } from './blocks';
import { Area, Choice, Title, Toggle, useVals } from './forms';
import { useStore } from './hooks';

const when = (v: any) => (v ? new Date(v).toLocaleString(locale(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');

/** Bildir penceresi: bir mesaj (kind=message) ya da kişinin kendisi (kind=user). İsteğe bağlı olarak kişi engellenir. */
export function ReportSheet({ pid, kind = 'user', ref, user, name, snapshot, close }: {
  pid?: string; kind?: string; ref?: string; user?: string; name?: string; snapshot?: string; close: () => void;
}) {
  useStore();
  const c = useColors();
  const { v, set } = useVals({ reason: 'taciz', note: '' });
  const [block, setBlock] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const blocked = isBlocked(user || '');
  const send = async () => {
    setBusy(true); setErr('');
    try {
      await reportContent({ pid, kind, ref, user, reason: v.reason, note: v.note, snapshot });
      if (block && user && !blocked) await setBlocked(user, true, pid);
      host.notify({ title: t('Bildirimin alındı'), body: t('Ekibimiz 24 saat içinde inceler; gerekirse içeriği kaldırır ve hesabı askıya alır.'), icon: 'flag' });
      close();
    } catch (e) { setErr(humanError(e)); }
    setBusy(false);
  };
  return (
    <Stack>
      <Title>{kind === 'message' ? t('Mesajı bildir') : t('Kişiyi bildir')}</Title>
      {name ? <Muted>{name}</Muted> : null}
      {snapshot ? <Card><Text v="small" selectable>{snapshot}</Text></Card> : null}
      <Choice label={t('Neden?')} options={REASONS().map((r) => r.key)} v={v} set={set} k="reason" render={reasonLabel} />
      <Area label={t('Açıklama (isteğe bağlı)')} v={v} set={set} k="note" placeholder={t('Ne oldu? Ekibimiz yalnızca bu bildirim için okur.')} />
      {user && !blocked ? <Card gap={4}><Toggle on={block} onChange={setBlock} label={t('Bu kişiyi engelle: mesajlarını görmezsin ve ondan mesaj bildirimi almazsın.')} /></Card> : null}
      {err ? <Text v="small" color={c.badInk}>{err}</Text> : null}
      <Row>
        <Button kind="ghost" title={t('Vazgeç')} onPress={close} style={{ flex: 1 }} />
        <Button title={t('Bildir')} onPress={send} loading={busy} disabled={busy} style={{ flex: 1 }} />
      </Row>
      {user && blocked ? (
        <Button kind="quiet" block title={t('Engeli kaldır')} onPress={async () => { try { await setBlocked(user, false, pid); close(); } catch (e) { setErr(humanError(e)); } }} />
      ) : null}
      <Note>{t('Acil bir tehlike varsa önce 112’yi ara.')}</Note>
    </Stack>
  );
}

/** Ayarlar → Hesap: engellenen kişiler (engel kaldırılabilir). */
export function BlockedList() {
  useStore();
  useEffect(() => { refreshBlocks(); }, []);
  const list = myBlocks();
  if (!list.length) return null;
  // Engellenen kişinin adı, ortak mülkteki üyelik kaydından okunur.
  const nameOf = (uid: string) => {
    for (const id of S.order) {
      const p = P(id);
      if (p?.ownerId === uid) return p.landlord?.name;
      const tn = (p?.tenants || []).find((x: any) => x.id === uid);
      if (tn) return tn.name;
    }
    return t('Kullanıcı');
  };
  return (
    <Stack gap={8}>
      <H2>{t('Engellenen kişiler')}</H2>
      <List>
        {list.map((b: any, i: number) => (
          <LI key={b.blocked} last={i === list.length - 1} title={nameOf(b.blocked)} sub={when(b.created_at)}
            right={<Button kind="ghost" title={t('Engeli kaldır')} onPress={() => setBlocked(b.blocked, false).catch(() => {})} />} />
        ))}
      </List>
    </Stack>
  );
}

/* ---------------- yönetici paneli ---------------- */

export function AdminReports({ onCount }: { onCount?: (n: number) => void }) {
  const c = useColors();
  const [f, setF] = useState('open');
  const [rows, setRows] = useState<any[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = async () => {
    try { const d = await adminReports(); setRows(d); setErr(null); onCount?.(d.filter((r: any) => r.status === 'open').length); }
    catch (e) { setErr(humanError(e)); }
  };
  useEffect(() => { load(); }, []);
  const list = (rows || []).filter((r) => f === 'all' || r.status === f);
  return (
    <Stack>
      <Note>{t('Mağaza kuralı: bildirimler 24 saat içinde incelenir. Gerekirse mesajı sil, hesabı Kullanıcılar bölümünden askıya al.')}</Note>
      <Seg value={f} onChange={setF} options={[['open', t('Açık')], ['done', t('Kapatılan')], ['all', t('Hepsi')]]} />
      {err ? <Text v="small" color={c.badInk}>{err}</Text> : null}
      {rows && !list.length ? <Empty>{t('Şikâyet yok.')}</Empty> : null}
      {list.map((r) => <ReportCard key={r.id} r={r} reload={load} />)}
    </Stack>
  );
}

function ReportCard({ r, reload }: { r: any; reload: () => void }) {
  const c = useColors();
  const [res, setRes] = useState(r.resolution || '');
  const [msg, setMsg] = useState('');
  const done = async (text: string) => { try { await closeReport(r.id, text); reload(); } catch (e) { setMsg(humanError(e)); } };
  return (
    <Card gap={8}>
      <Row between wrap>
        <H2>{r.kind === 'message' ? t('Mesaj') : r.kind === 'photo' ? t('Fotoğraf') : r.kind === 'request' ? t('Talep') : t('Kişi')} · {reasonLabel(r.reason)}</H2>
        <Row gap={8}><Chip tone={r.status === 'open' ? 'warn' : 'ok'} label={r.status === 'open' ? t('Açık') : t('Kapatıldı')} /><Muted>{when(r.created_at)}</Muted></Row>
      </Row>
      <Muted>{t('Mülk')}: {r.property_id || '—'} · {t('Bildirilen')}: {r.reported_user || '—'} · {t('Bildiren')}: {r.reporter}</Muted>
      {r.snapshot ? <Card><Text v="small" selectable>{r.snapshot}</Text></Card> : null}
      {r.note ? <Text v="small" selectable>{r.note}</Text> : null}
      {r.status === 'open' ? (
        <>
          <Field label={t('Karar (bildirene iletilir)')} value={res} onChangeText={setRes} maxLength={500} />
          {msg ? <Text v="small" color={c.badInk}>{msg}</Text> : null}
          <Row wrap>
            {r.kind === 'message' && r.ref_id ? <Button kind="ghost" title={t('Mesajı sil')} onPress={async () => {
              if (!await host.ask({ title: t('Mesaj silinsin mi?'), body: t('Mesaj iki taraftan da kaldırılır; işlem kayda geçer.'), ok: t('Sil'), danger: true })) return;
              try { await deleteMessage(r.ref_id); await done(res || t('Mesaj kaldırıldı.')); } catch (e) { setMsg(humanError(e)); }
            }} /> : null}
            <Button title={t('Kapat')} onPress={() => done(res)} />
          </Row>
        </>
      ) : r.resolution ? <Muted>{t('Karar')}: {r.resolution}</Muted> : null}
    </Card>
  );
}

/** Uygulama hataları: aynı mesajlı kayıtlar tek satırda, sayısı ve son görülme zamanıyla. */
export function AdminErrors() {
  const c = useColors();
  const [rows, setRows] = useState<any[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const load = async () => { try { setRows(await loadErrors()); setErr(null); } catch (e) { setErr(humanError(e)); } };
  useEffect(() => { load(); }, []);
  const groups: Record<string, any> = {};
  (rows || []).forEach((r) => {
    const g = groups[r.message] = groups[r.message] || { message: r.message, n: 0, last: r.at, kinds: new Set(), routes: new Set(), platforms: new Set(), users: new Set(), sample: r };
    g.n++; g.kinds.add(r.kind); g.routes.add(r.route); g.platforms.add(r.platform + (r.version ? ' ' + r.version : '')); if (r.user_id) g.users.add(r.user_id);
  });
  const list = Object.values(groups).sort((a: any, b: any) => b.n - a.n);
  return (
    <Stack>
      <Muted>{t('Son 500 kayıt. Ağ kopması gibi beklenen hatalar kaydedilmez.')}</Muted>
      {err ? <Text v="small" color={c.badInk}>{err}</Text> : null}
      {rows && !list.length ? <Empty>{t('Hata kaydı yok.')}</Empty> : null}
      {list.map((g: any) => (
        <Card key={g.message} gap={6} onPress={() => setOpen(open === g.message ? null : g.message)}>
          <Row between wrap>
            <Text v="small" style={{ flex: 1, minWidth: 220 }} selectable>{g.message}</Text>
            <Row gap={8}><Chip tone="bad" label={t('{n} kez', { n: g.n })} /><Muted>{when(g.last)}</Muted></Row>
          </Row>
          <Muted>{[...g.kinds].join(', ')} · {[...g.routes].slice(0, 4).join(', ')} · {[...g.platforms].join(', ')} · {t('{n} kişi', { n: g.users.size })}</Muted>
          {open === g.message && g.sample.stack ? <View><Text v="small" muted selectable style={{ fontFamily: 'monospace' as any }}>{g.sample.stack}</Text></View> : null}
        </Card>
      ))}
      {list.length ? <Button kind="ghost" title={t('Kayıtları temizle')} onPress={async () => {
        if (!await host.ask({ title: t('Hata kayıtları silinsin mi?'), body: t('Düzeltmeyi yayınladıktan sonra temizlersen yeni hatalar kolayca görünür.'), ok: t('Temizle'), danger: true })) return;
        try { await clearErrors(); load(); } catch (e) { setErr(humanError(e)); }
      }} /> : null}
    </Stack>
  );
}
