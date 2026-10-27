import { useEffect, useState } from 'react';
import { Linking, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { S, ui, emit } from '../domain/state';
import { P } from '../domain/logic';
import { t } from '../domain/i18n';
import { LIVE } from '../domain/config';
import { activityFeed, createTeamInvite, deleteInvite, humanError, inviteLink, teamInvites, teamList, teamRemove, teamSet } from '../domain/backend';
import { TEAM_ROLES, roleBlurb, roleLabel } from '../domain/team';
import { describe } from '../domain/activity';
import { waLink } from '../domain/wa';
import { host } from '../domain/host';
import { ago } from '../domain/util';
import { Button, Chip, Text } from '../ui/kit';
import { radius, useColors } from '../ui/theme';
import { Card, Empty, H2, Icon, IconBtn, Items, LI, Muted, Note, Stack } from './blocks';
import { Actions, Choice, Text2, Title, Toggle, useVals } from './forms';
import { useStore } from './hooks';
import { useSheet } from './overlays';
import { Page } from './screens';

/** Ekip listesi değişince ekran yeniden yüklenir. */
function bump(){ ui.teamTick = (ui.teamTick || 0) + 1; emit(); }
const propName = (pid: string) => P(pid)?.name || '';
const scopeText = (m: any) => m.scope === 'portfolio' ? t('Tüm portföy') : t('{n} mülk', { n: (m.property_ids || []).length });

/** Mülk sahibinin ekip ekranı: üyeler, bekleyen davetler, roller ve işlem geçmişi. */
export function TeamScreen() {
  useStore();
  const { open } = useSheet();
  const [members, setMembers] = useState<any[]>([]);
  const [invites, setInvites] = useState<any[]>([]);
  const [feed, setFeed] = useState<any[]>([]);
  const [limit, setLimit] = useState(60);
  const [err, setErr] = useState<string | null>(null);
  const tick = ui.teamTick || 0;
  useEffect(() => {
    if (!LIVE) return;
    let gone = false;
    Promise.all([teamList(), teamInvites(), activityFeed(limit)])
      .then(([m, i, f]) => { if (!gone) { setMembers(m); setInvites(i); setFeed(f); setErr(null); } })
      .catch((e) => !gone && setErr(humanError(e)));
    return () => { gone = true; };
  }, [tick, limit]);

  if (!LIVE) return (
    <Page title={t('Ekip')} sub={t('Emlakçı, muhasebeci ve personel')} back="/mulk-sahibi">
      <Note>{t('Ekip üyeleri gerçek hesaplarda davet edilir. Sunucu kurulunca bu ekrandan emlakçı, muhasebeci ya da personel davet edebilirsin.')}</Note>
      {TEAM_ROLES.map((r) => <Card key={r} gap={4}><Text v="h3">{roleLabel(r)}</Text><Muted>{roleBlurb(r)}</Muted></Card>)}
    </Page>
  );

  return (
    <Page title={t('Ekip')} sub={t('{n} kişi', { n: members.length })} back="/mulk-sahibi">
      {err ? <Note warn>{err}</Note> : null}
      <Button block title={t('Ekip üyesi davet et')} icon={<Icon name="plus" size={16} color="#fff" />} onPress={() => open('ekip-davet')} />
      <Stack gap={8}>
        <H2>{t('Ekip üyeleri')}</H2>
        {members.length
          ? <Items data={members} render={(m: any, last) => (
            <LI key={m.user_id} last={last} onPress={() => open('ekip-uye', { member: m })} title={m.name || m.email}
              sub={(m.email ? m.email + ' · ' : '') + scopeText(m)} right={<Chip tone="accent" label={roleLabel(m.role)} />} />
          )} />
          : <Empty>{t('Henüz ekip üyesi yok.')}{'\n'}{t('Emlakçını, muhasebecini ya da personelini davet et; her biri yalnızca rolünün izin verdiğini görür.')}</Empty>}
      </Stack>
      {invites.length ? (
        <Stack gap={8}>
          <H2>{t('Bekleyen davetler')}</H2>
          <Items data={invites} render={(i: any, last) => (
            <LI key={i.code} last={last} onPress={() => open('ekip-paylas', { code: i.code, role: i.role, phone: i.phone })} title={i.code}
              sub={roleLabel(i.role) + ' · ' + (i.scope === 'portfolio' ? t('Tüm portföy') : propName(i.property_id)) + (i.name ? ' · ' + i.name : '')}
              right={<IconBtn name="x" size={16} label={t('{code} davetini sil', { code: i.code })} onPress={async () => { await deleteInvite(i.property_id, i.code).catch(() => {}); bump(); }} />} />
          )} />
        </Stack>
      ) : null}
      <Stack gap={8}>
        <H2>{t('Roller')}</H2>
        {TEAM_ROLES.map((r) => <Card key={r} gap={2}><Text v="small" style={{ fontWeight: '700' }}>{roleLabel(r)}</Text><Muted>{roleBlurb(r)}</Muted></Card>)}
      </Stack>
      <Stack gap={8}>
        <H2>{t('İşlem geçmişi')}</H2>
        {feed.length
          ? <Items data={feed} render={(e: any, last) => (
            <LI key={e.id} last={last} title={describe(e)}
              sub={[e.actor_name || t('Silinmiş hesap'), e.actor_role ? roleLabel(e.actor_role) : '',
                e.entity === 'team' ? members.find((m) => m.user_id === e.ref)?.name || '' : propName(e.property_id),
                ago(new Date(e.at).getTime())].filter(Boolean).join(' · ')} />
          )} />
          : <Empty>{t('Henüz kayıt yok.')}</Empty>}
        {feed.length >= limit ? <Button kind="ghost" block title={t('Daha eski kayıtları göster')} onPress={() => setLimit(limit + 200)} /> : null}
      </Stack>
    </Page>
  );
}

export function TeamInviteSheet({ close }: { close: () => void }) {
  const { open } = useSheet();
  const { v, set } = useVals({ name: '', phone: '', role: 'agent', scope: 'portfolio', pid: S.order[0] || '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (!S.order.length) return (
    <Stack><Title>{t('Ekip üyesi davet et')}</Title><Note>{t('Önce bir mülk ekle; ekip üyeleri mülklerine atanır.')}</Note></Stack>
  );
  return (
    <Stack>
      <Title>{t('Ekip üyesi davet et')}</Title>
      <Choice label={t('Rol')} options={TEAM_ROLES} v={v} set={set} k="role" render={roleLabel} />
      <Muted>{roleBlurb(v.role)}</Muted>
      <Choice label={t('Kapsam')} options={['portfolio', 'property']} v={v} set={set} k="scope" render={(x: string) => x === 'portfolio' ? t('Tüm portföy') : t('Tek mülk')} />
      {v.scope === 'portfolio'
        ? <Muted>{t('Bütün mülklerine ve sonradan ekleyeceğin mülklere erişir.')}</Muted>
        : <Choice label={t('Mülk')} options={S.order} v={v} set={set} k="pid" render={propName} />}
      <Text2 label={t('Ad (isteğe bağlı)')} v={v} set={set} k="name" maxLength={60} />
      <Text2 label={t('Telefon (WhatsApp için, isteğe bağlı)')} v={v} set={set} k="phone" keyboardType="phone-pad" maxLength={20} />
      {err ? <Note warn>{err}</Note> : null}
      <Actions onCancel={close} submitLabel={t('Davet oluştur')} busy={busy} onSubmit={async () => {
        setBusy(true); setErr(null);
        try {
          const code = await createTeamInvite(v.scope === 'portfolio' ? S.order[0] : v.pid, { role: v.role, scope: v.scope, name: v.name.trim(), phone: v.phone.trim() });
          bump();
          open('ekip-paylas', { code, role: v.role, phone: v.phone.trim() });
        } catch (e) { setErr(humanError(e)); }
        setBusy(false);
      }} />
    </Stack>
  );
}

export function TeamShareSheet({ code, role, phone }: { code?: string; role?: string; phone?: string }) {
  const c = useColors();
  if (!code) return null;
  const link = inviteLink(code);
  const text = t('Merhaba, anahtar’da ekibime {role} olarak katılır mısın? Davet kodun: {code} — {link}', { role: roleLabel(role || 'agent').toLocaleLowerCase('tr'), code, link });
  return (
    <Stack>
      <Title>{t('Daveti gönder')}</Title>
      <Muted>{t('Bağlantıyla ücretsiz ekip hesabı açınca ekibine katılır. Kod 30 gün geçerlidir ve bir kez kullanılır.')}</Muted>
      <View style={{ backgroundColor: c.surface, borderRadius: radius.md, borderWidth: 1, borderColor: c.line, padding: 16, alignItems: 'center' }}>
        <Text v="h2" selectable style={{ letterSpacing: 4 }}>{code}</Text>
      </View>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Button title={t('WhatsApp')} style={{ flex: 1 }} onPress={() => Linking.openURL(waLink(phone || '', text)).catch(() => {})} />
        <Button kind="ghost" title={t('Kopyala')} style={{ flex: 1 }} onPress={async () => {
          try { await Clipboard.setStringAsync(link); host.notify({ title: t('Kopyalandı'), body: t('Davet bağlantısı panoya alındı.'), icon: 'doc' }); } catch {}
        }} />
      </View>
      <Button kind="ghost" block title={t('E-posta ile gönder')} onPress={() => Linking.openURL('mailto:?subject=' + encodeURIComponent(t('anahtar ekip daveti')) + '&body=' + encodeURIComponent(text))} />
    </Stack>
  );
}

export function TeamMemberSheet({ member, close }: { member?: any; close: () => void }) {
  const { v, set } = useVals({ role: member?.role || 'agent', scope: member?.scope || 'property' });
  const [pids, setPids] = useState<string[]>(member?.property_ids || []);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (!member) return null;
  return (
    <Stack>
      <Title>{member.name || member.email}</Title>
      {member.email ? <Muted>{member.email}</Muted> : null}
      <Choice label={t('Rol')} options={TEAM_ROLES} v={v} set={set} k="role" render={roleLabel} />
      <Muted>{roleBlurb(v.role)}</Muted>
      <Choice label={t('Kapsam')} options={['portfolio', 'property']} v={v} set={set} k="scope" render={(x: string) => x === 'portfolio' ? t('Tüm portföy') : t('Seçili mülkler')} />
      {v.scope === 'property'
        ? <Card gap={2}>{S.order.map((pid: string) => <Toggle key={pid} label={propName(pid)} on={pids.includes(pid)} onChange={(b) => setPids(b ? [...pids, pid] : pids.filter((x) => x !== pid))} />)}</Card>
        : null}
      {err ? <Note warn>{err}</Note> : null}
      <Actions onCancel={close} submitLabel={t('Kaydet')} busy={busy} onSubmit={async () => {
        if (v.scope === 'property' && !pids.length) { setErr(t('En az bir mülk seç ya da kişiyi ekipten çıkar.')); return; }
        setBusy(true); setErr(null);
        try { await teamSet(member.user_id, v.role, v.scope, v.scope === 'property' ? pids : []); bump(); close(); }
        catch (e) { setErr(humanError(e)); setBusy(false); }
      }} />
      <Button kind="quiet" block title={t('Ekipten çıkar')} onPress={async () => {
        if (!await host.ask({ title: t('{name} ekipten çıkarılsın mı?', { name: member.name || member.email }), body: t('Bütün mülklerine erişimi hemen biter. İşlem geçmişi korunur.'), ok: t('Ekipten çıkar'), danger: true })) return;
        try { await teamRemove(member.user_id); bump(); close(); } catch (e) { setErr(humanError(e)); }
      }} />
    </Stack>
  );
}
