import { useState } from 'react';
import { Linking, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { S } from '../domain/state';
import { P } from '../domain/logic';
import { t } from '../domain/i18n';
import { CONFIG, LIVE } from '../domain/config';
import { inviteLink, live } from '../domain/backend';
import { hasFeature, planLabel, roomFor } from '../domain/billing';
import { importProps } from '../domain/services';
import { readTable, templateCsv, templateXlsx, toSave, validate } from '../domain/importer';
import { waLink } from '../domain/wa';
import { host } from '../domain/host';
import { iso, t0, tl } from '../domain/util';
import { Button, Chip, Text } from '../ui/kit';
import { useColors } from '../ui/theme';
import { Card, Empty, H2, Icon, Muted, Note, Row, Seg, Stack } from './blocks';
import { useStore } from './hooks';
import { useSheet } from './overlays';
import { pickTable } from './media';
import { Page } from './screens';

const MAX = CONFIG.billing.importMax;
const msg = (e: { msg: string; p?: any }) => t(e.msg, e.p);

/** Excel ya da CSV ile toplu mülk ekleme: şablon → dosya → önizleme → içe aktarma → kiracı davetleri. */
export function ImportScreen() {
  useStore();
  const c = useColors();
  const { open } = useSheet();
  const [file, setFile] = useState('');
  const [fatal, setFatal] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<any[] | null>(null);

  if (!hasFeature('import')) return (
    <Page title={t('Toplu içe aktar')} sub={t('Excel ya da CSV ile mülklerini tek seferde ekle')} back="/mulk-sahibi">
      <Note>{t('Toplu içe aktarma {a} ve {b} paketlerinde var.', { a: planLabel('bes'), b: planLabel('kurumsal') })}</Note>
      <Button block title={t('Paketleri gör')} onPress={() => open('abonelik')} />
    </Page>
  );

  const choose = async () => {
    const f = await pickTable();
    if (!f) return;
    const me = live.user?.id;
    const mine = S.order.map((id: string) => P(id)).filter((p: any) => !p.ownerId || !me || p.ownerId === me).map((p: any) => ({ id: p.id, name: p.name, addr: p.addr }));
    setFile(f.name);
    try {
      const r = validate(readTable(f.bytes), mine, iso(t0()));
      setFatal(r.fatal); setItems(r.items);
    } catch {
      setFatal([{ msg: 'Dosya okunamadı. Excel (.xlsx) ya da CSV dosyası seç.' }]); setItems([]);
    }
  };
  const restart = () => { setFile(''); setFatal([]); setItems([]); setDone(null); };

  if (done) {
    const invites = done.filter((r) => r.code);
    return (
      <Page title={t('İçe aktarıldı')} sub={t('{n} mülk kaydedildi', { n: done.length })} back="/mulk-sahibi">
        {invites.length ? (
          <Stack gap={8}>
            <H2>{t('Kiracı davetleri')}</H2>
            <Muted>{t('Davet kodunu WhatsApp ile gönder; kiracın kodla katılınca mülkün paneline bağlanır. Kodlar 30 gün geçerlidir.')}</Muted>
            {invites.map((r) => {
              const link = LIVE ? inviteLink(r.code) : CONFIG.publicUrl + 'katil?kod=' + r.code;
              const text = t('Merhaba,') + ' ' + r.name + ' ' + t('için anahtar’da ortak panelimize katılır mısın? Davet kodun:') + ' ' + r.code + ' — ' + link;
              return (
                <Card key={r.id} gap={8}>
                  <Row between>
                    <View style={{ flex: 1 }}><Text v="h3">{r.name}</Text><Muted>{[r.tenant, r.phone].filter(Boolean).join(' · ')}</Muted></View>
                    <Text v="h3" selectable style={{ letterSpacing: 2 }}>{r.code}</Text>
                  </Row>
                  <Row>
                    <Button title={t('WhatsApp ile gönder')} style={{ flex: 1 }} onPress={() => Linking.openURL(waLink(r.phone, text)).catch(() => {})} />
                    <Button kind="ghost" title={t('Kopyala')} style={{ flex: 1 }} onPress={async () => {
                      try { await Clipboard.setStringAsync(text); host.notify({ title: t('Kopyalandı'), body: t('Davet metni panoya alındı.'), icon: 'doc' }, false); } catch {}
                    }} />
                  </Row>
                </Card>
              );
            })}
            {!LIVE ? <Note>{t('Demo modunda davet gerçek değildir; kod yalnızca akışı göstermek içindir.')}</Note> : null}
          </Stack>
        ) : <Note>{t('Dosyada kiracı bilgisi olmadığı için davet oluşturulmadı. Kiracıları mülk sayfasından davet edebilirsin.')}</Note>}
        <Button block title={t('Portföye dön')} onPress={() => host.go('/uygulama')} />
        <Button block kind="ghost" title={t('Başka dosya aktar')} onPress={restart} />
      </Page>
    );
  }

  const bad = items.filter((it) => it.errors.length);
  const ready: any[] = toSave(items);
  const adding = ready.filter((r) => !r.updateId).length;
  const room = roomFor(adding);
  const existing = items.filter((it) => it.dup && !it.errors.length).length;
  const tooMany = ready.length > MAX;
  const setAction = (line: number, action: string) => setItems((xs) => xs.map((x) => x.line === line ? { ...x, action } : x));

  return (
    <Page title={t('Toplu içe aktar')} sub={t('Excel ya da CSV ile mülklerini tek seferde ekle')} back="/mulk-sahibi">
      {file ? (
        <>
          <Row between>
            <View style={{ flex: 1 }}>
              <Text v="h3">{file}</Text>
              <Muted>{t('{n} satır', { n: items.length })} · {t('{n} hazır', { n: ready.length })}{bad.length ? ' · ' + t('{n} hatalı', { n: bad.length }) : ''}{existing ? ' · ' + t('{n} mevcut mülk', { n: existing }) : ''}</Muted>
            </View>
            <Button kind="ghost" title={t('Başka dosya')} onPress={choose} />
          </Row>
          {fatal.length ? <Note warn>{fatal.map(msg).join('\n')}</Note> : null}
          {bad.length ? <Note warn>{t('{n} satırda hata var. Dosyayı düzeltip yeniden yükle; hatalı satır varken içe aktarma yapılmaz.', { n: bad.length })}</Note> : null}
          {!bad.length && tooMany ? (
            <>
              <Note warn>{t('Tek seferde en fazla {n} mülk aktarılır.', { n: MAX })} {t('Daha büyük portföyler için ekibimiz yardım eder.')}</Note>
              <Button block title={t('Bize ulaş')} onPress={() => open('destek-talebi', { kind: 'import', units: room.have + adding })} />
            </>
          ) : null}
          {bad.length || tooMany || room.ok ? null : (
            <>
              <Note warn>{t('Bu dosyayla {n} mülkün olacak; paketin {limit} mülke kadar.', { n: room.have + adding, limit: room.limit })} {room.suggest === 'kurumsal' ? t('Daha fazla mülk için Kurumsal paketi öneriyoruz.') : t('Mülk sayını artırarak devam edebilirsin.')}</Note>
              <Button block title={room.suggest === 'kurumsal' ? t('Kurumsal için bize ulaş') : t('Mülk adedini artır')} onPress={() => open('paket', { need: room.have + adding, suggest: room.suggest })} />
            </>
          )}
          {items.length ? (
            <Stack gap={8}>
              <H2>{t('Önizleme')}</H2>
              {items.map((it) => (
                <Card key={it.line} gap={6} style={it.errors.length ? { borderColor: c.badInk, borderWidth: 1.5 } : undefined}>
                  <Row between align="flex-start">
                    <View style={{ flex: 1 }}>
                      <Text v="h3">{it.data.name || t('(adsız)')}</Text>
                      <Muted>{t('Satır {line}', { line: it.line })} · {t(it.data.type)}{it.data.rent > 0 ? ' · ' + t('{amount}/ay', { amount: tl(it.data.rent) }) : ''}{it.data.tenantName ? ' · ' + it.data.tenantName : ''}</Muted>
                    </View>
                    <Chip tone={it.errors.length ? 'bad' : it.dup ? 'warn' : 'ok'} label={it.errors.length ? t('Hatalı') : it.dup ? t('Mevcut') : t('Yeni')} />
                  </Row>
                  {it.errors.map((e: any, i: number) => <Text key={i} v="small" color={c.badInk}>• {msg(e)}</Text>)}
                  {it.dup && !it.errors.length ? (
                    <>
                      <Muted>{t('Portföyünde “{name}” adlı bir mülk var.', { name: it.dup.name })}</Muted>
                      <Seg value={it.action} onChange={(v) => setAction(it.line, v)} options={[['skip', t('Atla')], ['update', t('Güncelle')]]} />
                    </>
                  ) : null}
                </Card>
              ))}
            </Stack>
          ) : fatal.length ? null : <Empty>{t('Dosyada aktarılacak satır yok')}</Empty>}
          <Button block loading={busy} disabled={!!bad.length || !!fatal.length || !ready.length || tooMany || !room.ok}
            title={ready.length ? t('{n} mülkü içe aktar', { n: ready.length }) : t('İçe aktar')}
            onPress={async () => {
              setBusy(true);
              const res = await importProps(ready);
              setBusy(false);
              if (res) { setDone(res); host.notify({ title: t('İçe aktarıldı'), body: t('{n} mülk kaydedildi', { n: res.length }), icon: 'home' }, false); }
            }} />
        </>
      ) : (
        <>
          <Card gap={10}>
            <H2>{t('Nasıl çalışır')}</H2>
            {[
              t('Şablonu indir. İlk satırdaki başlıkları değiştirme; örnek satırı sil ya da üzerine yaz.'),
              t('Her satıra bir mülk yaz. Mülk adı ve kira zorunlu; diğer sütunlar isteğe bağlı.'),
              t('Kiracı adı ya da telefonu yazarsan kaydettikten sonra WhatsApp ile davet gönderebilirsin.'),
              t('Dosyayı yükle, önizlemede hataları gör ve onayla.')
            ].map((x, i) => <Row key={i} align="flex-start"><Chip tone="accent" label={String(i + 1)} /><Text style={{ flex: 1 }}>{x}</Text></Row>)}
          </Card>
          <Row wrap>
            <Button kind="ghost" style={{ flex: 1 }} title={t('Excel şablonu')} icon={<Icon name="doc" size={16} />}
              onPress={() => host.saveFile('anahtar-mulk-sablonu.xlsx', templateXlsx(), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')} />
            <Button kind="ghost" style={{ flex: 1 }} title={t('CSV şablonu')} icon={<Icon name="doc" size={16} />}
              onPress={() => host.saveFile('anahtar-mulk-sablonu.csv', templateCsv(), 'text/csv;charset=utf-8')} />
          </Row>
          <Button block title={t('Dosya seç')} icon={<Icon name="plus" size={16} color="#fff" />} onPress={choose} />
          <Note>{t('Tek seferde en fazla {n} mülk aktarılır.', { n: MAX })} {t('Daha büyük portföyler için ekibimiz yardım eder.')}</Note>
          <Button block kind="quiet" title={t('Bize ulaş')} onPress={() => open('destek-talebi', { kind: 'import' })} />
        </>
      )}
    </Page>
  );
}
