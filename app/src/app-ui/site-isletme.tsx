/* İşletme projesi (yıllık gider planı) Projeler bölümünde bir proje türüdür (migration isletme_projesi_birlesik).
   BudgetEditor: gider kalemleri, yıllık tutarlar ve paylaştırma anahtarı (yalnız taslakta ve reddedilince düzenlenir).
   KalemCard: kalem kalem öngörülen ve (yönetimde) gerçekleşen gider çubukları; gerçekleşen, gider defterinden kalem adına göre gelir.
   PayCard: dairelerin aylık payı (şu an → yeni); onaylanınca "Daire aidatlarını güncelle".
   SupplementForm: yıl ortası ek maliyet "ek ödenek" olarak açılır, oylanır; onaylanırsa kalemin tutarına eklenir. */
import { useState } from 'react';
import { View } from 'react-native';
import { t } from '../domain/i18n';
import { humanError } from '../domain/backend';
import { SITE_EXPENSE_CATS, budgetAidat, budgetTotal, saveBudget, addSupplement, unitLabel } from '../domain/site';
import { tl } from '../domain/util';
import { Button, Field, Text } from '../ui/kit';
import { fonts, useColors } from '../ui/theme';
import { Card, H2, Label, Muted, Row, Seg } from './blocks';
import { MoneyField } from './forms';
import { Pill } from './org';

export const METHODS = () => [['share', t('Arsa payına göre')], ['area', t('m²’ye göre')], ['equal', t('Eşit')]] as [string, string][];
export const methodLabel = (m: string) => (METHODS().find(([k]) => k === m) || METHODS()[0])[1];
const num = (v: any) => Number(String(v ?? '').replace(',', '.')) || 0;
function Err({ e }: { e: string | null }) { const c = useColors(); return e ? <Text v="small" color={c.badInk}>{e}</Text> : null; }

/** Gider kalemleri ve paylaştırma formu. saved: kayıtlı bütçe (yoksa yeni yıl). */
export function BudgetEditor({ oid, year, saved, done }: { oid: string; year: number; saved?: any; done: (ok: boolean) => void }) {
  const [b, setB] = useState<any>(saved ? { ...saved, items: (saved.items || []).map((i: any) => ({ ...i, amount: String(i.amount) })) } : { year, method: 'share', note: '', approved_on: '', items: [{ cat: '', amount: '' }] });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const total = b.items.reduce((a: number, i: any) => a + num(i.amount), 0);
  const setItem = (i: number, patch: any) => setB({ ...b, items: b.items.map((x: any, j: number) => (j === i ? { ...x, ...patch } : x)) });
  return (
    <Card gap={10}>
      <H2>{t('{year} işletme projesi', { year })}</H2>
      <Muted>{t('Yıllık gider tahmini: kalemleri ve tutarları yaz, paylaştırma anahtarını seç. Kaydedince taslak olur; oylamaya sunulunca sakinler görür.')}</Muted>
      {b.items.map((it: any, i: number) => (
        <Row key={i} gap={10} wrap align="flex-end">
          <View style={{ flexGrow: 2, flexBasis: 260, gap: 4 }}>
            <Label>{t('Gider kalemi')}</Label>
            <Seg wrap value={it.cat} onChange={(v: any) => setItem(i, { cat: v })} options={[...SITE_EXPENSE_CATS(), ...(it.cat && !SITE_EXPENSE_CATS().includes(it.cat) ? [it.cat] : [])].map((k: string) => [k, k] as [string, string])} />
          </View>
          <View style={{ flexGrow: 1, flexBasis: 130 }}><MoneyField label={t('Yıllık tutar (₺)')} value={String(it.amount ?? '')} onChange={(v) => setItem(i, { amount: v })} /></View>
          {b.items.length > 1 ? <Button kind="quiet" title={t('Kalemi kaldır')} onPress={() => setB({ ...b, items: b.items.filter((_: any, j: number) => j !== i) })} /> : null}
        </Row>
      ))}
      <Button kind="ghost" title={t('Kalem ekle')} onPress={() => setB({ ...b, items: [...b.items, { cat: '', amount: '' }] })} style={{ alignSelf: 'flex-start' }} />
      <Row between wrap><Text v="small" style={{ fontFamily: fonts.bodyXBold }}>{t('Yıllık toplam')}</Text><Text v="h3">{tl(total)}</Text></Row>
      <Text v="small" style={{ fontFamily: fonts.bodyBold }}>{t('Paylaştırma')}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{METHODS().map(([k, l]) => <Pill key={k} label={l} on={b.method === k} onPress={() => setB({ ...b, method: k })} />)}</View>
      <Row wrap gap={8}>
        <Button title={t('Kaydet')} disabled={!total || busy} loading={busy} onPress={async () => {
          setErr(null); setBusy(true);
          try { await saveBudget(oid, { ...b, year }); done(true); } catch (e) { setErr(humanError(e)); } finally { setBusy(false); }
        }} />
        <Button kind="quiet" title={t('Vazgeç')} onPress={() => done(false)} />
      </Row>
      <Err e={err} />
    </Card>
  );
}

/** Kalemler: öngörülen yıllık tutar; gerçekleşen (verilirse) çubukla, öngörüyü aşan kırmızı. */
export function KalemCard({ items, spentOf }: { items: any[]; spentOf?: (cat: string) => number }) {
  const c = useColors();
  if (!items.length) return null;
  return (
    <Card gap={10}>
      <H2>{t('Gider kalemleri')}</H2>
      {items.map((it: any) => {
        const plan = num(it.amount), used = spentOf ? spentOf(it.cat) : null;
        const over = used != null && used > plan;
        return (
          <View key={it.cat} style={{ gap: 4 }}>
            <Row between wrap><Text v="small" style={{ fontFamily: fonts.bodyBold }}>{it.cat}</Text>
              <Text v="small" color={over ? c.badInk : c.muted}>{used != null ? tl(used) + ' / ' : ''}{tl(plan)}</Text></Row>
            {used != null ? (
              <View style={{ height: 8, borderRadius: 4, backgroundColor: c.surface2, overflow: 'hidden' }}>
                <View style={{ width: `${Math.min(100, plan > 0 ? (used / plan) * 100 : 0)}%`, height: 8, backgroundColor: over ? c.badInk : c.okInk }} />
              </View>
            ) : null}
          </View>
        );
      })}
      <Muted>{spentOf ? t('Gerçekleşen, gider defterindeki kayıtlardan kalem adına göre otomatik gelir; öngörüyü aşan kalem kırmızıdır.') : t('Kalemler yıllık tahmindir.')}</Muted>
    </Card>
  );
}

/** Dairelerin aylık payı: yıllık toplam seçilen anahtara göre bölünüp 12'ye. Yönetimde dairelerin listesi, sakinde yalnız kendi dairesi. */
export function PayCard({ budget, units, mine, current }: { budget: any; units: any[]; mine?: any[]; current?: boolean }) {
  const c = useColors();
  const plan = budgetAidat(units, budget);
  const unitBy: Record<string, any> = Object.fromEntries(units.map((u: any) => [u.id, u]));
  if (!plan.length && !(mine && mine.length)) return null;
  return (
    <Card gap={0}>
      <H2>{t('Dairelerin aylık payı')}</H2>
      <Muted>{t('Paylaştırma: {m}', { m: methodLabel(budget.method) })}</Muted>
      {mine && mine.length ? mine.map((u: any) => (
        <Row key={u.unit_id} between style={{ paddingVertical: 10 }}>
          <Text v="small" style={{ fontFamily: fonts.bodyBold }}>{unitLabel(u)}</Text>
          <Text v="small" style={{ fontFamily: fonts.bodyXBold }}>{u.aidat != null ? tl(u.aidat) + ' ' + t('/ ay') : '—'}</Text>
        </Row>
      )) : plan.slice(0, 12).map((x: any, i: number) => (
        <Row key={x.unit_id} between style={{ paddingVertical: 10, borderTopWidth: i ? 1 : 0, borderColor: c.line }}>
          <Text v="small" style={{ fontFamily: fonts.bodyBold }}>{unitLabel(unitBy[x.unit_id])}</Text>
          <Muted>{!current && unitBy[x.unit_id].aidat != null && Number(unitBy[x.unit_id].aidat) !== x.monthly ? t('şu an') + ' ' + tl(unitBy[x.unit_id].aidat) + ' → ' : ''}</Muted>
          <Text v="small" style={{ fontFamily: fonts.bodyXBold }}>{tl(x.monthly)} {t('/ ay')}</Text>
        </Row>
      ))}
      {!mine && plan.length > 12 ? <Muted>{t('…ve diğer {n} daire', { n: plan.length - 12 })}</Muted> : null}
    </Card>
  );
}

/** Ek ödenek formu: kalem, tutar, açıklama; taslak olarak açılır (sonra oylamaya sunulur). */
export function SupplementForm({ oid, parent, done }: { oid: string; parent: any; done: (ok: boolean) => void }) {
  const [cat, setCat] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <Card gap={10} style={{ borderWidth: 0 }}>
      <Text v="body" style={{ fontFamily: fonts.bodyXBold }}>{t('Ek ödenek (yıl ortası ek maliyet)')}</Text>
      <Muted>{t('Onaylı işletme projesi doğrudan değişmez. Ek maliyeti buradan aç, oylamaya sun; kabul edilirse kalemin yıllık tutarına eklenir.')}</Muted>
      <Label>{t('Gider kalemi')}</Label>
      <Seg wrap value={cat} onChange={(v: any) => setCat(v)} options={SITE_EXPENSE_CATS().map((k: string) => [k, k] as [string, string])} />
      <MoneyField label={t('Ek tutar (₺)')} value={amount} onChange={setAmount} />
      <Field label={t('Gerekçe (isteğe bağlı)')} value={note} onChangeText={setNote} multiline maxLength={4000} placeholder={t('ör. Asansör revizyonu beklenenden pahalı çıktı')} />
      <Row wrap gap={8}>
        <Button title={t('Ek ödenek taslağı aç')} disabled={!cat || num(amount) <= 0 || busy} loading={busy} onPress={async () => {
          setErr(null); setBusy(true);
          try { await addSupplement(oid, parent.id, { cat, amount, note }); done(true); } catch (e) { setErr(humanError(e)); } finally { setBusy(false); }
        }} />
        <Button kind="quiet" title={t('Vazgeç')} onPress={() => done(false)} />
      </Row>
      <Err e={err} />
    </Card>
  );
}

export { budgetTotal };
