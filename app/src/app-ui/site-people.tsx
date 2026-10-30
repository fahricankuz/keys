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
          {mailed === true ? <Note>{t('Davet e-postası {email} adresine gönderildi.', { email: p.email })}</Note>
            : mailed === false ? <Note warn>{t('Davet e-postası şu an gönderilemedi. WhatsApp ya da bağlantıyla gönderebilirsin.')}</Note>
            : !p.email ? <Muted>{t('E-posta girilmedi; daveti WhatsApp ya da bağlantıyla gönder.')}</Muted> : null}
          <View style={{ backgroundColor: c.surface, borderRadius: radius.md, borderWidth: 1, borderColor: c.line, padding: 16, alignItems: 'center', gap: 4 }}>
            <Text v="small" muted>{t('Davet kodu')}</Text>
            <Text v="h2" selectable style={{ letterSpacing: 4 }}>{p.code}</Text>
          </View>
          <PressScale onPress={() => { openWa(inviteWa(p, org, label, commercial)); if (!p.invited_at) markInvited(p.id).then(reload); }} accessibilityRole="button" scaleTo={0.98}
            style={{ minHeight: 52, borderRadius: radius.pill, backgroundColor: WA_GREEN, alignItems: 'center', justifyContent: 'center' }}>
            <Text v="small" color="#fff" style={{ fontFamily: fonts.bodyXBold, fontSize: 15 }}>{t('WhatsApp ile gönder')}</Text>
          </PressScale>
          <Row>
            <Button kind="ghost" title={t('Bağlantıyı kopyala')} style={{ flex: 1 }} onPress={async () => {
              try { await Clipboard.setStringAsync(link); host.notify({ title: t('Kopyalandı'), body: t('Davet bağlantısı panoya alındı.'), icon: 'doc' }); } catch {}
            }} />
            {p.email ? <Button kind="ghost" title={t('E-postayı yeniden gönder')} style={{ flex: 1 }} onPress={async () => { setMailed(await sendSiteInvite(p)); reload(); }} /> : null}
          </Row>
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
