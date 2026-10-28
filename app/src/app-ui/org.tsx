/* Kurum yönetimi: yöneticiler, davetler, roller ve yetkiler. Uygulamada kurumun master yöneticisi ve
   "Yönetici ekleme" yetkisi olanlar, yönetici panelinde anahtar ekibi aynı bileşeni kullanır.
   Sunucu her işlemi ayrıca denetler (supabase/schema.sql 16. bölüm). */
import { useCallback, useEffect, useState } from 'react';
import { Share, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { t } from '../domain/i18n';
import { humanError, inviteLink, live } from '../domain/backend';
import { PERMS, createOrgInvite, deleteOrgInvite, deleteRole, myOrgs, orgCan, orgDetail, refreshOrgs, removeOrgMember, saveRole,
  sectorOf, setMemberRole, transferMaster } from '../domain/org';
import { Button, Chip, Field, PressScale, Text } from '../ui/kit';
import { Loader } from '../ui/Loader';
import { fonts, radius, useColors } from '../ui/theme';
import { Card, Empty, H2, Icon, Muted, Note, Row, Stack } from './blocks';
import { useStore } from './hooks';
import { Page } from './screens';

/** Açılıp kapanan seçim kapsülü (çoklu seçim). */
export function Pill({ label, on, onPress, disabled }: { label: string; on: boolean; onPress?: () => void; disabled?: boolean }) {
  const c = useColors();
  return (
    <PressScale onPress={disabled ? undefined : onPress} disabled={disabled} accessibilityRole="checkbox" aria-checked={on} accessibilityState={{ checked: on, disabled }} scaleTo={0.96}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, minHeight: 36, borderRadius: radius.pill,
        backgroundColor: on ? c.accentSoft : c.surface, borderWidth: 1, borderColor: on ? c.accent : c.line, opacity: disabled && !on ? 0.55 : 1 }}>
      {on ? <Icon name="check" size={14} color={c.accentText} /> : null}
      <Text v="small" color={on ? c.accentText : c.ink} style={{ fontFamily: fonts.bodyBold, fontSize: 13.5 }}>{label}</Text>
    </PressScale>
  );
}

const permLabel = (k: string) => (PERMS().find((p) => p.key === k) || { label: k }).label;

/** Rol kartı: ad ve yetkiler. Master (ya da anahtar ekibi) düzenler; diğerleri yalnızca görür. */
function RoleCard({ oid, role, edit, done, onEdit }: { oid: string; role: any; edit: boolean; done: () => void; onEdit?: () => void }) {
  const c = useColors();
  const [name, setName] = useState(role?.name || '');
  const [perms, setPerms] = useState<string[]>(role?.perms || []);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const dirty = !role || name !== role.name || perms.slice().sort().join() !== (role.perms || []).slice().sort().join();
  const flip = (k: string) => setPerms((x) => (x.includes(k) ? x.filter((y) => y !== k) : [...x, k]));
  const save = async () => {
    setBusy(true); setErr(null);
    try { await saveRole(oid, role?.id || null, name, perms); done(); } catch (e) { setErr(humanError(e)); }
    setBusy(false);
  };
  const remove = async () => {
    setBusy(true); setErr(null);
    try { await deleteRole(role.id); done(); } catch (e) { setErr(humanError(e)); }
    setBusy(false);
  };
  if (!edit) {
    return (
      <Card gap={8}>
        <Row between wrap>
          <H2>{role.name}</H2>
          <Row gap={12}>
            <Muted>{t('{n} yönetici', { n: role.count || 0 })}</Muted>
            {onEdit ? (
              <PressScale onPress={onEdit} accessibilityRole="button" accessibilityLabel={t('{name} rolünü düzenle', { name: role.name })}
                style={{ paddingHorizontal: 14, minHeight: 34, borderRadius: radius.pill, borderWidth: 1, borderColor: c.line, justifyContent: 'center' }}>
                <Text v="small" style={{ fontFamily: fonts.bodyBold }}>{t('Düzenle')}</Text>
              </PressScale>
            ) : null}
          </Row>
        </Row>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {role.perms.length ? role.perms.map((p: string) => <Chip key={p} label={permLabel(p)} />) : <Muted>{t('Yetkisi yok (yalnızca görür).')}</Muted>}
        </View>
      </Card>
    );
  }
  return (
    <Card gap={10}>
      <Row between wrap>
        <View style={{ flexGrow: 1, flexBasis: 220 }}><Field label={t('Rol adı')} value={name} onChangeText={setName} maxLength={60} /></View>
        {role ? <Muted>{t('{n} yönetici', { n: role.count || 0 })}</Muted> : null}
      </Row>
      <Text v="small" style={{ fontFamily: fonts.bodyBold }}>{t('Yetkiler')}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {PERMS().map((p) => <Pill key={p.key} label={p.label} on={perms.includes(p.key)} onPress={() => flip(p.key)} />)}
      </View>
      {err ? <Text v="small" color={c.badInk}>{err}</Text> : null}
      <Row wrap>
        <Button title={role ? t('Kaydet') : t('Rolü ekle')} onPress={save} disabled={!dirty || !name.trim()} loading={busy} />
        {role ? <Button kind="quiet" title={t('Rolü sil')} onPress={remove} disabled={busy} /> : <Button kind="quiet" title={t('Vazgeç')} onPress={done} />}
      </Row>
    </Card>
  );
}

/** Kurumun yöneticileri, davetleri ve rolleri. power.master: rolleri düzenler, master'ı devreder; power.members: yönetici ekler/çıkarır. */
export function OrgManage({ oid, power, selfId, onLeave }: { oid: string; power: { master: boolean; members: boolean; admin?: boolean }; selfId?: string; onLeave?: () => void }) {
  const c = useColors();
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [inviteRole, setInviteRole] = useState<string>('');
  const [code, setCode] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const load = useCallback(async () => {
    try { setD(await orgDetail(oid)); setErr(null); } catch (e) { setErr(humanError(e)); }
  }, [oid]);
  useEffect(() => { load(); }, [load]);
  const act = async (fn: () => Promise<any>) => {
    setErr(null);
    try { await fn(); await load(); if (!power.admin) await refreshOrgs(); } catch (e) { setErr(humanError(e)); }
  };
  if (!d) return err ? <Note warn>{err}</Note> : <View style={{ alignItems: 'center', paddingVertical: 20 }}><Loader size={64} /></View>;
  const roleName = (id: string | null) => (d.roles.find((r: any) => r.id === id) || { name: t('Rolsüz') }).name;
  const share = async (cd: string) => {
    const msg = t('anahtar’da {org} yöneticisi olarak davet edildin. Bağlantıdan katıl: {url} (davet kodu: {code})', { org: d.org.name, url: inviteLink(cd), code: cd });
    try { await Share.share({ message: msg }); } catch { try { await Clipboard.setStringAsync(cd); } catch {} }
  };
  return (
    <Stack>
      {err ? <Note warn>{err}</Note> : null}

      <Stack gap={8}>
        <H2>{t('Yöneticiler')}</H2>
        {d.members.length ? d.members.map((m: any) => (
          <Card key={m.user_id} gap={8}>
            <Row between wrap>
              <View style={{ flex: 1, minWidth: 180 }}>
                <Text v="body" style={{ fontFamily: fonts.bodyXBold }}>{m.name || m.email}{m.user_id === selfId ? ' · ' + t('sen') : ''}</Text>
                {m.email ? <Muted>{m.email}</Muted> : null}
              </View>
              <Chip tone={m.master ? 'accent' : m.role_id ? 'neutral' : 'warn'} label={m.master ? t('Master yönetici') : roleName(m.role_id)} />
            </Row>
            {!m.master && power.members ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }} accessibilityLabel={t('{name} için rol', { name: m.name })}>
                {d.roles.map((r: any) => (
                  <Pill key={r.id} label={r.name} on={m.role_id === r.id} onPress={() => act(() => setMemberRole(oid, m.user_id, m.role_id === r.id ? null : r.id))} />
                ))}
              </View>
            ) : null}
            <Row wrap>
              {!m.master && power.master ? <Button kind="ghost" title={t('Master yap')} onPress={() => act(() => transferMaster(oid, m.user_id))} /> : null}
              {!m.master && power.members && m.user_id !== selfId ? <Button kind="quiet" title={t('Kurumdan çıkar')} onPress={() => act(() => removeOrgMember(oid, m.user_id))} /> : null}
              {!m.master && m.user_id === selfId && !power.admin ? (
                <Button kind="quiet" title={t('Kurumdan ayrıl')} onPress={() => act(async () => { await removeOrgMember(oid, m.user_id); onLeave && onLeave(); })} />
              ) : null}
            </Row>
          </Card>
        )) : <Empty>{t('Henüz yönetici yok.')}</Empty>}
      </Stack>

      {power.members ? (
        <Card gap={10}>
          <H2>{t('Yönetici davet et')}</H2>
          <Muted>{t('Rolü seç, kodu oluştur ve kişiye gönder. Kişi anahtar hesabına giriş yapıp kodu girince kuruma katılır.')}</Muted>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {d.roles.map((r: any) => <Pill key={r.id} label={r.name} on={inviteRole === r.id} onPress={() => setInviteRole(inviteRole === r.id ? '' : r.id)} />)}
          </View>
          <Row wrap>
            <Button title={t('Davet kodu oluştur')} onPress={() => act(async () => setCode(await createOrgInvite(oid, inviteRole || null)))} />
          </Row>
          {code ? (
            <Row between wrap style={{ backgroundColor: c.surface2, borderRadius: radius.md, padding: 14 }}>
              <View style={{ gap: 2 }}>
                <Muted>{t('Davet kodu')}</Muted>
                <Text v="h3" selectable style={{ letterSpacing: 2, fontFamily: fonts.bodyXBold }}>{code}</Text>
              </View>
              <Button kind="ghost" title={t('Gönder')} onPress={() => share(code)} />
            </Row>
          ) : null}
          {d.invites.length ? (
            <Stack gap={6}>
              <Text v="small" style={{ fontFamily: fonts.bodyBold }}>{t('Bekleyen davetler')}</Text>
              {d.invites.map((i: any) => (
                <Row key={i.code} between wrap>
                  <Text v="small" selectable style={{ fontFamily: fonts.bodyXBold, letterSpacing: 1 }}>{i.code}</Text>
                  <Muted>{i.master ? t('Master yönetici') : roleName(i.role_id)}{i.email ? ' · ' + i.email : ''}</Muted>
                  <Button kind="quiet" title={t('Sil')} onPress={() => act(() => deleteOrgInvite(i.code))} />
                </Row>
              ))}
            </Stack>
          ) : null}
        </Card>
      ) : null}

      <Stack gap={8}>
        <Row between wrap>
          <H2>{t('Roller ve yetkiler')}</H2>
          {power.master && !adding ? <Button kind="ghost" title={t('Yeni rol')} onPress={() => setAdding(true)} /> : null}
        </Row>
        <Muted>{power.master
          ? t('Her yöneticinin yetkisi rolünden gelir. Rolü değiştirdiğinde o roldeki herkesin yetkisi değişir.')
          : t('Rolleri ve yetkileri master yönetici düzenler.')}</Muted>
        {adding ? <RoleCard oid={oid} role={null} edit done={() => { setAdding(false); load(); }} /> : null}
        {d.roles.map((r: any) => (
          power.master && editing === r.id
            ? <RoleCard key={r.id} oid={oid} role={r} edit done={() => { setEditing(null); load(); }} />
            : <RoleCard key={r.id} oid={oid} role={r} edit={false} done={load} onEdit={power.master ? () => setEditing(r.id) : undefined} />
        ))}
      </Stack>
    </Stack>
  );
}

/** Uygulamada "Kurum" ekranı: kişinin yöneticisi olduğu kurum(lar). */
export function OrgScreen() {
  useStore();
  const orgs = myOrgs();
  const [pick, setPick] = useState<string | null>(null);
  const org = orgs.find((o: any) => o.id === pick) || orgs[0];
  if (!org) {
    return (
      <Page title={t('Kurum')}>
        <Note>{t('Bir kurumun yöneticisi değilsin. Kurumundan aldığın davet kodunu girerek katılabilirsin.')}</Note>
      </Page>
    );
  }
  const sec = sectorOf(org.sector);
  const power = { master: !!org.master, members: orgCan(org, 'org.members') };
  return (
    <Page title={org.name} sub={sec.label}>
      {orgs.length > 1 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {orgs.map((o: any) => <Pill key={o.id} label={o.name} on={o.id === org.id} onPress={() => setPick(o.id)} />)}
        </View>
      ) : null}
      {org.status !== 'active' ? <Note warn>{t('Kurum askıda. Yeniden etkinleşene kadar değişiklik yapılamaz; anahtar ile iletişime geç.')}</Note> : null}
      <Card gap={6}>
        <Row between wrap>
          <Muted>{t('Rolün')}</Muted>
          <Chip tone="accent" label={org.master ? t('Master yönetici') : org.role ? org.role.name : t('Rolsüz')} />
        </Row>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {(org.perms || []).length ? org.perms.map((p: string) => <Chip key={p} label={permLabel(p)} />) : <Muted>{t('Henüz bir yetkin yok; master yönetici rol verince açılır.')}</Muted>}
        </View>
      </Card>
      <OrgManage key={org.id} oid={org.id} power={power} selfId={live.user?.id} onLeave={() => setPick(null)} />
    </Page>
  );
}
