/* Telefon uygulamasında paket satın alma (App Store / Google Play, RevenueCat). Web'de bu ekran yoktur:
   web satın alma sayfası (/satin-al) "uygulamadan abone ol" der. Mağaza kuralı gereği uygulamadan web ödemesine yönlendirme yapılmaz.
   Fiyat ve dönem mağazadan okunur; deneme mağazada değil sunucudadır (hesap açılınca 30 gün), mağaza deneme teklifi yoktur. */
import { useEffect, useState } from 'react';
import { Linking, Platform, View } from 'react-native';
import { t } from '../domain/i18n';
import { CONFIG } from '../domain/config';
import { humanError } from '../domain/backend';
import { access, ownedCount, planLabel, trialDaysLeft, unitsText } from '../domain/billing';
import { storeProduct, buyStore, restoreStore, manageStore, storeAvailable, storeReady } from '../domain/iap';
import { STORE_MAX_UNITS, parseStoreProductId, changeKind } from '../domain/store-ids';
import { fmtFull } from '../domain/util';
import { Button, Text } from '../ui/kit';
import { fonts, useColors } from '../ui/theme';
import { Muted, Note, Row, Seg, Stack, Stepper } from './blocks';
import { Title } from './forms';
import { useStore } from './hooks';

const storeName = () => (Platform.OS === 'ios' ? 'App Store' : 'Google Play');
const STORE_SUBS = ['app_store', 'play_store'];

/** Paket, mülk adedi ve dönem seçilir; fiyat mağazadan okunur. */
export function StorePurchaseSheet({ plan: plan0 = 'tek', yearly: y0 = false, units: u0, close }: { plan?: string; yearly?: boolean; units?: number; close: () => void }) {
  useStore();     // satın alma sonrası erişim durumu tazelenince "mevcut paket" satırı güncellenir
  const c = useColors();
  const [plan, setPlan] = useState(plan0 === 'bes' ? 'bes' : 'tek');
  const [yearly, setYearly] = useState(!!y0);
  const [units, setUnits] = useState(Math.min(STORE_MAX_UNITS, Math.max(1, u0 || ownedCount() || 1)));
  const [price, setPrice] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
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
    setPrice(null); setMissing(false);
    storeProduct(plan, units, yearly).then((p: any) => { if (on) { setPrice(p ? p.price : null); setMissing(!p); } })
      .catch((e: any) => { if (on) { setMissing(true); setErr(humanError(e)); } });
    return () => { on = false; };
  }, [plan, units, yearly, available, ready]);
  const run = async (f: () => Promise<any>, ok: string) => {
    setBusy(true); setErr(null); setDone(null);
    try { if (await f()) setDone(ok); } catch (e) { setErr(humanError(e)); }
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
  const per = yearly ? t('/ yıl') : t('/ ay');
  const timing = kind === 'upgrade' ? t('Yükseltme hemen başlar; mevcut dönemden kalan süre yeni paketin ücretine orantılı olarak yansıtılır.')
    : kind === 'downgrade' ? (when ? t('Bu değişiklik mevcut dönemin sonunda ({date}) başlar; o zamana kadar şimdiki paketin geçerli kalır, yeni ücret dönem sonunda alınır.', { date: when }) : t('Bu değişiklik mevcut dönemin sonunda başlar; o zamana kadar şimdiki paketin geçerli kalır, yeni ücret dönem sonunda alınır.'))
    : kind === 'same' ? t('Bu zaten mevcut paketin.') : null;
  return (
    <Stack gap={14}>
      <Title>{t('{plan} paketi', { plan: planLabel(plan) })}</Title>
      {fromStore ? (
        <View style={{ gap: 2 }}>
          <Text v="small" style={{ fontFamily: fonts.bodyBold }}>
            {t('Mevcut paketin: {plan}', { plan: planLabel(a.plan || a.productId) })}{' · '}{unitsText(a.units)}{current ? ' · ' + (current.yearly ? t('Yıllık') : t('Aylık')) : ''}
          </Text>
          {when ? <Muted>{a.willRenew === false ? t('{date} tarihine kadar geçerli, yenilenmeyecek.', { date: when }) : t('{date} tarihinde yenilenir', { date: when })}</Muted> : null}
        </View>
      ) : null}
      {['admin', 'promotional'].includes(String(a.store)) ? <Note>{t('Hesabında yönetici tarafından verilmiş bir paket var; mağaza aboneliği onu değiştirmez.')}</Note> : null}
      <Seg value={plan} onChange={setPlan} options={[['tek', planLabel('tek')], ['bes', planLabel('bes')]]} />
      <Seg value={yearly ? 'y' : 'm'} onChange={(v) => setYearly(v === 'y')} options={[['m', t('Aylık')], ['y', t('Yıllık · 2 ay ücretsiz')]]} />
      <View style={{ gap: 6 }}>
        <Text v="small" style={{ fontFamily: fonts.bodyBold }}>{t('Mülk sayısı')}</Text>
        <Stepper name={t('Mülk sayısı')} label={t('{n} mülk', { n: units })} prev={units > 1} next={units < STORE_MAX_UNITS}
          onPrev={() => setUnits(units - 1)} onNext={() => setUnits(units + 1)} />
        <Muted>{t('1-{n} mülk için. 10 ve üstü mülk için Kurumsal paket.', { n: STORE_MAX_UNITS })}</Muted>
      </View>
      <Row between>
        <Text v="body" style={{ fontFamily: fonts.bodyXBold }}>{t('Toplam')}</Text>
        <Text v="h3">{price ? price + ' ' + per : missing ? '—' : t('Yükleniyor…')}</Text>
      </Row>
      {timing ? <Note>{timing}</Note> : null}
      {a.inTrial && !a.subscribed ? <Muted>{t('Ücretsiz denemen hesabına bağlıdır ve {n} gün daha sürüyor. Abone olduğunda ücret hemen alınır.', { n: trialDaysLeft(a) })}</Muted> : null}
      {missing && !err ? <Note warn>{t('Bu paket mağazada henüz tanımlı değil.')}</Note> : null}
      <Button block title={kind === 'upgrade' || kind === 'downgrade' ? t('Paketi değiştir') : t('{store} ile abone ol', { store: storeName() })} loading={busy} disabled={!price || kind === 'same'}
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
