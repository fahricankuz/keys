/* Davet kodu biçimleri ve yazım düzeni.

   Yeni kodlar uzundur (tahmin edilemesin diye): mülk daveti 16 karakter, kurum yöneticisi daveti "K" + 16, site sakini
   daveti "S" + 16; alfabe Crockford base32 (0-9 ve A-Z; I, L, O, U yok), hep büyük harf. Eski kodlar süresi dolana kadar
   geçerlidir: mülk daveti 8 onaltılık hane, kurum "K" + 7, site "S" + 7 onaltılık hane. Sunucu işlevleri her iki biçimi
   de tanır (supabase/migrations → davet_kodlari); burada yalnızca yazım düzeltilir ve kodun türü ayırt edilir. */

/** En uzun kod (K/S + 16). Giriş alanı bundan biraz uzun tutulur ki aralıklı ya da tireli yapıştırılan kod kesilmesin. */
export const INVITE_CODE_LENGTH = 17;
export const INVITE_INPUT_MAX = 24;

const CROCKFORD = '0-9A-HJKMNP-TV-Z';
const KIND = (prefix) => new RegExp('^' + prefix + '(?:[0-9A-F]{7}|[' + CROCKFORD + ']{16})$');
const ORG = KIND('K');
const SITE = KIND('S');

/** Büyük harfe çevirir; boşluk, tire ve diğer işaretleri atar ("abcd-efgh jkmn" → "ABCDEFGHJKMN"). */
export function normalizeInviteCode(raw){
  return String(raw == null ? '' : raw).toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 40);
}

/** Kurum yöneticisi daveti ("K" önekli). */
export const isOrgInviteCode = (code) => ORG.test(normalizeInviteCode(code));
/** Site sakini daveti ("S" önekli). */
export const isSiteInviteCode = (code) => SITE.test(normalizeInviteCode(code));

/** Bağlantı ya da form alanından gelen kodu güvenli biçime getirir; kod olamayacak kadar uzunsa boş döner. */
export function inviteCodeFromInput(raw){
  const c = normalizeInviteCode(raw);
  return c.length >= 4 && c.length <= INVITE_CODE_LENGTH ? c : '';
}
