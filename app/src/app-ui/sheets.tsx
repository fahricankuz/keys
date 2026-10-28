/* Alt sayfalar (sheet). Her biri tek bir form ya da görünüm; kayıt işlemleri services.js'te. */
import { ReactNode, useEffect, useState } from 'react';
import { Image, Linking, Pressable, Share, Text as RNText, TextInput, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { myOrgs } from '../domain/org';
import { useRouter } from 'expo-router';
import {
  S, ui, setTheme, CATS, COST_OPTS, STEPS, EXPENSE_CATS, DEDUCTION_PRESETS, PROP_TYPES, DEPOSIT_KINDS, TENANT_KINDS, REQ_SUGGEST, isCommercial, docCatsFor
} from '../domain/state';
import { P, period, statusOf, remaining, ST, reminders, rentAt, expectedAt, moveOutSummary, search, otherPerson, payMap, statusFor, dueOf, aidatByTenant, METHOD } from '../domain/logic';
import { t, LANGS, getLang } from '../domain/i18n';
import { CONFIG, LIVE } from '../domain/config';
import { inviteLink, mediaSrc } from '../domain/backend';
import { act, submit } from '../domain/services';
import { access, trialDaysLeft, tiers, planLabel, unitsText, priceText, unitLimit, roomFor, paused } from '../domain/billing';
import { can, isTeam, memberRole, roleLabel } from '../domain/team';
import { TeamInviteSheet, TeamShareSheet, TeamMemberSheet } from './team';
import { toApp } from '../domain/nav';
import { tl, fmtFull, monthYear, parse, iso, t0, ago } from '../domain/util';
import { Button, Chip, Field, PressScale, Text } from '../ui/kit';
import { fonts, radius, useColors } from '../ui/theme';
import { Card, H2, Icon, IconBtn, Items, KV, Label, LI, List, Muted, Note, Row, Seg, Stack, Thumbs, Empty, FileLink, ReviewChip } from './blocks';
import { Actions, Area, Choice, DateField, FileField, NumField, Text2, Title, Toggle, useVals } from './forms';
import { useAuth } from '../auth/auth';
import { stopajLine, useGo } from './sections';
import { pickJson } from './media';
import { useStore } from './hooks';
import { useSheet } from './overlays';
import { PayButton } from '../ui/motion';
import { host } from '../domain/host';
import { MailPreviewSheet, MailReportSettings } from './report-mail';
import { PlanCard } from '../site/PlanCard';
import { AddressFields } from './address';
import { emptyAddress } from '../domain/address';
import { loadRates, rateFor } from '../domain/cpi';
import { EnterpriseForm } from '../site/EnterpriseForm';
import { plans as sitePlans } from '../site/content';

const propOf = (pid?: string) => (pid && (S as any).props[pid] ? P(pid) : P((S as any).myHome));
const reqOf = (p: any, id: string) => p.requests.find((r: any) => r.id === id);

/* ---------------- genel ---------------- */

function SearchSheet({ close }: { close: () => void }) {
  const go = useGo();
  const c = useColors();
  const [q, setQ] = useState('');
  const results = search(q);
  return (
    <Stack>
      <Title>{t('Ara')}</Title>
      <Field label={t('Talep, belge, mesaj ya da mülk ara')} value={q} onChangeText={setQ} autoFocus />
      {q.trim().length < 2 ? <Empty>{t('En az iki harf yaz. Talep başlıkları, belge adları, mesajlar ve mülk bilgileri taranır.')}</Empty>
        : results.length ? <Items data={results as any[]} render={(r: any, last) => <LI key={r.go + r.title} last={last} onPress={() => { close(); go(r.go); }} title={r.title} sub={r.sub} right={<Icon name={r.icon} size={18} color={c.accent} />} />} />
        : <Empty>{t('Sonuç yok.')}</Empty>}
    </Stack>
  );
}

function InboxSheet({ close }: { close: () => void }) {
  useStore();
  const go = useGo();
  useEffect(() => { S.inbox.forEach((n: any) => { n.read = true; }); }, []);
  const rem = reminders();
  return (
    <Stack>
      <Row between><Title>{t('Bildirimler')}</Title>{S.inbox.length ? <Button kind="ghost" title={t('Geçmişi temizle')} onPress={() => act('clearInbox')} /> : null}</Row>
      <H2>{t('Hatırlatmalar')}</H2>
      {rem.length ? <Items data={rem as any[]} render={(r: any, last) => <LI key={r.t + r.b} last={last} onPress={() => { close(); go(r.go); }} title={r.t} sub={r.b} right={<Chip tone={r.w > 1 ? 'bad' : 'warn'} label={t('Git')} />} />} /> : <Muted>{t('Şu an hatırlatma yok.')}</Muted>}
      <H2>{t('Son olaylar')}</H2>
      {S.inbox.length ? <Items data={S.inbox.slice().reverse()} render={(n: any, last, i) => <LI key={i} last={last} title={n.title} sub={n.body} right={<Muted>{ago(n.at)}</Muted>} />} /> : <Muted>{t('Henüz olay yok.')}</Muted>}
    </Stack>
  );
}

function subSummary() {
  const a: any = access();
  if (a.subscribed) return planLabel(a.plan || a.productId) + ' · ' + t('Aktif');
  if (a.inTrial) return t('Deneme · {n} gün kaldı', { n: trialDaysLeft(a) });
  return t('Deneme süresi bitti');
}

function NumSetting({ label, k, min, max }: { label: string; k: string; min: number; max: number }) {
  const [v, setV] = useState(String((S as any).settings[k]));
  return (
    <Row between>
      <Text v="small" style={{ flex: 1 }}>{label}</Text>
      <View style={{ width: 84 }}>
        <Field label="" accessibilityLabel={label} value={v} keyboardType="numeric" onChangeText={(x) => { const n = x.replace(/\D/g, ''); setV(n); }}
          onBlur={() => { const n = Math.min(max, Math.max(min, Number(v) || min)); setV(String(n)); act('setSetting', { k, v: n }); }} />
      </View>
    </Row>
  );
}

/** Açık / kapalı ayar; kayıtlı değer yoksa açık sayılır. */
function OnOff({ label, k, defaultOn = true }: { label: string; k: string; defaultOn?: boolean }) {
  const cur = (S as any).settings[k];
  const on = cur === undefined ? defaultOn : cur !== false;
  return <Toggle label={label} on={on} onChange={(b) => act('setSetting', { k, v: b, bool: true })} />;
}

/** Ayarlar > Hesap: ad, telefon, e-posta ve şifre değişikliği. */
function ProfileForm() {
  const { user, saveProfile, changeEmail, changePassword } = useAuth();
  const c = useColors();
  const [name, setName] = useState(user?.name || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [email, setEmail] = useState('');
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState<Record<string, { ok: boolean; text: string }>>({});
  const run = async (k: string, fn: () => Promise<string | null>, ok: string, after?: () => void) => {
    setBusy(k);
    const e = await fn();
    setBusy('');
    if (e && e !== 'CONFIRM') { setMsg({ ...msg, [k]: { ok: false, text: e } }); return; }
    setMsg({ ...msg, [k]: { ok: true, text: e === 'CONFIRM' ? t('Onay bağlantısını yeni adresine gönderdik. Bağlantıya tıklayınca e-postan değişir.') : ok } });
    after?.();
  };
  const Out = ({ k }: { k: string }) => msg[k] ? <Text v="small" color={msg[k].ok ? c.okInk : c.badInk} accessibilityLiveRegion="polite">{msg[k].text}</Text> : null;
  return (
    <Stack>
      <Card gap={14}>
        <H2>{t('Profil')}</H2>
        <Field label={t('Ad soyad')} value={name} onChangeText={setName} autoComplete="name" />
        <Field label={t('Telefon')} value={phone} onChangeText={setPhone} keyboardType="phone-pad" autoComplete="tel" placeholder="05xx xxx xx xx" />
        <Out k="profil" />
        <Button title={t('Kaydet')} loading={busy === 'profil'}
          onPress={() => run('profil', () => saveProfile({ name, phone }), t('Profilin güncellendi.'))} />
      </Card>
      <Card gap={14}>
        <H2>{t('E-posta adresi')}</H2>
        <Muted>{t('Şu anki adresin')}: {user?.email}</Muted>
        <Field label={t('Yeni e-posta')} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" />
        <Out k="eposta" />
        <Button kind="ghost" title={t('E-postayı değiştir')} loading={busy === 'eposta'} disabled={!email.trim()}
          onPress={() => run('eposta', () => changeEmail(email), t('E-posta adresin güncellendi.'), () => setEmail(''))} />
      </Card>
      <Card gap={14}>
        <H2>{t('Şifre')}</H2>
        <Field label={t('Mevcut şifre')} value={cur} onChangeText={setCur} secureTextEntry autoComplete="current-password" />
        <Field label={t('Yeni şifre')} hint={t('En az 8 karakter')} value={next} onChangeText={setNext} secureTextEntry autoComplete="new-password" />
        <Out k="sifre" />
        <Button kind="ghost" title={t('Şifreyi değiştir')} loading={busy === 'sifre'} disabled={!cur || !next}
          onPress={() => run('sifre', () => changePassword(cur, next), t('Şifren değişti.'), () => { setCur(''); setNext(''); })} />
      </Card>
    </Stack>
  );
}

/** Ayarlar: dört sekme, her sekmede yalnız gerekli seçenekler. Gün eşikleri "Hatırlatma zamanları" altında gizli.
    Hem yan menüdeki Ayarlar sayfasında (`page`) hem de eski bağlantılar için sayfa olarak açılır. */
export function SettingsBody({ close, page }: { close: () => void; page?: boolean }) {
  useStore();
  const { open } = useSheet();
  const { user, signOut, deleteAccount } = useAuth();
  const router = useRouter();
  const c = useColors();
  const [tab, setTab] = useState<'hesap' | 'bildirim' | 'gorunum' | 'yardim'>('hesap');
  const [timing, setTiming] = useState(false);
  const owner = ui.role === 'landlord' && !isTeam();
  const roleText = isTeam()
    ? t('Ekip üyesi') + (S.order.length && new Set(S.order.map((id: string) => memberRole(id))).size === 1 ? ' · ' + roleLabel(memberRole(S.order[0])) : '')
    : ui.role === 'landlord' ? t('Mülk sahibi') : t('Kiracı');
  const link = (title: string, url: string) => <LI key={title} title={title} onPress={() => Linking.openURL(url).catch(() => {})} right={<Muted>›</Muted>} />;
  return (
    <Stack>
      {page ? null : <Title>{t('Ayarlar')}</Title>}
      <Seg scroll value={tab} onChange={(v: any) => setTab(v)} options={[['hesap', t('Hesap')], ['bildirim', t('Bildirimler')], ['gorunum', t('Görünüm')], ['yardim', t('Yardım')]]} />

      {tab === 'hesap' ? (
        <Stack>
          <Card gap={4}>
            <Text v="body" style={{ fontFamily: fonts.bodyXBold }}>{user?.name || user?.email || ''}</Text>
            <Muted>{user?.email}{user?.email ? ' · ' : ''}{roleText}</Muted>
          </Card>
          {owner ? (
            <PressScale onPress={() => open('abonelik')} accessibilityRole="button" scaleTo={0.99} style={{ padding: 16, borderRadius: radius.lg, backgroundColor: c.tile, gap: 2 }}>
              <Label>{t('Paketin')}</Label>
              <Row between><Text v="body" style={{ fontFamily: fonts.bodyBold }}>{subSummary()}</Text><Muted>›</Muted></Row>
            </PressScale>
          ) : null}
          {myOrgs().length ? (
            <PressScale onPress={() => { if (!page) close(); router.push('/uygulama/kurum' as any); }} accessibilityRole="link" scaleTo={0.99} style={{ padding: 16, borderRadius: radius.lg, backgroundColor: c.tile, gap: 2 }}>
              <Label>{t('Kurum')}</Label>
              <Row between><Text v="body" style={{ fontFamily: fonts.bodyBold }}>{myOrgs().map((o: any) => o.name).join(', ')}</Text><Muted>›</Muted></Row>
            </PressScale>
          ) : null}
          <ProfileForm />
          <Button kind="ghost" block title={t('Çıkış yap')} onPress={async () => { close(); await signOut(); router.replace('/'); }} />
          <Button kind="quiet" block title={t('Hesabı sil')} onPress={async () => {
            if (!await host.ask({ title: t('Hesabın silinsin mi?'), body: t('Hesabın ve tüm verilerin kalıcı olarak silinir. Önce verini Yardım sekmesinden indirebilirsin.'), ok: t('Hesabı sil'), danger: true })) return;
            close(); await deleteAccount(); router.replace('/');
          }} />
        </Stack>
      ) : null}

      {tab === 'bildirim' ? (
        <Stack>
          <Muted>{t('Hangi durumlarda haber almak istediğini seç.')}</Muted>
          <Card gap={4}>
            <OnOff label={t('Kira günü yaklaşırken')} k="remindRent" />
            <OnOff label={t('Kira gecikince')} k="lateNotice" />
            <OnOff label={t('Talep güncellemeleri')} k="reqUpdates" />
            <OnOff label={t('Sözleşme yenileme')} k="remindRenew" />
            {ui.role === 'landlord' ? <OnOff label={t('DASK ve sigorta bitişi')} k="remindIns" /> : null}
            <OnOff label={t('Tahliye tarihi')} k="remindEvict" />
          </Card>
          <Label>{t('Nereden haber alayım?')}</Label>
          <Card gap={4}>
            <OnOff label={t('Telefon ve tarayıcı bildirimi')} k="push" />
            <OnOff label={t('E-posta')} k="email" />
            <OnOff label={t('SMS (kira, sözleşme ve sigorta hatırlatmaları)')} k="sms" />
          </Card>
          {!user?.phone ? <Muted>{t('SMS için Hesap sekmesinden telefon numaranı ekle.')}</Muted> : null}
          {owner ? (
            <>
              <Label>{t('Rapor e-postası')}</Label>
              <Card gap={4}><MailReportSettings /></Card>
            </>
          ) : null}
          <PressScale onPress={() => setTiming(!timing)} accessibilityRole="button" aria-expanded={timing}>
            <Text v="small" color={c.accentText} style={{ fontFamily: fonts.bodyBold }}>{timing ? t('Hatırlatma zamanlarını gizle') : t('Hatırlatma zamanlarını değiştir')}</Text>
          </PressScale>
          {timing ? (
            <Card gap={8}>
              <NumSetting label={t('Kira günü (gün önce)')} k="rentDays" min={0} max={15} />
              <NumSetting label={t('Sözleşme yenileme (gün önce)')} k="renewDays" min={7} max={120} />
              {ui.role === 'landlord' ? <NumSetting label={t('DASK ve sigorta (gün önce)')} k="insDays" min={7} max={90} /> : null}
              <NumSetting label={t('Tahliye tarihi (gün önce)')} k="evictDays" min={7} max={180} />
            </Card>
          ) : null}
        </Stack>
      ) : null}

      {tab === 'gorunum' ? (
        <Stack>
          <H2>{t('Tema')}</H2>
          <Seg value={S.theme === 'dark' ? 'dark' : 'light'} onChange={(v) => act('theme', { v })} options={[['light', t('Açık')], ['dark', t('Koyu')]]} />
          <H2>{t('Dil')}</H2>
          <Seg value={getLang()} onChange={(v) => act('lang', { v })} options={LANGS as any} />
        </Stack>
      ) : null}

      {tab === 'yardim' ? (
        <Stack>
          <List>
              {link(t('Destek merkezi ve sık sorulanlar'), CONFIG.legal.support)}
              <LI title={t('Bize yaz')} sub={CONFIG.supportEmail} onPress={() => open('destek-talebi', { kind: 'genel' })} right={<Muted>›</Muted>} />
              {link(t('Kullanım ve abonelik koşulları'), CONFIG.legal.terms)}
              {link(t('Gizlilik ve KVKK aydınlatma metni'), CONFIG.legal.privacy)}
            <LI last title={t('Hesap silme bilgisi')} onPress={() => Linking.openURL(CONFIG.legal.deletion).catch(() => {})} right={<Muted>›</Muted>} />
          </List>
          <H2>{t('Verilerin')}</H2>
          {ui.role === 'landlord' ? <Button kind="ghost" block title={t('Ödeme ve giderleri Excel olarak indir')} onPress={() => act('exportXlsx')} /> : null}
          <Button kind="ghost" block title={t('Tüm verimi indir (JSON)')} onPress={() => act('exportData')} />
          {LIVE ? null : (
            <>
              <Button kind="ghost" block title={t('Yedekten geri yükle')} onPress={async () => { const text = await pickJson(); if (text) act('importData', { text }); }} />
              <Button kind="quiet" block title={t('Örnek veriyi sıfırla')} onPress={() => act('reset')} />
              <Muted>{t('Bu sürümde veriler yalnızca bu cihazda saklanır.')}</Muted>
            </>
          )}
        </Stack>
      ) : null}
    </Stack>
  );
}

function MapSheet({ close }: { close: () => void }) {
  const go = useGo();
  const items: [string, string, string][] = ui.role === 'tenant'
    ? [[t('Panel'), '/kiraci', 'home'], [t('Ödemeler'), '/kiraci/odemeler', 'card'], [t('Talepler'), '/kiraci/talepler', 'wrench'], [t('Mesajlar'), '/kiraci/mesajlar', 'chat'], [t('Belgeler'), '/kiraci/belgeler', 'doc'], [t('Giriş tutanağı'), '/kiraci/belgeler/tutanak', 'key'], [t('Çıkış ve depozito'), '/kiraci/belgeler/cikis', 'key'], [t('Takvim'), '/kiraci/takvim', 'calendar']]
    : [[t('Portföy'), '/mulk-sahibi', 'grid'], ...(S.order as string[]).map((id) => [(S as any).props[id].name, '/mulk-sahibi/mulk/' + id, 'home'] as [string, string, string]), [t('Tüm talepler'), '/mulk-sahibi/talepler', 'wrench'], [t('Mesajlar'), '/mulk-sahibi/mesajlar', 'chat'], [t('Takvim'), '/mulk-sahibi/takvim', 'calendar'], [t('Rapor'), '/mulk-sahibi/rapor', 'chart']];
  return (
    <Stack>
      <Title>{t('Ekran haritası')}</Title>
      <Items data={items} render={([label, path, icon], last) => <LI key={path} last={last} onPress={() => { close(); go(path); }} title={label} right={<Icon name={icon} size={18} />} />} />
    </Stack>
  );
}

function TextSheet() {
  const c = useColors();
  const txt = ui.text || { title: t('Metin'), body: '' };
  return (
    <Stack>
      <Title>{txt.title}</Title>
      <View style={{ backgroundColor: c.surface, borderRadius: radius.md, borderWidth: 1, borderColor: c.line, padding: 14 }}><Text v="small" selectable style={{ lineHeight: 21 }}>{txt.body}</Text></View>
      <Row>
        <Button title={t('Kopyala')} style={{ flex: 1 }} onPress={async () => { try { await Clipboard.setStringAsync(txt.body); host.notify({ title: t('Kopyalandı'), body: t('Metin panoya alındı.'), icon: 'doc' }); } catch {} }} />
        <Button kind="ghost" title={t('İndir')} style={{ flex: 1 }} onPress={() => act('downloadText')} />
      </Row>
    </Stack>
  );
}

/* ---------------- talepler ---------------- */

function NewReqSheet({ pid, close }: { pid?: string; close: () => void }) {
  const p = propOf(pid);
  const { v, set } = useVals({ cat: 'Arıza', title: '', desc: '', urgency: 'Normal' });
  const [files, setFiles] = useState<any[]>([]);
  const [err, setErr] = useState('');
  const sugg: string[] = (REQ_SUGGEST as any)[p.type] || (REQ_SUGGEST as any)['Konut'];
  return (
    <Stack>
      <Title>{t('Yeni talep')}</Title>
      <Choice label={t('Tür')} options={CATS} v={v} set={set} k="cat" render={t} />
      <Text2 label={t('Başlık')} v={v} set={set} k="title" maxLength={80} placeholder={t('Ör. Mutfak musluğu damlatıyor')} error={err} />
      <Row wrap gap={6}>{sugg.map((x) => <PressScale key={x} onPress={() => set('title', t(x))}><Chip label={t(x)} /></PressScale>)}</Row>
      <Area label={t('Açıklama')} v={v} set={set} k="desc" placeholder={t('Ne zamandır sürüyor, nerede, nasıl?')} />
      <Choice label={t('Aciliyet')} options={['Normal', 'Acil']} v={v} set={set} k="urgency" render={t} />
      <FileField label={t('Fotoğraf')} kind="photos" files={files} setFiles={setFiles} max={4} camera />
      <Actions onCancel={close} submitLabel={t('Talebi gönder')} onSubmit={async () => { if (!v.title.trim()) { setErr(t('Başlık gerekli.')); return; } await submit('newReq', { ...v, pid: p.id, files }); }} />
    </Stack>
  );
}

function QuotesSection({ p, r }: { p: any; r: any }) {
  const { open } = useSheet();
  const quotes = r.quotes || [];
  const landlord = ui.role === 'landlord' && can(p.id, 'request');
  if (!quotes.length && !landlord && !r.invoice) return null;
  return (
    <Card gap={8}>
      <Row between><H2>{t('Usta ve teklifler')}</H2>{landlord && r.status < 3 ? <Button kind="ghost" title={t('Teklif')} icon={<Icon name="plus" size={15} />} onPress={() => open('teklif', { pid: p.id, id: r.id })} /> : null}</Row>
      {quotes.length ? quotes.slice().sort((a: any, b: any) => a.amount - b.amount).map((q: any) => (
        <Row key={q.id} between style={{ paddingVertical: 4 }}>
          <View style={{ flex: 1 }}><Text v="small" style={{ fontFamily: fonts.bodyXBold }}>{q.vendor}</Text><Muted>{tl(q.amount)}{q.note ? ' · ' + q.note : ''}</Muted></View>
          <Row gap={6}>
            {q.chosen ? <Chip tone="ok" label={t('Seçildi')} /> : landlord && r.status < 3 ? <Button kind="ghost" title={t('Seç')} onPress={() => act('chooseQuote', { pid: p.id, id: r.id, q: q.id })} /> : null}
            {q.phone ? <IconBtn name="phone" size={16} label={t('{name} ara|telefon', { name: q.vendor })} onPress={() => Linking.openURL('tel:' + q.phone).catch(() => {})} /> : null}
            {landlord && !q.chosen ? <IconBtn name="x" size={16} label={q.vendor} onPress={() => act('removeQuote', { pid: p.id, id: r.id, q: q.id })} /> : null}
          </Row>
        </Row>
      )) : <Muted>{t('Henüz teklif yok. Ustalardan aldığın fiyatları ekleyip karşılaştırabilirsin.')}</Muted>}
      {r.invoice
        ? <Stack gap={8}><Note>{t('Fatura:')} {tl(r.invoice.amount)} · {r.invoice.name} · {fmtFull(parse(r.invoice.date))}{r.invoice.expenseId ? ' ' + t('· gider defterine işlendi') : ''}</Note><FileLink path={r.invoice.path} label={t('Faturayı aç')} /><ReviewChip kind="invoice" pid={p.id} id={r.id} /></Stack>
        : landlord ? <Button kind="ghost" title={t('Fatura ekle')} onPress={() => open('fatura', { pid: p.id, id: r.id })} /> : null}
    </Card>
  );
}

function ReqSheet({ pid, id, close }: { pid?: string; id: string; close: () => void }) {
  useStore();
  const p = propOf(pid);
  const r = reqOf(p, id);
  const go = useGo();
  if (!r) return <Stack><Title>{t('Talep bulunamadı')}</Title><Button kind="ghost" block title={t('Kapat')} onPress={close} /></Stack>;
  const landlord = ui.role === 'landlord';
  const ctrl: ReactNode[] = [];
  if (landlord && !can(p.id, 'request')) {
    // Muhasebeci gibi yalnız okuyan ekip üyeleri talebi değiştiremez.
  } else if (landlord) {
    if (r.cat === 'Ek talep' && !r.decision)
      ctrl.push(<Row key="d"><Button title={t('Onayla')} style={{ flex: 1 }} onPress={() => act('decide', { pid: p.id, id: r.id, v: 'Onaylandı' })} /><Button kind="ghost" title={t('Reddet')} style={{ flex: 1 }} onPress={() => act('decide', { pid: p.id, id: r.id, v: 'Reddedildi' })} /></Row>);
    else if (r.status < 3)
      ctrl.push(<Button key="a" block title={t('Durumu ilerlet:') + ' ' + t(STEPS[r.status + 1])} onPress={() => act('advance', { pid: p.id, id: r.id })} />);
    if (r.status > 0 && r.cat !== 'Ek talep') ctrl.push(<Button key="rw" kind="ghost" block title={t('Bir adım geri al')} onPress={() => act('rewind', { pid: p.id, id: r.id })} />);
    ctrl.push(<View key="cost" style={{ gap: 8 }}><Text v="small" style={{ fontFamily: fonts.bodyBold }}>{t('Masrafı kim karşılıyor?')}</Text>
      <Row wrap gap={8}>{COST_OPTS.map((o: string) => { const on = r.cost === o; return <PressScale key={o} onPress={() => act('setCost', { pid: p.id, id: r.id, v: o })} scaleTo={0.96} style={{ paddingHorizontal: 14, minHeight: 38, borderRadius: radius.pill, justifyContent: 'center', borderWidth: 1, borderColor: on ? '#A8492A' : '#E4E1DA', backgroundColor: on ? '#A8492A' : 'transparent' }}><Text v="small" color={on ? '#fff' : undefined} style={{ fontFamily: fonts.bodyXBold }}>{t(o)}</Text></PressScale>; })}</Row></View>);
  } else {
    if (r.cost !== 'Belirlenmedi' && !r.costOk && r.cat !== 'Ek talep') {
      ctrl.push(<Note key="cn">{t('Mülk sahibi masrafın')} {t(r.cost)} {t('tarafından karşılanmasını önerdi.')}</Note>);
      ctrl.push(<Button key="ok" block title={t('Masraf paylaşımını onayla')} onPress={() => act('okCost', { pid: p.id, id: r.id })} />);
    }
    if (r.status < 3) ctrl.push(<Button key="cl" kind="ghost" block title={t('Talebi kapat (çözüldü)')} onPress={() => act('closeReq', { pid: p.id, id: r.id })} />);
  }
  return (
    <Stack>
      <Label accent>{t(r.cat)} · {t(r.urgency)} · {fmtFull(parse(r.date))}</Label>
      <Title>{r.title}</Title>
      <Muted>{r.desc || t('Açıklama yok.')}</Muted>
      <Thumbs srcs={r.shots || []} />
      {r.cat !== 'Ek talep'
        ? <Stack gap={4}><Row gap={6} wrap>{STEPS.map((s: string, i: number) => <Chip key={s} tone={i < r.status ? 'ok' : i === r.status ? 'accent' : 'neutral'} label={t(s)} />)}</Row></Stack>
        : r.decision ? <Chip tone={r.decision === 'Onaylandı' ? 'ok' : 'bad'} label={t(r.decision)} /> : <Chip tone="warn" label={t('Mülk sahibinin kararı bekleniyor')} />}
      <KV k={t('Masraf')} v={t(r.cost) + (r.costOk ? ' ' + t('· onaylı') : r.cost !== 'Belirlenmedi' ? ' ' + t('· onay bekliyor') : '')} />
      {ctrl}
      <QuotesSection p={p} r={r} />
      {(r.log || []).length ? <Stack gap={8}><H2>{t('Geçmiş')}</H2><Items data={(r.log || []).slice().reverse()} render={(e: any, last, i) => <LI key={i} last={last} title={e.text} sub={ago(e.at)} />} /></Stack> : null}
      {can(p.id, 'message') ? <Button kind="ghost" block title={t('Bu talep hakkında yaz')} onPress={() => { close(); act('goMsg', { pid: p.id }); }} /> : null}
    </Stack>
  );
}

function QuoteSheet({ pid, id, close }: { pid?: string; id: string; close: () => void }) {
  const p = propOf(pid); const r = reqOf(p, id);
  const { v, set } = useVals({ vendor: '', amount: '', phone: '', note: '' });
  if (!r) return null;
  return (
    <Stack>
      <Title>{t('Teklif ekle')}</Title><Muted>{r.title}</Muted>
      <Text2 label={t('Usta ya da firma')} v={v} set={set} k="vendor" maxLength={60} />
      <Row align="flex-start"><View style={{ flex: 1 }}><NumField label={t('Tutar (₺)')} v={v} set={set} k="amount" /></View><View style={{ flex: 1 }}><Text2 label={t('Telefon')} v={v} set={set} k="phone" keyboardType="phone-pad" /></View></Row>
      <Text2 label={t('Not')} v={v} set={set} k="note" maxLength={120} placeholder={t('Ör. parça dahil, 2 gün')} />
      <Actions onCancel={close} submitLabel={t('Ekle')} onSubmit={() => submit('quote', { ...v, pid: p.id, id: r.id })} />
    </Stack>
  );
}

function InvoiceSheet({ pid, id, close }: { pid?: string; id: string; close: () => void }) {
  const p = propOf(pid); const r = reqOf(p, id);
  const q = r && (r.quotes || []).find((x: any) => x.chosen);
  const mayExpense = !!r && can(p.id, 'expense');
  const { v, set } = useVals({ amount: q ? String(q.amount) : '', date: iso(t0()), toExpense: mayExpense && (r.cost === 'Mülk sahibi' || r.cost === 'Paylaşımlı') });
  const [files, setFiles] = useState<any[]>([]);
  if (!r) return null;
  return (
    <Stack>
      <Title>{t('Fatura ekle')}</Title><Muted>{r.title}{q ? ' · ' + q.vendor : ''}</Muted>
      <Row align="flex-start"><View style={{ flex: 1 }}><NumField label={t('Tutar (₺)')} v={v} set={set} k="amount" /></View><View style={{ flex: 1 }}><DateField label={t('Tarih')} v={v} set={set} k="date" /></View></Row>
      <FileField label={t('Fatura dosyası')} files={files} setFiles={setFiles} />
      {mayExpense ? (
        <>
          <Toggle label={t('Gider defterine ekle') + (r.cost === 'Paylaşımlı' ? ' ' + t('(yarısı)') : '')} on={!!v.toExpense} onChange={(b) => set('toExpense', b)} />
          <Muted>{t('Masraf:')} {t(r.cost)}{t('. Masraf kiracıdaysa gider defterine eklenmez.')}</Muted>
        </>
      ) : <Muted>{t('Gider defterine mülk sahibi ya da emlakçı ekler.')}</Muted>}
      <Actions onCancel={close} submitLabel={t('Kaydet')} onSubmit={() => submit('invoice', { ...v, pid: p.id, id: r.id, files })} />
    </Stack>
  );
}

/* ---------------- ödeme ---------------- */

function ReceiptSheet({ pid, k, kind, close }: { pid?: string; k: string; kind?: string; close: () => void }) {
  useStore();
  const { open } = useSheet();
  const p = propOf(pid);
  const aidat = kind === 'aidat';
  const rc = payMap(p, kind)[k] || {};
  const st = statusFor(p, kind, k);
  const due = dueOf(p, kind, k);
  return (
    <Stack>
      <Title>{monthYear(k)} {aidat ? t('aidat dekontu') : t('dekontu')}</Title>
      <ReviewChip kind="payment" pid={p.id} id={aidat ? 'aidat:' + k : k} />
      {rc.photo && /\.pdf$/i.test(rc.photo) ? <FileLink path={rc.photo} label={rc.receipt || t('Dekontu aç')} /> : rc.photo ? <Thumbs size={190} srcs={[rc.photo]} /> : <Card><Muted>{rc.receipt || (rc.method ? t('Dekontsuz kayıt') + ' · ' + t((METHOD as any)[rc.method] || rc.method) : t('Dekont yok'))}</Muted></Card>}
      <KV k={t('Tutar')} v={tl(rc.amount != null ? rc.amount : due)} />
      <KV k={t('Beklenen')} v={tl(due)} />
      {p.stopaj && !aidat ? <Muted>{stopajLine(p, k)}</Muted> : null}
      <KV k={t('Ödeme tarihi')} v={rc.date ? fmtFull(parse(rc.date)) : '—'} />
      <KV k={t('Durum')} v={((ST as any)[st] || (ST as any).pending)[0]} />
      {rc.note ? <KV k={t('Not')} v={rc.note} /> : null}
      {rc.rejectReason ? <Note warn>{t('Red gerekçesi:')} {rc.rejectReason}</Note> : null}
      {ui.role === 'landlord' && can(p.id, 'decide') && (st === 'review' || st === 'partial')
        ? <Row><Button title={t('Onayla')} style={{ flex: 1 }} onPress={() => act('approvePay', { pid: p.id, key: k, kind })} /><Button kind="ghost" title={t('Reddet')} style={{ flex: 1 }} onPress={() => open('red', { pid: p.id, key: k, kind })} /></Row> : null}
      {ui.role === 'tenant' && (st === 'rejected' || st === 'late' || st === 'pending' || st === 'partial') && (!aidat || aidatByTenant(p))
        ? <Button block title={t('Dekont yükle')} onPress={() => open('odeme', { pid: p.id, key: k, kind })} /> : null}
    </Stack>
  );
}

function PayFormSheet({ pid, k, kind, close }: { pid?: string; k?: string; kind?: string; close: () => void }) {
  const p = propOf(pid);
  const aidat = kind === 'aidat';
  // Aidatı mülk sahibi ödüyorsa kendi kaydını girer; dekont isteğe bağlıdır.
  const own = aidat && ui.role === 'landlord';
  const key = k || (period(p) as any).key;
  const rec = payMap(p, kind)[key] || {};
  const paid = rec.status === 'partial' ? Number(rec.amount) || 0 : 0;
  const due = dueOf(p, kind, key);
  const { v, set } = useVals({ amount: String(Math.max(0, due - paid)), date: iso(t0()), note: '' });
  const [files, setFiles] = useState<any[]>([]);
  const [err, setErr] = useState('');
  return (
    <Stack>
      <Title>{monthYear(key)} {aidat ? t('aidatı') : t('ödemesi')}</Title>
      <KV k={aidat ? t('Bu ayın aidatı') : p.stopaj ? t('Hesaba yatacak tutar') : t('Bu ayın kirası')} v={tl(due)} />
      {p.stopaj && !aidat ? <Muted>{stopajLine(p, key)}</Muted> : null}
      {paid ? <KV k={t('Şimdiye kadar ödenen')} v={tl(paid)} /> : null}
      <NumField label={t('Ödenen tutar (₺)')} v={v} set={set} k="amount" />
      <DateField label={t('Ödeme tarihi')} v={v} set={set} k="date" max={iso(t0())} />
      <FileField label={own ? t('Dekont (isteğe bağlı)') : t('Dekont (görsel ya da PDF)')} files={files} setFiles={setFiles} camera />
      <Text2 label={t('Not (isteğe bağlı)')} v={v} set={set} k="note" maxLength={120} placeholder={t('Ör. havale açıklaması')} />
      <Muted>{aidat ? t('Tutar aidatın altındaysa ödeme kısmi olarak işaretlenir ve kalan bakiye takip edilir.') : t('Tutar kiranın altındaysa ödeme kısmi olarak işaretlenir ve kalan bakiye takip edilir.')}</Muted>
      {err ? <Text v="small" color="#A8231F">{err}</Text> : null}
      <Row>
        <Button kind="ghost" title={t('Vazgeç')} onPress={close} style={{ flex: 1 }} />
        <PayButton title={own ? t('Kaydet') : t('Gönder')} doneTitle={own ? t('Kaydedildi') : t('Gönderildi')} style={{ flex: 1 }} onPress={async () => {
          if (!files.length && !own) { setErr(t('Dekont dosyası seç.')); return false; }
          const ok = await submit('pay', { ...v, pid: p.id, key, kind, files, keepOpen: true });
          if (ok) setTimeout(close, 900);
          return ok;
        }} />
      </Row>
    </Stack>
  );
}

function RejectSheet({ pid, k, kind, close }: { pid?: string; k: string; kind?: string; close: () => void }) {
  const p = propOf(pid);
  const { v, set } = useVals({ reason: 'Tutar eksik', note: '' });
  return (
    <Stack>
      <Title>{t('Dekontu reddet')}</Title>
      <Muted>{t('Kiracıya gerekçe iletilir; ödeme yeniden yüklenebilir.')}</Muted>
      <Choice label={t('Gerekçe')} options={['Tutar eksik', 'Dekont okunmuyor', 'Farklı hesaba yatmış', 'Tarih uyuşmuyor', 'Diğer']} v={v} set={set} k="reason" render={t} />
      <Text2 label={t('Açıklama (isteğe bağlı)')} v={v} set={set} k="note" maxLength={120} />
      <Actions onCancel={close} danger submitLabel={t('Reddet')} onSubmit={() => submit('reject', { ...v, pid: p.id, key: k, kind })} />
    </Stack>
  );
}

function RenewalSheet({ pid, close }: { pid?: string; close: () => void }) {
  const p = propOf(pid);
  const [cpi, setCpi] = useState(ui.renewal.cpi == null ? '' : String(ui.renewal.cpi));
  const [amount, setAmount] = useState(ui.renewal.amount == null ? '' : String(ui.renewal.amount));
  const [auto, setAuto] = useState<{ month: string; rate: number } | null>(null);
  // Oran tablosunda yenileme ayı için TÜİK verisi varsa alan kendiliğinden dolar (elle değiştirilebilir).
  useEffect(() => {
    let live = true;
    loadRates().then((r) => {
      const hit = live ? rateFor(r, parse(p.contractEnd)) : null;
      if (!hit) return;
      setAuto(hit);
      if (ui.renewal.cpi == null) { setCpi(String(hit.rate)); ui.renewal.cpi = hit.rate; }
    });
    return () => { live = false; };
  }, [p.id]);
  const has = cpi !== '' && isFinite(Number(cpi));
  const max = has ? Math.round(p.rent * (1 + Number(cpi) / 100)) : 0;
  const over = has && Number(amount) > max;
  return (
    <Stack>
      <Title>{t('Kira artışı hesaplama')}</Title>
      <KV k={t('Mevcut kira')} v={tl(p.rent)} /><KV k={t('Sözleşme bitişi')} v={fmtFull(parse(p.contractEnd))} />
      <Field label={t('Son 12 aylık TÜFE ortalaması (%)')} value={cpi} keyboardType="decimal-pad" placeholder={t('TÜİK’in açıkladığı oran')}
        onChangeText={(x) => { const n = x.replace(',', '.').replace(/[^0-9.]/g, ''); setCpi(n); ui.renewal.cpi = n === '' ? null : Number(n); if (n !== '' && !amount) { const m = Math.round(p.rent * (1 + Number(n) / 100)); setAmount(String(m)); ui.renewal.amount = m; } }} />
      {auto ? <Muted>{t('TÜİK {m} verisi: %{r}. Sözleşmede daha düşük bir oran yazıyorsa onu gir.', { m: monthYear(auto.month), r: String(auto.rate).replace('.', ',') })}</Muted> : null}
      <Note>{!has ? t('Oranı girince yasal üst sınır burada görünür.') : over ? t('Önerdiğin tutar yasal üst sınırı (') + tl(max) + t(') aşıyor; teklif sınırla gönderilir.') : `${t('Yasal üst sınır:')} ${tl(max)} (+${tl(max - p.rent)})`}</Note>
      {ui.role === 'landlord' && can(p.id, 'shared') ? (
        <>
          <Field label={t('Önereceğin kira')} value={amount} keyboardType="numeric" onChangeText={(x) => { const n = x.replace(/\D/g, ''); setAmount(n); ui.renewal.amount = n === '' ? null : Number(n); }} />
          <Button block title={t('Teklifi kiracıya gönder')} disabled={!has} onPress={() => act('sendRenewal', { pid: p.id })} />
        </>
      ) : null}
      <Muted>{t('Oranı TÜİK’in resmi açıklamasından kontrol et. Taraflar daha düşük bir artışta anlaşabilir.')}</Muted>
    </Stack>
  );
}

/* ---------------- mülk ---------------- */

function LesseeFields({ v, set, p }: { v: any; set: (k: string, x: any) => void; p?: any }) {
  const company = v.tenantKind === TENANT_KINDS[1];
  return (
    <Stack>
      <Choice label={t('Kiracı türü')} options={TENANT_KINDS} v={v} set={set} k="tenantKind" render={t} />
      {company ? (
        <Stack>
          <Text2 label={t('Unvan')} v={v} set={set} k="coName" maxLength={120} placeholder={t('Ör. Örnek Ticaret Ltd. Şti.')} />
          <Row align="flex-start"><View style={{ flex: 1 }}><Text2 label={t('Vergi no')} v={v} set={set} k="coTaxNo" maxLength={11} keyboardType="numeric" /></View><View style={{ flex: 1 }}><Text2 label={t('Vergi dairesi')} v={v} set={set} k="coTaxOffice" maxLength={60} /></View></Row>
          <Toggle label={t('Kiracı kira stopajı keser (%20)')} on={!!v.stopaj} onChange={(b) => set('stopaj', b)} />
          <Muted>{t('Şirket ya da esnaf kiracı, kiranın %20’sini keserek vergi dairesine öder; sana net tutar yatar. Kira alanına sözleşmedeki brüt tutarı yaz.')}</Muted>
        </Stack>
      ) : null}
    </Stack>
  );
}

function AddPropSheet({ close }: { close: () => void }) {
  const { v, set } = useVals({ type: ui.newPropType || 'Konut', name: '', address: emptyAddress(), area: '', rent: '', due: '1', phone: '', tenantKind: TENANT_KINDS[0], coName: '', coTaxNo: '', coTaxOffice: '', stopaj: true });
  const [err, setErr] = useState('');
  const ph: any = { Konut: t('Ör. Kadıköy 3+1'), Ofis: t('Ör. Levent ofis'), Mağaza: t('Ör. Bağdat Cd. mağaza'), Depo: t('Ör. Hadımköy depo') };
  return (
    <Stack>
      <Title>{t('Mülk ekle')}</Title>
      <Seg scroll value={v.type} onChange={(x) => set('type', x)} options={PROP_TYPES.map((tp: string) => [tp, t(tp)] as [string, string])} />
      <Text2 label={t('Mülk adı')} v={v} set={set} k="name" maxLength={60} placeholder={ph[v.type]} error={err} />
      <H2>{t('Adres')}</H2>
      <AddressFields value={v.address} onChange={(a) => set('address', a)} />
      <H2>{t('Kira')}</H2>
      <Row align="flex-start"><View style={{ flex: 1 }}><NumField label={t('Alan (m²)')} v={v} set={set} k="area" /></View><View style={{ flex: 1 }}><NumField label={t('Aylık kira (₺)')} v={v} set={set} k="rent" /></View></Row>
      <NumField label={t('Ödeme günü')} v={v} set={set} k="due" />
      {v.type !== 'Konut' ? <LesseeFields v={v} set={set} /> : null}
      <Text2 label={t('Kiracının telefonu')} v={v} set={set} k="phone" keyboardType="phone-pad" placeholder="05__ ___ __ __" />
      <Muted>{t('Kaydettiğinde kiracıya WhatsApp ile davet linki hazırlanır; katıldığında mülk iki taraflı panele dönüşür.')}</Muted>
      <Actions onCancel={close} submitLabel={t('Kaydet ve davet et')} onSubmit={async () => { if (!v.name.trim()) { setErr(t('Mülk adı gerekli.')); return; } await submit('addProp', v); }} />
    </Stack>
  );
}

function EditPropSheet({ pid, close }: { pid?: string; close: () => void }) {
  const p = propOf(pid);
  const { v, set } = useVals({
    name: p.name, address: p.address || { ...emptyAddress(), note: p.addr || '' }, type: p.type, area: p.area ? String(p.area) : '', rent: String(p.rent), due: String(p.dueDay),
    tenantKind: p.company ? TENANT_KINDS[1] : TENANT_KINDS[0], coName: p.company?.name || '', coTaxNo: p.company?.taxNo || '', coTaxOffice: p.company?.taxOffice || '', stopaj: !p.company || p.stopaj,
    aidat: String(p.aidat), aidatPayer: p.aidatPayer, depositKind: p.depositKind || 'Nakit', deposit: String(p.deposit), depositNote: p.depositNote || '',
    value: p.value ? String(p.value) : '', contractEnd: p.contractEnd, dask: p.dask || ''
  });
  return (
    <Stack>
      <Title>{t('Mülk bilgileri')}</Title>
      <Text2 label={t('Mülk adı')} v={v} set={set} k="name" maxLength={60} />
      <AddressFields value={v.address} onChange={(a) => set('address', a)} />
      <Choice label={t('Mülk tipi')} options={PROP_TYPES} v={v} set={set} k="type" render={t} />
      <Row align="flex-start"><View style={{ flex: 1 }}><NumField label={t('Alan (m²)')} v={v} set={set} k="area" /></View><View style={{ flex: 1 }}><NumField label={p.stopaj ? t('Aylık brüt kira (₺)') : t('Aylık kira (₺)')} v={v} set={set} k="rent" /></View></Row>
      <NumField label={t('Ödeme günü')} v={v} set={set} k="due" />
      <LesseeFields v={v} set={set} p={p} />
      <Row align="flex-start"><View style={{ flex: 1 }}><NumField label={t('Aidat (₺)')} v={v} set={set} k="aidat" /></View></Row>
      <Choice label={t('Aidatı ödeyen')} options={['Kiracı', 'Mülk sahibi']} v={v} set={set} k="aidatPayer" render={t} />
      <Choice label={t('Depozito türü')} options={DEPOSIT_KINDS} v={v} set={set} k="depositKind" render={t} />
      <NumField label={t('Depozito (₺)')} v={v} set={set} k="deposit" />
      <Text2 label={t('Depozito notu')} v={v} set={set} k="depositNote" maxLength={120} placeholder={t('Ör. banka, mektup tutarı ve vadesi')} />
      <NumField label={t('Tahmini değer (₺)')} v={v} set={set} k="value" hint={t('İsteğe bağlı')} />
      <Muted>{t('Kira tutarını değiştirirsen bugünden geçerli yeni bir dönem olarak kira geçmişine eklenir. Değer, net getiri oranı için kullanılır.')}</Muted>
      <DateField label={t('Sözleşme bitişi')} v={v} set={set} k="contractEnd" />
      <DateField label={isCommercial(p) ? t('DASK bitişi (varsa)') : t('DASK bitişi')} v={v} set={set} k="dask" />
      {isCommercial(p) ? <Muted>{t('DASK yalnızca konutta zorunludur. İşyeri sigortasını Belgeler’e bitiş tarihiyle yüklersen hatırlatma kurulur.')}</Muted> : null}
      <Actions onCancel={close} submitLabel={t('Kaydet')} onSubmit={() => submit('editProp', { ...v, pid: p.id })} />
      {S.order.length > 1 ? <Button kind="quiet" block title={t('Bu mülkü kaldır')} onPress={() => act('removeProp', { pid: p.id })} /> : null}
    </Stack>
  );
}

function AddTenantSheet({ pid, close }: { pid?: string; close: () => void }) {
  const p = propOf(pid);
  const { v, set } = useVals({ name: '', email: '', phone: '' });
  return (
    <Stack>
      <Title>{t('Kiracı ekle')}</Title>
      <Muted>{p.name} {t('için yeni bir kiracı hesabı. Aynı mülkün kiracıları ödemeleri, talepleri ve yazışmaları birlikte görür.')}</Muted>
      <Text2 label={t('Ad soyad')} v={v} set={set} k="name" maxLength={60} />
      <Text2 label={t('E-posta')} v={v} set={set} k="email" keyboardType="email-address" autoCapitalize="none" />
      <Text2 label={t('Telefon')} v={v} set={set} k="phone" keyboardType="phone-pad" placeholder="05__ ___ __ __" />
      <Actions onCancel={close} submitLabel={t('Ekle ve davet et')} onSubmit={() => submit('addTenant', { ...v, pid: p.id })} />
    </Stack>
  );
}

function PhotoSheet({ src }: { src?: string }) {
  const c = useColors();
  useStore();
  if (!src) return null;
  return (
    <Stack>
      <Image source={{ uri: mediaSrc(src) }} accessibilityLabel={t('Fotoğraf')} resizeMode="contain" style={{ width: '100%', aspectRatio: 1, borderRadius: radius.md, backgroundColor: c.surface2 }} />
    </Stack>
  );
}

function InviteSheet({ pid, code }: { pid?: string; code?: string }) {
  const p = propOf(pid);
  const c = useColors();
  if (!code) return null;
  const link = LIVE ? inviteLink(code) : CONFIG.publicUrl + 'katil?kod=' + code;
  const text = t('Merhaba,') + ' ' + p.name + ' ' + t('için anahtar’da ortak panelimize katılır mısın? Davet kodun:') + ' ' + code + ' — ' + link;
  return (
    <Stack>
      <Title>{t('Kiracını davet et')}</Title>
      <Muted>{t('Kiracın bu bağlantıyla kayıt olunca ya da kodu girince')} {p.name} {t('paneline bağlanır. Kod 30 gün geçerlidir.')}</Muted>
      <View style={{ backgroundColor: c.surface, borderRadius: radius.md, borderWidth: 1, borderColor: c.line, padding: 16, alignItems: 'center' }}><Text v="h2" selectable style={{ letterSpacing: 4 }}>{code}</Text></View>
      <Row>
        <Button title={t('Kopyala')} icon={<Icon name="doc" size={16} color="#fff" />} style={{ flex: 1 }} onPress={async () => { try { await Clipboard.setStringAsync(link); host.notify({ title: t('Kopyalandı'), body: t('Davet bağlantısı panoya alındı.'), icon: 'doc' }); } catch {} }} />
        <Button kind="ghost" title={t('WhatsApp')} style={{ flex: 1 }} onPress={() => Linking.openURL('https://wa.me/?text=' + encodeURIComponent(text))} />
      </Row>
      <Button kind="ghost" block title={t('E-posta ile gönder')} onPress={() => Linking.openURL('mailto:?subject=' + encodeURIComponent(t('anahtar daveti')) + '&body=' + encodeURIComponent(text))} />
      {!LIVE && <Note>{t('Demo modunda davet gerçek değildir; kod yalnızca akışı göstermek içindir.')}</Note>}
    </Stack>
  );
}

/* ---------------- belge, gider, çıkış ---------------- */

function UploadSheet({ pid, cat, close }: { pid?: string; cat?: string; close: () => void }) {
  const p = propOf(pid);
  const { v, set } = useVals({ cat: cat || 'Kira sözleşmesi', until: '', note: '' });
  const [files, setFiles] = useState<any[]>([]);
  const [err, setErr] = useState('');
  const other = v.cat === 'Diğer';
  return (
    <Stack>
      <Title>{t('Belge yükle')}</Title>
      <Choice label={t('Kategori')} options={docCatsFor(p)} v={v} set={set} k="cat" render={t} />
      {other ? <Text2 label={t('Açıklama')} v={v} set={set} k="note" maxLength={120} placeholder={t('Ör. kombi garanti belgesi')} hint={t('“Diğer” için kısa bir açıklama yaz.')} /> : null}
      <FileField label={t('Dosya')} files={files} setFiles={setFiles} />
      <DateField label={t('Bitiş veya tahliye tarihi (varsa)')} v={v} set={set} k="until" />
      <Muted>{t('Tarih girersen, yaklaştığında iki tarafa da hatırlatma gider. Tahliye taahhütnamesi ve sigorta poliçeleri için önerilir.')}</Muted>
      {err ? <Text v="small" color="#A8231F">{err}</Text> : null}
      <Actions onCancel={close} submitLabel={t('Yükle')} onSubmit={async () => {
        if (!files.length) { setErr(t('Dosya seç.')); return; }
        if (other && String(v.note || '').trim().length < 3) { setErr(t('“Diğer” için en az 3 karakterlik bir açıklama yaz.')); return; }
        await submit('upload', { ...v, note: other ? v.note : '', pid: p.id, files });
      }} />
    </Stack>
  );
}

function ExpenseSheet({ pid, id, close }: { pid?: string; id?: string; close: () => void }) {
  const p = propOf(pid);
  const e = id ? (p.expenses || []).find((x: any) => x.id === id) : null;
  const { v, set } = useVals({ cat: e ? e.cat : EXPENSE_CATS[0], amount: e ? String(e.amount) : '', date: e ? e.date : iso(t0()), note: e ? e.note || '' : '' });
  return (
    <Stack>
      <Title>{e ? t('Gideri düzenle') : t('Gider ekle')}</Title>
      <Choice label={t('Kategori')} options={EXPENSE_CATS} v={v} set={set} k="cat" render={t} />
      <Row align="flex-start"><View style={{ flex: 1 }}><NumField label={t('Tutar (₺)')} v={v} set={set} k="amount" /></View><View style={{ flex: 1 }}><DateField label={t('Tarih')} v={v} set={set} k="date" /></View></Row>
      <Text2 label={t('Açıklama')} v={v} set={set} k="note" maxLength={120} />
      <Actions onCancel={close} submitLabel={t('Kaydet')} onSubmit={() => { if (!v.date) return; submit('expense', { ...v, pid: p.id, id: e ? e.id : undefined }); }} />
      {e ? <Button kind="quiet" block title={t('Gideri sil')} onPress={() => act('removeExpense', { pid: p.id, id: e.id })} /> : null}
    </Stack>
  );
}

function StartMoveOutSheet({ pid, close }: { pid?: string; close: () => void }) {
  const p = propOf(pid);
  const { v, set } = useVals({ date: iso(t0()) });
  return (
    <Stack>
      <Title>{t('Çıkış sürecini başlat')}</Title>
      <Muted>{t('Giriş tutanağındaki')} {p.inspect.rooms.length} {t('alan karşılaştırma için kopyalanır. Kiracı ve mülk sahibi alanları birlikte değerlendirir, kesintiler iki tarafın onayından sonra kesinleşir.')}</Muted>
      <DateField label={t('Çıkış tarihi')} v={v} set={set} k="date" />
      <Actions onCancel={close} submitLabel={t('Başlat')} onSubmit={() => submit('startMoveOut', { ...v, pid: p.id })} />
    </Stack>
  );
}

function DeductionSheet({ pid, close }: { pid?: string; close: () => void }) {
  const p = propOf(pid);
  const { v, set } = useVals({ label: '', amount: '', note: '' });
  return (
    <Stack>
      <Title>{t('Kesinti ekle')}</Title>
      <Text2 label={t('Kalem')} v={v} set={set} k="label" maxLength={60} placeholder={t('Ör. Boya')} />
      <Row wrap gap={6}>{DEDUCTION_PRESETS.map((x: string) => <PressScale key={x} onPress={() => set('label', t(x))}><Chip label={t(x)} /></PressScale>)}</Row>
      <NumField label={t('Tutar (₺)')} v={v} set={set} k="amount" />
      <Text2 label={t('Gerekçe')} v={v} set={set} k="note" maxLength={140} placeholder={t('Hangi odada, girişe göre ne değişti?')} />
      <Muted>{t('Kesinti eklemek iki tarafın onayını sıfırlar. Olağan kullanımdan kaynaklı yıpranma için kesinti yapılamaz.')}</Muted>
      <Actions onCancel={close} submitLabel={t('Ekle')} onSubmit={() => submit('deduction', { ...v, pid: p.id })} />
    </Stack>
  );
}

function RefundSheet({ pid, close }: { pid?: string; close: () => void }) {
  const p = propOf(pid);
  const sm: any = moveOutSummary(p);
  const { v, set } = useVals({ amount: String(sm.refund), date: iso(t0()) });
  return (
    <Stack>
      <Title>{t('Depozito iadesi')}</Title>
      <KV k={t('Hesaplanan iade')} v={tl(sm.refund)} />
      <Row align="flex-start"><View style={{ flex: 1 }}><NumField label={t('İade edilen (₺)')} v={v} set={set} k="amount" /></View><View style={{ flex: 1 }}><DateField label={t('Tarih')} v={v} set={set} k="date" /></View></Row>
      <Actions onCancel={close} submitLabel={t('Kaydet')} onSubmit={() => submit('refund', { ...v, pid: p.id })} />
    </Stack>
  );
}

/* ---------------- abonelik ---------------- */

/** Paket listesi: mülk sınırı ve fiyat; mevcut ve önerilen paket işaretlenir. */
function TierPicker({ current, suggest, onPick }: { current?: string; suggest?: string; onPick: (id: string) => void }) {
  const c = useColors();
  return (
    <Stack gap={8}>
      {tiers().map((tr: any) => {
        const mine = current === tr.id, rec = suggest === tr.id;
        return (
          <PressScale key={tr.id} onPress={() => onPick(tr.id)} accessibilityRole="button" accessibilityLabel={planLabel(tr.id)} scaleTo={0.99}
            style={{ padding: 16, borderRadius: radius.lg, borderWidth: 1.5, borderColor: rec ? c.accent : c.line, backgroundColor: rec ? c.accentSoft : c.surface, gap: 4 }}>
            <Row between><Text v="h3">{planLabel(tr.id)}</Text>{mine ? <Chip tone="ok" label={t('Paketin')} /> : rec ? <Chip tone="accent" label={t('Önerilen')} /> : null}</Row>
            <Row between><Muted>{unitsText(tr.units)}</Muted><Text v="small" style={{ fontFamily: fonts.bodyXBold }}>{priceText(tr)}{tr.price != null ? ' ' + t('/ ay') : ''}</Text></Row>
          </PressScale>
        );
      })}
    </Stack>
  );
}

/** Kurumsal için iletişim formu açılır; diğer paketler satın almaya gider. */
function pickTier(id: string, units: number | null, open: (n: string, p?: any) => void) {
  if (id === 'kurumsal') open('kurumsal-basvuru');
  else act('buy', { tier: id });
}

/** Paketler: ana sayfadaki fiyat kartlarının aynısı; aylık / yıllık seçimi, mevcut paket işaretli. */
function SubscriptionSheet() {
  useStore();
  const { open } = useSheet();
  const c = useColors();
  const [yearly, setYearly] = useState(false);
  const a: any = access();
  const limit = unitLimit(a);
  const mine = a.subscribed ? a.plan : undefined;
  const list = sitePlans(yearly);
  const days = trialDaysLeft(a);
  const total = a.trialDays || 30;
  const status = a.subscribed
    ? { title: t('{plan} paketi', { plan: planLabel(a.plan || a.productId) }), body: unitsText(limit) + (a.expiresAt ? ' · ' + t('{date} tarihinde yenilenir', { date: fmtFull(new Date(a.expiresAt)) }) : ''), chip: <Chip tone="ok" label={t('Aktif')} />, pct: null as number | null }
    : a.inTrial
      ? { title: t('Ücretsiz deneme · {n} gün kaldı', { n: days }), body: t('Denemede {units} mülke kadar ekleyebilirsin. Deneme bitince kayıtların silinmez; abone olana kadar salt okunur olur.', { units: limit ?? CONFIG.billing.trialUnits ?? 5 }), chip: <Chip tone="warn" label={t('Deneme')} />, pct: Math.max(0, Math.min(100, (days / total) * 100)) }
      : { title: t('Deneme süren bitti'), body: t('Kayıtların duruyor; okuyabilir ve mesajlaşabilirsin. Değiştirmek için abone ol.'), chip: <Chip tone="bad" label={t('Salt okunur')} />, pct: 0 };
  const cta = (id: string) => mine === id
    ? { title: t('Mevcut paketin'), onPress: () => {}, disabled: true }
    : id === 'kurumsal' ? { title: t('Bize ulaşın'), onPress: () => pickTier(id, null, open) }
    : { title: t('Paketi seç'), onPress: () => pickTier(id, null, open) };
  return (
    <Stack gap={16}>
      <View style={{ gap: 4 }}>
        <Text v="label" color={c.accentText}>{t('Paketler')}</Text>
        <RNText style={{ fontFamily: fonts.siteBold, fontSize: 32, lineHeight: 35, letterSpacing: -1, color: c.ink }}>{t('Portföyüne göre seç')}</RNText>
      </View>
      <View style={{ backgroundColor: c.deepA, borderRadius: 22, padding: 18, gap: 8 }}>
        <Row between align="flex-start">
          <Text v="body" color={c.heroInk} style={{ flex: 1, fontFamily: fonts.bodyXBold }}>{status.title}</Text>
          {status.chip}
        </Row>
        {status.pct != null ? <View style={{ height: 6, borderRadius: 3, backgroundColor: 'rgba(250,245,240,0.14)', overflow: 'hidden' }}><View style={{ width: status.pct + '%' as any, height: 6, backgroundColor: c.lemon }} /></View> : null}
        <Text v="small" color={c.heroMuted}>{status.body}</Text>
      </View>
      {paused() ? (
        <Row gap={10} align="flex-start" style={{ paddingHorizontal: 4 }}>
          <Icon name="bell" size={16} color={c.muted} />
          <Muted style={{ flex: 1 }}>{t('Ödeme sistemimizi güncelliyoruz. Paket satın alma kısa süre içinde açılacak; fiyatlar kesinleşince burada görünür.')}</Muted>
        </Row>
      ) : null}
      <View accessibilityRole="tablist" style={{ alignSelf: 'center', flexDirection: 'row', backgroundColor: c.surface, borderRadius: radius.pill, padding: 4, borderWidth: 1, borderColor: c.line }}>
        {([[false, t('Aylık')], [true, t('Yıllık · 2 ay ücretsiz')]] as const).map(([k, label]) => {
          const on = yearly === k;
          return (
            <PressScale key={String(k)} onPress={() => setYearly(k)} accessibilityRole="tab" accessibilityState={{ selected: on }} scaleTo={0.97}
              style={{ paddingHorizontal: 18, minHeight: 40, borderRadius: radius.pill, justifyContent: 'center', backgroundColor: on ? c.ink : 'transparent' }}>
              <RNText style={{ fontFamily: fonts.bodyBold, fontSize: 14, color: on ? c.bg : c.ink }}>{label}</RNText>
            </PressScale>
          );
        })}
      </View>
      {list.map((p) => (
        <PlanCard key={p.id} p={p} compact cta={cta(p.id)}
          badge={mine === p.id ? <Chip tone="ok" label={t('Paketin')} /> : undefined} />
      ))}
      <Row gap={8} align="flex-start" style={{ paddingHorizontal: 4 }}>
        <Icon name="check" size={16} color={c.okInk} />
        <Muted style={{ flex: 1 }}>{t('Kiracıların ve ekip üyelerin her zaman ücretsiz. Her paket 1 ay ücretsiz denemeyle başlar.')}</Muted>
      </Row>
      <Row gap={16} style={{ justifyContent: 'center' }}>
        <PressScale onPress={() => Linking.openURL(CONFIG.legal.terms)} accessibilityRole="link"><Text v="small" color={c.muted} style={{ textDecorationLine: 'underline' }}>{t('Kullanım koşulları')}</Text></PressScale>
        <PressScale onPress={() => Linking.openURL(CONFIG.legal.privacy)} accessibilityRole="link"><Text v="small" color={c.muted} style={{ textDecorationLine: 'underline' }}>{t('Gizlilik politikası')}</Text></PressScale>
      </Row>
      {LIVE ? null : (
        <Card gap={8}><Label>{t('Demo: durumu dene')}</Label>
          <Row wrap gap={6}>{[['trial', t('Deneme'), ''], ['expired', t('Süresi bitti'), ''], ['subscribed', planLabel('tek'), 'tek'], ['subscribed', planLabel('bes'), 'bes'], ['subscribed', planLabel('kurumsal'), 'kurumsal']].map(([v, l, pl]) =>
            <Button key={v + pl} kind="ghost" title={l} onPress={() => act('demoBilling', { v: v === 'trial' ? null : v, plan: pl })} />)}</Row>
        </Card>
      )}
    </Stack>
  );
}

/** Kurumsal başvuru (uygulama içinden): sitedeki formun aynısı, ad ve e-posta hesaptan dolu gelir. */
function EnterpriseSheet({ close }: { close: () => void }) {
  const { user } = useAuth();
  return (
    <Stack>
      <Title>{t('Kurumsal paket')}</Title>
      <Muted>{t('Portföyünü kısaca anlat; sana uygun fiyatı ve kurulum planını iki iş günü içinde iletelim.')}</Muted>
      <EnterpriseForm onDone={close} email={user?.email || ''} name={user?.name || ''} />
    </Stack>
  );
}

/** Paket sınırına gelince: yükseltme önerisi. */
function UpgradeSheet({ need, suggest }: { need?: number; suggest?: string }) {
  const { open } = useSheet();
  const a: any = access();
  const limit = unitLimit(a);
  return (
    <Stack>
      <Title>{t('Paketini yükselt')}</Title>
      <Note warn>
        {a.inTrial ? t('Deneme süresinde en fazla {n} mülk ekleyebilirsin.', { n: limit }) : t('{plan} paketin en fazla {n} mülk içerir.', { plan: planLabel(a.plan), n: limit })}{' '}
        {suggest === 'kurumsal' ? t('Daha fazla mülk için Kurumsal paketi öneriyoruz.') : t('Daha fazla mülk için paketini yükselt.')}
      </Note>
      <TierPicker current={a.subscribed ? a.plan : undefined} suggest={suggest} onPick={(id) => pickTier(id, need ?? null, open)} />
      {suggest === 'kurumsal'
        ? <Button block title={t('Kurumsal için bize ulaş')} onPress={() => open('kurumsal-basvuru')} />
        : <Button block title={t('Paketi yükselt')} onPress={() => act('buy', { tier: suggest })} />}
    </Stack>
  );
}

/** "Bize ulaş": kurumsal paket, toplu içe aktarma desteği ya da genel soru. */
function SupportSheet({ kind = 'genel', units, close }: { kind?: string; units?: number; close: () => void }) {
  const { v, set } = useVals({ kind, units: units ? String(units) : '', phone: '', message: '' });
  const title = kind === 'kurumsal' ? t('Kurumsal paket talebi') : kind === 'import' ? t('Toplu içe aktarma desteği') : t('Bize yaz');
  return (
    <Stack>
      <Title>{title}</Title>
      <Muted>{kind === 'import'
        ? t('Tek seferde {n} mülkten fazlasını aktarmak için ekibimiz sana yardım eder.', { n: CONFIG.billing.importMax })
        : t('Portföyünü anlat; sana uygun paketi ve fiyatı iletelim.')}</Muted>
      <NumField label={t('Mülk sayısı')} v={v} set={set} k="units" />
      <Text2 label={t('Telefon (isteğe bağlı)')} v={v} set={set} k="phone" keyboardType="phone-pad" maxLength={20} />
      <Area label={t('Mesaj')} v={v} set={set} k="message" />
      <Actions onCancel={close} submitLabel={t('Talebi gönder')} onSubmit={() => submit('support', v)} />
    </Stack>
  );
}

/** Mülk ekleme: paket sınırı doluysa yükseltme sayfası açılır. */
function AddPropGate({ close }: { close: () => void }) {
  const room = roomFor(1);
  return room.ok ? <AddPropSheet close={close} /> : <UpgradeSheet need={room.have + 1} suggest={room.suggest} />;
}

/* ---------------- yönlendirici ---------------- */

export function renderSheet(name: string, p: any, close: () => void): ReactNode {
  switch (name) {
    case 'arama': return <SearchSheet close={close} />;
    case 'bildirim': return <InboxSheet close={close} />;
    case 'ayarlar': return <SettingsBody close={close} />;
    case 'harita': return <MapSheet close={close} />;
    case 'metin': return <TextSheet />;
    case 'yeni-talep': return <NewReqSheet pid={p.pid} close={close} />;
    case 'talep': return <ReqSheet pid={p.pid} id={p.id} close={close} />;
    case 'teklif': return <QuoteSheet pid={p.pid} id={p.id} close={close} />;
    case 'fatura': return <InvoiceSheet pid={p.pid} id={p.id} close={close} />;
    case 'dekont': return <ReceiptSheet pid={p.pid} k={p.key} kind={p.kind} close={close} />;
    case 'odeme': return <PayFormSheet pid={p.pid} k={p.key} kind={p.kind} close={close} />;
    case 'red': return <RejectSheet pid={p.pid} k={p.key} kind={p.kind} close={close} />;
    case 'yenileme': return <RenewalSheet pid={p.pid} close={close} />;
    case 'ev-ekle': return <AddPropGate close={close} />;
    case 'ev-duzenle': return <EditPropSheet pid={p.pid} close={close} />;
    case 'kiraci-ekle': return <AddTenantSheet pid={p.pid} close={close} />;
    case 'foto': return <PhotoSheet src={p.src} />;
    case 'davet-paylas': return <InviteSheet pid={p.pid} code={p.code} />;
    case 'belge': return <UploadSheet pid={p.pid} cat={p.cat} close={close} />;
    case 'gider': return <ExpenseSheet pid={p.pid} id={p.id} close={close} />;
    case 'cikis-baslat': return <StartMoveOutSheet pid={p.pid} close={close} />;
    case 'kesinti': return <DeductionSheet pid={p.pid} close={close} />;
    case 'iade': return <RefundSheet pid={p.pid} close={close} />;
    case 'abonelik': return <SubscriptionSheet />;
    case 'rapor-eposta': return <MailPreviewSheet />;
    case 'kurumsal-basvuru': return <EnterpriseSheet close={close} />;
    case 'paket': return <UpgradeSheet need={p.need} suggest={p.suggest} />;
    case 'destek-talebi': return <SupportSheet kind={p.kind} units={p.units} close={close} />;
    case 'ekip-davet': return <TeamInviteSheet close={close} />;
    case 'ekip-paylas': return <TeamShareSheet code={p.code} role={p.role} phone={p.phone} />;
    case 'ekip-uye': return <TeamMemberSheet member={p.member} close={close} />;
    default: return null;
  }
}
