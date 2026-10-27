/* Ekranlar: kiracı ve mülk sahibi görünümleri (views.js → React). */
import { ReactNode, useEffect, useState } from 'react';
import { Linking, ScrollView, View } from 'react-native';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import Animated, { FadeIn } from 'react-native-reanimated';
import { S, ui, PROP_TYPES } from '../domain/state';
import { estimate, stopajRate } from '../domain/tax';
import {
  P, period, openReqs, reminders, meTenant, monthCollection, yearIncome, yearNumbers, dataYears, lesseeLabel, tenantsLabel, expectedAt, moveOutSummary, unreadCount, agendaItems,
  statusOf, monthlyBreakdown, expensesByCat, unreadIn, isMineMsg, senderName
} from '../domain/logic';
import { can, canAny, isOwnerOf, isTeam } from '../domain/team';
import { t, locale } from '../domain/i18n';
import { act } from '../domain/services';
import { access, trialDaysLeft, hasFeature, planLabel } from '../domain/billing';
import { tl, fmt, fmtFull, monthYear, monthName, parse, t0, iso, daysTo, up, percent, mkey, addM } from '../domain/util';
import { Button, Chip, PressScale, Text } from '../ui/kit';
import { fonts, radius, useBreakpoint, useColors } from '../ui/theme';
import {
  Avatar, Bar, Big, Card, Empty, H2, Hero, Icon, IconBtn, Items, KV, Label, LI, Mid, Muted, Note, Row, Seg, Stack, StatusChip, initials, toneOf, typeIcon, BigRoll, MonthTiles, MonthLegend, lastMonths
} from './blocks';
import { Toggle } from './forms';
import { useStore } from './hooks';
import { useSheet } from './overlays';
import {
  AgendaBody, AgendaSection, InspectTabs, MonthStatusCard, RenewalCard, RentHero, SecDocs, SecExpenses, SecInspect, SecMoveOut, SecMsg, SecPay, SecReq, ReqCard, stopajLine, useGo
} from './sections';

/* ---------------- sayfa iskeleti ---------------- */

export function Page({ title, sub, back, children }: { title: string; sub?: string; back?: string; children: ReactNode }) {
  const { open } = useSheet();
  const go = useGo();
  useStore();
  const n = unreadCount();
  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 120, width: '100%', maxWidth: 760, alignSelf: 'center' }} keyboardShouldPersistTaps="handled">
      <Row between align="flex-start">
        <Row align="flex-start" style={{ flex: 1 }}>
          {back ? <IconBtn name="back" label={t('Geri')} onPress={() => go(back)} /> : null}
          <View style={{ flex: 1, gap: 2 }}>
            <Text v="h1" style={{ fontSize: 36, lineHeight: 38, letterSpacing: -1.2 }}>{title}</Text>
            {sub ? <Muted>{sub}</Muted> : null}
          </View>
        </Row>
        <Row gap={8}>
          <IconBtn name="search" label={t('Ara')} onPress={() => open('arama')} />
          <IconBtn name="bell" label={t('Bildirimler ve hatırlatmalar')} badge={n} onPress={() => open('bildirim')} />
          <IconBtn name="gear" label={t('Ayarlar')} onPress={() => open('ayarlar')} />
        </Row>
      </Row>
      <Animated.View entering={FadeIn.duration(280)} style={{ gap: 16, marginTop: 18 }}>{children}</Animated.View>
    </ScrollView>
  );
}

/** Dokunmayla `?req=` ile gelen talebi açar (arama ve gündem bağlantıları). */
export function useOpenReq(pid: string) {
  const { req } = useLocalSearchParams<{ req?: string }>();
  const { open } = useSheet();
  useEffect(() => { if (req) open('talep', { pid, id: req }); }, [req]);
}

/* ---------------- kiracı ---------------- */

function PersonRow({ abbr, name, sub, right }: { abbr: string; name: string; sub: string; right?: ReactNode }) {
  return (
    <Row>
      <Avatar text={abbr} />
      <View style={{ flex: 1, minWidth: 0 }}><Text v="small" style={{ fontFamily: fonts.bodyXBold }}>{name}</Text><Muted>{sub}</Muted></View>
      {right}
    </Row>
  );
}

function MoveOutTeaser({ p, to }: { p: any; to: string }) {
  const go = useGo();
  const m: any = moveOutSummary(p);
  return (
    <Card onPress={() => go(to)}>
      <Row between>
        <View style={{ flex: 1 }}><H2>{t('Çıkış süreci')}</H2><Muted>{t('Depozito')} {tl(m.deposit)} {t('· kesinti')} {tl(m.deducted)} {t('· iade')} {tl(m.refund)}</Muted></View>
        <Chip tone="warn" label={t('Aç')} />
      </Row>
    </Card>
  );
}

export function TenantPanel() {
  useStore();
  const { open } = useSheet();
  const go = useGo();
  const colors = useColors();
  const p = P(S.myHome);
  if (!p) return <Page title={t('Panel')}><Empty>{t('Henüz bağlı bir mülk yok.')}</Empty></Page>;
  const o = p.landlord;
  const me = meTenant(p);
  const mates = p.tenants.filter((x: any) => x.id !== me?.id);
  const qa: [string, string, () => void][] = [
    [t('Talep aç'), 'plus', () => open('yeni-talep', { pid: p.id })],
    [t('Mesaj'), 'chat', () => go('/kiraci/mesajlar')],
    [t('Ara|telefon'), 'phone', () => { if (o.phone) Linking.openURL('tel:' + o.phone).catch(() => {}); }],
    [t('Belgeler'), 'doc', () => go('/kiraci/belgeler')]
  ];
  return (
    <Page title={p.name} sub={p.addr}>
      <Card gap={12}>
        <PersonRow abbr={t('MS')} name={o.name} sub={t('Mülk sahibi · bağlı')} right={<Chip tone="ok" label={t('Aktif')} />} />
        {mates.map((x: any) => <PersonRow key={x.id} abbr={initials(x.name)} name={x.name} sub={t('Diğer kiracı')} />)}
      </Card>
      <RentHero p={p} />
      <MonthStatusCard p={p} />
      <RenewalCard p={p} />
      {p.moveOut && !p.moveOut.refunded ? <MoveOutTeaser p={p} to="/kiraci/belgeler/cikis" /> : null}
      <Row wrap gap={10}>
        {qa.map(([label, icon, fn], i) => (
          <PressScale key={label} onPress={fn} accessibilityRole="button" scaleTo={0.96} wrapStyle={{ flexGrow: 1, flexBasis: '45%' }}
            style={{ backgroundColor: [colors.peach, colors.butter, colors.sage, colors.sky][i % 4], borderRadius: 30, padding: 18, minHeight: 112, justifyContent: 'space-between' }}>
            <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }}><Icon name={icon} size={20} /></View>
            <Text v="small" style={{ fontFamily: fonts.bodyXBold, fontSize: 15 }}>{label}</Text>
          </PressScale>
        ))}
      </Row>
      <AgendaSection p={p} />
    </Page>
  );
}

/** Kiracı alt ekranları (ödemeler, talepler, mesajlar, belgeler, tutanak, çıkış, takvim). */
export function TenantScreen({ tab, sub }: { tab: 'pay' | 'req' | 'msg' | 'docs' | 'agenda'; sub?: string }) {
  useStore();
  const p = P(S.myHome);
  useOpenReq(p?.id);
  if (!p) return <Page title={t('Panel')}><Empty>{t('Henüz bağlı bir mülk yok.')}</Empty></Page>;
  switch (tab) {
    case 'pay': return <Page title={t('Ödemeler')} sub={p.name}><SecPay p={p} /></Page>;
    case 'req': return <Page title={t('Talepler')} sub={p.name}><SecReq p={p} /></Page>;
    case 'msg': return <Page title={t('Mesajlar')} sub={p.name}><SecMsg p={p} /></Page>;
    case 'agenda': return <Page title={t('Takvim')} sub={p.name}><AgendaBody props={[p]} /></Page>;
    default:
      if (sub === 'tutanak') return <Page title={t('Tutanak')} sub={p.name} back="/kiraci/belgeler"><InspectTabs p={p} active="giris" /><SecInspect p={p} /></Page>;
      if (sub === 'cikis') return <Page title={t('Tutanak')} sub={p.name} back="/kiraci/belgeler"><InspectTabs p={p} active="cikis" /><SecMoveOut p={p} /></Page>;
      return <Page title={t('Belgeler')} sub={p.name}><SecDocs p={p} /></Page>;
  }
}

/* ---------------- mülk sahibi ---------------- */

function SubBanner({ full }: { full: boolean }) {
  const { open } = useSheet();
  const c = useColors();
  const a: any = access();
  if (isTeam()) return null;
  const row = (icon: string, title: string, body: string, label: string, primary: boolean) => (
    <Card gap={10} style={{ backgroundColor: primary ? c.warnBg : c.surface }}>
      <Row><Icon name={icon} size={20} /><View style={{ flex: 1 }}><Text v="small" style={{ fontFamily: fonts.bodyXBold }}>{title}</Text><Muted>{body}</Muted></View></Row>
      <Button kind={primary ? 'primary' : 'ghost'} title={label} onPress={() => open('abonelik')} />
    </Card>
  );
  if (!a.access) return row('key', t('Deneme süren bitti'), t('Kayıtların duruyor; okuyabilir ve mesajlaşabilirsin. Değiştirmek için bir paket seç.'), t('Paketleri gör'), true);
  if (!full) return null;
  if (a.inTrial) return row('flag', t('Ücretsiz deneme'), t('{n} gün kaldı', { n: trialDaysLeft(a) }) + ' · ' + t('Denemede {units} mülke kadar ekleyebilirsin.', { units: a.units ?? 5 }), t('Paketleri gör'), false);
  return null;
}

export function Portfolio() {
  useStore();
  const { open } = useSheet();
  const go = useGo();
  const accentSoft = useColors().accentSoft;
  const m: any = monthCollection();
  const rem = reminders().slice(0, 4);
  const types = PROP_TYPES.filter((tp: string) => S.order.some((id: string) => P(id).type === tp));
  const [filter, setFilter] = useState(types.includes(ui.propFilter) ? ui.propFilter : 'all');
  const shown = S.order.filter((id: string) => filter === 'all' || P(id).type === filter);
  const openTotal = S.order.reduce((a: number, id: string) => a + openReqs(P(id)).length, 0);

  if (!S.order.length && isTeam())
    return (
      <Page title={t('Portföy')} sub={t('Henüz mülk yok')}>
        <Empty>{t('Sana henüz mülk atanmadı.')}{'\n'}{t('Mülk sahibi seni bir mülke atadığında burada görünür.')}</Empty>
      </Page>
    );
  if (!S.order.length)
    return (
      <Page title={t('Portföyüm')} sub={t('Henüz mülk yok')}>
        <SubBanner full />
        <Empty>{t('İlk mülkünü ekle')}{'\n'}{t('Mülkü ekleyince kiracın için bir davet kodu oluşur. Kiracın kodla katılınca kira, talep ve belgeleri birlikte takip edersiniz.')}</Empty>
        <Button block title={t('Mülk ekle')} icon={<Icon name="plus" size={16} color="#fff" />} onPress={() => open('ev-ekle')} />
        <Button block kind="ghost" title={t('Excel ile toplu ekle')} onPress={() => go('/mulk-sahibi/ice-aktar')} />
      </Page>
    );

  return (
    <Page title={t('Portföyüm')} sub={t('{n} mülk', { n: S.order.length })}>
      <SubBanner full />
      <Hero>
        <Label onDark>{t('{month} kira durumu', { month: monthYear(m.key) })}</Label>
        <Row between align="flex-end">
          <View style={{ flex: 1 }}><BigRoll onDark value={m.collected} /><Muted onDark>{tl(m.expected)} {t('beklenenin tahsil edilen kısmı')}</Muted></View>
          <Text v="h2" color="#fff">{percent(Math.round(m.pct * 100))}</Text>
        </Row>
        <Bar pct={m.pct * 100} />
        <Row><View style={{ flex: 1 }}><Muted onDark>{t('Onay bekleyen')}</Muted><Text v="h3" color="#fff">{tl(m.waiting)}</Text></View><View style={{ flex: 1 }}><Muted onDark>{t('Geciken')}</Muted><Text v="h3" color="#fff">{tl(m.late)}</Text></View></Row>
      </Hero>
      <Row>
        <Card style={{ flex: 1 }} onPress={() => go('/mulk-sahibi/talepler')} gap={4}><Label>{t('Açık talep')}</Label><Mid>{openTotal}</Mid></Card>
        <Card style={{ flex: 1 }} onPress={canAny(S.order, 'expense_read') ? () => go('/mulk-sahibi/rapor') : undefined} gap={4}><Label>{t('Bu yıl tahsil edilen')}</Label><Mid>{tl((yearIncome() as any).total)}</Mid></Card>
      </Row>
      {isTeam() ? null : (
        <Row wrap>
          <Card style={{ flex: 1, minWidth: 240 }} onPress={() => go('/mulk-sahibi/ekip')} gap={4}>
            <Row between><View style={{ flex: 1 }}><Label>{t('Ekip ve işlem geçmişi')}</Label><Muted>{t('Emlakçı, muhasebeci ya da personel davet et; kimin neyi değiştirdiğini gör.')}</Muted></View><Icon name="landlord" size={22} /></Row>
          </Card>
          <Card style={{ flex: 1, minWidth: 240 }} onPress={() => go('/mulk-sahibi/ice-aktar')} gap={4}>
            <Row between><View style={{ flex: 1 }}><Label>{t('Toplu içe aktar')}</Label><Muted>{t('Excel ya da CSV dosyasıyla mülklerini ve kiracılarını tek seferde ekle.')}</Muted></View><Icon name="doc" size={22} /></Row>
          </Card>
        </Row>
      )}
      {rem.length ? (
        <Stack gap={8}><H2>{t('Öncelikli işler')}</H2>
          <Items data={rem} render={(r: any, last) => <LI key={r.t + r.b} last={last} onPress={() => go(r.go)} title={up(r.t)} sub={r.b} right={<Chip tone={r.w > 1 ? 'bad' : 'warn'} label={r.w > 1 ? t('Öncelikli') : t('Yakında')} />} />} />
        </Stack>
      ) : null}
      <Stack gap={10}>
        <H2>{t('Mülklerim')}</H2>
        <MonthLegend />
        {types.length > 1 ? <Seg scroll value={filter} onChange={(v) => { ui.propFilter = v; setFilter(v); }} options={[['all', t('Tümü')], ...types.map((tp: string) => [tp, t(tp)] as [string, string])]} /> : null}
        {shown.map((id: string) => {
          const p = P(id), per: any = period(p), o = openReqs(p).length;
          return (
            <Card key={id} onPress={() => go('/mulk-sahibi/mulk/' + id)} gap={12}>
              <Row between align="flex-start">
                <Row align="flex-start" style={{ flex: 1 }}>
                  <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: accentSoft, alignItems: 'center', justifyContent: 'center' }}><Icon name={typeIcon(p.type)} size={18} /></View>
                  <View style={{ flex: 1 }}><Text v="h3">{p.name}</Text><Muted>{lesseeLabel(p)} · {t('{amount}/ay', { amount: tl(p.rent) })}</Muted></View>
                </Row>
                <StatusChip st={per.status} />
              </Row>
              <MonthTiles months={lastMonths(p)} />
              <Row wrap gap={6}>
                {types.length > 1 ? <Chip label={t(p.type)} /> : null}
                {o ? <Chip tone="accent" label={t('{n} açık talep', { n: o })} /> : null}
                <Chip label={t('Yenileme {n} gün', { n: daysTo(p.contractEnd) })} />
                {p.dask && daysTo(p.dask) <= S.settings.insDays ? <Chip tone="bad" label={t('DASK {n} gün', { n: daysTo(p.dask) })} /> : null}
                {p.moveOut && !p.moveOut.refunded ? <Chip tone="warn" label={t('Çıkış süreci')} /> : null}
              </Row>
            </Card>
          );
        })}
        {isTeam() ? null : <Button kind="ghost" block title={t('Mülk ekle ve kiracı davet et')} icon={<Icon name="plus" size={16} />} onPress={() => open('ev-ekle')} />}
      </Stack>
    </Page>
  );
}

const PROP_SUBS: [string, string][] = [['ozet', t('Özet')], ['odeme', t('Ödemeler')], ['talep', t('Talepler')], ['mesaj', t('Mesajlar')], ['belge', t('Belgeler')], ['tutanak', t('Tutanak')], ['gider', t('Giderler')], ['rapor', t('Rapor')]];

/** Yazışmalar: son mesaja göre yeniden eskiye (ekip üyesi yalnız mesaj yetkisi olan mülkleri görür). */
function threadIds() {
  const lastAt = (id: string) => { const m = P(id).msgs; return (m.length && Number(m[m.length - 1].at)) || 0; };
  return S.order.filter((id: string) => can(id, 'message')).sort((a: string, b: string) => lastAt(b) - lastAt(a));
}

/** Mülk ya da portföy için CSV ve Excel dışa aktarma düğmeleri. */
function ExportButtons({ pid }: { pid?: string }) {
  return (
    <Row wrap>
      <Button kind="ghost" style={{ flex: 1, minWidth: 150 }} title={t('CSV indir')} icon={<Icon name="doc" size={16} />} onPress={() => act('exportCsv', { pid })} />
      <Button kind="ghost" style={{ flex: 1, minWidth: 150 }} title={t('Excel indir')} icon={<Icon name="chart" size={16} />} onPress={() => act('exportXlsx', { pid })} />
    </Row>
  );
}

/** Tek mülk raporu: yıl seçimi, net getiri, ay ay tahsilat ve kategoriye göre giderler. */
function PropReport({ p }: { p: any }) {
  if (!hasFeature('report')) return <ReportLocked />;
  const years = dataYears([p.id]);
  const [year, setYear] = useState(String(years.includes(ui.reportYear) ? ui.reportYear : years[0]));
  const yn: any = yearNumbers(year, [p.id]);
  const months = monthlyBreakdown(p, year).filter((m: any) => m.status || m.collected || m.exp);
  const cats = expensesByCat(p, year);
  const expected = months.reduce((a: number, m: any) => a + m.expected, 0);
  return (
    <Stack>
      {years.length > 1 ? <Seg scroll value={year} onChange={(y) => { ui.reportYear = y; setYear(y); }} options={years.map((y: string) => [y, y] as [string, string])} /> : null}
      <Hero>
        <Label onDark>{t('{year} net kira getirisi', { year })}</Label>
        <BigRoll onDark value={yn.net} />
        <Row>
          <View style={{ flex: 1 }}><Muted onDark>{yn.withheld ? t('Brüt kira') : t('Tahsil edilen')}</Muted><Text v="h3" color="#fff">{tl(yn.gross)}</Text></View>
          <View style={{ flex: 1 }}><Muted onDark>{t('Giderler')}</Muted><Text v="h3" color="#fff">{tl(yn.exp)}</Text></View>
        </Row>
        <Muted onDark>{t('Tahsilat oranı')}: {expected ? percent(Math.round((yn.received / expected) * 100)) : '—'}{yn.rows[0]?.yieldPct != null ? ' · ' + t('net getiri {pct}', { pct: percent(yn.rows[0].yieldPct * 100) }) : ''}</Muted>
      </Hero>
      <Card gap={6}>
        <H2>{t('Ay ay')}</H2>
        <Row>
          <Text v="small" muted style={{ flex: 1.4 }}>{t('Ay')}</Text>
          <Text v="small" muted style={{ flex: 1, textAlign: 'right' }}>{t('Beklenen')}</Text>
          <Text v="small" muted style={{ flex: 1, textAlign: 'right' }}>{t('Tahsil')}</Text>
          <Text v="small" muted style={{ flex: 1, textAlign: 'right' }}>{t('Gider')}</Text>
        </Row>
        {months.length ? months.map((m: any) => (
          <Row key={m.key} style={{ paddingVertical: 4, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.06)' }}>
            <View style={{ flex: 1.4, gap: 2 }}><Text v="small">{monthName(m.key)}</Text>{m.status ? <StatusChip st={m.status} /> : null}</View>
            <Text v="small" style={{ flex: 1, textAlign: 'right' }}>{m.expected ? tl(m.expected) : '—'}</Text>
            <Text v="small" style={{ flex: 1, textAlign: 'right', fontFamily: fonts.bodyBold }}>{m.collected ? tl(m.collected) : '—'}</Text>
            <Text v="small" style={{ flex: 1, textAlign: 'right' }}>{m.exp ? tl(m.exp) : '—'}</Text>
          </Row>
        )) : <Muted>{t('Bu yıl için kayıt yok.')}</Muted>}
      </Card>
      {cats.length ? <Card gap={8}><H2>{t('Kategoriye göre giderler')}</H2>{cats.map((c: any) => <KV key={c.cat} k={t(c.cat)} v={tl(c.amount)} />)}</Card> : null}
      <ExportButtons pid={p.id} />
      <Muted>{t('Özet bilgi amaçlıdır; kira geliri beyanı için mali müşavirine danış.')}</Muted>
    </Stack>
  );
}

function TenantsCard({ p }: { p: any }) {
  const { open } = useSheet();
  const go = useGo();
  return (
    <Card gap={12}>
      <Row between><H2>{p.tenants.length > 1 ? t('Kiracılar') : t('Kiracı')}</H2>{isOwnerOf(p.id) ? <Button kind="ghost" title={t('Kiracı ekle')} icon={<Icon name="plus" size={15} />} onPress={() => open('kiraci-ekle', { pid: p.id })} /> : null}</Row>
      {p.company && p.company.name ? (
        <Note>{p.company.name}{p.company.taxNo ? '\n' + t('VKN {no}', { no: p.company.taxNo }) + (p.company.taxOffice ? ' · ' + p.company.taxOffice + ' ' + t('VD') : '') : ''}{p.stopaj ? '\n' + t('Kira stopajını kiracı keser ve öder.') : ''}</Note>
      ) : null}
      {p.tenants.length ? p.tenants.map((tn: any) => (
        <PersonRow key={tn.id} abbr={tn.pending ? '?' : initials(tn.name)} name={tn.name || t('Davet bekleniyor')} sub={tn.email || tn.phone || t('İletişim bilgisi yok')}
          right={<Row gap={6}>
            {tn.phone ? <IconBtn name="phone" size={16} label={t('{name} ara|telefon', { name: tn.name })} onPress={() => Linking.openURL('tel:' + tn.phone).catch(() => {})} /> : null}
            {isOwnerOf(p.id) ? <IconBtn name="x" size={16} label={tn.name + ' ' + t('kiracısını çıkar')} onPress={() => act('removeTenant', { pid: p.id, id: tn.id })} /> : null}
          </Row>} />
      )) : <Muted>{t('Bu mülkte kayıtlı kiracı yok. Kiracı ekleyerek davet edebilirsin.')}</Muted>}
      {can(p.id, 'message') ? <Button kind="ghost" title={t('Mesaj gönder')} icon={<Icon name="chat" size={15} />} onPress={() => go('/mulk-sahibi/mulk/' + p.id + '/mesaj')} /> : null}
    </Card>
  );
}

export function PropDetail({ pid, sub = 'ozet' }: { pid: string; sub?: string }) {
  useStore();
  const { open } = useSheet();
  const go = useGo();
  const p = P(pid);
  useOpenReq(pid);
  if (!p) return <Redirect href="/uygulama" />;
  // Ekip üyesi rolünün göremediği sekmeler gizlenir (muhasebeci mesaj, personel gider ve rapor).
  const hidden = (k: string) => (k === 'mesaj' && !can(pid, 'message')) || ((k === 'gider' || k === 'rapor') && !can(pid, 'expense_read'));
  const subs = PROP_SUBS.filter(([k]) => !hidden(k));
  if (hidden(sub)) sub = 'ozet';
  const depText = p.depositKind === 'Teminat mektubu' ? t('Teminat mektubu') : tl(p.deposit);
  let body: ReactNode = null;
  if (sub === 'ozet') {
    body = (
      <Stack>
        <TenantsCard p={p} />
        <RentHero p={p} />
        {p.moveOut && !p.moveOut.refunded ? <MoveOutTeaser p={p} to={'/mulk-sahibi/mulk/' + p.id + '/cikis'} /> : null}
        <Card gap={4}>
          <KV k={t('Mülk tipi')} v={t(p.type) + (p.area ? ' · ' + p.area + ' m²' : '')} />
          <KV k={p.stopaj ? t('Aylık brüt kira') : t('Aylık kira')} v={tl(p.rent)} />
          {p.stopaj ? <>
            <KV k={t('Stopaj ({pct}) · kiracı öder', { pct: percent(stopajRate(new Date().getFullYear()) * 100) })} v={'− ' + tl(p.rent - expectedAt(p, iso(t0())))} />
            <KV k={t('Hesaba geçen')} v={tl(expectedAt(p, iso(t0())))} />
          </> : null}
          <KV k={t('Ödeme günü')} v={t('Her ayın {n}’i', { n: p.dueDay })} />
          <KV k={t('Aidat')} v={tl(p.aidat) + ' · ' + t(p.aidatPayer)} />
          <KV k={t('Depozito')} v={depText} />
          <KV k={t('Sözleşme bitişi')} v={fmtFull(parse(p.contractEnd))} />
          {p.dask ? <KV k={t('DASK bitişi')} v={fmtFull(parse(p.dask))} /> : null}
          {p.value ? <KV k={t('Tahmini değer')} v={tl(p.value)} /> : null}
          {isOwnerOf(p.id) ? <View style={{ marginTop: 8 }}><Button kind="ghost" block title={t('Bilgileri düzenle')} onPress={() => open('ev-duzenle', { pid: p.id })} /></View> : null}
        </Card>
        <AgendaSection p={p} />
      </Stack>
    );
  } else if (sub === 'odeme') body = <SecPay p={p} />;
  else if (sub === 'talep') body = <SecReq p={p} />;
  else if (sub === 'mesaj') body = <SecMsg p={p} />;
  else if (sub === 'belge') body = <SecDocs p={p} />;
  else if (sub === 'tutanak') body = <><InspectTabs p={p} active="giris" /><SecInspect p={p} /></>;
  else if (sub === 'cikis') body = <><InspectTabs p={p} active="cikis" /><SecMoveOut p={p} /></>;
  else if (sub === 'gider') body = <SecExpenses p={p} />;
  else if (sub === 'rapor') body = <PropReport p={p} />;
  const strip = sub === 'cikis' ? 'tutanak' : sub;
  return (
    <Page title={p.name} sub={p.addr} back="/mulk-sahibi">
      <SubBanner full={false} />
      <Seg scroll value={strip} onChange={(v) => go('/mulk-sahibi/mulk/' + p.id + '/' + v)} options={subs} />
      {body}
    </Page>
  );
}

export function AllRequests() {
  useStore();
  const [tab, setTab] = useState(ui.reqTab || 'open');
  const cards: ReactNode[] = [];
  S.order.forEach((id: string) => {
    const p = P(id);
    p.requests.filter((r: any) => (tab === 'open' ? r.status < 3 : r.status >= 3)).forEach((r: any) => cards.push(<ReqCard key={id + r.id} p={p} r={r} showProp />));
  });
  const openN = S.order.reduce((a: number, id: string) => a + openReqs(P(id)).length, 0);
  const allN = S.order.reduce((a: number, id: string) => a + P(id).requests.length, 0);
  return (
    <Page title={t('Talepler')} sub={t('Tüm mülkler')}>
      <SubBanner full={false} />
      <Seg value={tab} onChange={(v) => { ui.reqTab = v; setTab(v); }} options={[['open', t('Açık (') + openN + ')'], ['done', t('Tamamlanan (') + (allN - openN) + ')']]} />
      {cards.length ? cards : <Empty>{t('Bu listede talep yok.')}</Empty>}
    </Page>
  );
}

export function Threads() {
  useStore();
  const go = useGo();
  const c = useColors();
  const ids = threadIds();
  return (
    <Page title={t('Mesajlar')} sub={t('Kiracılarınla yazışmalar')}>
      <SubBanner full={false} />
      {ids.length ? (
        <Items data={ids} render={(id, last) => {
          const p = P(id), lastMsg = p.msgs[p.msgs.length - 1], unread = unreadIn(p);
          const preview = lastMsg
            ? (lastMsg.from === 'system' ? '' : isMineMsg(p, lastMsg) ? t('Sen') + ': ' : senderName(p, lastMsg) + ': ') + (lastMsg.text || (lastMsg.img ? t('Fotoğraf') : ''))
            : t('Henüz mesaj yok');
          return <LI key={id} last={last} onPress={() => go('/mulk-sahibi/mulk/' + id + '/mesaj')}
            title={<Text v="h3" style={{ fontFamily: unread ? fonts.bodyXBold : undefined }}>{tenantsLabel(p)}</Text>}
            sub={p.name + ' · ' + preview}
            right={<View style={{ alignItems: 'flex-end', gap: 4 }}><Muted>{lastMsg ? fmt(lastMsg.at) : ''}</Muted>{unread ? <Chip tone="accent" label={t('{n} yeni', { n: unread })} /> : null}</View>} />;
        }} />
      ) : <Empty>{t('Henüz mülk yok')}</Empty>}
    </Page>
  );
}

export function LandlordAgenda() {
  useStore();
  return <Page title={t('Takvim')} sub={t('Tüm mülklerin yaklaşan işleri')}><SubBanner full={false} /><AgendaBody props={S.order.map((id: string) => P(id))} /></Page>;
}

/* ---------------- rapor ve vergi ---------------- */

export const taxInput = (yn: any) => ({ konut: yn.groups.konut, stopajli: yn.groups.stopajli, diger: yn.groups.diger });

function TaxCard({ year, yn }: { year: string; yn: any }) {
  const c = useColors();
  const [noEx, setNoEx] = useState(!!ui.noExemption);
  const e: any = estimate(taxInput(yn), { year: Number(year), noExemption: noEx });
  const r = e.rates;
  const hasK = e.konut.gross > 0, hasW = e.stopajli.gross > 0, hasN = e.diger.gross > 0;
  const payLine = (m: any) => (m.payable < 0 ? t('İade {amount}', { amount: tl(-m.payable) }) : tl(m.payable));
  const Pick = ({ m }: { m: string }) => (e.best === m ? <Chip tone="ok" label={t('Daha avantajlı')} /> : null);
  return (
    <Card gap={10}>
      <Row between><H2>{t('Vergi tahmini')}</H2><Chip label={r.year + ' ' + t('oranları')} /></Row>
      {r.approx ? <Note warn>{year} {t('oranları henüz uygulamada yok;')} {r.year} {t('değerleriyle yaklaşık hesaplandı.')}</Note> : null}
      {hasK ? <><KV k={t('Konut kira geliri')} v={tl(e.konut.gross)} /><KV k={t('İstisna')} v={noEx ? t('Uygulanmıyor') : '− ' + tl(Math.min(e.istisna, e.konut.gross))} /></> : null}
      {hasW ? <><KV k={t('İşyeri kira geliri (stopajlı)')} v={tl(e.stopajli.gross)} />
        {e.includeW ? null : <Muted>{t('Beyan sınırının ({limit}) altında; beyana eklenmez, kesilen {tax} stopaj nihai vergidir.', { limit: tl(r.beyanSiniri), tax: tl(e.stopajli.withheld) })}</Muted>}</> : null}
      {hasN ? <KV k={t('İşyeri kira geliri (stopajsız)')} v={tl(e.diger.gross)} /> : null}
      {e.belowExemption
        ? <Note>{hasW || hasN ? t('Bu yıl için kira geliri beyanı gerekmeyebilir.') : t('Gelir istisna tutarının altında; bu yıl için konut kira geliri beyanı gerekmeyebilir.')}</Note>
        : <>
          <KV k={t('Beyana giren gelir')} v={tl(e.declared)} />
          {e.credit ? <KV k={t('Mahsup edilecek stopaj')} v={'− ' + tl(e.credit)} /> : null}
          <Row align="flex-start">
            <Card style={{ flex: 1, backgroundColor: c.bg }} gap={4}><Label>{t('Götürü gider ({pct})', { pct: percent(Math.round(r.goturu * 100)) })}</Label><Mid>{payLine(e.goturu)}</Mid><Muted>{t('Matrah')} {tl(e.goturu.base)}{e.credit ? ' · ' + t('vergi') + ' ' + tl(e.goturu.tax) : ''}</Muted><Pick m="goturu" /></Card>
            <Card style={{ flex: 1, backgroundColor: c.bg }} gap={4}><Label>{t('Gerçek gider')}</Label><Mid>{payLine(e.gercek)}</Mid><Muted>{t('İndirilebilir gider')} {tl(e.gercek.allowed)}{e.credit ? ' · ' + t('vergi') + ' ' + tl(e.gercek.tax) : ''}</Muted><Pick m="gercek" /></Card>
          </Row>
        </>}
      {hasK ? <Toggle label={t('İstisnadan yararlanamıyorum')} on={noEx} onChange={(b) => { ui.noExemption = b; setNoEx(b); }} /> : null}
      <Muted>{t('Konut istisnası işyeri kirasına uygulanmaz. Ticari, zirai ya da serbest meslek kazancı beyan edenler veya diğer gelirleri belirli sınırı aşanlar istisnadan yararlanamaz. Tahmin başka gelir olmadığını varsayar; beyan öncesi mali müşavirine danış.')}</Muted>
    </Card>
  );
}

/** Başlangıç paketinde rapor yerine paket önerisi gösterilir. */
function ReportLocked() {
  const { open } = useSheet();
  return (
    <Card gap={8}>
      <H2>{t('Rapor ve vergi tahmini')}</H2>
      <Muted>{t('Yıllık rapor, Excel dışa aktarma ve vergi tahmini {a} ve {b} paketlerinde var.', { a: planLabel('bes'), b: planLabel('kurumsal') })}</Muted>
      <Button title={t('Paketleri gör')} onPress={() => open('abonelik')} />
    </Card>
  );
}

export function Report() {
  useStore();
  const go = useGo();
  if (!hasFeature('report')) return <Page title={t('Rapor')}><ReportLocked /></Page>;
  const years: string[] = dataYears() as any;
  const [year, setYear] = useState(String(ui.reportYear || years[0]));
  const yn: any = yearNumbers(year);
  const dep = S.order.reduce((a: number, id: string) => a + P(id).deposit, 0);
  const monthly = S.order.reduce((a: number, id: string) => a + P(id).rent, 0);
  const max = Math.max(1, ...yn.rows.map((r: any) => r.gross));
  const k = yn.groups.konut, w = { gross: yn.groups.stopajli.gross + yn.groups.diger.gross, exp: yn.groups.stopajli.exp + yn.groups.diger.exp };
  return (
    <Page title={t('Rapor')} sub={year + ' ' + t('yılı')}>
      <SubBanner full={false} />
      <Seg scroll value={year} onChange={(y) => { ui.reportYear = y; setYear(y); }} options={years.map((y) => [y, y] as [string, string])} />
      <Hero>
        <Label onDark>{t('{year} net kira getirisi', { year })}</Label>
        <BigRoll onDark value={yn.net} />
        <Row><View style={{ flex: 1 }}><Muted onDark>{yn.withheld ? t('Brüt kira') : t('Tahsil edilen')}</Muted><Text v="h3" color="#fff">{tl(yn.gross)}</Text></View><View style={{ flex: 1 }}><Muted onDark>{t('Giderler')}</Muted><Text v="h3" color="#fff">{tl(yn.exp)}</Text></View></Row>
        {yn.withheld ? <Muted onDark>{t('Hesaba geçen {received} · kiracının kestiği stopaj {tax}', { received: tl(yn.received), tax: tl(yn.withheld) })}</Muted> : null}
        <Muted onDark>{t('Onaylanmış ve kısmi ödemelerden, girilen giderler düşülerek hesaplanır.')}</Muted>
      </Hero>
      {k.gross && w.gross ? (
        <Row>
          <Card style={{ flex: 1 }} gap={4}><Label>{t('Konut')}</Label><Text v="h3">{tl(k.gross - k.exp)}</Text><Muted>{t('Brüt')} {tl(k.gross)}</Muted></Card>
          <Card style={{ flex: 1 }} gap={4}><Label>{t('İşyeri')}</Label><Text v="h3">{tl(w.gross - w.exp)}</Text><Muted>{t('Brüt')} {tl(w.gross)}</Muted></Card>
        </Row>
      ) : null}
      <Card gap={14}>
        <H2>{t('Mülk bazında')}</H2>
        {yn.rows.map((r: any) => (
          <PressScale key={r.id} scaleTo={0.99} accessibilityRole="link" accessibilityLabel={t('{name} raporu', { name: r.name })} onPress={() => go('/mulk-sahibi/mulk/' + r.id + '/rapor')} style={{ gap: 6 }}>
            <Row between><Row gap={6} style={{ flex: 1 }}><Icon name={typeIcon(r.type)} size={15} /><Text v="small" style={{ fontFamily: fonts.bodyXBold, flexShrink: 1 }}>{r.name}</Text></Row><Text v="small" style={{ fontFamily: fonts.bodyXBold }}>{tl(r.net)} ›</Text></Row>
            <Bar pct={(Math.max(0, r.net) / max) * 100} exp={(Math.min(r.exp, r.gross) / max) * 100} />
            <Muted>{t('Brüt')} {tl(r.gross)} {t('· gider')} {tl(r.exp)}{r.yieldPct != null ? ' ' + t('· net getiri {pct}', { pct: percent(r.yieldPct * 100) }) : ''}</Muted>
          </PressScale>
        ))}
      </Card>
      <TaxCard year={year} yn={yn} />
      <Row>
        <Card style={{ flex: 1 }} gap={4}><Label>{t('Tutulan depozito')}</Label><Text v="h3">{tl(dep)}</Text></Card>
        <Card style={{ flex: 1 }} gap={4}><Label>{t('Aylık toplam kira')}</Label><Text v="h3">{tl(monthly)}</Text></Card>
      </Row>
      <Button block title={t('Beyanname özeti oluştur')} onPress={() => act('shareReport')} />
      <ExportButtons />
      <Muted>{t('Özet bilgi amaçlıdır; kira geliri beyanı için mali müşavirine danış.')}</Muted>
    </Page>
  );
}
