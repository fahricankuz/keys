/* Kurum panelinde kişi ekleme ve davet (alt sayfa "site-kisi"): malik ya da kiracı için ad soyad, telefon ve isteğe bağlı
   e-posta. "Davet gönder"e basınca e-posta girildiyse davet e-postası kendiliğinden gider (site-invite fonksiyonu) ve
   telefon girildiyse WhatsApp hazır mesajla (kayıt bağlantısı ve davet kodu) açılır. Bağlantı açılınca kayıt formunda
   ad, telefon ve e-posta dolu gelir (bkz. katil.tsx → site_invite_info). */
import { useState } from 'react';
import { Linking, Platform, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { t } from '../domain/i18n';
import { humanError, inviteLink } from '../domain/backend';
import { deleteResident, inviteState, markInvited, inviteText, inviteWa, saveResident, sendSiteInvite, unitLabel } from '../domain/site';
import { host } from '../domain/host';
import { Button, Field, PressScale, Text } from '../ui/kit';
import { fonts, radius, useColors } from '../ui/theme';
import { Muted, Note, Row, Stack } from './blocks';
import { Title } from './forms';
import { Pill } from './org';

const WA_GREEN = '#1F8F4E';
const okMail = (v: string) => !v.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

/** WhatsApp'ı açar. Web'de açılır pencere engellenmesin diye pencere tıklama anında açılıp sonra adrese yönlendirilir. */
function openWa(url: string, pre?: Window | null) {
  if (pre) { try { pre.location.href = url; return; } catch {} }
  Linking.openURL(url).catch(() => {});
}

export function SitePersonSheet({ oid, org, unit, commercial, person, manage, reload, close }:
  { oid: string; org: string; unit: any; commercial: boolean; person?: any; manage: boolean; reload: () => void; close: () => void }) {
  const c = useColors();
  const [p, setP] = useState<any>(person || null);
  const [f, setF] = useState({ role: 'kiraci', name: '', phone: '', email: '' });
  const [mailed, setMailed] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const label = unitLabel(unit);

  const submit = async () => {
    if (!okMail(f.email)) { setErr(t('E-posta adresini kontrol et.')); return; }
    setErr(null); setBusy(true);
    const pre = Platform.OS === 'web' && f.phone.trim() && typeof window !== 'undefined' ? window.open('', '_blank') : null;
    try {
      const row = await saveResident(oid, { ...f, unit_id: unit.id });
      const m = await sendSiteInvite(row);
      setMailed(row.email ? m : null);
      setP({ ...row, invited_at: new Date().toISOString() });
      if (row.phone) openWa(inviteWa(row, org, label, commercial), pre);
      else if (pre) pre.close();
      reload();
    } catch (e) { if (pre) pre.close(); setErr(humanError(e)); }
    setBusy(false);
  };

  if (!p) return (
    <Stack>
      <Title>{commercial ? t('Kiracı ekle') : t('Kişi ekle')}</Title>
      <Muted>{label}</Muted>
      {commercial ? null : (
        <Row gap={6}>
          <Pill label={t('Malik')} on={f.role === 'malik'} onPress={() => setF({ ...f, role: 'malik' })} />
          <Pill label={t('Kiracı')} on={f.role === 'kiraci'} onPress={() => setF({ ...f, role: 'kiraci' })} />
        </Row>
      )}
      <Field label={commercial ? t('Kiracı firma ya da ad soyad') : t('Ad soyad')} value={f.name} onChangeText={(v) => setF({ ...f, name: v })} maxLength={120} autoComplete="name" />
      <Field label={t('Telefon')} value={f.phone} onChangeText={(v) => setF({ ...f, phone: v })} keyboardType="phone-pad" maxLength={30} placeholder="05xx xxx xx xx" hint={t('Davet WhatsApp ile bu numaraya hazırlanır.')} />
      <Field label={t('E-posta (isteğe bağlı)')} value={f.email} onChangeText={(v) => setF({ ...f, email: v })} keyboardType="email-address" autoCapitalize="none" maxLength={200} hint={t('Girersen davet e-postası da gider.')} />
      {err ? <Text v="small" color={c.badInk}>{err}</Text> : null}
      <Button block title={t('Davet gönder')} loading={busy} disabled={!f.name.trim()} onPress={submit} />
      <Button block kind="quiet" title={t('Vazgeç')} onPress={close} />
    </Stack>
  );

  const st = inviteState(p);
  const text = inviteText(org, label, p.code, commercial);
  const link = inviteLink(p.code);
  return (
    <Stack>
      <Title>{st === 'linked' ? p.name : t('Davet hazır')}</Title>
      <Muted>{[label, p.role === 'malik' ? t('Malik') : t('Kiracı'), p.phone, p.email].filter(Boolean).join(' · ')}</Muted>
      {st === 'linked' ? <Note>{t('Hesabı bağlı; aidat, duyuru ve taleplerini anahtar’dan izliyor.')}</Note> : (
        <>
          {mailed === true ? <Note ok>{t('Davet e-postası {email} adresine gönderildi.', { email: p.email })}</Note>
            : mailed === false ? <Note warn>{t('Davet e-postası şu an gönderilemedi. WhatsApp ya da bağlantıyla gönderebilirsin.')}</Note>
            : !p.email ? <Muted>{t('E-posta girilmedi; daveti WhatsApp ya da bağlantıyla gönder.')}</Muted> : null}
          <View style={{ backgroundColor: c.surface, borderRadius: radius.md, borderWidth: 1, borderColor: c.line, padding: 16, alignItems: 'center', gap: 4 }}>
            <Text v="small" muted>{t('Davet kodu')}</Text>
            <Text v="h2" selectable style={{ letterSpacing: 4 }}>{p.code}</Text>
          </View>
          <PressScale onPress={() => { openWa(inviteWa(p, org, label, commercial)); if (!p.invited_at) markInvited(p.id).then(reload); }} accessibilityRole="button" scaleTo={0.98}
            style={{ minHeight: 44, borderRadius: radius.pill, backgroundColor: WA_GREEN, alignItems: 'center', justifyContent: 'center' }}>
            <Text v="small" color="#fff" style={{ fontFamily: fonts.bodyXBold, fontSize: 15 }}>{t('WhatsApp ile gönder')}</Text>
          </PressScale>
          {/* Dar ekranda alt alta: düğme yazısı ikinci satıra geçmez. */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            <Button kind="ghost" title={t('Bağlantıyı kopyala')} style={{ flexGrow: 1, flexBasis: 200 }} onPress={async () => {
              try { await Clipboard.setStringAsync(link); host.notify({ title: t('Kopyalandı'), body: t('Davet bağlantısı panoya alındı.'), icon: 'doc' }); } catch {}
            }} />
            {p.email ? <Button kind="ghost" title={t('E-postayı tekrar gönder')} style={{ flexGrow: 1, flexBasis: 200 }} onPress={async () => { setMailed(await sendSiteInvite(p)); reload(); }} /> : null}
          </View>
          <View style={{ backgroundColor: c.surface2, borderRadius: radius.md, padding: 12 }}><Text v="small" muted selectable>{text}</Text></View>
        </>
      )}
      {manage ? <Button kind="quiet" title={t('Kişiyi kaldır')} onPress={async () => {
        if (!(await host.ask({ title: t('{name} kaldırılsın mı?', { name: p.name || '—' }), body: st === 'linked' ? t('Hesabının bu kayıtla bağı kopar.') : t('Davet kodu geçersiz olur.'), ok: t('Kaldır'), danger: true }))) return;
        try { await deleteResident(p.id); reload(); close(); } catch (e) { setErr(humanError(e)); }
      }} style={{ alignSelf: 'flex-start' }} /> : null}
      {err ? <Text v="small" color={c.badInk}>{err}</Text> : null}
      <Button block kind="ghost" title={t('Tamam')} onPress={close} />
    </Stack>
  );
}

/** Toplu davet (alt sayfa "site-toplu-davet"): henüz davet edilmemiş herkes. E-postası olanlara davet e-postası tek seferde
    gider; yalnız telefonu olanlar için WhatsApp toplu gönderime izin vermediğinden "Sıradaki kişi" akışı: her dokunuşta bir
    sonraki kişinin hazır mesajı açılır ve kişi "davet gönderildi" olarak işaretlenir. */
export function SiteBulkInviteSheet({ org, commercial, people, reload, close }:
  { org: string; commercial: boolean; people: any[]; reload: () => void; close: () => void }) {
  const c = useColors();
  const withMail = people.filter((p) => p.email);
  const phoneOnly = people.filter((p) => !p.email && p.phone);
  const missing = people.filter((p) => !p.email && !p.phone);
  const [mailState, setMailState] = useState<'idle' | 'busy' | 'done'>('idle');
  const [mailed, setMailed] = useState({ ok: 0, fail: 0, n: 0 });
  const [next, setNext] = useState(0);

  const sendMails = async () => {
    setMailState('busy');
    let ok = 0, fail = 0, n = 0;
    for (const p of withMail) {
      const sent = await sendSiteInvite(p);
      // E-posta gitmese de kişide telefon varsa WhatsApp akışına düşer; burada yalnız sonucu sayarız.
      if (sent) ok++; else fail++;
      setMailed({ ok, fail, n: ++n });
    }
    setMailState('done');
    reload();
  };
  const waNext = async () => {
    const p = phoneOnly[next];
    if (!p) return;
    openWa(inviteWa(p, org, p.unitLabel, commercial));
    await markInvited(p.id);
    setNext(next + 1);
    if (next + 1 >= phoneOnly.length) reload();
  };
  const cur = phoneOnly[next];
  return (
    <Stack>
      <Title>{t('Toplu davet')}</Title>
      <Muted>{t('{n} kişi henüz davet edilmedi.', { n: people.length })}</Muted>

      <View style={{ gap: 8, backgroundColor: c.surface, borderRadius: radius.md, borderWidth: 1, borderColor: c.line, padding: 14 }}>
        <Text v="small" style={{ fontFamily: fonts.bodyXBold }}>{t('E-postası olan {n} kişi', { n: withMail.length })}</Text>
        <Muted>{t('Davet e-postası hepsine tek seferde gider; kayıt bağlantısı ve davet kodu içerir.')}</Muted>
        {mailState === 'idle' ? <Button title={t('{n} e-posta gönder', { n: withMail.length })} disabled={!withMail.length} onPress={sendMails} style={{ alignSelf: 'flex-start' }} />
          : <Text v="small" color={mailed.fail ? c.badInk : c.okInk}>{mailState === 'busy' ? t('Gönderiliyor… {n}/{m}', { n: mailed.n, m: withMail.length })
            : mailed.fail ? t('{a} e-posta gönderildi, {b} gönderilemedi. Gönderilemeyenleri kişinin satırından WhatsApp ile davet edebilirsin.', { a: mailed.ok, b: mailed.fail })
            : t('{a} e-posta gönderildi.', { a: mailed.ok })}</Text>}
      </View>

      <View style={{ gap: 8, backgroundColor: c.surface, borderRadius: radius.md, borderWidth: 1, borderColor: c.line, padding: 14 }}>
        <Text v="small" style={{ fontFamily: fonts.bodyXBold }}>{t('Yalnız telefonu olan {n} kişi', { n: phoneOnly.length })}</Text>
        <Muted>{t('WhatsApp toplu gönderime izin vermez: her dokunuşta sıradaki kişinin hazır mesajı açılır, sen gönderirsin.')}</Muted>
        {cur ? (
          <>
            <Muted>{t('Sıradaki ({n}/{m})', { n: next + 1, m: phoneOnly.length })}: {cur.name || '—'} · {cur.unitLabel} · {cur.phone}</Muted>
            <PressScale onPress={waNext} accessibilityRole="button" accessibilityLabel={t('{name} kişisine WhatsApp ile gönder', { name: cur.name || '—' })} scaleTo={0.98}
              style={{ minHeight: 48, borderRadius: radius.pill, backgroundColor: WA_GREEN, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18, alignSelf: 'flex-start' }}>
              <Text v="small" color="#fff" style={{ fontFamily: fonts.bodyXBold }}>{t('WhatsApp ile gönder: {name}', { name: cur.name || '—' })}</Text>
            </PressScale>
          </>
        ) : <Text v="small" color={c.okInk}>{phoneOnly.length ? t('Hepsine gönderildi.') : t('Bu grupta kimse yok.')}</Text>}
      </View>

      {missing.length ? (
        <Note warn>{t('{n} kişinin telefonu da e-postası da yok: {list}. Bu kişileri telefon ya da e-postasıyla yeniden eklersen davet edebilirsin.', { n: missing.length, list: missing.slice(0, 6).map((p) => (p.name || '—') + ' (' + p.unitLabel + ')').join(', ') + (missing.length > 6 ? '…' : '') })}</Note>
      ) : null}
      <Button block kind="ghost" title={t('Tamam')} onPress={() => { reload(); close(); }} />
    </Stack>
  );
}
