/* WhatsApp bağlantısı: Türkiye numaralarını uluslararası biçime çevirir (0532… → 90532…). */

export function waNumber(phone){
  let n = String(phone || '').replace(/\D/g, '');
  if (!n) return '';
  if (n.startsWith('00')) n = n.slice(2);
  if (n.length === 11 && n.startsWith('0')) n = '9' + n;
  else if (n.length === 10 && n.startsWith('5')) n = '90' + n;
  return n.length >= 11 && n.length <= 15 ? n : '';
}

export function waLink(phone, text){
  return 'https://wa.me/' + (waNumber(phone) || '') + '?text=' + encodeURIComponent(text || '');
}
