/* Telefon uygulamasında paket satın alma (App Store / Google Play, RevenueCat). Web'de bu ekran yoktur:
   web satın alma sayfası (/satin-al) "uygulamadan abone ol" der. Mağaza kuralı gereği uygulamadan web ödemesine yönlendirme yapılmaz.
   Fiyat ve dönem mağazadan okunur; deneme mağazada değil sunucudadır (hesap açılınca 30 gün), mağaza deneme teklifi yoktur. */
import { useEffect, useState } from 'react';
import { Linking, Platform, Pressable, View } from 'react-native';
import { t, getLang } from '../domain/i18n';
import { CONFIG } from '../domain/config';
import { humanError } from '../domain/backend';
import { useBillingPaused } from '../domain/app-config';
import { access, ownedCount, planLabel, trialDaysLeft, unitsText } from '../domain/billing';
import { storeProduct, buyStore, restoreStore, manageStore, storeAvailable, storeReady } from '../domain/iap';
import { STORE_MAX_UNITS, parseStoreProductId, changeKind } from '../domain/store-ids';
import { fmtFull } from '../domain/util';
import { Button, Text } from '../ui/kit';
import { fonts, useColors } from '../ui/theme';
import { Card, Muted, Note, Row, Stack, Stepper } from './blocks';
import { Title } from './forms';
import { useStore } from './hooks';

const storeName = () => (Platform.OS === 'ios' ? 'App Store' : 'Google Play');
const STORE_SUBS = ['app_store', 'play_store'];
const INK = '#1D1A19';

/** Mağaza ürününün sayısal fiyatı ve para birimi (yoksa null). Android'de temel planın tam fiyat aşaması, iOS'ta ürün fiyatı. */
function amountOf(p: any): { n: number; cur: string } | null {
  if (!p) return null;
  const ph = p.option && p.option.fullPricePhase && p.option.fullPricePhase.price;
  const n = ph && ph.amountMicros != null ? Number(ph.amountMicros) / 1e6 : Number(p.product && p.product.price);
  const cur = (ph && ph.currencyCode) || (p.product && p.product.currencyCode) || '';
  return isFinite(n) && n > 0 && cur ? { n, cur } : null;
}
/** Kısa para metni: 10 ve üstü tam sayıya yuvarlanır (₺250, ₺600), küçük tutarlar kuruşlu kalır ($1.67). Biçimlendirilemezse null; o satır gösterilmez. */
function roundMoney(n: number, cur: string): string | null {
  const d = n >= 10 ? 0 : 2;
  try { return new Intl.NumberFormat(getLang() === 'en' ? 'en-US' : 'tr-TR', { style: 'currency', currency: cur, maximumFractionDigits: d, minimumFractionDigits: d }).format(d ? n : Math.round(n)); }
  catch { return null; }
}

/** Ödeme dönemi kartı: solda seçim işareti ve başlık, sağda mağaza fiyatı ve altında küçük notlar. */
function PeriodCard({ on, onPress, title, sub, badge, price, per, notes, save }: { on: boolean; onPress: () => void; title: string; sub: string; badge?: string; price: string; per: string; notes?: string | null; save?: string | null }) {
  const c = useColors();
  return (
    <Pressable onPress={onPress} accessibilityRole="radio" accessibilityState={{ selected: on, checked: on }}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: 20, borderWidth: 1.5, borderColor: on ? c.accent : c.line, backgroundColor: on ? c.rose : c.surface }}>
      <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: on ? c.accent : c.muted, alignItems: 'center', justifyContent: 'center' }}>
        {on ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: c.accent }} /> : null}
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <Text v="body" style={{ fontFamily: fonts.bodyXBold }}>{title}</Text>
        <Text v="small" color={c.muted}>{sub}</Text>
        {badge ? <View style={{ alignSelf: 'flex-start', backgroundColor: c.lemon, borderRadius: 99, paddingHorizontal: 9, paddingVertical: 2 }}><Text v="small" color={INK} style={{ fontFamily: fonts.bodyBold, fontSize: 12 }}>{badge}</Text></View> : null}
      </View>
      <View style={{ alignItems: 'flex-end', gap: 3, flexShrink: 1 }}>
        <Text v="body" style={{ fontFamily: fonts.bodyXBold, fontSize: 17 }}>{price} <Text v="small" color={c.muted}>{per}</Text></Text>
        {notes ? <Text v="small" color={c.muted} style={{ fontSize: 12 }}>{notes}</Text> : null}
        {save ? <View style={{ backgroundColor: c.lemon, borderRadius: 99, paddingHorizontal: 8, paddingVertical: 2 }}><Text v="small" color={INK} style={{ fontFamily: fonts.bodyBold, fontSize: 11.5 }}>{save}</Text></View> : null}
      </View>
    </Pressable>
  );
}

/** Paket, mülk adedi ve dönem seçilir; fiyat mağazadan okunur. */
export function StorePurchaseSheet({ plan: plan0 = 'tek', yearly: y0 = false, units: u0, close }: { plan?: string; yearly?: boolean; units?: number; close: () => void }) {
  useStore();     // satın alma sonrası erişim durumu tazelenince "mevcut paket" satırı güncellenir
  const c = useColors();
  const [plan, setPlan] = useState(plan0 === 'bes' ? 'bes' : 'tek');
  const [yearly, setYearly] = useState(!!y0);
  // Paketteki adet, sahip olunan mülk sayısının altına inemez (sunucu da sınırın dışında kalan mülklere yazmayı reddeder).
  const owned = ownedCount();
  const minUnits = Math.max(1, Math.min(owned, STORE_MAX_UNITS));
  const [units, setUnits] = useState(Math.min(STORE_MAX_UNITS, Math.max(minUnits, u0 || owned || 1)));
  const paused = useBillingPaused();
  const [pending, setPending] = useState(false);
  const subscribedNow = !!(access() as any).subscribed;
  // Aylık ve yıllık ürünler birlikte okunur (iki kartın fiyatı ve yıllık tasarruf); Başlangıç'ta Profesyonel aylık da (öneri şeridindeki fark).
  const [prods, setProds] = useState<{ m: { p: any; e: any }; y: { p: any; e: any }; up: { p: any; e: any } } | null>(null);
  const [hideUp, setHideUp] = useState(false);
  const [ready, setReady] = useState<'wait' | 'ok' | 'fail'>('wait');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const available = storeAvailable();
  // Mağaza gerçekten satış yapabiliyor mu (anahtar var, ürünler tanımlı, ağ açık)? Yapamıyorsa fiyat ve satın alma düğmesi gizlenir.
  useEffect(() => {
    if (!available) return;
    let on = true;
    storeReady().then((ok: boolean) => { if (on) setReady(ok ? 'ok' : 'fail'); }).catch(() => { if (on) setReady('fail'); });
    return () => { on = false; };
  }, [available]);
  useEffect(() => {
    if (!available || ready !== 'ok') return;
    let on = true;
    setProds(null);
    // Okunamayan ürün null olur, hatası saklanır; seçili dönemin ürünü yoksa hata ya da "tanımlı değil" notu çıkar.
    const get = (pl: string, yr: boolean) => storeProduct(pl, units, yr).then((p: any) => ({ p, e: null }), (e: any) => ({ p: null, e }));
    Promise.all([get(plan, false), get(plan, true), plan === 'tek' ? get('bes', false) : Promise.resolve({ p: null, e: null })])
      .then(([m, y, up]) => { if (on) setProds({ m, y, up }); });
    return () => { on = false; };
  }, [plan, units, available, ready]);
  // Satın alma mağazada tamamlandı ama sunucu aboneliği henüz yazmadıysa gerçek zamanlı güncelleme gelince başarı iletisi açılır.
  useEffect(() => { if (pending && subscribedNow) { setPending(false); setDone(t('Aboneliğin açıldı. Teşekkürler!')); } }, [pending, subscribedNow]);
  const run = async (f: () => Promise<any>, ok: string) => {
    setBusy(true); setErr(null); setDone(null); setPending(false);
    try {
      const r = await f();
      if (r === 'pending') { setPending(true); setDone(t('Satın alma alındı, aboneliğin etkinleştiriliyor…')); }
      else if (r) setDone(ok);
    } catch (e) { setErr(humanError(e)); }
    setBusy(false);
  };
  const restore = () => run(async () => { const ok = await restoreStore(); if (!ok) throw new Error(t('Bu mağaza hesabında etkin abonelik bulunamadı.')); return true; }, t('Aboneliğin geri yüklendi.'));
  const links = (
    <Row gap={16} style={{ justifyContent: 'center' }}>
      <Text v="small" color={c.muted} onPress={() => Linking.openURL(CONFIG.legal.terms)} accessibilityRole="link" style={{ textDecorationLine: 'underline' }}>{t('Kullanım koşulları')}</Text>
      <Text v="small" color={c.muted} onPress={() => Linking.openURL(CONFIG.legal.privacy)} accessibilityRole="link" style={{ textDecorationLine: 'underline' }}>{t('Gizlilik politikası')}</Text>
    </Row>
  );
  if (!available) return <Stack><Title>{t('Paketler')}</Title><Note>{t('Mağaza içi satın alma bu cihazda henüz açık değil.')}</Note>{links}<Button kind="quiet" title={t('Kapat')} onPress={close} /></Stack>;
  if (paused) {
    return (
      <Stack gap={14}>
        <Title>{t('Paketler')}</Title>
        <Note warn>{t('Ödeme sistemimizi güncelliyoruz. Paket satın alma kısa süre içinde açılacak; fiyatlar kesinleşince burada görünür.')}</Note>
        <Button kind="ghost" title={t('Satın alımları geri yükle')} disabled={busy} onPress={restore} />
        {done ? <Text v="small" color={c.okInk}>{done}</Text> : null}
        {err ? <Text v="small" color={c.badInk}>{err}</Text> : null}
        {links}
        <Button kind="quiet" title={t('Kapat')} onPress={close} />
      </Stack>
    );
  }
  if (ready === 'fail') {
    return (
      <Stack gap={14}>
        <Title>{t('Paketler')}</Title>
        <Note warn>{t('Mağazaya şu an ulaşılamıyor ya da paketler henüz tanımlı değil. Biraz sonra yeniden dene.')}</Note>
        <Button kind="ghost" title={t('Satın alımları geri yükle')} disabled={busy} onPress={restore} />
        {done ? <Text v="small" color={c.okInk}>{done}</Text> : null}
        {err ? <Text v="small" color={c.badInk}>{err}</Text> : null}
        {links}
        <Button kind="quiet" title={t('Kapat')} onPress={close} />
      </Stack>
    );
  }

  const a: any = access();
  const fromStore = !!a.subscribed && STORE_SUBS.includes(String(a.store));
  const current = fromStore ? parseStoreProductId(a.productId) : null;
  const kind = fromStore ? changeKind(CONFIG.billing.tiers, current, { plan, units, yearly }) : 'new';
  const when = a.expiresAt ? fmtFull(new Date(a.expiresAt)) : '';
  const sel = prods ? (yearly ? prods.y : prods.m) : null;
  const price: string | null = sel && sel.p ? sel.p.price : null;
  const missing = !!sel && !sel.p;
  const loadErr = sel && sel.e ? humanError(sel.e) : null;
  // Yıllık kartın altındaki küçük satırlar: aylık karşılığı ve yıllık tasarruf (ikisi de mağaza fiyatlarından, tam sayıya yuvarlı).
  const am = amountOf(prods && prods.m.p), ay = amountOf(prods && prods.y.p), aup = amountOf(prods && prods.up.p);
  const sameCur = am && ay && am.cur === ay.cur;
  const yMonthly = ay ? roundMoney(ay.n / 12, ay.cur) : null;
  const saveN = sameCur ? am!.n * 12 - ay!.n : 0;
  const saveTxt = saveN >= 1 ? roundMoney(saveN, ay!.cur) : null;
  const upN = aup && am && aup.cur === am.cur ? (aup.n - am.n) / units : 0;
  const upTxt = upN >= 1 ? roundMoney(upN, am!.cur) : null;
  const wait = prods ? '—' : '…';
  const showUp = plan === 'tek' && !hideUp && kind !== 'same';
  const timing = kind === 'upgrade' ? t('Yükseltme hemen başlar; mevcut dönemden kalan süre yeni paketin ücretine orantılı olarak yansıtılır.')
    : kind === 'downgrade' ? (when ? t('Bu değişiklik mevcut dönemin sonunda ({date}) başlar; o zamana kadar şimdiki paketin geçerli kalır, yeni ücret dönem sonunda alınır.', { date: when }) : t('Bu değişiklik mevcut dönemin sonunda başlar; o zamana kadar şimdiki paketin geçerli kalır, yeni ücret dönem sonunda alınır.'))
    : kind === 'same' ? t('Bu zaten mevcut paketin.') : null;
  return (
    <Stack gap={14}>
      <Title>{t('Aboneliğini tamamla')}</Title>
      {fromStore ? (
        <View style={{ gap: 2 }}>
          <Text v="small" style={{ fontFamily: fonts.bodyBold }}>
            {t('Mevcut paketin: {plan}', { plan: planLabel(a.plan || a.productId) })}{' · '}{unitsText(a.units)}{current ? ' · ' + (current.yearly ? t('Yıllık') : t('Aylık')) : ''}
          </Text>
          {when ? <Muted>{a.willRenew === false ? t('{date} tarihine kadar geçerli, yenilenmeyecek.', { date: when }) : t('{date} tarihinde yenilenir', { date: when })}</Muted> : null}
        </View>
      ) : null}
      {['admin', 'promotional'].includes(String(a.store)) ? <Note>{t('Hesabında yönetici tarafından verilmiş bir paket var; mağaza aboneliği onu değiştirmez.')}</Note> : null}
      <View style={{ backgroundColor: plan === 'bes' ? c.hero : c.surface, borderColor: plan === 'bes' ? c.hero : c.line, borderWidth: 1.5, borderRadius: 24, padding: 18, gap: 4 }}>
        <Text v="small" color={plan === 'bes' ? c.heroMuted : c.muted}>{t('Seçtiğin paket · 1-{n} mülk', { n: STORE_MAX_UNITS })}</Text>
        <Row between>
          <Text v="h3" color={plan === 'bes' ? c.heroInk : c.ink}>{planLabel(plan)}</Text>
          <Text v="small" color={plan === 'bes' ? c.heroInk : c.accentText} onPress={() => setPlan(plan === 'bes' ? 'tek' : 'bes')} accessibilityRole="button"
            accessibilityLabel={t('Paketi değiştir: {plan}', { plan: planLabel(plan === 'bes' ? 'tek' : 'bes') })} style={{ fontFamily: fonts.bodyBold, textDecorationLine: 'underline' }}>{t('Değiştir')}</Text>
        </Row>
        {a.inTrial && !a.subscribed ? <View style={{ alignSelf: 'flex-start', marginTop: 6, backgroundColor: c.lemon, borderRadius: 99, paddingHorizontal: 10, paddingVertical: 3 }}>
          <Text v="small" color={INK} style={{ fontFamily: fonts.bodyBold, fontSize: 12.5 }}>{t('Deneme · {n} gün kaldı', { n: trialDaysLeft(a) })}</Text></View> : null}
      </View>
      <Card gap={8}>
        <Text v="body" style={{ fontFamily: fonts.bodyXBold }}>{t('Mülk sayısı')}</Text>
        <Stepper name={t('Mülk sayısı')} label={t('{n} mülk', { n: units })} prev={units > minUnits} next={units < STORE_MAX_UNITS}
          onPrev={() => setUnits(units - 1)} onNext={() => setUnits(units + 1)} />
        <Muted>{t('1-{n} mülk için. 10 ve üstü mülk için Kurumsal paket.', { n: STORE_MAX_UNITS })}</Muted>
        {owned > 0 ? <Muted>{owned > STORE_MAX_UNITS ? t('{n} mülkün var; mağaza paketleri en çok {max} mülk içindir. Kurumsal paket için info@anahtar.io adresine yaz.', { n: owned, max: STORE_MAX_UNITS })
          : t('{n} mülkün var; daha az mülk için önce mülk sil/arşivle.', { n: owned })}</Muted> : null}
      </Card>
      <View style={{ gap: 10 }} accessibilityRole="radiogroup">
        <Text v="label" color={c.muted}>{t('Ödeme dönemi')}</Text>
        <PeriodCard on={!yearly} onPress={() => setYearly(false)} title={t('Aylık')} sub={t('Her ay yenilenir')}
          price={prods && prods.m.p ? prods.m.p.price : wait} per={t('/ ay')} />
        <PeriodCard on={yearly} onPress={() => setYearly(true)} title={t('Yıllık')} sub={t('Her yıl yenilenir')} badge={t('2 ay ücretsiz')}
          price={prods && prods.y.p ? prods.y.p.price : wait} per={t('/ yıl')}
          notes={yMonthly ? t('{price} / ay', { price: yMonthly }) : null}
          save={saveTxt ? t('Yılda {save} tasarruf et', { save: saveTxt }) : null} />
      </View>
      {showUp ? (
        <View style={{ backgroundColor: c.hero, borderRadius: 18, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ flex: 1, gap: 4 }}>
            <Text v="small" color={c.lemon} style={{ fontFamily: fonts.bodyBold, fontSize: 12 }}>
              {upTxt ? t('Profesyonel’e geç · mülk başı +{price} / ay', { price: upTxt }) : t('Profesyonel’e geç')}</Text>
            <Text v="body" color={c.heroInk} style={{ fontFamily: fonts.bodyXBold }}>{t('Aylık ve yıllık konsolide raporlar')}</Text>
            <Text v="small" color={c.heroMuted}>{t('Tüm mülklerin tek raporda')}</Text>
            <Row wrap gap={6} style={{ marginTop: 4 }}>
              {[t('Net getiri'), t('Vergi tahmini'), t('Ekip üyeleri')].map((x) => (
                <View key={x} style={{ borderWidth: 1, borderColor: c.heroMuted, borderRadius: 99, paddingHorizontal: 8, paddingVertical: 2 }}>
                  <Text v="small" color={c.heroInk} style={{ fontSize: 11.5 }}>{x}</Text>
                </View>
              ))}
            </Row>
          </View>
          <View style={{ alignItems: 'center', gap: 8 }}>
            <Pressable onPress={() => setPlan('bes')} accessibilityRole="button" accessibilityLabel={t('Profesyonel’i seç')}
              style={{ backgroundColor: c.lemon, borderRadius: 99, paddingHorizontal: 16, paddingVertical: 8 }}>
              <Text v="small" color={INK} style={{ fontFamily: fonts.bodyXBold }}>{t('Seç')}</Text>
            </Pressable>
            <Text v="small" color={c.heroMuted} onPress={() => setHideUp(true)} accessibilityRole="button" accessibilityLabel={t('Öneriyi kapat')}>✕</Text>
          </View>
        </View>
      ) : null}
      {timing ? <Note>{timing}</Note> : null}
      {a.inTrial && !a.subscribed ? (
        <Row gap={10} align="flex-start">
          <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: c.lemon, alignItems: 'center', justifyContent: 'center', marginTop: 1 }}><Text v="small" color={INK} style={{ fontFamily: fonts.bodyXBold, fontSize: 12, lineHeight: 14 }}>✓</Text></View>
          <Muted style={{ flex: 1 }}>{t('Ücretsiz denemen hesabına bağlıdır ve {n} gün daha sürüyor. Abone olduğunda ücret hemen alınır.', { n: trialDaysLeft(a) })}</Muted>
        </Row>
      ) : null}
      {loadErr ? <Text v="small" color={c.badInk}>{loadErr}</Text> : missing ? <Note warn>{t('Bu paket mağazada henüz tanımlı değil.')}</Note> : null}
      <Button block title={kind === 'upgrade' || kind === 'downgrade' ? t('Paketi değiştir') : t('{store} ile abone ol', { store: storeName() })} loading={busy} disabled={!price || kind === 'same' || owned > STORE_MAX_UNITS}
        onPress={() => run(() => buyStore(plan, units, yearly), kind === 'downgrade' ? t('Değişikliğin kaydedildi; dönem sonunda başlayacak.') : t('Aboneliğin açıldı. Teşekkürler!'))} />
      {done ? <Text v="small" color={c.okInk}>{done}</Text> : null}
      {err ? <Text v="small" color={c.badInk}>{err}</Text> : null}
      <Muted>{t('Ödeme, satın alma onaylandığında {store} hesabından alınır. Abonelik, seçtiğin dönem sonunda aynı ücretle kendiliğinden yenilenir; yenilemeden en az 24 saat önce {store} ayarlarından iptal etmezsen ücret yeniden alınır. Aboneliği istediğin zaman {store} ayarlarından yönetebilir ya da iptal edebilirsin; iptal mevcut dönemin sonunda geçerli olur.', { store: storeName() })}</Muted>
      <Row wrap gap={8}>
        <Button kind="ghost" title={t('Satın alımları geri yükle')} disabled={busy} onPress={restore} />
        {STORE_SUBS.includes(String(a.store)) ? <Button kind="quiet" title={t('Aboneliği yönet')} onPress={() => run(() => manageStore(), '')} /> : null}
      </Row>
      {links}
      <Button kind="quiet" title={t('Kapat')} onPress={close} />
    </Stack>
  );
}
