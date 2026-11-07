/* Kurum paneli → Yatırımcı raporu (GYO; AVM ve depoda anahtar yöneticisi açar): dönem (çeyrek / yıl), önizleme,
   yönetimin notu, "PDF indir" (A4 belge, yazdırma penceresi) ve "Mailime gönder" (özet ve bağlantı kendi e-postana).
   Hesap: domain/investor.js; belge: domain/investor-html.js. Para birimi kurumun rapor para birimidir (yönetici panelinde seçilir). */
import { useEffect, useMemo, useState } from 'react';
import { Platform, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { t } from '../domain/i18n';
import { humanError } from '../domain/backend';
import { investorReport, investorSummary, isPeriod, lastQuarter, periodRange } from '../domain/investor';
import { openInvestorReport } from '../domain/investor-html';
import { loadInvestorNote, mailInvestorReport, saveInvestorNote } from '../domain/investor-api';
import { fmtMoney } from '../domain/money';
import { Button, Field, Text } from '../ui/kit';
import { fonts } from '../ui/theme';
import { Card, H2, Label, Muted, Note, Row, Seg, Stack, Stepper } from './blocks';
import { CurrencySwitch, useFx } from './fx-ui';
import { S } from '../domain/state';
import { act } from '../domain/services';
import { useStore } from './hooks';

const pctS = (x: number | null) => (x == null ? '—' : '%' + (Math.round(x * 1000) / 10).toLocaleString('tr-TR'));

function shiftPeriod(key: string, n: number) {
  const y = Number(key.slice(0, 4));
  const q = /-Q([1-4])$/.exec(key);
  if (!q) return String(y + n);
  const i = y * 4 + Number(q[1]) - 1 + n;
  return Math.floor(i / 4) + '-Q' + ((i % 4) + 1);
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card style={{ flexGrow: 1, flexBasis: 150, minWidth: 150 }} gap={2}>
      <Label>{label}</Label>
      <Text v="h3" style={{ fontFamily: fonts.displayBold, fontSize: value.length > 13 ? 16 : value.length > 9 ? 19 : undefined, fontVariant: ['tabular-nums'] }}>{value}</Text>
      {sub ? <Muted>{sub}</Muted> : null}
    </Card>
  );
}

/** Raporun para birimi: kişinin seçimi (hesapta saklanır); seçmemişse kurumun varsayılanı (yönetici panelinde), o da yoksa USD. */
function useInvestorCurrency(org: any): ['TRY' | 'USD' | 'EUR', (c: 'TRY' | 'USD' | 'EUR') => void] {
  useStore();
  const v = (S as any).settings?.investorCurrency;
  const cur = ['TRY', 'USD', 'EUR'].includes(v) ? v : (org.report_currency === 'EUR' ? 'EUR' : 'USD');
  return [cur, (c) => act('setSetting', { k: 'investorCurrency', v: c, str: true })];
}

export function InvestorReport({ d, org }: { d: any; org: any }) {
  const [cur, setCur] = useInvestorCurrency(org);
  const params = useLocalSearchParams<{ donem?: string }>();
  const first = String(Array.isArray(params.donem) ? params.donem[0] : params.donem || '');
  const [key, setKey] = useState(isPeriod(first) ? first : lastQuarter());
  const range = periodRange(key);
  const prev = periodRange(range.prev);
  // Kur: önceki dönemin başından ve 12 aylık grafiğin başından (hangisi eskiyse) bugüne.
  const fxFrom = useMemo(() => { const y = Number(range.to.slice(0, 4)), m = Number(range.to.slice(5, 7)); const g = new Date(y, m - 12, 1); const s = g.toISOString().slice(0, 10); return s < prev.from ? s : prev.from; }, [key]);
  const { table, ready } = useFx(fxFrom);
  const [note, setNote] = useState('');
  const [saved, setSaved] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState('');
  useEffect(() => {
    let live = true;
    setMsg(null); setErr(null);
    loadInvestorNote(org.id, key).then((n) => { if (live) { setNote(n); setSaved(n); } }).catch(() => {});
    return () => { live = false; };
  }, [org.id, key]);
  const r = investorReport({ d, org, key, table, note: saved, cur });
  const M = (n: any) => fmtMoney(n, r.cur);
  const web = Platform.OS === 'web' && typeof window !== 'undefined';

  const run = async (name: string, f: () => Promise<any>) => {
    setBusy(name); setErr(null); setMsg(null);
    try { await f(); } catch (e: any) { setErr(humanError(e)); } finally { setBusy(''); }
  };
  const save = () => run('note', async () => { const n = await saveInvestorNote(org.id, key, note); setSaved(n); setNote(n); setMsg(t('Not kaydedildi.')); });
  const mail = () => run('mail', async () => { await mailInvestorReport(org.id, key, investorSummary(r, M)); setMsg(t('Rapor özeti ve bağlantısı e-postana gönderildi.')); });
  const pdf = () => { if (!openInvestorReport(r, { print: true })) setErr(t('Yeni sekme açılamadı; tarayıcının açılır pencere engelini kaldır.')); };

  return (
    <Stack>
      <Row wrap>
        <Seg value={range.quarter ? 'q' : 'y'} onChange={(v: any) => setKey(v === 'q' ? lastQuarter() : String(new Date().getFullYear() - 1))}
          options={[['q', t('Çeyrek')], ['y', t('Yıl')]]} />
        <Stepper name={range.quarter ? t('çeyrek') : t('yıl')} label={range.label} onPrev={() => setKey(shiftPeriod(key, -1))} onNext={() => setKey(shiftPeriod(key, 1))}
          next={range.from <= new Date().toISOString().slice(0, 10)} />
        <CurrencySwitch value={cur} onChange={setCur} />
      </Row>
      <Card gap={10}>
        <View style={{ gap: 2 }}>
          <Label>{org.name} · {t('Yatırımcı raporu')} · {r.cur === 'TRY' ? 'TL' : r.cur}</Label>
          <H2>{range.label}</H2>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          <Kpi label={t('Dönem geliri')} value={M(r.kpi.revenue)} sub={t('Önceki dönem {v}', { v: M(r.prev.revenue) })} />
          <Kpi label={t('NOI marjı')} value={pctS(r.kpi.margin)} sub={t('NOI {v}', { v: M(r.now.noi) })} />
          <Kpi label={t('Doluluk')} value={pctS(r.kpi.occupancy)} sub={t('{a} / {b} m²', { a: Math.round(r.occupancy.occArea).toLocaleString('tr-TR'), b: Math.round(r.occupancy.area).toLocaleString('tr-TR') })} />
          <Kpi label={t('WALE')} value={r.kpi.wale == null ? '—' : t('{n} yıl', { n: r.kpi.wale.toFixed(1).replace('.', ',') })} sub={t('Kira ağırlıklı')} />
        </View>
        <Muted>{t('Tahsilat oranı {p} · 30 günü geçen alacak {v} · kur farkı {k}', { p: pctS(r.now.collection), v: M(r.receivablesTotal), k: M(r.now.diff) })}</Muted>
        {r.cur === 'TRY' ? null : !ready ? <Muted>{t('Kurlar yükleniyor…')}</Muted> : r.missing ? <Note>{t('Bazı işlemlerin günü için kur henüz yok; bu işlemler döviz toplamlarına katılmadı.')}</Note> : null}
        <Row wrap>
          {web ? <Button title={t('PDF indir')} onPress={pdf} /> : null}
          <Button kind="ghost" title={busy === 'mail' ? t('Gönderiliyor…') : t('Mailime gönder')} onPress={mail} disabled={!!busy} />
          {web ? <Button kind="ghost" title={t('Raporu aç')} onPress={() => openInvestorReport(r, { print: false })} /> : null}
        </Row>
        {!web ? <Muted>{t('PDF, anahtar.io’da web tarayıcısından indirilir; “Mailime gönder” ile bağlantıyı e-postana alabilirsin.')}</Muted> : null}
        {msg ? <Text v="small" style={{ fontFamily: fonts.bodyBold }}>{msg}</Text> : null}
        {err ? <Note>{err}</Note> : null}
      </Card>
      <Card gap={8}>
        <H2>{t('Yönetimin notu')}</H2>
        <Muted>{t('Raporun son sayfasında görünür; boş bırakırsan bölüm raporda yer almaz.')}</Muted>
        <Field label={t('Not')} value={note} onChangeText={setNote} multiline maxLength={2000} style={{ minHeight: 110, textAlignVertical: 'top' }} />
        <Row between>
          <Muted>{note.length} / 2000</Muted>
          <Button kind="ghost" title={busy === 'note' ? t('Kaydediliyor…') : t('Notu kaydet')} onPress={save} disabled={!!busy || note.trim() === saved} />
        </Row>
      </Card>
      <Muted>{t('Rapor üç A4 sayfasıdır: kapak, özet ve ayrıntılar. Tutarlar her işlemin kendi gününün TCMB döviz satış kuruyla çevrilir; denetlenmiş finansal tablo ya da değerleme raporu yerine geçmez.')}</Muted>
    </Stack>
  );
}
