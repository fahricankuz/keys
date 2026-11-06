/* Telefon uygulamasında paket satın alma (App Store / Google Play, RevenueCat). Web'de bu ekran yoktur:
   satın alma sanal POS sayfasından (/satin-al) yapılır. Mağaza kuralı gereği uygulamadan web ödemesine yönlendirme yapılmaz. */
import { useEffect, useState } from 'react';
import { Linking, Platform, View } from 'react-native';
import { t } from '../domain/i18n';
import { CONFIG } from '../domain/config';
import { humanError } from '../domain/backend';
import { access, ownedCount, planLabel } from '../domain/billing';
import { storeProduct, buyStore, restoreStore, manageStore, storeAvailable } from '../domain/iap';
import { STORE_MAX_UNITS } from '../domain/store-ids';
import { Button, Text } from '../ui/kit';
import { fonts, useColors } from '../ui/theme';
import { Muted, Note, Row, Seg, Stack, Stepper } from './blocks';
import { Title } from './forms';

const storeName = () => (Platform.OS === 'ios' ? 'App Store' : 'Google Play');

/** Paket, mülk adedi ve dönem seçilir; fiyat mağazadan okunur. */
export function StorePurchaseSheet({ plan: plan0 = 'tek', yearly: y0 = false, units: u0, close }: { plan?: string; yearly?: boolean; units?: number; close: () => void }) {
  const c = useColors();
  const [plan, setPlan] = useState(plan0 === 'bes' ? 'bes' : 'tek');
  const [yearly, setYearly] = useState(!!y0);
  const [units, setUnits] = useState(Math.min(STORE_MAX_UNITS, Math.max(1, u0 || ownedCount() || 1)));
  const [price, setPrice] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  useEffect(() => {
    let on = true;
    setPrice(null); setMissing(false);
    storeProduct(plan, units, yearly).then((p: any) => { if (on) { setPrice(p ? p.price : null); setMissing(!p); } })
      .catch((e: any) => { if (on) { setMissing(true); setErr(humanError(e)); } });
    return () => { on = false; };
  }, [plan, units, yearly]);
  const run = async (f: () => Promise<any>, ok: string) => {
    setBusy(true); setErr(null); setDone(null);
    try { if (await f()) setDone(ok); } catch (e) { setErr(humanError(e)); }
    setBusy(false);
  };
  if (!storeAvailable()) return <Stack><Title>{t('Paketler')}</Title><Note>{t('Mağaza içi satın alma bu cihazda henüz açık değil.')}</Note></Stack>;
  const per = yearly ? t('/ yıl') : t('/ ay');
  return (
    <Stack gap={14}>
      <Title>{t('{plan} paketi', { plan: planLabel(plan) })}</Title>
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
      {missing && !err ? <Note warn>{t('Bu paket mağazada henüz tanımlı değil.')}</Note> : null}
      <Button block title={t('{store} ile abone ol', { store: storeName() })} loading={busy} disabled={!price}
        onPress={() => run(() => buyStore(plan, units, yearly), t('Aboneliğin açıldı. Teşekkürler!'))} />
      {done ? <Text v="small" color={c.okInk}>{done}</Text> : null}
      {err ? <Text v="small" color={c.badInk}>{err}</Text> : null}
      <Muted>{t('Abonelik {store} hesabından ödenir ve dönem sonunda kendiliğinden yenilenir; yenilemeden en az 24 saat önce iptal etmezsen aynı ücret yeniden alınır. Aboneliği {store} ayarlarından yönetebilir ya da iptal edebilirsin. İlk ay ücretsizse, deneme bitmeden iptal edersen ücret alınmaz.', { store: storeName() })}</Muted>
      <Row wrap gap={8}>
        <Button kind="ghost" title={t('Satın alımları geri yükle')} disabled={busy}
          onPress={() => run(async () => { const ok = await restoreStore(); if (!ok) throw new Error(t('Bu mağaza hesabında etkin abonelik bulunamadı.')); return true; }, t('Aboneliğin geri yüklendi.'))} />
        {['app_store', 'play_store'].includes(String((access() as any).store)) ? <Button kind="quiet" title={t('Aboneliği yönet')} onPress={() => run(() => manageStore(), '')} /> : null}
      </Row>
      <Row gap={16} style={{ justifyContent: 'center' }}>
        <Text v="small" color={c.muted} onPress={() => Linking.openURL(CONFIG.legal.terms)} accessibilityRole="link" style={{ textDecorationLine: 'underline' }}>{t('Kullanım koşulları')}</Text>
        <Text v="small" color={c.muted} onPress={() => Linking.openURL(CONFIG.legal.privacy)} accessibilityRole="link" style={{ textDecorationLine: 'underline' }}>{t('Gizlilik politikası')}</Text>
      </Row>
      <Button kind="quiet" title={t('Kapat')} onPress={close} />
    </Stack>
  );
}
