/* Yönetici paneli → Müşteriler › Duyurular: uygulama içi kart / şerit, telefon bildirimi ve e-posta ile duyuru.
   Form + canlı önizleme (kart, şerit, bildirim, e-posta, İngilizce), kitle sayısı, "Bana test gönder", iki adımlı gönder onayı
   (21:00–09:00 arası telefon bildirimi için ayrıca uyarı; onaylanırsa yine gönderilir) ve gönderilenler tablosu. */
import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { t, locale } from '../domain/i18n';
import { humanError } from '../domain/admin';
import { host } from '../domain/host';
import { KINDS, ROLES, adminAnnouncementCancel, adminAnnouncementCount, adminAnnouncementSave, adminAnnouncementSend, adminAnnouncementTest,
  adminAnnouncements, kindLabel, parseWhen } from '../domain/announce';
import { Button, Chip, Field, PressScale, Text } from '../ui/kit';
import { Wordmark } from '../ui/Wordmark';
import { fonts, useBreakpoint, useColors } from '../ui/theme';
import { Card, Empty, H2, Label, Muted, Row, Seg, Stack } from './blocks';
import { Toggle } from './forms';

const EMPTY = { kind: 'info', view: 'card', title: '', body: '', title_en: '', body_en: '', cta: '', cta_en: '', url: '',
  audience: { roles: [] as string[], paid: 'all', sectors: [] as string[], platform: 'all', lang: 'all' },
  ch_app: true, ch_push: true, ch_email: false, start: '', end: '' };
const SECTORS = () => [['site', t('Site')], ['avm', t('AVM')], ['depo', t('Depo')], ['gyo', t('GYO')], ['emlak', t('Emlak ofisi')]];
const when = (v: any) => (v ? new Date(v).toLocaleString(locale(), { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
const fmtWhen = (v: any) => {
  if (!v) return '';
  const d = new Date(v), p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
};
const STATUS: Record<string, [string, 'ok' | 'warn' | 'neutral' | 'bad' | 'accent']> = {
  draft: ['Taslak', 'neutral'], scheduled: ['Planlandı', 'warn'], sending: ['Gönderiliyor', 'accent'], sent: ['Gönderildi', 'ok'], cancelled: ['Durduruldu', 'bad']
};

/** Çoklu seçim çipleri (kitle: rol, sektör). Hiçbiri seçili değilse "Herkes". */
function Multi({ all, value, onChange, options }: { all: string; value: string[]; onChange: (v: string[]) => void; options: string[][] }) {
  const c = useColors();
  const chip = (key: string, label: string, on: boolean, press: () => void) => (
    <PressScale key={key} onPress={press} accessibilityRole="checkbox" accessibilityState={{ checked: on }} scaleTo={0.95}
      style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: on ? c.ink : c.tile }}>
      <Text v="small" color={on ? c.bg : c.ink} style={{ fontFamily: fonts.bodyBold }}>{label}</Text>
    </PressScale>
  );
  return (
    <Row wrap gap={6}>
      {chip('__all', all, !value.length, () => onChange([]))}
      {options.map(([k, l]) => chip(k, l, value.includes(k), () => onChange(value.includes(k) ? value.filter((x) => x !== k) : [...value, k])))}
    </Row>
  );
}

/** Canlı önizleme: kart, şerit, telefon bildirimi, e-posta; İngilizce seçilirse EN metin. */
function Preview({ f }: { f: any }) {
  const c = useColors();
  const [mode, setMode] = useState('app');
  const [en, setEn] = useState(false);
  const title = (en && f.title_en) || f.title || t('Başlık');
  const body = (en && (f.body_en || f.body)) || f.body;
  const cta = (en && (f.cta_en || f.cta)) || f.cta;
  const dark = '#1D1A19';
  return (
    <Card>
      <Row between wrap>
        <Seg value={mode} onChange={setMode} options={[['app', f.view === 'banner' ? t('Şerit') : t('Pop-up')], ['push', t('Bildirim')], ['mail', t('E-posta')]]} />
        <Seg value={en ? 'en' : 'tr'} onChange={(v) => setEn(v === 'en')} options={[['tr', 'TR'], ['en', 'EN']]} />
      </Row>
      <View style={{ backgroundColor: c.tile, borderRadius: 22, padding: 14, gap: 10, minHeight: 200, justifyContent: 'center' }}>
        {mode === 'app' && f.view === 'card' ? (
          <View style={{ backgroundColor: c.surface, borderRadius: 22, overflow: 'hidden', alignSelf: 'center', width: '100%', maxWidth: 300 }}>
            <View style={{ backgroundColor: dark, padding: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Wordmark size={18} variant="cream" /><Text v="small" color="#FAF5F0">✕</Text>
            </View>
            <View style={{ padding: 14, gap: 6 }}>
              <View style={{ alignSelf: 'flex-start', backgroundColor: c.butter, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}><Text v="small" color={c.warnInk} style={{ fontSize: 11, fontFamily: fonts.bodyBold }}>{kindLabel(f.kind)}</Text></View>
              <Text v="body" style={{ fontFamily: fonts.bodyXBold }}>{title}</Text>
              {body ? <Text v="small" muted numberOfLines={4}>{body}</Text> : null}
              <View style={{ backgroundColor: c.accent, borderRadius: 999, paddingVertical: 8, alignItems: 'center', marginTop: 4 }}><Text v="small" color={c.accentInk} style={{ fontFamily: fonts.bodyBold }}>{cta || t('Tamam')}</Text></View>
            </View>
          </View>
        ) : mode === 'app' ? (
          <View style={{ backgroundColor: dark, borderRadius: 16, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ flex: 1 }}><Text v="small" color="#FAF5F0" style={{ fontFamily: fonts.bodyBold }}>{title}</Text>{body ? <Text v="small" color="#BDB1AB" numberOfLines={2}>{body}</Text> : null}</View>
            {f.url ? <View style={{ backgroundColor: c.butter, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}><Text v="small" color={c.warnInk}>{cta || t('Gör')}</Text></View> : null}
            <Text v="small" color="#FAF5F0">✕</Text>
          </View>
        ) : mode === 'push' ? (
          <View style={{ backgroundColor: c.surface, borderRadius: 18, padding: 12, gap: 2 }}>
            <Row between><Text v="small" muted style={{ fontSize: 11 }}>ANAHTAR</Text><Text v="small" muted style={{ fontSize: 11 }}>{t('şimdi')}</Text></Row>
            <Text v="small" style={{ fontFamily: fonts.bodyBold }}>{title}</Text>
            {body ? <Text v="small" muted numberOfLines={3}>{body}</Text> : null}
          </View>
        ) : (
          <View style={{ backgroundColor: c.surface, borderRadius: 18, overflow: 'hidden' }}>
            <View style={{ backgroundColor: dark, padding: 14, gap: 8 }}>
              <Wordmark size={18} variant="cream" />
              <View style={{ alignSelf: 'flex-start', backgroundColor: c.butter, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}><Text v="small" color={c.warnInk} style={{ fontSize: 11 }}>{kindLabel(f.kind)}</Text></View>
              <Text v="body" color="#FFF3EA" style={{ fontFamily: fonts.bodyXBold }}>{title}</Text>
            </View>
            <View style={{ padding: 14, gap: 6 }}>
              <Text v="small">{en ? 'Hi Ayşe,' : 'Merhaba Ayşe,'}</Text>
              {body ? <Text v="small" muted>{body}</Text> : null}
              {cta ? <View style={{ alignSelf: 'flex-start', backgroundColor: c.accent, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 8 }}><Text v="small" color={c.accentInk}>{cta}</Text></View> : null}
              <Text v="small" muted style={{ fontSize: 11 }}>{en ? 'Unsubscribe from announcements' : 'Duyuru e-postalarını alma'}</Text>
            </View>
          </View>
        )}
      </View>
      <Muted>{mode === 'push' ? t('Bildirime dokununca bağlantı açılır; bildirimi kapatanlara gitmez.') : mode === 'mail' ? t('Alıcının adıyla gider; duyuru e-postasını kapatanlara gitmez.') : t('Gönderince kullanıcının uygulamayı açtığında bir kez görünür.')}</Muted>
    </Card>
  );
}

/** Duyurular bölümü. */
export function Announcements() {
  const c = useColors();
  const { desktop } = useBreakpoint();
  const [f, setF] = useState<any>(EMPTY);
  const [id, setId] = useState<number | null>(null);
  const [count, setCount] = useState<number | null>(null);
  const [list, setList] = useState<any[] | null>(null);
  const [en, setEn] = useState(false);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState<[string, boolean] | null>(null);
  const up = (k: string, v: any) => setF((x: any) => ({ ...x, [k]: v }));
  const aud = (k: string, v: any) => setF((x: any) => ({ ...x, audience: { ...x.audience, [k]: v } }));
  const load = () => adminAnnouncements().then(setList).catch((e) => setMsg([humanError(e), false]));
  useEffect(() => { load(); }, []);
  const audKey = JSON.stringify(f.audience);
  useEffect(() => {
    let on = true;
    const h = setTimeout(() => adminAnnouncementCount(f.audience).then((n: number) => on && setCount(n)).catch(() => on && setCount(null)), 300);
    return () => { on = false; clearTimeout(h); };
  }, [audKey]);

  const urlOk = !f.url || /^(\/uygulama|https:\/\/)/.test(f.url.trim());
  const startOk = !f.start.trim() || !!parseWhen(f.start);
  const endOk = !f.end.trim() || !!parseWhen(f.end);
  const valid = f.title.trim().length >= 2 && (f.ch_app || f.ch_push || f.ch_email) && urlOk && startOk && endOk;
  const payload = () => ({ id, kind: f.kind, view: f.view, title: f.title.trim(), body: f.body, title_en: f.title_en.trim(), body_en: f.body_en,
    cta: f.cta.trim(), cta_en: f.cta_en.trim(), url: f.url.trim(), audience: f.audience, ch_app: f.ch_app, ch_push: f.ch_push, ch_email: f.ch_email,
    starts_at: parseWhen(f.start) || '', ends_at: parseWhen(f.end) || '' });
  const save = async () => { const x = await adminAnnouncementSave(payload()); setId(x); return x as number; };
  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key); setMsg(null);
    try { await fn(); } catch (e) { setMsg([humanError(e), false]); }
    setBusy('');
  };
  const reset = () => { setF(EMPTY); setId(null); setEn(false); };

  const send = () => run('send', async () => {
    const chans = [f.ch_app && t('uygulama içi'), f.ch_push && t('telefon bildirimi'), f.ch_email && t('e-posta')].filter(Boolean).join(', ');
    const later = parseWhen(f.start) && new Date(parseWhen(f.start)!).getTime() > Date.now() + 60000;
    if (!await host.ask({ title: later ? t('Duyuru planlansın mı?') : t('Duyuru gönderilsin mi?'),
      body: t('{n} kişiye {ch} ile gidecek. Gönderilen duyuru değiştirilemez.', { n: count ?? '—', ch: chans }) + (later ? ' ' + t('Başlangıç: {d}', { d: f.start }) : ''),
      ok: later ? t('Planla') : t('Gönder') })) return;
    const aid = await save();
    let r = await adminAnnouncementSend(aid);
    if (r?.quiet) {
      if (!await host.ask({ title: t('Gece saati: yine de gönderilsin mi?'),
        body: t('Telefon bildirimi 21:00–09:00 arasına denk geliyor; kullanıcıları uyandırabilir. Acil bir durum değilse sabah göndermeni öneririz.'),
        ok: t('Yine de gönder'), danger: true })) { setMsg([t('Gönderilmedi; duyuru taslak olarak kaydedildi.'), true]); load(); return; }
      r = await adminAnnouncementSend(aid, true);
    }
    setMsg([r?.scheduled ? t('Duyuru planlandı.') : t('Duyuru gönderiliyor: {n} kişi. Bildirim ve e-postalar dakikada bir gruplar halinde gider.', { n: r?.recipients ?? 0 }), true]);
    reset(); load();
  });

  const edit = (a: any) => {
    setId(a.id);
    setF({ ...EMPTY, ...a, audience: { ...EMPTY.audience, ...(a.audience || {}) }, start: fmtWhen(a.starts_at), end: fmtWhen(a.ends_at) });
    setEn(!!(a.title_en || a.body_en));
  };

  const form = (
    <Card>
      <Row between><H2>{id ? t('Taslak') : t('Yeni duyuru')}</H2>{id ? <Button kind="quiet" title={t('Yeni duyuru')} onPress={reset} /> : null}</Row>
      <Label>{t('Tür')}</Label>
      <Seg value={f.kind} onChange={(v) => up('kind', v)} options={KINDS() as [string, string][]} />
      <Label>{t('Görünüm')}</Label>
      <Seg value={f.view} onChange={(v) => up('view', v)} options={[['card', t('Ortada kart')], ['banner', t('Sayfa içi şerit')]]} />
      <Field label={t('Başlık')} value={f.title} onChangeText={(v) => up('title', v)} maxLength={120} />
      <Field label={t('Metin')} value={f.body} onChangeText={(v) => up('body', v)} maxLength={2000} multiline style={{ minHeight: 90 }} />
      <Row gap={10} wrap align="flex-start">
        <View style={{ flexGrow: 1, flexBasis: 160 }}><Field label={t('Düğme yazısı')} value={f.cta} onChangeText={(v) => up('cta', v)} maxLength={40} placeholder={t('ör. Rapora git')} /></View>
        <View style={{ flexGrow: 1, flexBasis: 200 }}><Field label={t('Düğme açılacak sayfa')} value={f.url} onChangeText={(v) => up('url', v)} autoCapitalize="none" placeholder="/uygulama/rapor"
          error={urlOk ? null : t('/uygulama ile ya da https:// ile başlamalı.')} /></View>
      </Row>
      <Toggle label={t('İngilizce metin ekle (dili İngilizce olanlara)')} on={en} onChange={setEn} />
      {en ? (
        <>
          <Field label={t('Başlık (İngilizce)')} value={f.title_en} onChangeText={(v) => up('title_en', v)} maxLength={120} />
          <Field label={t('Metin (İngilizce)')} value={f.body_en} onChangeText={(v) => up('body_en', v)} maxLength={2000} multiline style={{ minHeight: 70 }} />
          <Field label={t('Düğme yazısı (İngilizce)')} value={f.cta_en} onChangeText={(v) => up('cta_en', v)} maxLength={40} />
        </>
      ) : null}

      <Label>{t('Kime')}</Label>
      <Multi all={t('Herkes')} value={f.audience.roles} onChange={(v) => aud('roles', v)} options={ROLES()} />
      <Row wrap gap={8}>
        <Seg value={f.audience.paid} onChange={(v) => aud('paid', v)} options={[['all', t('Tüm paketler')], ['paid', t('Ücretli')], ['free', t('Deneme / ücretsiz')]]} />
        <Seg value={f.audience.platform} onChange={(v) => aud('platform', v)} options={[['all', t('Tüm platformlar')], ['ios', 'iOS'], ['android', 'Android'], ['web', t('Yalnız web')]]} />
        <Seg value={f.audience.lang} onChange={(v) => aud('lang', v)} options={[['all', t('Türkçe + İngilizce')], ['tr', t('Türkçe')], ['en', t('İngilizce')]]} />
      </Row>
      <Muted>{t('Sektör (kurum ve site sakinleri)')}</Muted>
      <Multi all={t('Tüm sektörler')} value={f.audience.sectors} onChange={(v) => aud('sectors', v)} options={SECTORS()} />
      <View style={{ backgroundColor: c.tile, borderRadius: 14, padding: 12, flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text v="small">{t('Bu duyuruyu görecek kişi')}</Text>
        <Text v="body" style={{ fontFamily: fonts.bodyXBold }}>{count == null ? '—' : count.toLocaleString(locale())}</Text>
      </View>

      <Label>{t('Nerede gösterilsin')}</Label>
      <Toggle label={t('Uygulama içi (kart ya da şerit)')} on={f.ch_app} onChange={(b) => up('ch_app', b)} />
      <Toggle label={t('Telefon bildirimi (bildirimi kapatanlara gitmez)')} on={f.ch_push} onChange={(b) => up('ch_push', b)} />
      <Toggle label={t('E-posta (duyuru e-postasını kapatanlara gitmez)')} on={f.ch_email} onChange={(b) => up('ch_email', b)} />
      <View style={{ backgroundColor: c.rose, borderRadius: 14, padding: 12 }}>
        <Text v="small">{t('Yalnız bilgilendirme amaçlı duyuru gönder: kampanya, indirim ve tanıtım ileti izni (İYS) gerektirir; bu panelden gönderilmez.')}</Text>
      </View>
      <Row gap={10} wrap align="flex-start">
        <View style={{ flexGrow: 1, flexBasis: 160 }}><Field label={t('Başlangıç (boş: hemen)')} value={f.start} onChangeText={(v) => up('start', v)} placeholder="27.11.2026 10:00" error={startOk ? null : t('GG.AA.YYYY SS:DD')} /></View>
        <View style={{ flexGrow: 1, flexBasis: 160 }}><Field label={t('Bitiş (boş: süresiz)')} value={f.end} onChangeText={(v) => up('end', v)} placeholder="10.12.2026" error={endOk ? null : t('GG.AA.YYYY SS:DD')} /></View>
      </Row>
      {msg ? <Text v="small" color={msg[1] ? c.okInk : c.badInk}>{msg[0]}</Text> : null}
      <Row wrap>
        <Button kind="ghost" title={t('Taslağı kaydet')} loading={busy === 'save'} disabled={!valid || !!busy} onPress={() => run('save', async () => { await save(); setMsg([t('Taslak kaydedildi.'), true]); load(); })} />
        <Button kind="ghost" title={t('Bana test gönder')} loading={busy === 'test'} disabled={!valid || !!busy} onPress={() => run('test', async () => {
          await adminAnnouncementTest(await save());
          setMsg([t('Test sana gönderildi: seçili kanallardan gelir; uygulamayı yeniden açınca kart/şerit görünür.'), true]); load();
        })} />
        <Button title={t('Gönder · {n} kişi', { n: count ?? '—' })} loading={busy === 'send'} disabled={!valid || !!busy || !count} onPress={send} />
      </Row>
    </Card>
  );

  const rows = useMemo(() => list || [], [list]);
  return (
    <Stack>
      {desktop ? <Row align="flex-start" gap={14}><View style={{ flex: 3 }}>{form}</View><View style={{ flex: 2 }}><Preview f={f} /></View></Row> : <>{form}<Preview f={f} /></>}
      <Card>
        <H2>{t('Gönderilenler')}</H2>
        {list === null ? <Muted>{t('Yükleniyor…')}</Muted> : !rows.length ? <Empty>{t('Henüz duyuru yok')}</Empty> : rows.map((a: any) => {
          const st = STATUS[a.status] || STATUS.draft;
          const roles = (a.audience?.roles || []).map((r: string) => (ROLES().find((x) => x[0] === r) || [r, r])[1]).join(', ') || t('Herkes');
          const ch = [a.ch_app && (a.view === 'banner' ? t('Şerit') : t('Kart')), a.ch_push && t('Bildirim'), a.ch_email && t('E-posta')].filter(Boolean).join(' · ');
          return (
            <View key={a.id} style={{ borderTopWidth: 1, borderColor: c.line, paddingTop: 10, gap: 4 }}>
              <Row between wrap>
                <Text v="body" style={{ fontFamily: fonts.bodyBold, flexShrink: 1 }}>{a.title}</Text>
                <Chip label={t(st[0])} tone={st[1]} />
              </Row>
              <Muted>{[kindLabel(a.kind), roles, ch, when(a.sent_at || a.starts_at || a.created_at)].join(' · ')}</Muted>
              {a.status !== 'draft' ? (
                <Text v="small">{t('Kitle {n} · ulaşan {r} · gören {s} · tıklayan {c}', { n: a.recipients ?? 0, r: a.reached ?? 0, s: a.seen ?? 0, c: a.clicked ?? 0 })}</Text>
              ) : null}
              <Row wrap>
                {a.status === 'draft' || a.status === 'scheduled' ? <Button kind="quiet" title={t('Düzenle')} onPress={() => edit(a)} /> : null}
                {['scheduled', 'sending', 'sent'].includes(a.status) ? <Button kind="quiet" title={t('Durdur')} onPress={async () => {
                  if (!await host.ask({ title: t('Duyuru durdurulsun mu?'), body: t('Kalan gönderim durur ve uygulama içinde artık görünmez.'), ok: t('Durdur'), danger: true })) return;
                  run('cancel', async () => { await adminAnnouncementCancel(a.id); load(); });
                }} /> : null}
              </Row>
            </View>
          );
        })}
      </Card>
    </Stack>
  );
}
