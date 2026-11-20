// Şifre kuralları: Supabase → Authentication → Providers → Email ayarlarıyla birebir aynı tutulur.
// Bugünkü ayar: en az 8 karakter + "Prevent use of leaked passwords" açık; "Password requirements" seçili değil
// (büyük harf, rakam, sembol zorunlu değil). Supabase'te kural değişirse buradaki listeyi de güncelle.
import { t } from './i18n.js';

export const PW_MIN = 8;

/** Yazdıkça işaretlenen maddeler. `pw2` verilmezse (tekrar alanı olmayan ekran) eşleşme maddesi çıkmaz. */
export function pwChecks(pw, pw2) {
  pw = pw || '';
  const list = [{ key: 'len', ok: pw.length >= PW_MIN, label: t('En az 8 karakter') }];
  if (pw2 !== undefined) list.push({ key: 'match', ok: !!pw && pw === (pw2 || ''), label: t('İki şifre aynı') });
  return list;
}

/** Bütün maddeler tamam mı (düğmeyi açmak için). */
export const pwReady = (pw, pw2) => pwChecks(pw, pw2).every((c) => c.ok);

/** Gönderimden önce ilk eksik maddenin hata metni; tamamsa null. */
export function pwProblem(pw, pw2) {
  if ((pw || '').length < PW_MIN) return t('Şifre en az 8 karakter olmalı.');
  if (pw2 !== undefined && pw !== pw2) return t('Şifreler aynı değil.');
  return null;
}

/** Supabase'in şifre reddini Türkçe metne çevirir; şifreyle ilgili değilse null.
    Supabase "weak_password" hatasında nedenleri `weak_password.reasons` içinde verir: length | characters | pwned. */
export function pwServerError(e) {
  const m = String(e?.message || e || '');
  const reasons = e?.weak_password?.reasons || e?.reasons || [];
  if (reasons.includes('pwned') || /known to be weak|easy to guess|pwned|leaked/i.test(m))
    return t('Bu şifre çok yaygın ya da daha önce internette sızan şifreler arasında. Başka bir şifre seç.');
  if (reasons.includes('length') || /Password should be at least/i.test(m)) return t('Şifre en az 8 karakter olmalı.');
  if (reasons.includes('characters') || /Password should contain/i.test(m)) return t('Şifre gereken karakter türlerini içermiyor. Başka bir şifre seç.');
  if (e?.code === 'weak_password' || /weak.?password/i.test(m)) return t('Bu şifre yeterince güçlü değil. Başka bir şifre seç.');
  if (/should be different from the old password|same_password/i.test(m) || e?.code === 'same_password') return t('Yeni şifre eskisiyle aynı olamaz.');
  return null;
}
