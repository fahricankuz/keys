/* Kurumsal paket başvuru formu: sitedeki /kurumsal sayfası ve uygulamadaki paket penceresi kullanır.
   Başvuru yönetici panelindeki Talepler bölümüne düşer, info@anahtar.io'ya e-postalanır (supabase/functions/lead-mail). */
import { useEffect, useState } from 'react';
import { Linking, View } from 'react-native';
import { t } from '../domain/i18n';
import { CONFIG } from '../domain/config';
import { humanError, submitLead } from '../domain/backend';
import { Button, Field, PressScale, Text } from '../ui/kit';
import { fonts, radius, useColors } from '../ui/theme';
import { Area } from '../app-ui/forms';
import { Icon } from '../app-ui/blocks';

const TYPES = ['Konut', 'Ofis', 'Mağaza', 'Depo', 'Arsa', 'Diğer'];
const ROLES = ['Mülk sahibi / yatırımcı', 'Emlak ofisi', 'Site / bina yönetimi', 'AVM', 'GYO', 'Şirket', 'Diğer'];
const WHEN = ['Hemen', '1–3 ay içinde', 'Araştırıyorum'];

function Chips({ label, options, value, multi, onChange }: { label: string; options: string[]; value: string[]; multi?: boolean; onChange: (v: string[]) => void }) {
  const c = useColors();
  return (
    <View style={{ gap: 8 }} accessibilityRole={multi ? undefined : 'radiogroup'} aria-label={label}>
      <Text v="small" style={{ fontFamily: fonts.bodyBold }}>{label}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {options.map((o) => {
          const on = value.includes(o);
          return (
            <PressScale key={o} scaleTo={0.96} accessibilityRole={multi ? 'checkbox' : 'radio'} aria-checked={on} accessibilityState={{ checked: on }}
              onPress={() => onChange(multi ? (on ? value.filter((x) => x !== o) : [...value, o]) : [o])}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, minHeight: 40, borderRadius: radius.pill, backgroundColor: on ? c.ink : c.surface, borderWidth: 1, borderColor: on ? c.ink : c.line }}>
              {multi && on ? <Icon name="check" size={14} color={c.bg} /> : null}
              <Text v="small" color={on ? c.bg : c.ink} style={{ fontFamily: fonts.bodyBold }}>{t(o)}</Text>
            </PressScale>
          );
        })}
      </View>
    </View>
  );
}

export function EnterpriseForm({ onDone, email: email0 = '', name: name0 = '', role: role0 = '' }: { onDone?: () => void; email?: string; name?: string; role?: string }) {
  const c = useColors();
  const [v, setV] = useState<Record<string, string>>({ name: name0, company: '', email: email0, phone: '', units: '', city: '', message: '' });
  const set = (k: string, x: string) => setV((s) => ({ ...s, [k]: x }));
  const [types, setTypes] = useState<string[]>([]);
  // Sektör sayfasından gelen seçim çizimden sonra uygulanır: sayfa önceden derlendiği için ilk çizim boş seçimle eşleşmeli.
  const [role, setRole] = useState<string[]>([]);
  useEffect(() => { if (ROLES.includes(role0)) setRole((r) => (r.length ? r : [role0])); }, [role0]);
  const [when, setWhen] = useState<string[]>([]);
  const [consent, setConsent] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async () => {
    setErr(null);
    if (v.name.trim().length < 2) return setErr(t('Adını yaz.'));
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.email.trim())) return setErr(t('Geçerli bir e-posta adresi yaz.'));
    if (!consent) return setErr(t('Aydınlatma metnini onayla.'));
    setBusy(true);
    try {
      await submitLead({ ...v, units: v.units.replace(/\D/g, ''), types, role: role[0] || '', timeline: when[0] || '', consent });
      setSent(true);
    } catch (e) { setErr(humanError(e)); }
    setBusy(false);
  };

  if (sent) {
    return (
      <View style={{ gap: 14, alignItems: 'flex-start' }}>
        <View style={{ width: 52, height: 52, borderRadius: 18, backgroundColor: c.okBg, alignItems: 'center', justifyContent: 'center' }}><Icon name="check" size={24} color={c.okInk} /></View>
        <Text v="h3">{t('Başvurun bize ulaştı')}</Text>
        <Text v="body" muted>{t('Portföyünü inceleyip iki iş günü içinde {email} adresinden sana döneceğiz.', { email: CONFIG.supportEmail })}</Text>
        {onDone ? <Button kind="ghost" title={t('Tamam')} onPress={onDone} /> : null}
      </View>
    );
  }
  return (
    <View style={{ gap: 16 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        <View style={{ flexGrow: 1, flexBasis: 220 }}><Field label={t('Ad soyad')} value={v.name} onChangeText={(x) => set('name', x)} autoComplete="name" maxLength={120} /></View>
        <View style={{ flexGrow: 1, flexBasis: 220 }}><Field label={t('Şirket / kurum (isteğe bağlı)')} value={v.company} onChangeText={(x) => set('company', x)} autoComplete="organization" maxLength={160} /></View>
        <View style={{ flexGrow: 1, flexBasis: 220 }}><Field label={t('E-posta')} value={v.email} onChangeText={(x) => set('email', x)} keyboardType="email-address" autoCapitalize="none" autoComplete="email" maxLength={200} /></View>
        <View style={{ flexGrow: 1, flexBasis: 220 }}><Field label={t('Telefon')} value={v.phone} onChangeText={(x) => set('phone', x)} keyboardType="phone-pad" autoComplete="tel" placeholder="05xx xxx xx xx" maxLength={30} /></View>
        <View style={{ flexGrow: 1, flexBasis: 220 }}><Field label={t('Yaklaşık mülk adedi')} value={v.units} onChangeText={(x) => set('units', x.replace(/\D/g, ''))} keyboardType="numeric" inputMode="numeric" placeholder="ör. 40" maxLength={7} /></View>
        <View style={{ flexGrow: 1, flexBasis: 220 }}><Field label={t('Şehir (isteğe bağlı)')} value={v.city} onChangeText={(x) => set('city', x)} maxLength={80} /></View>
      </View>
      <Chips label={t('Mülk tipi (birden fazla seçebilirsin)')} options={TYPES} value={types} multi onChange={setTypes} />
      <Chips label={t('Seni en iyi ne tanımlar?')} options={ROLES} value={role} onChange={setRole} />
      <Chips label={t('Ne zaman başlamak istersin?')} options={WHEN} value={when} onChange={setWhen} />
      <Area label={t('Eklemek istediklerin (isteğe bağlı)')} v={v} set={set} k="message" placeholder={t('Ör. mevcut takip yöntemin, ekip büyüklüğün, özel ihtiyaçların')} />
      <PressScale onPress={() => setConsent(!consent)} accessibilityRole="checkbox" aria-checked={consent} accessibilityState={{ checked: consent }} scaleTo={0.99} style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
        <View style={{ width: 22, height: 22, borderRadius: 7, borderWidth: 1.5, borderColor: consent ? c.accent : c.line, backgroundColor: consent ? c.accent : c.surface, alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
          {consent ? <Icon name="check" size={14} color={c.accentInk} /> : null}
        </View>
        <Text v="small" muted style={{ flex: 1 }}>
          <Text v="small" color={c.accentText} onPress={() => Linking.openURL(CONFIG.legal.privacy)}>{t('Gizlilik ve KVKK Aydınlatma Metni’ni')}</Text>
          {t(' okudum; başvurum için benimle iletişime geçilmesini kabul ediyorum.')}
        </Text>
      </PressScale>
      {err ? <Text v="small" color={c.badInk} accessibilityLiveRegion="polite">{err}</Text> : null}
      <Button block title={t('Başvuruyu gönder')} onPress={submit} loading={busy} />
    </View>
  );
}
