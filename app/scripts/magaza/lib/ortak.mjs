// Mağaza betikleri için ortak yardımcılar: bayrak okuma, ortam değişkeni, bekleme ve yeniden denemeli fetch.
// Sıfır bağımlılık: yalnızca Node 22 (global fetch, node:crypto). Gizli anahtar ve token hiçbir yere yazdırılmaz.

export const bekle = (ms) => new Promise((r) => setTimeout(r, ms));
export const gunluk = (...a) => console.log(new Date().toTimeString().slice(0, 8), ...a);

/** `--apply`, `--urun x`, `--urun=x` biçimlerini okur. Bilinmeyen bayrak hata verir (yazım hatası yanlışlıkla yazma yapmasın). */
export function bayrakOku(argv, { mantiksal = [], deger = [] } = {}) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { out._.push(a); continue; }
    const [ad, satir] = a.slice(2).split(/=(.*)/s, 2);
    if (mantiksal.includes(ad)) out[ad] = true;
    else if (deger.includes(ad)) { const v = satir ?? argv[++i]; if (v == null || v.startsWith('--')) throw new Error(`--${ad} bir değer ister.`); out[ad] = v; }
    else throw new Error(`Bilinmeyen bayrak: --${ad}`);
  }
  return out;
}

/** Zorunlu ortam değişkeni; yoksa hangi değişkenin eksik olduğunu söyler (değeri asla yazmaz). */
export function ortam(ad, varsayilan) {
  const v = process.env[ad];
  if (v && v.trim()) return v.trim();
  if (varsayilan !== undefined) return varsayilan;
  throw new Error(`${ad} ortam değişkeni gerekli (bkz. app/scripts/magaza/README.md).`);
}

/** Yeniden denemeli fetch: ağ hatası, 429 ve 5xx için üstel bekleme; Retry-After varsa ona uyar. Son yanıtı döner. */
export async function tekrarliFetch(url, secenek, { deneme = 6, ad = 'istek', kota429 = 30 } = {}) {
  let son;
  for (let i = 0; i < deneme; i++) {
    try {
      const r = await fetch(url, secenek);
      if (r.status !== 429 && r.status < 500) return r;
      son = r;
      if (i === deneme - 1) return r;
      const ra = Number(r.headers.get('retry-after'));
      const sn = ra > 0 ? ra : r.status === 429 ? Math.min(kota429 * 2 ** i, 600) : 3 * (i + 1);
      console.error(`  [${r.status}] ${ad}: ${sn} sn bekleniyor (deneme ${i + 1}/${deneme})`);
      await bekle(sn * 1000);
    } catch (e) {
      if (i === deneme - 1) throw new Error(`${ad}: ağ hatası (${e.cause?.code || e.message})`);
      await bekle(3000 * (i + 1));
    }
  }
  return son;
}

export const b64url = (buf) => Buffer.from(buf).toString('base64url');
