// IBAN yardımcıları (Havale / EFT bilgileri). Sunucu biçimi de denetler: '^TR[0-9]{24}$' (migration havale_bilgileri).

/** Boşlukları atar, büyük harfe çevirir: "tr38 0006 …" → "TR380006…". */
export const normalizeIban = (s) => String(s || '').replace(/\s+/g, '').toUpperCase();

/** TR IBAN geçerli mi: TR + 24 rakam ve ISO 13616 mod-97 denetimi (yanlış yazılmış IBAN kaydedilmez). */
export function validIban(s) {
  const i = normalizeIban(s);
  if (!/^TR\d{24}$/.test(i)) return false;
  const moved = i.slice(4) + i.slice(0, 4);
  const digits = moved.replace(/[A-Z]/g, (ch) => String(ch.charCodeAt(0) - 55));
  let r = 0;
  for (const d of digits) r = (r * 10 + Number(d)) % 97;
  return r === 1;
}

/** Okumak için dörtlü gruplar: "TR38 0006 2001 3240 0006 2921 12". */
export const formatIban = (s) => normalizeIban(s).replace(/(.{4})/g, '$1 ').trim();
