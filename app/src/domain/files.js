/* Yüklenen dosyalara okunur, çakışmayan adlar verir: mulk-adi_belge-turu_2026-10_1.pdf */

const TR = { 'ç':'c','Ç':'c','ğ':'g','Ğ':'g','ı':'i','İ':'i','ö':'o','Ö':'o','ş':'s','Ş':'s','ü':'u','Ü':'u' };

export function slug(s, max = 40){
  return String(s ?? '')
    .replace(/[çÇğĞıİöÖşŞüÜ]/g, ch => TR[ch])
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, max).replace(/-+$/g, '') || 'dosya';
}

const MIME_EXT = { 'application/pdf':'pdf', 'image/jpeg':'jpg', 'image/png':'png', 'image/webp':'webp', 'image/heic':'heic' };

export function extOf(name, mimeOrDataUrl){
  const m = /\.([a-z0-9]{1,5})$/i.exec(String(name || ''));
  if (m) return m[1].toLowerCase().replace('jpeg', 'jpg');
  const mime = String(mimeOrDataUrl || '').replace(/^data:([^;,]+).*$/, '$1');
  return MIME_EXT[mime] || 'bin';
}

/** Mülk adı + tür + dönem; aynı ad varsa sonuna artan sayı eklenir. */
export function fileName(propName, kind, period, existing, file){
  const base = slug(propName) + '_' + slug(kind) + '_' + String(period || '').slice(0, 7);
  const ext = extOf(file?.name, file?.mime || file?.dataUrl);
  const taken = new Set((existing || []).map(x => String(x).toLowerCase()));
  let n = 1;
  while (taken.has((base + '_' + n + '.' + ext).toLowerCase())) n++;
  return base + '_' + n + '.' + ext;
}
