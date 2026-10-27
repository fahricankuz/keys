/* Eski adres biçimlerini (/kiraci/..., /mulk-sahibi/...) uygulama içi yola çevirir.
   logic.js hatırlatma ve arama sonuçlarında hâlâ bu biçimi üretir. */

export const BASE = '/uygulama';

export function toApp(path){
  if (!path) return BASE;
  if (path.startsWith(BASE)) return path;
  const [p, q] = String(path).split('?');
  const parts = p.split('/').filter(Boolean);
  const query = q ? '?' + q : '';
  const [root, a, b, c] = parts;

  if (root === 'kiraci'){
    if (!a) return BASE;
    if (a === 'talepler' && b) return BASE + '/talepler?req=' + encodeURIComponent(b);
    if (a === 'belgeler' && b) return BASE + '/belgeler/' + b;
    return BASE + '/' + a + query;
  }
  if (root === 'mulk-sahibi'){
    if (!a) return BASE;
    if (a === 'mulk'){
      if (!b) return BASE;
      return BASE + '/mulk?pid=' + encodeURIComponent(b) + '&sub=' + (c || 'ozet') + (q ? '&' + q : '');
    }
    return BASE + '/' + a + query;
  }
  return BASE;
}
