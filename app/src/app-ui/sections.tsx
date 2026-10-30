/* Ekran bölümleri: views.js'in React karşılığı (aynı veri, aynı kurallar). */
import { useEffect, useState } from 'react';
import { Image, Linking, Pressable, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { S, ui, STEPS, CONDITIONS, docCatsFor, isCommercial } from '../domain/state';
import { estimate, stopajRate } from '../domain/tax';
import {
  P, period, remaining, openReqs, otherPerson, otherLabel, rentAt, expectedAt, tenantsLabel, meTenant, senderName,
  expensesIn, sum, moveOutSummary, unpaid, yearNumbers, agendaItems, chip, rentDuesIn, isMineMsg,
  aidatOn, aidatByTenant, aidatMonths, aidatDue
} from '../domain/logic';
import { can, isOwnerOf, memberRole } from '../domain/team';
import { t, locale } from '../domain/i18n';
import { act } from '../domain/services';
import { toApp } from '../domain/nav';
import { tl, fmt, fmtFull, monthYear, parse, t0, iso, between, daysTo, tm, dayLabel, percent, mkey, addM } from '../domain/util';
import { Button, Chip, PressScale, Text } from '../ui/kit';
import { fonts, radius, useBreakpoint, useColors } from '../ui/theme';
import {
  Avatar, Bar, Big, BigRoll, Card, Empty, FileLink, H2, Hero, Icon, IconBtn, Items, KV, Label, LI, List, Mid, Muted, Note, ReviewChip, Row, Seg, Stack, Steps, StatusChip, Thumbs, initials, toneOf, typeIcon, MonthLegend, YearTiles
} from './blocks';
import { Toggle } from './forms';
import { LegalLink, LegalNudge } from './legal';
import { SiteUnitCharges } from './site';
import { useAuth } from '../auth/auth';
import { useStore } from './hooks';
import { humanError, refreshProperty, olderMessages } from '../domain/backend';
import { mySiteUnits, linkSiteUnit, unitLabel } from '../domain/site';
import { Picked, pickImages, takePhoto } from './media';
import { mediaSrc } from '../domain/backend';
import { LIVE } from '../domain/config';
import { useSheet } from './overlays';
import { Platform } from 'react-native';

export function useGo() {
  const router = useRouter();
  return (path: string) => router.push(toApp(path) as any);
}

/* ---------------- ödeme ---------------- */

export function stopajLine(p: any, key: string) {
  const gross = rentAt(p, key), rate = stopajRate(String(key).slice(0, 4));
  return t('Brüt {gross} · stopaj {pct} ({tax}) kiracı öder', { gross: tl(gross), pct: percent(rate * 100), tax: tl(gross - expectedAt(p, key)) });
}
const depositText = (p: any) => (p.depositKind === 'Teminat mektubu' ? t('Teminat mektubu') : tl(p.deposit));

export function RentHero({ p }: { p: any }) {
  const { open } = useSheet();
  const per: any = period(p);
  const dd = between(t0(), per.due);
  let line: string;
  switch (per.status) {
    case 'late': line = t('{n} gün gecikti · vade {date}', { n: -dd, date: fmtFull(per.due) }); break;
    case 'review': line = t('Dekont yüklendi ·') + ' ' + (ui.role === 'tenant' ? t('mülk sahibi onayı bekleniyor') : t('onayını bekliyor')); break;
    case 'partial': line = t('{paid} ödendi · {left} bakiye', { paid: tl(per.rec?.amount || 0), left: tl(remaining(p, per.key)) }); break;
    case 'rejected': line = t('Dekont reddedildi') + (per.rec?.rejectReason ? ' · ' + per.rec.rejectReason : ''); break;
    case 'approved': line = t('Ödendi ve onaylandı'); break;
    default: line = t('Son ödeme') + ' ' + fmtFull(per.due) + ' · ' + (dd === 0 ? t('bugün') : t('{n} gün kaldı', { n: dd }));
  }
  const key = per.key, pid = p.id;
  let action: any = null;
  if (ui.role === 'tenant') {
    if (['pending', 'late', 'rejected'].includes(per.status)) action = <Button kind="primary" block title={t('Dekont yükle')} icon={<Icon name="doc" size={16} color="#fff" />} onPress={() => open('odeme', { pid, key })} />;
    else if (per.status === 'partial') action = <Button kind="primary" block title={`${t('Kalan')} ${tl(remaining(p, key))} ${t('için dekont yükle')}`} onPress={() => open('odeme', { pid, key })} />;
    else if (per.status === 'review') action = <Button kind="onDark" block title={t('Yüklediğin dekontu gör')} onPress={() => open('dekont', { pid, key })} />;
  } else if (per.status === 'review') {
    action = can(pid, 'decide')
      ? <Row><Button kind="onDark" title={t('Dekontu gör')} onPress={() => open('dekont', { pid, key })} style={{ flex: 1 }} /><Button title={t('Onayla')} onPress={() => act('approvePay', { pid, key })} style={{ flex: 1 }} /></Row>
      : <Button kind="onDark" block title={t('Dekontu gör')} onPress={() => open('dekont', { pid, key })} />;
  } else if ((per.status === 'late' || per.status === 'partial') && can(pid, 'message')) {
    action = <Button kind="primary" block title={t('Nazik hatırlatma gönder')} onPress={() => act('nudge', { pid })} />;
  }
  return (
    <Hero>
      <Row between align="flex-start">
        <View style={{ flex: 1, gap: 4 }}>
          <Label onDark>{monthYear(per.key)} {t('kirası')}</Label>
          <BigRoll onDark value={expectedAt(p, per.key)} />
          {p.stopaj ? <Muted onDark>{stopajLine(p, per.key)}</Muted> : null}
          <View style={{ marginVertical: 6, gap: 10 }}><YearTiles p={p} onDark /><MonthLegend onDark /></View>
          <Muted onDark>{line}</Muted>
        </View>
        <StatusChip st={per.status} />
      </Row>
      {action}
    </Hero>
  );
}

/** Kira 10 günden fazla gecikince mülk sahibine hukuki destek kartı (o ay için gizlenebilir). */
function LateLegal({ p }: { p: any }) {
  const per: any = period(p);
  if (ui.role !== 'landlord' || per.status !== 'late' || -between(t0(), per.due) <= 10) return null;
  return <LegalNudge pid={p.id} topic="gecikme" hideKey={p.id + ':' + per.key} title={t('Gecikme uzadı mı?')}
    body={t('İhtar ve takip sürecini ekibimiz ve anlaşmalı hukuk büromuz birlikte yürütsün.')} />;
}

const renewLegal = (p: any) => <LegalLink pid={p.id} topic="artis" text={ui.role === 'tenant' ? t('Artış ya da tahliye konusunda anlaşamadınız mı?') : t('Kiracı artışa ya da tahliyeye itiraz mı ediyor?')} />;

export function RenewalCard({ p }: { p: any }) {
  const { open } = useSheet();
  const rd = daysTo(p.contractEnd);
  const r = p.renewal;
  const go = useGo();
  if (r && r.status === 'sent') {
    if (ui.role === 'tenant')
      return (
        <Card>
          <Row between><H2>{t('Yenileme teklifi geldi')}</H2><Chip tone="warn" label={t('Yanıt bekliyor')} /></Row>
          <View><KV k={t('Mevcut kira')} v={tl(p.rent)} /><KV k={t('Önerilen kira')} v={tl(r.amount)} /><KV k={t('Yasal üst sınır (TÜFE {pct})', { pct: percent(r.cpi, 2) })} v={tl(r.max)} /></View>
          {r.amount < r.max ? <Note>{t('Teklif yasal üst sınırın')} {tl(r.max - r.amount)} {t('altında.')}</Note> : null}
          <Row><Button title={t('Kabul et')} onPress={() => act('acceptRenewal', { pid: p.id })} style={{ flex: 1 }} /><Button kind="ghost" title={t('Görüşelim')} onPress={() => act('goMsg', { pid: p.id })} style={{ flex: 1 }} /></Row>
          {renewLegal(p)}
        </Card>
      );
    return (
      <Card>
        <Row between><H2>{t('Yenileme teklifi gönderildi')}</H2><Chip tone="warn" label={t('Yanıt bekleniyor')} /></Row>
        <Muted>{tl(r.amount)} {t('önerdin · yasal üst sınır')} {tl(r.max)}</Muted>
        {can(p.id, 'shared') ? <Button kind="ghost" title={t('Teklifi geri çek')} onPress={() => act('cancelRenewal', { pid: p.id })} /> : null}
        {renewLegal(p)}
      </Card>
    );
  }
  if (r && r.status === 'accepted')
    return (
      <Card>
        <Row between><H2>{t('Yeni dönem kirası')}</H2><Chip tone="ok" label={t('Anlaşıldı')} /></Row>
        <Muted>{fmtFull(parse(p.contractEnd))} {t('itibarıyla')} {tl(r.amount)}</Muted>
      </Card>
    );
  if (rd > S.settings.renewDays) return null;
  return (
    <Card>
      <Row between><H2>{t('Sözleşme yenileme')}</H2><Chip tone={rd <= 30 ? 'bad' : 'warn'} label={t('{n} gün', { n: rd })} /></Row>
      <Muted>{t('Sözleşme {date} tarihinde yenileniyor. Artış, son 12 aylık TÜFE ortalamasıyla sınırlıdır; iki taraf da aynı hesabı görür.', { date: fmtFull(parse(p.contractEnd)) })}</Muted>
      <Button kind={ui.role === 'landlord' && can(p.id, 'shared') ? 'primary' : 'ghost'} block title={ui.role === 'landlord' && can(p.id, 'shared') ? t('Artışı hesapla ve teklif gönder') : t('Yasal üst sınırı hesapla')} onPress={() => open('yenileme', { pid: p.id })} />
      {renewLegal(p)}
    </Card>
  );
}

export function RentHistoryCard({ p }: { p: any }) {
  const hist = (p.rentHistory || []).slice().sort((a: any, b: any) => (a.from < b.from ? 1 : -1));
  if (!hist.length) return null;
  const today = iso(t0());
  return (
    <Stack gap={8}>
      <Row between><H2>{t('Kira tutarı geçmişi')}</H2><Muted>{t('{n} dönem', { n: hist.length })}</Muted></Row>
      <Items data={hist} render={(h: any, last, i) => {
        const prev = hist[i + 1];
        const pct = prev && prev.amount ? Math.round((h.amount / prev.amount - 1) * 1000) / 10 : null;
        const future = h.from > today;
        return <LI key={h.from} last={last} title={tl(h.amount)} sub={fmtFull(parse(h.from)) + (future ? ' ' + t('itibarıyla') : '') + (h.note ? ' · ' + t(h.note) : '')}
          right={pct != null ? <Chip tone={future ? 'warn' : 'neutral'} label={(pct >= 0 ? '+' : '') + percent(pct, 2)} /> : <Chip label={t('Başlangıç')} />} />;
      }} />
    </Stack>
  );
}

export function SecPay({ p }: { p: any }) {
  const { open } = useSheet();
  const keys = Object.keys(p.pay).sort().reverse();
  const year = new Date().getFullYear();
  const paidYear = keys.filter((k) => k.startsWith(String(year)) && p.pay[k].status === 'approved');
  return (
    <Stack>
      <RentHero p={p} />
      <LateLegal p={p} />
      <RenewalCard p={p} />
      <AidatCard p={p} />
      <Card gap={4}><Label>{t('Depozito')}</Label><Text v="h3">{depositText(p)}</Text><Muted>{p.depositNote}</Muted></Card>
      <Stack gap={8}>
        <H2>{t('Faturalar kimin adına?')}</H2>
        {p.bills.length
          ? <Items data={p.bills} render={(b: any, last) => <LI key={b.n} last={last} title={b.n} right={<Chip label={t(b.who)} />} />} />
          : <Muted>{t('Fatura kaydı yok.')}</Muted>}
      </Stack>
      <RentHistoryCard p={p} />
      <Stack gap={8}>
        <Row between><H2>{t('Ödeme geçmişi')}</H2><Muted>{t('{year}: {n} ödeme onaylı', { year, n: paidYear.length })}</Muted></Row>
        {keys.length
          ? <Items data={keys} render={(k, last) => {
              const r = p.pay[k];
              return <LI key={k} last={last} onPress={() => open('dekont', { pid: p.id, key: k })} title={monthYear(k)}
                sub={(r.receipt ? r.receipt + ' · ' : '') + (r.date ? fmtFull(parse(r.date)) : '') + (r.status === 'partial' ? ' · ' + tl(r.amount) : '')} right={<StatusChip st={r.status} />} />;
            }} />
          : <Empty>{t('Henüz ödeme kaydı yok.')}</Empty>}
      </Stack>
    </Stack>
  );
}

/** Aidat: kiradan ayrı izlenen kalem. Kiracı ödüyorsa kiracı dekont yükler, mülk sahibi onaylar;
    mülk sahibi ödüyorsa kendi ödemesini kaydeder. Son altı ayın durumu listelenir. */
/** Mülk sitedeki bir daireye bağlıysa aidat siteden gelir (yönetimin tahakkuku); değilse mülkteki aidat izlenir. */
export function AidatCard({ p }: { p: any }) {
  useStore();
  const owner = ui.role === 'landlord' && isOwnerOf(p.id);
  if (p.siteUnitId) {
    return (
      <Card gap={10}>
        <SiteUnitCharges unitId={p.siteUnitId} />
        {owner ? <SiteLinker p={p} /> : null}
      </Card>
    );
  }
  return <LocalAidat p={p} footer={owner ? <SiteLinker p={p} /> : null} />;
}

/** Ev sahibi: mülkü sitedeki dairesine bağlar ya da bağı kaldırır. Site yönetiminden aldığı malik davet koduyla başlar. */
function SiteLinker({ p }: { p: any }) {
  const c = useColors();
  const { join } = useAuth();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const act = async (fn: () => Promise<any>) => { setBusy(true); setErr(null); try { await fn(); await refreshProperty(p.id); } catch (e) { setErr(humanError(e)); } setBusy(false); };
  if (p.siteUnitId) {
    return <Button kind="quiet" title={t('Site dairesi bağlantısını kaldır')} onPress={() => act(() => linkSiteUnit(p.id, null))} style={{ alignSelf: 'flex-start' }} />;
  }
  const free = mySiteUnits().filter((u: any) => u.role === 'malik' && !u.property_id);
  return (
    <View style={{ gap: 8, paddingTop: 8, borderTopWidth: 1, borderColor: c.line }}>
      {free.length ? (
        <>
          <Text v="small" style={{ fontFamily: fonts.bodyBold }}>{t('Bu mülk sitedeki dairen mi? Bağlarsan aidat siteden gelir, kiracın da görür ve öder.')}</Text>
          <Row wrap gap={6}>{free.map((u: any) => <Button key={u.unit_id} kind="ghost" title={u.org + ' · ' + unitLabel(u)} disabled={busy} onPress={() => act(() => linkSiteUnit(p.id, u.unit_id))} />)}</Row>
        </>
      ) : open ? (
        <>
          <Muted>{t('Siten anahtar kullanıyorsa yönetimden malik davet kodunu iste ve buraya gir; ardından mülkünü daireye bağla.')}</Muted>
          <Row gap={8} wrap align="flex-end">
            <TextInput value={code} onChangeText={(v) => setCode(v.toUpperCase())} accessibilityLabel={t('Site davet kodu')} placeholder="S1234ABC" placeholderTextColor={c.muted} autoCapitalize="characters" maxLength={12}
              style={{ flexGrow: 1, flexBasis: 160, minHeight: 48, borderRadius: radius.pill, paddingHorizontal: 18, borderWidth: 1.5, borderColor: c.line, color: c.ink, fontFamily: fonts.bodyBold, letterSpacing: 1.5 }} />
            <Button title={t('Kodu gir')} disabled={!code.trim() || busy} onPress={async () => { setBusy(true); const e = await join(code); setBusy(false); setErr(e); if (!e) setCode(''); }} />
          </Row>
        </>
      ) : (
        <PressScale onPress={() => setOpen(true)} accessibilityRole="button" style={{ alignSelf: 'flex-start' }}>
          <Text v="small" color={c.accentText} style={{ fontFamily: fonts.bodyBold }}>{t('Siten anahtar kullanıyor mu? Daireni bağla')} ›</Text>
        </PressScale>
      )}
      {err ? <Text v="small" color={c.badInk}>{err}</Text> : null}
    </View>
  );
}

function LocalAidat({ p, footer }: { p: any; footer?: any }) {
  const { open } = useSheet();
  const c = useColors();
  if (!aidatOn(p)) {
    return <Card gap={4}><Label>{t('Aidat')}</Label><Muted>{t('Bu mülk için aidat tanımlı değil.')}</Muted>{footer}</Card>;
  }
  const byTenant = aidatByTenant(p);
  const tenant = ui.role === 'tenant';
  // Ödemeyi kim kaydeder: aidatı kiracı ödüyorsa kiracı, mülk sahibi ödüyorsa mülk sahibi (ya da ödeme yetkili ekip üyesi).
  const payer = tenant ? byTenant : !byTenant && can(p.id, 'pay');
  if (tenant && !byTenant) {
    return <Card gap={4}><Label>{t('Aidat')}</Label><Text v="h3">{tl(p.aidat)} {t('/ ay')}</Text><Muted>{t('Aidatı mülk sahibi öder.')}</Muted>{footer}</Card>;
  }
  const months = aidatMonths(p, 6);
  const cur = months[0];
  const curOpen = cur && !['approved', 'review'].includes(cur.status);
  const record = (key: string) => open('odeme', { pid: p.id, key, kind: 'aidat' });
  return (
    <Card gap={12}>
      <Row between align="flex-start">
        <View style={{ flex: 1, gap: 2 }}>
          <Label>{t('Aidat')}</Label>
          <Text v="h3">{tl(p.aidat)} {t('/ ay')}</Text>
          <Muted>{byTenant
            ? (tenant ? t('Aidatı sen ödüyorsun. Dekontu yükle; mülk sahibin görsün.') : t('Aidatı kiracı öder. Dekontu yükleyince onaylarsın.'))
            : t('Aidatı sen ödüyorsun. Ödedikçe kaydet; geçmişi burada durur.')}</Muted>
        </View>
        <Chip tone="neutral" label={t(p.aidatPayer || 'Kiracı') + ' ' + t('öder')} />
      </Row>
      {payer && curOpen ? (
        <Button block kind={cur.status === 'late' ? 'primary' : 'ghost'}
          title={tenant ? t('{month} aidat dekontunu yükle', { month: monthYear(cur.key) }) : t('{month} aidatını kaydet', { month: monthYear(cur.key) })}
          onPress={() => record(cur.key)} />
      ) : null}
      <View>
        {months.map((m: any, i: number) => {
          const r = m.rec;
          const tap = r ? () => open('dekont', { pid: p.id, key: m.key, kind: 'aidat' }) : payer ? () => record(m.key) : undefined;
          return (
            <LI key={m.key} last={i === months.length - 1} onPress={tap} title={monthYear(m.key)}
              sub={r ? [r.receipt, r.date ? fmtFull(parse(r.date)) : '', r.status === 'partial' ? tl(r.amount) : ''].filter(Boolean).join(' · ')
                : t('Son gün {date}', { date: fmtFull(aidatDue(p, m.key)) })}
              right={<StatusChip st={m.status} />} />
          );
        })}
      </View>
      {footer}
    </Card>
  );
}

/* ---------------- talepler ---------------- */

const chosenQuote = (r: any) => (r.quotes || []).find((q: any) => q.chosen) || null;

export function ReqCard({ p, r, showProp }: { p: any; r: any; showProp?: boolean }) {
  const { open } = useSheet();
  const c = useColors();
  const shots = (r.shots || []).length + (r.photos || 0);
  const cq = chosenQuote(r);
  return (
    <Card onPress={() => open('talep', { pid: p.id, id: r.id })} gap={12}>
      <Row between align="flex-start">
        <View style={{ flex: 1, gap: 3 }}>
          <Label accent>{t(r.cat)}{r.urgency === 'Acil' ? ' ' + t('· Acil') : ''}{showProp ? ' · ' + p.name : ''}</Label>
          <Text v="h3">{r.title}</Text>
        </View>
        <Muted>{fmt(parse(r.date))}</Muted>
      </Row>
      {r.cat !== 'Ek talep' ? <Steps status={r.status} labels={STEPS.map((s: string) => t(s))} /> : null}
      <Row wrap gap={6}>
        {r.cat === 'Ek talep' ? (r.decision ? <Chip tone={r.decision === 'Onaylandı' ? 'ok' : 'bad'} label={t(r.decision)} /> : <Chip tone="warn" label={t('Karar bekleniyor')} />) : null}
        {r.cost === 'Belirlenmedi' ? <Chip label={t('Masraf belirlenmedi')} /> : <Chip tone={r.costOk ? 'ok' : 'warn'} label={`${t('Masraf:')} ${t(r.cost)}${r.costOk ? ' ' + t('· onaylı') : ''}`} />}
        {shots ? <Chip label={t('{n} fotoğraf', { n: shots })} /> : null}
        {cq ? <Chip tone="accent" label={`${cq.vendor} · ${tl(cq.amount)}`} /> : (r.quotes || []).length ? <Chip label={t('{n} teklif', { n: r.quotes.length })} /> : null}
        {r.invoice ? <Chip tone="ok" label={t('Fatura işlendi')} /> : null}
      </Row>
    </Card>
  );
}

export function SecReq({ p }: { p: any }) {
  const { open } = useSheet();
  const [tab, setTab] = useState(ui.reqTab || 'open');
  const list = p.requests.filter((r: any) => (tab === 'open' ? r.status < 3 : r.status >= 3));
  const n = openReqs(p).length;
  return (
    <Stack>
      {ui.role === 'tenant' ? <Button block title={t('Yeni talep aç')} icon={<Icon name="plus" size={16} color="#fff" />} onPress={() => open('yeni-talep', { pid: p.id })} /> : null}
      <Seg value={tab} onChange={(v) => { ui.reqTab = v; setTab(v); }} options={[['open', t('Açık (') + n + ')'], ['done', t('Tamamlanan (') + (p.requests.length - n) + ')']]} />
      {list.length ? list.map((r: any) => <ReqCard key={r.id} p={p} r={r} />)
        : <Empty>{tab === 'open' ? t('Açık talep yok.') : t('Tamamlanan talep yok.')}{ui.role === 'tenant' && tab === 'open' ? '\n' + t('Bir arıza ya da isteğin olduğunda buradan açabilirsin.') : ''}</Empty>}
    </Stack>
  );
}

/* ---------------- mesajlar ---------------- */

const isMine = isMineMsg;

/** Girişte son mesajlar yüklenir; eskileri bu düğmeyle sayfa sayfa gelir. */
function OlderMessages({ pid }: { pid: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <Button kind="quiet" title={t('Daha eski mesajlar')} loading={busy} disabled={busy} style={{ alignSelf: 'center' }}
      onPress={async () => { setBusy(true); try { await olderMessages(pid); } catch {} setBusy(false); }} />
  );
}

export function SecMsg({ p }: { p: any }) {
  const c = useColors();
  const o: any = otherPerson(p);
  const [text, setText] = useState('');
  const [photo, setPhoto] = useState<Picked | null>(null);
  const { open } = useSheet();
  const send = async () => {
    const { submit } = await import('../domain/services');
    if (await submit('msg', { pid: p.id, text, files: photo ? [photo] : [] })) { setText(''); setPhoto(null); }
  };
  const attach = async (camera?: boolean) => {
    const f = camera ? await takePhoto() : await pickImages(1);
    if (f[0]) setPhoto(f[0]);
  };
  // Yazışma açıkken gelen mesajlar okunmuş sayılır.
  const lastAt = p.msgs.length ? p.msgs[p.msgs.length - 1].at : 0;
  useEffect(() => { act('markRead', { pid: p.id }); }, [p.id, lastAt]);
  let lastDay = '';
  return (
    <Stack>
      <Card>
        <Row between>
          <View><Label>{otherLabel()}</Label><Text v="h3">{o.name}</Text></View>
          {o.phone ? <Button title={t('Ara|telefon')} icon={<Icon name="phone" size={16} color="#fff" />} onPress={() => Linking.openURL('tel:' + o.phone).catch(() => {})} /> : null}
        </Row>
      </Card>
      <View style={{ gap: 8 }}>
        {p.msgs.length === 0 ? <Note>{t('Henüz mesaj yok. Yazışmalar tarihli olarak saklanır.')}</Note> : null}
        {ui.msgMore[p.id] ? <OlderMessages pid={p.id} /> : null}
        {p.msgs.map((m: any, i: number) => {
          const whoOf = (x: any) => (isMine(p, x) ? '' : senderName(p, x));
          const d = dayLabel(m.at);
          const sep = d !== lastDay ? (lastDay = d, <Text key={'d' + i} v="small" muted style={{ textAlign: 'center', marginTop: 6 }}>{d}</Text>) : null;
          const rq = m.req ? p.requests.find((x: any) => x.id === m.req) : null;
          // Talebe bağlı mesaj (kart ve talep sistem mesajları): dokununca talep açılır; durum güncel gösterilir.
          if (rq) {
            const sys = m.from === 'system';
            const mineReq = !sys && isMine(p, m);
            return (
              <View key={i} style={{ gap: 6 }}>
                {sep}
                <PressScale onPress={() => open('talep', { pid: p.id, id: rq.id })} accessibilityRole="button" accessibilityLabel={t('Talebi aç') + ': ' + rq.title} scaleTo={0.98}
                  style={{ alignSelf: sys ? 'center' : mineReq ? 'flex-end' : 'flex-start', width: '88%', backgroundColor: c.surface, borderWidth: 1, borderColor: c.line, borderLeftWidth: 4, borderLeftColor: c.accent, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, gap: 4 }}>
                  <Text v="small" color={c.accentText} style={{ fontFamily: fonts.bodyXBold, fontSize: 11, letterSpacing: 0.6 }}>{(t('Talep') + ' · ' + t(rq.cat) + (rq.urgency === 'Acil' ? ' · ' + t('Acil') : '')).toUpperCase()}</Text>
                  <Text v="body" style={{ fontFamily: fonts.bodyXBold }}>{rq.title}</Text>
                  {m.text ? <Text v="small" muted>{!sys && whoOf(m) ? whoOf(m) + ': ' : ''}{m.text}</Text> : null}
                  <Row gap={6}>
                    {rq.cat === 'Ek talep' ? (rq.decision ? <Chip tone={rq.decision === 'Onaylandı' ? 'ok' : 'bad'} label={t(rq.decision)} /> : <Chip tone="warn" label={t('Karar bekliyor')} />) : <Chip tone={rq.status === 3 ? 'ok' : 'accent'} label={t(STEPS[rq.status])} />}
                    {(rq.quotes || []).length ? <Chip tone="neutral" label={(rq.quotes || []).length + ' ' + t('teklif')} /> : null}
                  </Row>
                  <Text v="small" color={c.accentText} style={{ fontFamily: fonts.bodyXBold }}>{t('Talebi aç')} →</Text>
                  <Text v="small" muted style={{ fontSize: 11, alignSelf: 'flex-end' }}>{tm(m.at)}</Text>
                </PressScale>
              </View>
            );
          }
          if (m.from === 'system') return <View key={i} style={{ gap: 6 }}>{sep}<Text v="small" muted style={{ textAlign: 'center' }}>{m.text}</Text></View>;
          const mine = isMine(p, m);
          const who = !mine && (p.tenants.length > 1 || (ui.role === 'tenant' && m.from === 'tenant')) ? senderName(p, m) : null;
          return (
            <View key={i} style={{ gap: 6 }}>
              {sep}
              <View style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '82%', backgroundColor: mine ? c.ink : c.surface, borderWidth: mine ? 0 : 1, borderColor: c.line, borderRadius: 20, borderBottomRightRadius: mine ? 6 : 20, borderBottomLeftRadius: mine ? 20 : 6, paddingHorizontal: 14, paddingVertical: 10, gap: 2 }}>
                {who ? <Text v="small" color={c.accentText} style={{ fontFamily: fonts.bodyXBold }}>{who}</Text> : null}
                {m.img ? (
                  <PressScale onPress={() => open('foto', { src: m.img })} accessibilityRole="imagebutton" accessibilityLabel={t('Fotoğrafı büyüt')} scaleTo={0.98}>
                    <Image source={{ uri: mediaSrc(m.img) }} style={{ width: 220, height: 220, borderRadius: 14, backgroundColor: c.surface2, maxWidth: '100%' }} resizeMode="cover" />
                  </PressScale>
                ) : null}
                {m.text ? <Text v="body" color={mine ? c.bg : c.ink} style={{ fontSize: 15, lineHeight: 21 }}>{m.text}</Text> : null}
                <Text v="small" color={mine ? c.heroMuted : c.muted} style={{ fontSize: 11, alignSelf: 'flex-end' }}>{tm(m.at)}</Text>
              </View>
            </View>
          );
        })}
      </View>
      {photo ? (
        <Row>
          {photo.dataUrl ? <Image source={{ uri: photo.dataUrl }} style={{ width: 64, height: 64, borderRadius: 12 }} accessibilityLabel={t('Eklenen fotoğraf')} /> : null}
          <Muted style={{ flex: 1 }}>{photo.name}</Muted>
          <IconBtn name="x" size={16} label={t('Fotoğrafı kaldır')} onPress={() => setPhoto(null)} />
        </Row>
      ) : null}
      <Row>
        {Platform.OS !== 'web' ? <IconBtn name="cam" label={t('Kamerayla çek')} onPress={() => attach(true)} /> : null}
        <IconBtn name={Platform.OS !== 'web' ? 'doc' : 'cam'} label={t('Fotoğraf ekle')} onPress={() => attach(false)} />
        <TextInput value={text} onChangeText={setText} onSubmitEditing={send} placeholder={t('Mesaj yaz')} placeholderTextColor={c.muted} accessibilityLabel={t('Mesaj')}
          style={[{ flex: 1, minHeight: 50, borderRadius: radius.pill, paddingHorizontal: 18, backgroundColor: c.surface, borderWidth: 1.5, borderColor: c.line, color: c.ink, fontFamily: fonts.body, fontSize: 16 }, { outlineStyle: 'none' } as any]} />
        <PressScale onPress={send} accessibilityRole="button" accessibilityLabel={t('Gönder')} style={{ width: 50, height: 50, borderRadius: 25, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="send" size={20} color={c.accentInk} />
        </PressScale>
      </Row>
      <Button kind="ghost" title={t('Yazışmayı dışa aktar')} onPress={() => act('exportChat', { pid: p.id })} />
    </Stack>
  );
}

/* ---------------- belgeler ---------------- */

export function SecDocs({ p }: { p: any }) {
  const { open } = useSheet();
  const go = useGo();
  const done = p.inspect.tenantOk && p.inspect.landlordOk;
  const inspectPath = ui.role === 'tenant' ? '/kiraci/belgeler/tutanak' : '/mulk-sahibi/mulk/' + p.id + '/tutanak';
  return (
    <Stack>
      <Card onPress={() => go(inspectPath)}>
        <Row between>
          <View style={{ flex: 1 }}><H2>{t('Giriş tutanağı')}</H2><Muted>{done ? t('İki taraf da onayladı') : t('Onay bekleyen taraf var')}</Muted></View>
          <Chip tone={done ? 'ok' : 'warn'} label={done ? t('Tamam') : t('Aç')} />
        </Row>
      </Card>
      {docCatsFor(p).map((cat: string) => {
        const ds = p.docs.filter((d: any) => d.cat === cat);
        return (
          <Card key={cat} gap={8}>
            <Row between><H2>{t(cat)}</H2>{can(p.id, 'document') ? <Button kind="ghost" title={t('Yükle')} icon={<Icon name="plus" size={16} />} onPress={() => open('belge', { pid: p.id, cat })} /> : null}</Row>
            {ds.length ? ds.map((d: any) => {
              const soon = d.until && daysTo(d.until) <= 60;
              return (
                <Row key={d.id} between style={{ paddingVertical: 4 }}>
                  <View style={{ flex: 1 }}>
                    <FileLink path={d.path} label={d.name} />
                    {d.note ? <Text v="small">{d.note}</Text> : null}
                    <ReviewChip kind="document" pid={p.id} id={d.id} />
                    <Muted>{t('Yüklendi')} {fmtFull(parse(d.at))}{d.until ? ' · ' + (d.cat === 'Tahliye taahhütnamesi' ? t('tahliye') : t('bitiş')) + ' ' + fmtFull(parse(d.until)) : ''}</Muted>
                  </View>
                  {soon ? <Chip tone="warn" label={t('{n} gün', { n: daysTo(d.until) })} /> : null}
                  {ui.role === 'tenant' || isOwnerOf(p.id) || memberRole(p.id) === 'agent'
                    ? <IconBtn name="x" size={16} label={t('{name} belgesini sil', { name: d.name })} onPress={() => act('removeDoc', { pid: p.id, id: d.id })} /> : null}
                </Row>
              );
            }) : <Muted>{t('Henüz belge yok.')}</Muted>}
          </Card>
        );
      })}
      {LIVE ? null : <Muted>{t('Bu sürümde dosyalar cihazdan çıkmaz; yalnızca adları ve küçültülmüş görselleri saklanır.')}</Muted>}
    </Stack>
  );
}

/* ---------------- tutanak ---------------- */

export function areaWords(p: any) {
  return isCommercial(p) ? {
    intro: t('Teslimde alan alan kayıt al; iki taraf da onaylayınca tutanak kilitlenir. Çıkışta aynı alanlar karşılaştırmalı rapor olarak açılır.'),
    label: t('Alan adı'), add: t('Alan ekle (ör. Arşiv odası)'), del: t('alanını sil'),
    compare: t('Alan alan karşılaştırma'),
    moveOut: t('Tahliye zamanı geldiğinde çıkış sürecini buradan başlat. Giriş tutanağındaki alanlar karşılaştırma için kopyalanır; kesintiler iki tarafın onayından sonra depozitodan düşülür.')
  } : {
    intro: t('Taşınırken oda oda kayıt al; iki taraf da onaylayınca tutanak kilitlenir. Çıkışta aynı odalar karşılaştırmalı rapor olarak açılır.'),
    label: t('Oda adı'), add: t('Oda ekle (ör. Çocuk odası)'), del: t('odasını sil'),
    compare: t('Oda oda karşılaştırma'),
    moveOut: t('Taşınma zamanı geldiğinde çıkış sürecini buradan başlat. Giriş tutanağındaki odalar karşılaştırma için kopyalanır; kesintiler iki tarafın onayından sonra depozitodan düşülür.')
  };
}

export function InspectTabs({ p, active }: { p: any; active: 'giris' | 'cikis' }) {
  const go = useGo();
  const giris = ui.role === 'tenant' ? '/kiraci/belgeler/tutanak' : '/mulk-sahibi/mulk/' + p.id + '/tutanak';
  const cikis = ui.role === 'tenant' ? '/kiraci/belgeler/cikis' : '/mulk-sahibi/mulk/' + p.id + '/cikis';
  return <Seg value={active} onChange={(v) => go(v === 'giris' ? giris : cikis)} options={[['giris', t('Giriş')], ['cikis', t('Çıkış ve depozito')]]} />;
}

function PhotoButtons({ onPick, label }: { onPick: (f: any[]) => void; label?: string }) {
  return (
    <Row wrap>
      <Button kind="ghost" title={label || t('Fotoğraf ekle')} icon={<Icon name="cam" size={16} />} onPress={async () => { const f = await pickImages(6); if (f.length) onPick(f); }} />
      {Platform.OS !== 'web' ? <Button kind="ghost" title={t('Kamerayla çek')} onPress={async () => { const f = await takePhoto(); if (f.length) onPick(f); }} /> : null}
    </Row>
  );
}

function NoteInput({ value, onChange, onCommit, placeholder, label }: { value: string; onChange: (v: string) => void; onCommit?: () => void; placeholder: string; label: string }) {
  const c = useColors();
  const [v, setV] = useState(value || '');
  return (
    <TextInput value={v} onChangeText={(x) => { setV(x); onChange(x); }} onBlur={onCommit} placeholder={placeholder} placeholderTextColor={c.muted} accessibilityLabel={label}
      style={[{ minHeight: 46, borderRadius: radius.md, paddingHorizontal: 14, backgroundColor: c.bg, borderWidth: 1.5, borderColor: c.line, color: c.ink, fontFamily: fonts.body, fontSize: 15 }, { outlineStyle: 'none' } as any]} />
  );
}

export function SecInspect({ p }: { p: any }) {
  const c = useColors();
  const ins = p.inspect;
  const w = areaWords(p);
  const [room, setRoom] = useState('');
  const mineOk = ui.role === 'tenant' ? ins.tenantOk : ins.landlordOk;
  const bothOk = ins.tenantOk && ins.landlordOk;
  // Tutanağı yalnız kiracı, mülk sahibi ve emlakçı düzenler; diğer ekip üyeleri okur.
  const edit = can(p.id, 'shared');
  return (
    <Stack>
      <Note>{w.intro}</Note>
      {ins.rooms.map((r: any, i: number) => {
        const count = (r.photos || 0) + (r.shots || []).length;
        return (
          <Card key={r.n + i} gap={10}>
            <Row between>
              <Text v="h3">{r.n}</Text>
              <Row gap={6}><Chip tone={count ? (r.note ? 'warn' : 'ok') : 'neutral'} label={count ? t('{n} fotoğraf', { n: count }) : t('Fotoğraf yok')} />{edit ? <IconBtn name="x" size={16} label={r.n + ' ' + w.del} onPress={() => act('removeRoom', { pid: p.id, i })} /> : null}</Row>
            </Row>
            <Thumbs srcs={r.shots || []} onRemove={edit ? (j) => act('removeShot', { pid: p.id, i, j }) : undefined} />
            {edit ? <NoteInput label={t('Not')} value={r.note} placeholder={t('Hasar, eksik, sayaç okuması')} onChange={(v) => act('setRoomNote', { pid: p.id, i, v })} /> : r.note ? <Muted>{r.note}</Muted> : null}
            {edit ? <PhotoButtons onPick={(files) => act('addRoomPhotos', { pid: p.id, i, files })} /> : null}
          </Card>
        );
      })}
      {edit ? <Row>
        <TextInput value={room} onChangeText={setRoom} placeholder={w.add} placeholderTextColor={c.muted} accessibilityLabel={w.label}
          style={[{ flex: 1, minHeight: 46, borderRadius: radius.md, paddingHorizontal: 14, backgroundColor: c.surface, borderWidth: 1.5, borderColor: c.line, color: c.ink, fontFamily: fonts.body, fontSize: 15 }, { outlineStyle: 'none' } as any]} />
        <Button kind="ghost" title={t('Ekle')} onPress={async () => { const { submit } = await import('../domain/services'); if (await submit('room', { pid: p.id, n: room })) setRoom(''); }} />
      </Row> : null}
      <Hero>
        <Label onDark>{t('Onay durumu')}</Label>
        <KV onDark k={t('Kiracı')} v={ins.tenantOk ? t('Onayladı') : t('Bekleniyor')} />
        <KV onDark k={t('Mülk sahibi')} v={ins.landlordOk ? t('Onayladı') : t('Bekleniyor')} />
        {bothOk ? <Muted onDark>{t('Tutanak tamamlandı.')}</Muted> : !edit ? null
          : mineOk ? <Button kind="primary" block title={t('Karşı tarafa hatırlat')} onPress={() => act('nudgeInspect', { pid: p.id })} />
          : <Button kind="primary" block title={t('Tutanağı onayla')} onPress={() => act('approveInspect', { pid: p.id })} />}
        <Button kind="onDark" block title={t('Tutanağı dışa aktar')} onPress={() => act('exportInspect', { pid: p.id })} />
      </Hero>
    </Stack>
  );
}

/* ---------------- çıkış ve depozito ---------------- */

export function SecMoveOut({ p }: { p: any }) {
  const { open } = useSheet();
  const c = useColors();
  const mo = p.moveOut;
  if (!mo)
    return (
      <Stack>
        <Note>{areaWords(p).moveOut}</Note>
        <Card gap={4}><KV k={t('Depozito')} v={depositText(p)} /><KV k={t('Ödenmemiş kira')} v={tl((unpaid(p) as any).total)} /></Card>
        {can(p.id, 'shared') ? <Button block title={t('Çıkış sürecini başlat')} onPress={() => open('cikis-baslat', { pid: p.id })} /> : null}
      </Stack>
    );
  const sm: any = moveOutSummary(p);
  const both = mo.tenantOk && mo.landlordOk;
  const mineOk = ui.role === 'tenant' ? mo.tenantOk : mo.landlordOk;
  const edit = can(p.id, 'shared');
  const locked = both || !edit;
  const owner = ui.role === 'landlord' && edit;
  const due: any = unpaid(p);
  const hasUnpaidLine = (mo.deductions || []).some((d: any) => d.kind === 'rent');
  return (
    <Stack>
      <Hero gap={10}>
        <Label onDark>{t('Depozito hesabı')}{mo.date ? ' ' + t('· çıkış') + ' ' + fmtFull(parse(mo.date)) : ''}</Label>
        <KV onDark k={t('Depozito')} v={tl(sm.deposit)} />
        <KV onDark k={t('Kesintiler')} v={'− ' + tl(sm.deducted)} />
        <Row between align="flex-end">
          <View><Muted onDark>{t('İade edilecek')}</Muted><BigRoll onDark value={sm.refund} /></View>
          {mo.refunded ? <Chip tone="ok" label={t('İade edildi')} /> : both ? <Chip tone="warn" label={t('Onaylandı')} /> : <Chip label={t('Taslak')} />}
        </Row>
        {sm.extra ? <Note warn>{t('Kesintiler depozitoyu')} {tl(sm.extra)} {t('aşıyor; bu tutar kiracıdan ayrıca talep edilir.')}</Note> : null}
      </Hero>
      {p.depositKind === 'Teminat mektubu' ? <Note>{t('Depozito teminat mektubuyla verildi. Kesintiler mektuptan tahsil edilebilir; iade, mektubun kiracıya geri verilmesidir.')}</Note> : null}
      <H2>{areaWords(p).compare}</H2>
      {mo.rooms.map((r: any, i: number) => {
        const entry = p.inspect.rooms.find((x: any) => x.n === r.n);
        const entryCount = entry ? (entry.photos || 0) + (entry.shots || []).length : 0;
        const tone = r.condition === 'Aynı' ? 'ok' : r.condition === 'Yıpranmış' ? 'warn' : r.condition ? 'bad' : 'neutral';
        return (
          <Card key={r.n + i} gap={10}>
            <Row between><Text v="h3">{r.n}</Text>{r.condition ? <Chip tone={tone as any} label={t(r.condition)} /> : <Chip label={t('Değerlendirilmedi')} />}</Row>
            <Row align="flex-start" gap={14}>
              <View style={{ flex: 1, gap: 4 }}>
                <Label>{t('Girişte')}</Label>
                <Muted>{entry ? (entry.note || t('Not yok')) + ' · ' + t('{n} fotoğraf', { n: entryCount }) : t('Girişte kayıt yok')}</Muted>
                <Thumbs size={48} srcs={entry ? (entry.shots || []).slice(0, 4) : []} />
              </View>
              <View style={{ flex: 1, gap: 4 }}>
                <Label>{t('Çıkışta')}</Label>
                {locked ? <Muted>{r.note || t('Not yok')} · {t('{n} fotoğraf', { n: (r.shots || []).length })}</Muted>
                  : <NoteInput label={r.n + ' ' + t('çıkış notu')} value={r.note} placeholder={t('Durum notu')} onChange={(v) => act('setExitNote', { pid: p.id, i, v })} onCommit={() => act('commitExitNote', { pid: p.id, i })} />}
                <Thumbs size={48} srcs={r.shots || []} onRemove={locked ? undefined : (j) => act('removeExitShot', { pid: p.id, i, j })} />
              </View>
            </Row>
            {!locked ? (
              <View style={{ gap: 8 }}>
                <Row wrap gap={6}>{['', ...CONDITIONS].map((cd: string) => {
                  const on = (r.condition || '') === cd;
                  if (!cd) return null;
                  return <PressScale key={cd} onPress={() => act('setExitCond', { pid: p.id, i, v: cd })} accessibilityRole="radio" aria-checked={on} accessibilityState={{ selected: on }} scaleTo={0.96}
                    style={{ paddingHorizontal: 14, minHeight: 38, borderRadius: radius.pill, justifyContent: 'center', backgroundColor: on ? c.ink : c.surface, borderWidth: 1, borderColor: on ? c.ink : c.line }}>
                    <Text v="small" color={on ? c.bg : c.ink} style={{ fontFamily: fonts.bodyXBold }}>{t(cd)}</Text></PressScale>;
                })}</Row>
                <PhotoButtons label={t('Fotoğraf')} onPick={(files) => act('addExitPhotos', { pid: p.id, i, files })} />
              </View>
            ) : null}
          </Card>
        );
      })}
      <Stack gap={8}>
        <Row between><H2>{t('Kesintiler')}</H2>
          {!locked && owner ? <Button kind="ghost" title={t('Ekle')} icon={<Icon name="plus" size={15} />} onPress={() => open('kesinti', { pid: p.id })} /> : null}</Row>
        {(mo.deductions || []).length
          ? <Items data={mo.deductions} render={(d: any, last) => <LI key={d.id} last={last} title={d.label} sub={d.note}
              right={<Row gap={6}><Text v="small" style={{ fontFamily: fonts.bodyXBold }}>{tl(d.amount)}</Text>{!locked && owner ? <IconBtn name="x" size={16} label={t('{name} kesintisini sil', { name: d.label })} onPress={() => act('removeDeduction', { pid: p.id, id: d.id })} /> : null}</Row>} />} />
          : <Muted>{t('Kesinti yok; depozitonun tamamı iade edilir.')}</Muted>}
        {!locked && owner && due.total > 0 && !hasUnpaidLine
          ? <Button kind="ghost" block title={t('Ödenmemiş kirayı ekle (') + tl(due.total) + ')'} onPress={() => act('addUnpaidDeduction', { pid: p.id })} /> : null}
      </Stack>
      <Card gap={10}>
        <H2>{t('Onaylar')}</H2>
        <KV k={t('Kiracı')} v={mo.tenantOk ? t('Onayladı') : t('Bekleniyor')} />
        <KV k={t('Mülk sahibi')} v={mo.landlordOk ? t('Onayladı') : t('Bekleniyor')} />
        {mo.refunded ? <Note>{t('{amount}, {date} tarihinde iade edildi.', { amount: tl(mo.refunded.amount), date: fmtFull(parse(mo.refunded.date)) })}</Note>
          : !mineOk ? (edit ? <Button block title={t('Hesabı onayla')} onPress={() => act('approveMoveOut', { pid: p.id })} /> : <Muted>{t('Onay bekleniyor')}</Muted>)
          : !both ? <Muted>{t('Karşı tarafın onayı bekleniyor. Bir kalem değişirse onaylar sıfırlanır.')}</Muted>
          : owner ? <Button block title={t('İadeyi yaptım')} onPress={() => open('iade', { pid: p.id })} />
          : <Muted>{t('Mülk sahibinin iadeyi yapması bekleniyor.')}</Muted>}
        <Button kind="ghost" block title={t('Çıkış raporunu dışa aktar')} onPress={() => act('exportMoveOut', { pid: p.id })} />
        {!mo.refunded && owner ? <Button kind="quiet" block title={t('Çıkış sürecini iptal et')} onPress={() => act('cancelMoveOut', { pid: p.id })} /> : null}
      </Card>
      {mo.refunded ? null : <LegalLink pid={p.id} topic="depozito" text={ui.role === 'tenant' ? t('Depozito iade edilmedi mi ya da kesintilere itirazın mı var?') : t('Kesintiler ya da hasar konusunda anlaşamadınız mı?')} />}
    </Stack>
  );
}

/* ---------------- gider defteri ---------------- */

export function SecExpenses({ p }: { p: any }) {
  const { open } = useSheet();
  const thisYear = String(new Date().getFullYear());
  const [year, setYear] = useState(String(ui.expenseYear || thisYear));
  const years = [...new Set([thisYear, ...(p.expenses || []).map((e: any) => String(e.date).slice(0, 4))])].sort().reverse() as string[];
  const list = expensesIn(p, year).slice().sort((a: any, b: any) => (a.date < b.date ? 1 : -1));
  const total = sum(list);
  const byCat: Record<string, number> = {};
  list.forEach((e: any) => { byCat[e.cat] = (byCat[e.cat] || 0) + Number(e.amount); });
  const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...cats.map((x) => x[1]));
  const yn: any = (yearNumbers(year) as any).rows.find((r: any) => r.id === p.id);
  return (
    <Stack>
      <Row between wrap>
        <Seg scroll value={year} onChange={(y) => { ui.expenseYear = y; setYear(y); }} options={years.map((y) => [y, y] as [string, string])} />
        {can(p.id, 'expense') ? <Button title={t('Gider ekle')} icon={<Icon name="plus" size={15} color="#fff" />} onPress={() => open('gider', { pid: p.id })} /> : null}
      </Row>
      <Hero>
        <Label onDark>{t('{year} net getiri', { year })}</Label>
        <BigRoll onDark value={yn.net} />
        <Row><View style={{ flex: 1 }}><Muted onDark>{yn.withheld ? t('Brüt kira') : t('Tahsil edilen')}</Muted><Text v="h3" color="#fff">{tl(yn.gross)}</Text></View><View style={{ flex: 1 }}><Muted onDark>{t('Giderler')}</Muted><Text v="h3" color="#fff">{tl(yn.exp)}</Text></View></Row>
        {yn.withheld ? <Muted onDark>{t('Hesaba geçen {received} · kiracının kestiği stopaj {tax}', { received: tl(yn.received), tax: tl(yn.withheld) })}</Muted> : null}
        {yn.yieldPct != null ? <Muted onDark>{t('Değere göre net getiri: {pct}', { pct: percent(yn.yieldPct * 100) })}</Muted> : null}
      </Hero>
      {cats.length ? (
        <Card gap={12}><H2>{t('Kategoriye göre')}</H2>
          {cats.map(([cat, v]) => <View key={cat} style={{ gap: 6 }}><Row between><Text v="small" style={{ fontFamily: fonts.bodyXBold }}>{t(cat)}</Text><Text v="small" style={{ fontFamily: fonts.bodyXBold }}>{tl(v)}</Text></Row><Bar pct={(v / max) * 100} /></View>)}
        </Card>
      ) : null}
      <Stack gap={8}>
        <Row between><H2>{t('Kayıtlar')}</H2><Muted>{t('{n} gider · {amount}', { n: list.length, amount: tl(total) })}</Muted></Row>
        {list.length
          ? <Items data={list} render={(e: any, last) => <LI key={e.id} last={last} onPress={can(p.id, 'expense') ? () => open('gider', { pid: p.id, id: e.id }) : undefined} title={t(e.cat)}
              sub={fmtFull(parse(e.date)) + (e.note ? ' · ' + e.note : '') + (e.reqId ? ' ' + t('· talebe bağlı') : '')} right={<Text v="small" style={{ fontFamily: fonts.bodyXBold }}>{tl(e.amount)}</Text>} />} />
          : <Empty>{year} {t('için gider kaydı yok.')}</Empty>}
      </Stack>
    </Stack>
  );
}

/* ---------------- gündem ---------------- */

export function AgendaSection({ p }: { p: any }) {
  const go = useGo();
  const items = agendaItems(p);
  return (
    <Stack gap={8}>
      <H2>{t('Gündem')}</H2>
      <Items data={items} render={(it: any, last) => <LI key={it.title + it.sub} last={last} onPress={() => go(it.go)} title={it.title} sub={it.sub}
        right={<Chip tone={toneOf(it.cls || (it.days != null && it.days <= 14 ? 'bad' : ''))} label={it.chip} />} />} />
    </Stack>
  );
}

/* Takvim: ay görünümü (ızgara + günün işleri) ve ajanda (gecikmiş / bu hafta / bu ay / sonrası). */
const CAL_KIND = (k: string) => (['pay', 'contract', 'dask', 'eviction', 'req'].includes(k) ? k : 'other');
const CAL_NAME: Record<string, string> = { pay: 'Kira vadesi', contract: 'Sözleşme yenileme', dask: 'DASK', eviction: 'Tahliye', req: 'Talep', other: 'Diğer' };
const CAL_MARK: Record<string, string> = { pay: 'K', contract: 'S', dask: 'D', eviction: 'T', req: 'A', other: '•' };
function useCalStyle() {
  const c = useColors();
  return (k: string) => ({
    pay: { bg: c.accent, ink: c.accentInk }, contract: { bg: c.okInk, ink: c.okBg }, dask: { bg: c.warnBg, ink: c.warnInk },
    eviction: { bg: c.ink, ink: c.bg }, req: { bg: c.muted, ink: c.bg }, other: { bg: c.surface2, ink: c.ink }
  } as Record<string, { bg: string; ink: string }>)[k];
}
function CalBadge({ kind, size = 20 }: { kind: string; size?: number }) {
  const st = useCalStyle()(kind);
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: st.bg, alignItems: 'center', justifyContent: 'center' }}>
      <Text v="small" color={st.ink} style={{ fontFamily: fonts.bodyXBold, fontSize: size * 0.55, lineHeight: size * 0.7 }}>{CAL_MARK[kind]}</Text>
    </View>
  );
}
function CalLegend() {
  return (
    <View role="list" aria-label={t('Takvim açıklaması')} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
      {Object.keys(CAL_NAME).filter((k) => k !== 'other').map((k) => (
        <View key={k} role="listitem" style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><CalBadge kind={k} size={18} /><Text v="small" muted>{t(CAL_NAME[k])}</Text></View>
      ))}
    </View>
  );
}
/** Ayın işleri: gündem öğeleri + o ayın kira vadesi (aynı vade iki kez yazılmaz). */
function monthItems(props: any[], key: string) {
  const out: any[] = [];
  props.forEach((p) => {
    const list = agendaItems(p).map((it: any) => Object.assign({ prop: p.name, pid: p.id }, it));
    rentDuesIn(p, key).forEach((d: any) => { if (!list.some((x: any) => x.kind === 'pay' && x.date === d.date)) list.push(Object.assign({ prop: p.name, pid: p.id }, d)); });
    out.push(...list);
  });
  return out;
}
function CalRow({ it, last, many }: { it: any; last: boolean; many: boolean }) {
  const go = useGo();
  const kind = CAL_KIND(it.kind);
  return (
    <PressScale onPress={() => go(it.go)} accessibilityRole="link" accessibilityLabel={t(CAL_NAME[kind]) + ': ' + it.title + (many ? ', ' + it.prop : '')} scaleTo={0.99}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: last ? 0 : 1, borderBottomColor: 'rgba(0,0,0,0.06)' }}>
      <CalBadge kind={kind} size={26} />
      <View style={{ flex: 1 }}>
        <Text v="small" style={{ fontFamily: fonts.bodyBold }}>{it.title}</Text>
        <Muted>{(many ? it.prop + ' · ' : '') + it.sub}</Muted>
      </View>
      {it.chip ? <Chip tone={it.days != null && it.days <= 7 ? 'bad' : 'neutral'} label={it.chip} /> : it.status ? <StatusChip st={it.status} /> : null}
    </PressScale>
  );
}
function MonthView({ props }: { props: any[] }) {
  const c = useColors();
  const today = iso(t0());
  const [month, setMonth] = useState(mkey(t0()));
  const [day, setDay] = useState(today.startsWith(month) ? today : month + '-01');
  const items = monthItems(props, month).filter((it) => it.date && String(it.date).startsWith(month));
  const first = parse(month + '-01');
  const lead = (first.getDay() + 6) % 7;
  const days = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const cells: (string | null)[] = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => month + '-' + String(i + 1).padStart(2, '0'))];
  while (cells.length % 7) cells.push(null);
  const week = Array.from({ length: 7 }, (_, i) => new Date(2024, 0, 1 + i).toLocaleDateString(locale(), { weekday: 'short' }));
  const shift = (n: number) => { const k = mkey(addM(first, n)); setMonth(k); setDay(today.startsWith(k) ? today : k + '-01'); };
  const dayItems = items.filter((it) => it.date === day);
  const dot = useCalStyle();
  return (
    <Stack gap={12}>
      <Row between>
        <IconBtn name="back" label={t('Önceki ay')} onPress={() => shift(-1)} />
        <Text v="h3">{monthYear(month)}</Text>
        <View style={{ transform: [{ scaleX: -1 }] }}><IconBtn name="back" label={t('Sonraki ay')} onPress={() => shift(1)} /></View>
      </Row>
      <View role="grid" aria-label={monthYear(month)}>
        <View style={{ flexDirection: 'row' }}>{week.map((w) => <Text key={w} v="small" muted style={{ flex: 1, textAlign: 'center' }}>{w}</Text>)}</View>
        {Array.from({ length: cells.length / 7 }, (_, r) => (
          <View key={r} style={{ flexDirection: 'row', marginTop: 4 }}>
            {cells.slice(r * 7, r * 7 + 7).map((d, i) => {
              if (!d) return <View key={'x' + i} style={{ flex: 1, height: 52 }} />;
              const its = items.filter((it) => it.date === d);
              const kinds = [...new Set(its.map((it) => CAL_KIND(it.kind)))].slice(0, 3);
              const sel = d === day, now = d === today;
              return (
                <PressScale key={d} onPress={() => setDay(d)} scaleTo={0.94} accessibilityRole="button" accessibilityState={{ selected: sel }}
                  accessibilityLabel={fmtFull(parse(d)) + (its.length ? ', ' + t('{n} iş', { n: its.length }) : '')}
                  style={{ flex: 1, height: 52, marginHorizontal: 2, borderRadius: 10, alignItems: 'center', paddingTop: 6, gap: 4, backgroundColor: sel ? c.ink : 'transparent', borderWidth: now && !sel ? 1.5 : 0, borderColor: c.accent }}>
                  <Text v="small" color={sel ? c.bg : undefined} style={{ fontFamily: now ? fonts.bodyXBold : fonts.body }}>{Number(d.slice(8))}</Text>
                  <View style={{ flexDirection: 'row', gap: 2 }}>{kinds.map((k) => <View key={k} style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: dot(k).bg }} />)}</View>
                </PressScale>
              );
            })}
          </View>
        ))}
      </View>
      <CalLegend />
      <Stack gap={4}>
        <H2>{fmtFull(parse(day))}</H2>
        {dayItems.length
          ? <View>{dayItems.map((it, i) => <CalRow key={it.kind + it.title + it.prop + i} it={it} last={i === dayItems.length - 1} many={props.length > 1} />)}</View>
          : <Muted>{t('Bu gün için iş yok.')}</Muted>}
      </Stack>
    </Stack>
  );
}
function AgendaList({ props }: { props: any[] }) {
  const all: any[] = [];
  props.forEach((p) => agendaItems(p).forEach((it: any) => all.push(Object.assign({ prop: p.name }, it))));
  all.sort((a, b) => (a.days ?? 999) - (b.days ?? 999));
  if (!all.length) return <Empty>{t('Yaklaşan bir iş görünmüyor.')}</Empty>;
  const buckets: [string, (it: any) => boolean][] = [
    [t('Gecikmiş'), (it) => it.days != null && it.days < 0],
    [t('Bu hafta'), (it) => it.days != null && it.days >= 0 && it.days <= 7],
    [t('Bu ay'), (it) => it.days != null && it.days > 7 && it.days <= 30],
    [t('Sonrası'), (it) => it.days == null || it.days > 30]
  ];
  return (
    <Stack>
      <CalLegend />
      {buckets.map(([label, test]) => {
        const list = all.filter(test);
        if (!list.length) return null;
        return (
          <Stack key={label} gap={4}>
            <H2>{label}</H2>
            <Card gap={0}>{list.map((it, i) => <CalRow key={it.title + it.sub + it.prop} it={it} last={i === list.length - 1} many={props.length > 1} />)}</Card>
          </Stack>
        );
      })}
    </Stack>
  );
}

export function AgendaBody({ props }: { props: any[] }) {
  const [view, setView] = useState<string>((ui as any).calendarView || 'month');
  return (
    <Stack>
      <Seg value={view} onChange={(v) => { (ui as any).calendarView = v; setView(v); }} options={[['month', t('Ay')], ['agenda', t('Ajanda')]]} />
      {view === 'month' ? <MonthView props={props} /> : <AgendaList props={props} />}
    </Stack>
  );
}

export { Avatar, initials, typeIcon, Toggle, Mid, List, Pressable };
