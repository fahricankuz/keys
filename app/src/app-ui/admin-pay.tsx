/* Yönetici paneli → Kurumsal ödeme: anahtar'ın banka hesapları (Havale/EFT e-postasında müşteriye gider), Sanal POS durumu ve
   ödeme istekleri (bekleyen → "Ödeme alındı" paketi tanımlar ya da iptal). "Paket ver"deki ödeme seçenekleri de buradan (PayResult). */
import { useEffect, useState } from 'react';
import { Linking, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { t, locale } from '../domain/i18n';
import { humanError } from '../domain/admin';
import { deletePayAccount, ibanOk, ibanShow, loadCorpPayments, loadPayAccounts, paySet, payWa, posStatus, savePayAccount } from '../domain/admin-pay';
import { planLabel } from '../domain/plans';
import { tl } from '../domain/util';
import { Button, Chip, Field, Text } from '../ui/kit';
import { useColors } from '../ui/theme';
import { Card, Empty, H2, Muted, Row, Seg, Stack } from './blocks';

const day = (v: any) => (v ? new Date(v).toLocaleDateString(locale(), { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

/** Ödeme isteği oluşturulduktan sonra: e-posta notu, WhatsApp ve (Sanal POS'ta) bağlantı. */
export function PayResult({ r, amount, done }: { r: any; amount: number; done: () => void }) {
  const c = useColors();
  return (
    <View style={{ gap: 8 }}>
      <Text v="small" color={c.okInk}>{r.url ? t('Ödeme bağlantısı hazır ({ref}).', { ref: r.ref }) : t('Ödeme bilgisi {email} adresine e-postayla gönderildi ({ref}).', { email: r.email, ref: r.ref })}</Text>
      {r.url ? <Text v="small" selectable>{r.url}</Text> : null}
      <Row wrap>
        <Button kind="ghost" title={t('WhatsApp ile gönder')} onPress={() => Linking.openURL(payWa(r, amount)).catch(() => {})} />
        {r.url ? <Button kind="ghost" title={t('Bağlantıyı kopyala')} onPress={() => Clipboard.setStringAsync(r.url).catch(() => {})} /> : null}
        <Button kind="quiet" title={t('Tamam')} onPress={done} />
      </Row>
      {!r.phone ? <Muted>{t('Kayıtlı telefon yok; WhatsApp’ta kişiyi kendin seç.')}</Muted> : null}
    </View>
  );
}

function AccountForm({ a, done }: { a?: any; done: () => void }) {
  const c = useColors();
  const [f, setF] = useState<any>(a || { bank: '', holder: '', iban: '', note: '', is_default: false });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!ibanOk(f.iban)) { setErr(t('IBAN TR ile başlayan 26 karakter olmalı.')); return; }
    setBusy(true); setErr(null);
    try { await savePayAccount(f); done(); } catch (e) { setErr(humanError(e)); }
    setBusy(false);
  };
  return (
    <View style={{ gap: 8 }}>
      <Row gap={10} wrap align="flex-end">
        <View style={{ flexGrow: 1, flexBasis: 160 }}><Field label={t('Banka')} value={f.bank} onChangeText={(v) => setF({ ...f, bank: v })} maxLength={80} /></View>
        <View style={{ flexGrow: 1, flexBasis: 200 }}><Field label={t('Hesap sahibi')} value={f.holder} onChangeText={(v) => setF({ ...f, holder: v })} maxLength={120} /></View>
      </Row>
      <Field label={t('IBAN')} value={f.iban} onChangeText={(v) => setF({ ...f, iban: v })} autoCapitalize="characters" maxLength={34} placeholder="TR00 0000 0000 0000 0000 0000 00" />
      <Field label={t('Not (e-postada görünür, ör. şube)')} value={f.note} onChangeText={(v) => setF({ ...f, note: v })} maxLength={300} />
      <Seg value={f.is_default ? '1' : '0'} onChange={(v) => setF({ ...f, is_default: v === '1' })} options={[['1', t('Varsayılan hesap')], ['0', t('Diğer hesap')]]} />
      {err ? <Text v="small" color={c.badInk}>{err}</Text> : null}
      <Row wrap>
        <Button title={t('Kaydet')} loading={busy} disabled={f.bank.trim().length < 2 || f.holder.trim().length < 2} onPress={save} />
        <Button kind="quiet" title={t('Vazgeç')} onPress={done} />
      </Row>
    </View>
  );
}

/** Kurumsal ödeme bölümü. */
export function PaySettings() {
  const c = useColors();
  const [acc, setAcc] = useState<any[] | null>(null);
  const [pays, setPays] = useState<any[] | null>(null);
  const [pos, setPos] = useState<any>(null);
  const [edit, setEdit] = useState<any>(null);
  const [f, setF] = useState('pending');
  const [err, setErr] = useState<string | null>(null);
  const load = async () => {
    try { setAcc(await loadPayAccounts()); setPays(await loadCorpPayments()); setErr(null); } catch (e) { setErr(humanError(e)); }
  };
  useEffect(() => { load(); posStatus().then(setPos); }, []);
  const act = async (fn: () => Promise<any>) => { try { await fn(); load(); } catch (e) { setErr(humanError(e)); } };
  const shown = (pays || []).filter((p) => f === 'all' || p.status === f);
  return (
    <Stack>
      {err ? <Text v="small" color={c.badInk}>{err}</Text> : null}
      <Card gap={10}>
        <H2>{t('Banka hesapları')}</H2>
        <Muted>{t('Havale/EFT seçilince varsayılan hesap müşteriye e-postayla ve WhatsApp metninde gider.')}</Muted>
        {acc && !acc.length && edit === null ? <Empty>{t('Henüz hesap yok. Havale/EFT için bir hesap ekle.')}</Empty> : null}
        {(acc || []).map((a) => edit && edit.id === a.id ? <AccountForm key={a.id} a={a} done={() => { setEdit(null); load(); }} /> : (
          <Row key={a.id} between wrap>
            <View style={{ flex: 1, minWidth: 220, gap: 2 }}>
              <Text v="small" style={{ fontWeight: '700' }}>{a.bank} · {a.holder}</Text>
              <Muted>{ibanShow(a.iban)}{a.note ? ' · ' + a.note : ''}</Muted>
            </View>
            <Row gap={6}>
              {a.is_default ? <Chip tone="accent" label={t('Varsayılan')} /> : null}
              <Button kind="ghost" title={t('Düzenle')} onPress={() => setEdit(a)} />
              <Button kind="quiet" title={t('Sil')} onPress={() => act(() => deletePayAccount(a.id))} />
            </Row>
          </Row>
        ))}
        {edit && !edit.id ? <AccountForm done={() => { setEdit(null); load(); }} /> : edit === null ? <Button kind="ghost" title={t('Hesap ekle')} onPress={() => setEdit({})} style={{ alignSelf: 'flex-start' }} /> : null}
      </Card>
      <Card gap={6}>
        <H2>{t('Sanal POS')}</H2>
        {pos === null ? <Muted>…</Muted> : pos.configured
          ? <Text v="small" color={c.okInk}>{t('Bağlı ({p}). "Paket ver"de Sanal POS seçilince kartla ödeme bağlantısı oluşur.', { p: pos.provider })}</Text>
          : <Muted>{t('Henüz bağlı değil. Sağlayıcıyla (Moka) anlaşınca üye işyeri bilgileri Supabase’e gizli değer olarak girilir; seçenek kendiliğinden açılır.')}</Muted>}
      </Card>
      <Card gap={10}>
        <H2>{t('Ödeme istekleri')}</H2>
        <Seg value={f} onChange={setF} options={[['pending', t('Bekleyen')], ['paid', t('Ödendi')], ['cancelled', t('İptal')], ['all', t('Hepsi')]]} />
        {pays && !shown.length ? <Empty>{t('Kayıt yok.')}</Empty> : null}
        {shown.map((p) => (
          <View key={p.id} style={{ gap: 4, borderTopWidth: 1, borderColor: c.line, paddingTop: 10 }}>
            <Row between wrap>
              <Text v="small" style={{ fontWeight: '700' }}>{p.ref} · {tl(p.amount)}</Text>
              <Chip tone={p.status === 'paid' ? 'ok' : p.status === 'cancelled' ? 'neutral' : 'warn'} label={p.status === 'paid' ? t('Ödendi') : p.status === 'cancelled' ? t('İptal') : t('Bekliyor')} />
            </Row>
            <Muted>{[p.method === 'havale' ? t('Havale/EFT') : t('Sanal POS'), planLabel(p.plan), t('{n} mülk', { n: p.units }), day(p.created_at), p.paid_at ? t('ödendi {d}', { d: day(p.paid_at) }) : ''].filter(Boolean).join(' · ')}</Muted>
            {p.status === 'pending' ? (
              <Row wrap>
                <Button kind="ghost" title={t('Ödeme alındı')} onPress={() => act(() => paySet(p.id, 'paid'))} />
                <Button kind="quiet" title={t('İptal et')} onPress={() => act(() => paySet(p.id, 'cancelled'))} />
              </Row>
            ) : null}
          </View>
        ))}
      </Card>
    </Stack>
  );
}
