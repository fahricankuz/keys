/* Yönetici paneli: "E-posta gönder" penceresi. mailto: yerine ileti panelde yazılır ve sitenin e-posta altyapısıyla
   (admin_send_email → mail_outbox → mail-send) gönderilir; yanıtlar info@anahtar.io'ya gelir. Yedek olarak "Gmail'de aç"
   ve "Adresi kopyala". Gönderim talebin altında "gönderildi" olarak görünür ve İşlem kaydı'na düşer. */
import { useState } from 'react';
import { Linking, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { t } from '../domain/i18n';
import { humanError } from '../domain/backend';
import { adminSendEmail } from '../domain/admin';
import { Button, Field, Text } from '../ui/kit';
import { fonts, radius, useColors } from '../ui/theme';
import { Muted, Row } from './blocks';

export type MailTarget = { to: string; subject?: string; body?: string; name?: string; request_id?: string; user_id?: string; org_id?: string };

/** Gmail'in tarayıcıdaki yazma penceresi (alıcı, konu ve mesaj dolu). */
export const gmailLink = (to: string, subject: string, body: string) =>
  'https://mail.google.com/mail/?view=cm&fs=1&to=' + encodeURIComponent(to) + '&su=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);

/** Varsayılan ileti: "Merhaba {ad}," ile başlar. */
export function draftBody(name?: string) {
  const first = String(name || '').trim().split(/\s+/)[0];
  return (first ? t('Merhaba {name},', { name: first }) : t('Merhaba,')) + '\n\n\n\n' + t('anahtar ekibi');
}

export function MailComposer({ target, onSent, onClose }: { target: MailTarget; onSent?: () => void; onClose: () => void }) {
  const c = useColors();
  const [to, setTo] = useState(target.to);
  const [subject, setSubject] = useState(target.subject || t('anahtar'));
  const [body, setBody] = useState(target.body ?? draftBody(target.name));
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const send = async () => {
    setBusy(true); setErr(null); setMsg(null);
    try {
      await adminSendEmail({ to, subject, body, request_id: target.request_id, user_id: target.user_id, org_id: target.org_id });
      setSent(true);
      setMsg(t('E-posta gönderildi. Yanıtlar info@anahtar.io adresine gelir.'));
      onSent?.();
    } catch (e) { setErr(humanError(e)); }
    setBusy(false);
  };
  const copy = async () => { try { await Clipboard.setStringAsync(to); setMsg(t('Adres panoya alındı.')); } catch { setErr(t('Kopyalanamadı.')); } };
  return (
    <View accessibilityRole="none" accessibilityLabel={t('E-posta penceresi')}
      style={{ gap: 10, padding: 14, borderRadius: radius.md, borderWidth: 1.5, borderColor: c.accent, backgroundColor: c.surface }}>
      <Row between>
        <Text v="small" style={{ fontFamily: fonts.bodyXBold }}>{t('E-posta gönder')}</Text>
        <Button kind="quiet" title={t('Kapat')} onPress={onClose} />
      </Row>
      <Field label={t('Alıcı')} value={to} onChangeText={setTo} keyboardType="email-address" autoCapitalize="none" maxLength={200} />
      <Field label={t('Konu')} value={subject} onChangeText={setSubject} maxLength={200} />
      <Field label={t('Mesaj')} value={body} onChangeText={setBody} multiline maxLength={10000} style={{ minHeight: 150, textAlignVertical: 'top' }} />
      <Row wrap>
        <Button title={busy ? t('Gönderiliyor…') : t('Gönder')} onPress={send} disabled={busy || sent || !to.trim() || !subject.trim() || !body.trim()} />
        <Button kind="ghost" title={t('Gmail’de aç')} onPress={() => Linking.openURL(gmailLink(to, subject, body)).catch(() => {})} />
        <Button kind="ghost" title={t('Adresi kopyala')} onPress={copy} />
      </Row>
      <Muted>{t('anahtar’ın e-posta adresinden gider; yanıtlar info@anahtar.io adresine gelir.')}</Muted>
      {msg ? <Text v="small" color={c.okInk} style={{ fontFamily: fonts.bodyBold }}>{msg}</Text> : null}
      {err ? <Text v="small" color={c.badInk}>{err}</Text> : null}
    </View>
  );
}
