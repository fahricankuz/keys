/* Yönetici paneli → Kurumlar: kurumsal müşteriyi açma, sektör ve modüller, sözleşme ve fatura bilgisi,
   master yönetici atama, askıya alma; kurumun yöneticileri ve rolleri (OrgManage). */
import { useEffect, useState } from 'react';
import { Share, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { t, locale } from '../domain/i18n';
import { humanError } from '../domain/admin';
import { inviteLink } from '../domain/backend';
import { MODULES, SECTORS, adminOrgs, adminSaveOrg, adminSetMaster, sectorModules, sectorOf } from '../domain/org';
import { Button, Chip, Field, Text } from '../ui/kit';
import { Loader } from '../ui/Loader';
import { fonts, radius, useColors } from '../ui/theme';
import { Card, Empty, H2, Muted, Row, Seg, Stack } from './blocks';
import { OrgManage, Pill } from './org';

export type OrgDraft = { name?: string; sector?: string; units?: number | null; lead_id?: string; email?: string; note?: string };

const day = (v: any) => (v ? new Date(v).toLocaleDateString(locale(), { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
/** Başvuru formundaki "Seni en iyi ne tanımlar?" cevabından sektör tahmini. */
export const sectorFromRole = (role?: string) => ({ 'Site / bina yönetimi': 'site', AVM: 'avm', GYO: 'gyo', 'Emlak ofisi': 'emlak', Şirket: 'depo', 'Mülk sahibi / yatırımcı': 'family' } as Record<string, string>)[role || ''] || 'diger';

function OrgForm({ org, draft, done }: { org?: any; draft?: OrgDraft | null; done: (id?: string) => void }) {
  const c = useColors();
  const init = org || {};
  const [name, setName] = useState<string>(init.name || draft?.name || '');
  const [sector, setSector] = useState<string>(init.sector || draft?.sector || 'site');
  const [mods, setMods] = useState<string[]>(init.modules || sectorModules(init.sector || draft?.sector || 'site'));
  const [units, setUnits] = useState<string>(init.units != null ? String(init.units) : draft?.units ? String(draft.units) : '');
  const [until, setUntil] = useState<string>(init.contract_until || '');
  const [title, setTitle] = useState<string>(init.billing?.title || '');
  const [tax, setTax] = useState<string>(init.billing?.tax_no || '');
  const [mail, setMail] = useState<string>(init.billing?.email || draft?.email || '');
  const [note, setNote] = useState<string>(init.note || draft?.note || '');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pickSector = (s: string) => { setSector(s); if (!org) setMods(sectorModules(s)); };
  const save = async () => {
    setErr(null);
    if (until && !/^\d{4}-\d{2}-\d{2}$/.test(until)) { setErr(t('Sözleşme bitişini YYYY-AA-GG biçiminde yaz.')); return; }
    setBusy(true);
    try {
      const id = await adminSaveOrg({ id: org?.id, name, sector, modules: mods, units: units.replace(/\D/g, '') || null, contract_until: until || null,
        billing: { title, tax_no: tax, email: mail }, note, lead_id: org ? undefined : draft?.lead_id });
      done(id);
    } catch (e) { setErr(humanError(e)); }
    setBusy(false);
  };
  return (
    <Card gap={12}>
      <H2>{org ? t('Kurumu düzenle') : t('Yeni kurum')}</H2>
      <Field label={t('Kurum adı')} value={name} onChangeText={setName} maxLength={160} />
      <Text v="small" style={{ fontFamily: fonts.bodyBold }}>{t('Sektör')}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }} accessibilityRole="radiogroup">
        {SECTORS().map((s) => <Pill key={s.key} label={s.label} on={sector === s.key} onPress={() => pickSector(s.key)} />)}
      </View>
      <Text v="small" style={{ fontFamily: fonts.bodyBold }}>{t('Modüller')}</Text>
      <Muted>{t('Sektörün varsayılanları seçili gelir. “Yol planında” olanlar geliştirildikçe bu kurumda kendiliğinden açılır.')}</Muted>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {MODULES().map((m) => (
          <Pill key={m.key} label={m.label + (m.ready ? '' : ' · ' + t('Yol planında'))} on={mods.includes(m.key)}
            onPress={() => setMods((x) => (x.includes(m.key) ? x.filter((y) => y !== m.key) : [...x, m.key]))} />
        ))}
      </View>
      <Row gap={10} wrap align="flex-end">
        <View style={{ flexGrow: 1, flexBasis: 160 }}><Field label={t('Birim sayısı (sözleşme)')} value={units} onChangeText={(x) => setUnits(x.replace(/\D/g, ''))} keyboardType="number-pad" placeholder={t('ör. 240')} /></View>
        <View style={{ flexGrow: 1, flexBasis: 160 }}><Field label={t('Sözleşme bitişi (YYYY-AA-GG)')} value={until} onChangeText={setUntil} maxLength={10} placeholder="2027-12-31" /></View>
      </Row>
      <Row gap={10} wrap align="flex-end">
        <View style={{ flexGrow: 1, flexBasis: 200 }}><Field label={t('Fatura unvanı')} value={title} onChangeText={setTitle} maxLength={160} /></View>
        <View style={{ flexGrow: 1, flexBasis: 140 }}><Field label={t('Vergi no')} value={tax} onChangeText={setTax} maxLength={20} /></View>
        <View style={{ flexGrow: 1, flexBasis: 200 }}><Field label={t('Fatura e-postası')} value={mail} onChangeText={setMail} keyboardType="email-address" autoCapitalize="none" maxLength={200} /></View>
      </Row>
      <Field label={t('Not (yalnızca anahtar ekibi görür)')} value={note} onChangeText={setNote} multiline maxLength={4000} />
      {err ? <Text v="small" color={c.badInk}>{err}</Text> : null}
      <Row wrap>
        <Button title={org ? t('Kaydet') : t('Kurumu aç')} onPress={save} loading={busy} disabled={name.trim().length < 2} />
        <Button kind="quiet" title={t('Vazgeç')} onPress={() => done()} />
      </Row>
    </Card>
  );
}

function MasterForm({ org, done }: { org: any; done: () => void }) {
  const c = useColors();
  const [mail, setMail] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true); setMsg(null); setCode(null);
    try {
      const r = await adminSetMaster(org.id, mail);
      if (r.status === 'set') { setMsg(t('Master yönetici atandı.')); done(); } else setCode(r.code);
    } catch (e) { setMsg(humanError(e)); }
    setBusy(false);
  };
  return (
    <Stack gap={8}>
      <Muted>{t('Kayıtlı bir hesabın e-postasını yazarsan doğrudan atanır. Hesabı yoksa davet kodu oluşur; kişi kayıt olup kodu girince master olur.')}</Muted>
      <Row gap={10} wrap align="flex-end">
        <View style={{ flexGrow: 1, flexBasis: 240 }}><Field label={t('Master yöneticinin e-postası')} value={mail} onChangeText={setMail} keyboardType="email-address" autoCapitalize="none" /></View>
        <Button title={t('Ata')} onPress={submit} loading={busy} disabled={!mail.trim()} style={{ minHeight: 52 }} />
      </Row>
      {msg ? <Text v="small" color={msg === t('Master yönetici atandı.') ? c.okInk : c.badInk}>{msg}</Text> : null}
      {code ? <InviteCode code={code} org={org.name} /> : null}
    </Stack>
  );
}

function InviteCode({ code, org }: { code: string; org: string }) {
  const c = useColors();
  const share = async () => {
    const msg = t('anahtar’da {org} kurumunun master yöneticisi olarak davet edildin. Bağlantıdan hesabını aç ve katıl: {url} (davet kodu: {code})', { org, url: inviteLink(code), code });
    try { await Share.share({ message: msg }); } catch { try { await Clipboard.setStringAsync(code); } catch {} }
  };
  return (
    <Row between wrap style={{ backgroundColor: c.surface2, borderRadius: radius.md, padding: 14 }}>
      <View style={{ gap: 2 }}>
        <Muted>{t('Master davet kodu')}</Muted>
        <Text v="h3" selectable style={{ letterSpacing: 2, fontFamily: fonts.bodyXBold }}>{code}</Text>
      </View>
      <Button kind="ghost" title={t('Gönder')} onPress={share} />
    </Row>
  );
}

function OrgCard({ o, reload }: { o: any; reload: () => void }) {
  const c = useColors();
  const [mode, setMode] = useState<'' | 'edit' | 'master' | 'manage'>('');
  const [err, setErr] = useState<string | null>(null);
  const sec = sectorOf(o.sector);
  const toggleStatus = async () => {
    setErr(null);
    try { await adminSaveOrg({ ...o, status: o.status === 'active' ? 'paused' : 'active' }); reload(); } catch (e) { setErr(humanError(e)); }
  };
  if (mode === 'edit') return <OrgForm org={o} done={() => { setMode(''); reload(); }} />;
  return (
    <Card gap={8}>
      <Row between wrap>
        <View style={{ flex: 1, minWidth: 200 }}>
          <H2>{o.name}</H2>
          <Muted>{o.master ? t('Master: {name}', { name: [o.master.name, o.master.email].filter(Boolean).join(' · ') }) : o.master_invite ? t('Master daveti bekliyor: {code}', { code: o.master_invite }) : t('Master yönetici yok')}</Muted>
        </View>
        <Row gap={8} wrap>
          <Chip tone="accent" label={sec.label} />
          <Chip tone={o.status === 'active' ? 'ok' : 'bad'} label={o.status === 'active' ? t('Etkin') : t('Askıda')} />
        </Row>
      </Row>
      <Muted>{[t('{n} yönetici', { n: o.members }), o.units ? t('{n} birim (sözleşme)', { n: o.units }) : '', o.contract_until ? t('Sözleşme bitişi {d}', { d: day(o.contract_until) }) : '',
        (o.modules || []).length + ' ' + t('modül')].filter(Boolean).join(' · ')}</Muted>
      {err ? <Text v="small" color={c.badInk}>{err}</Text> : null}
      <Row wrap>
        <Button kind={mode === 'manage' ? 'primary' : 'ghost'} title={t('Yöneticiler ve roller')} onPress={() => setMode(mode === 'manage' ? '' : 'manage')} />
        <Button kind={mode === 'master' ? 'primary' : 'ghost'} title={t('Master belirle')} onPress={() => setMode(mode === 'master' ? '' : 'master')} />
        <Button kind="ghost" title={t('Düzenle')} onPress={() => setMode('edit')} />
        <Button kind="quiet" title={o.status === 'active' ? t('Askıya al') : t('Etkinleştir')} onPress={toggleStatus} />
      </Row>
      {mode === 'master' ? <MasterForm org={o} done={reload} /> : null}
      {mode === 'manage' ? <OrgManage oid={o.id} power={{ master: true, members: true, admin: true }} /> : null}
    </Card>
  );
}

/** Kurumlar bölümü. draft: "Talepler"deki kurumsal başvurudan "Kuruma çevir" ile gelen ön bilgi. */
export function Orgs({ draft, clearDraft }: { draft?: OrgDraft | null; clearDraft?: () => void }) {
  const c = useColors();
  const [list, setList] = useState<any[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [adding, setAdding] = useState(!!draft);
  const [f, setF] = useState('all');
  const reload = async () => { try { setList(await adminOrgs()); setErr(null); } catch (e) { setErr(humanError(e)); } };
  useEffect(() => { reload(); }, []);
  useEffect(() => { if (draft) setAdding(true); }, [draft]);
  const shown = (list || []).filter((o) => f === 'all' || o.sector === f);
  const used = SECTORS().filter((s) => (list || []).some((o) => o.sector === s.key));
  return (
    <Stack>
      {adding ? <OrgForm key={draft?.lead_id || 'new'} draft={draft} done={() => { setAdding(false); clearDraft && clearDraft(); reload(); }} />
        : <Button title={t('Yeni kurum')} onPress={() => setAdding(true)} style={{ alignSelf: 'flex-start' }} />}
      {used.length > 1 ? <Seg scroll value={f} onChange={setF} options={[['all', t('Hepsi')], ...used.map((s) => [s.key, s.label] as [string, string])]} /> : null}
      {err ? <Text v="small" color={c.badInk}>{err}</Text> : null}
      {list || err ? null : <View style={{ alignItems: 'center', paddingVertical: 20 }}><Loader size={64} /></View>}
      {list && !list.length ? <Empty>{t('Henüz kurum yok. Kurumsal başvurudan “Kuruma çevir” ile ya da “Yeni kurum” ile açabilirsin.')}</Empty> : null}
      {shown.map((o) => <OrgCard key={o.id} o={o} reload={reload} />)}
    </Stack>
  );
}
