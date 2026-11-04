/* Kiracı: "Kira geçmişi belgesi" kartı (Belgeler) ve belgenin görünümü (/belge?kod=… sayfası da bunu kullanır). */
import { useCallback, useEffect, useState } from 'react';
import { Linking, Platform, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { t } from '../domain/i18n';
import { LIVE } from '../domain/config';
import { humanError } from '../domain/backend';
import { certUrl, createCertificate, myCertificates } from '../domain/certificate';
import { host } from '../domain/host';
import { tl, monthYear, fmtFull, parse, mkey, addM } from '../domain/util';
import { Button, Text } from '../ui/kit';
import { fonts, radius, useColors } from '../ui/theme';
import { Card, H2, Muted, Row, Seg } from './blocks';

const dayOf = (v?: string) => (v ? fmtFull(parse(String(v).slice(0, 10))) : '—');

/** Belgenin içeriği (doğrulama sayfasında ve önizlemede). */
export function CertificateBody({ d }: { d: any }) {
  const c = useColors();
  return (
    <View style={{ gap: 14 }}>
      <View style={{ gap: 4 }}>
        <Text v="small" muted style={{ fontFamily: fonts.bodyBold, letterSpacing: 0.6 }}>{t('KİRA ÖDEME GEÇMİŞİ BELGESİ')}</Text>
        <Text v="h2">{d.tenant}</Text>
        <Muted>{[d.property, d.addr].filter(Boolean).join(' · ')}</Muted>
        <Muted>{t('Mülk sahibi')}: {d.landlord} · {t('Dönem')}: {monthYear(d.from)} – {monthYear(d.to)}</Muted>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {[[t('Onaylı ödeme'), String(d.months)], [t('Zamanında'), d.months ? `${d.on_time}/${d.months}` : '—'], [t('Toplam'), tl(d.total)]].map(([a, b]) => (
          <View key={a} style={{ flexGrow: 1, flexBasis: 120, backgroundColor: c.tile, borderRadius: radius.md, padding: 12 }}>
            <Muted>{a}</Muted><Text v="h3">{b}</Text>
          </View>
        ))}
      </View>
      <View style={{ borderWidth: 1, borderColor: c.line, borderRadius: radius.md, overflow: 'hidden' }}>
        <View style={{ flexDirection: 'row', backgroundColor: c.tile, paddingHorizontal: 12, paddingVertical: 8 }}>
          {[t('Ay'), t('Tutar'), t('Ödeme tarihi'), t('Durum')].map((h, i) => <Text key={h} v="small" muted style={{ flex: i === 0 ? 1.3 : 1, fontFamily: fonts.bodyBold }}>{h}</Text>)}
        </View>
        {(d.rows || []).length ? d.rows.map((r: any) => (
          <View key={r.month} style={{ flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 8, borderTopWidth: 1, borderColor: c.line }}>
            <Text v="small" style={{ flex: 1.3 }}>{monthYear(r.month)}</Text>
            <Text v="small" style={{ flex: 1 }}>{tl(r.amount)}</Text>
            <Text v="small" style={{ flex: 1 }}>{dayOf(r.paid_on)}</Text>
            <Text v="small" color={r.on_time ? c.okInk : c.ink} style={{ flex: 1 }}>{r.on_time ? t('Zamanında') : t('Geç')}</Text>
          </View>
        )) : <View style={{ padding: 12 }}><Muted>{t('Bu dönemde onaylı kira ödemesi yok.')}</Muted></View>}
      </View>
      <Muted>{t('Belgede yalnız mülk sahibinin onayladığı kira ödemeleri yer alır. Düzenlenme: {d}.', { d: dayOf(d.issued_at) })}</Muted>
    </View>
  );
}

/** Kiracının Belgeler ekranındaki kart: dönem seç, belge oluştur, aç / paylaş; önceki belgeler. */
export function CertificateCard({ p }: { p: any }) {
  const c = useColors();
  const [range, setRange] = useState('12');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [made, setMade] = useState<any>(null);
  const [old, setOld] = useState<any[]>([]);
  const load = useCallback(() => { myCertificates(p.id).then(setOld).catch(() => {}); }, [p.id]);
  useEffect(() => { if (LIVE) load(); }, [load]);
  if (!LIVE) return null;
  const now = mkey(new Date());
  const from = range === '12' ? mkey(addM(new Date(), -11)) : range === 'yil' ? now.slice(0, 4) + '-01' : String(p.startDate || '2000-01-01').slice(0, 7);
  const create = async () => {
    setBusy(true); setErr(null);
    try { const r = await createCertificate(p.id, from, now); setMade(r); load(); } catch (e) { setErr(humanError(e)); }
    setBusy(false);
  };
  const open = (code: string) => Linking.openURL(certUrl(code)).catch(() => {});
  return (
    <Card gap={10}>
      <H2>{t('Kira geçmişi belgesi')}</H2>
      <Muted>{t('Yeni ev, kredi ya da kefalet başvurusu için: onaylı kira ödemelerini gösteren, kodla doğrulanabilen belge.')}</Muted>
      <Seg value={range} onChange={setRange} options={[['12', t('Son 12 ay')], ['yil', t('Bu yıl')], ['hepsi', t('Sözleşme başından')]]} />
      <Button title={t('Belge oluştur')} loading={busy} onPress={create} style={{ alignSelf: 'flex-start' }} />
      {err ? <Text v="small" color={c.badInk}>{err}</Text> : null}
      {made ? (
        <View style={{ gap: 8, backgroundColor: c.okBg, borderRadius: radius.md, padding: 12 }}>
          <Text v="small" color={c.okInk} style={{ fontFamily: fonts.bodyXBold }}>{t('Belge hazır · doğrulama kodu {code}', { code: made.code })}</Text>
          <Text v="small" color={c.okInk}>{t('{n} onaylı ödeme, {k} tanesi zamanında.', { n: made.data.months, k: made.data.on_time })}</Text>
          <Row wrap>
            <Button title={Platform.OS === 'web' ? t('Belgeyi aç (PDF olarak kaydet)') : t('Belgeyi aç')} onPress={() => open(made.code)} />
            <Button kind="ghost" title={t('Bağlantıyı kopyala')} onPress={async () => {
              try { await Clipboard.setStringAsync(certUrl(made.code)); host.notify({ title: t('Kopyalandı'), body: t('Belge bağlantısı panoya alındı.'), icon: 'doc' }); } catch {}
            }} />
          </Row>
        </View>
      ) : null}
      {old.length ? (
        <View style={{ gap: 4 }}>
          <Muted>{t('Önceki belgeler')}</Muted>
          {old.slice(0, 5).map((x) => (
            <Row key={x.code} between>
              <Text v="small">{monthYear(x.from_month)} – {monthYear(x.to_month)} · {x.code}</Text>
              <Button kind="quiet" title={t('Aç')} onPress={() => open(x.code)} />
            </Row>
          ))}
        </View>
      ) : null}
    </Card>
  );
}
