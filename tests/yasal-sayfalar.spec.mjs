// Yasal sayfalar (mağaza incelemesi): gizlilik, kosullar, hesap-silme, destek. Şirket kimliği Devredin'in yayımlanmış yasal metinleriyle aynıdır;
// taslak şeridi, yer tutucu ve noindex yoktur; fiyatlar config.js ile, adresler config.legal ile tutarlıdır. Tarayıcı gerekmez.
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const root = (p) => new URL('../' + p, import.meta.url).pathname;
const read = (p) => readFileSync(root(p), 'utf8');

const SAYFALAR = ['gizlilik', 'kosullar', 'hesap-silme'];
const html = Object.fromEntries([...SAYFALAR, 'destek'].map((s) => [s, read(`app/public/${s}/index.html`)]));

const SIRKET = {
  unvan: 'DEVREDİN BİLGİ TEKNOLOJİLERİ YAZILIM VE TİCARET ANONİM ŞİRKETİ',
  kisaUnvan: 'Devredin Bilgi Teknolojileri Yazılım ve Ticaret A.Ş.',
  mersis: '0295131795100001',
  vergi: 'Beyoğlu Vergi Dairesi',
  vergiNo: '2951317951',
  sicil: '1072030',
  adres: 'Şehit Muhtar Mah. Mis Sk. No:24 İç Kapı No:28 Kat:5 Beyoğlu/İstanbul 34435',
  kep: 'devredin@hs01.kep.tr',
  telefon: '+90 544 957 44 74',
  eposta: 'info@anahtar.io'
};

/** Etiket dengesi: kapanmamış ya da fazladan kapanan etiket yok (boş öğeler ve kendiliğinden kapananlar hariç). */
function dengeli(s) {
  const bos = new Set(['meta', 'link', 'br', 'img', 'hr', 'input', 'source']);
  const govde = s.replace(/<!--[\s\S]*?-->/g, '').replace(/<script\b[\s\S]*?<\/script>/gi, '');
  const yigin = [];
  for (const m of govde.matchAll(/<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b[^>]*?(\/?)>/g)) {
    const [, kapat, ad, kendi] = m;
    const a = ad.toLowerCase();
    if (bos.has(a) || kendi === '/') continue;
    if (!kapat) { yigin.push(a); continue; }
    const son = yigin.pop();
    if (son !== a) return `beklenen </${son}>, bulunan </${a}>`;
  }
  return yigin.length ? `kapanmamış: ${yigin.join(',')}` : '';
}

for (const s of SAYFALAR) {
  test(`${s}: şirket kimliği, KEP, adres ve iletişim eksiksiz; taslak, yer tutucu ve noindex yok`, () => {
    const h = html[s];
    for (const v of [SIRKET.unvan, SIRKET.kisaUnvan, SIRKET.mersis, SIRKET.vergi, SIRKET.vergiNo, SIRKET.sicil, SIRKET.adres, SIRKET.kep, SIRKET.telefon, SIRKET.eposta]) {
      expect(h, `${s}: ${v}`).toContain(v);
    }
    expect(h).not.toMatch(/Taslak/);
    expect(h).not.toMatch(/class="ph"|mark\.ph|class="draft"/);
    expect(h).not.toMatch(/noindex/i);
    expect(h).not.toMatch(/\[(ŞİRKET|MERSİS|YÜRÜRLÜK|İL|VERGİ)[^\]]*\]/);
    expect(h).toContain('13 Kasım 2026');
  });

  test(`${s}: geçerli yapı, canonical eğik çizgili, satır içi betik ve olay özniteliği yok, İngilizce bölümü ve bağlantısı var`, () => {
    const h = html[s];
    expect(dengeli(h), s).toBe('');
    expect(h).toMatch(/^<!doctype html>\n<html lang="tr">/);
    expect(h.match(/<h1[ >]/g)).toHaveLength(1);
    expect(h).toContain(`<link rel="canonical" href="https://anahtar.io/${s}/">`);
    expect(h).not.toMatch(/<script\b/i);                 // katı CSP: bu sayfalarda betik hiç yok
    expect(h).not.toMatch(/\son[a-z]+\s*=/i);
    expect(h).toMatch(/<section id="english" lang="en">/);
    expect(h).toContain('href="#english"');
    expect(h).toMatch(/<nav class="legal"[^>]*>[\s\S]*href="\.\.\/gizlilik\/"[\s\S]*href="\.\.\/kosullar\/"[\s\S]*href="\.\.\/hesap-silme\/"[\s\S]*href="\.\.\/destek\/"/);
    // Sayfa içi bağlantılar bir kimliğe düşer.
    for (const [, id] of h.matchAll(/href="#([^"]+)"/g)) expect(h, `${s}: #${id}`).toContain(`id="${id}"`);
  });
}

test('destek: şirket kimliği bloğu üretici (blog/destek.mjs) ve çıktıda aynı; sayfa hâlâ dizinlenir', () => {
  const h = html.destek;
  const gen = read('app/scripts/blog/destek.mjs');
  for (const v of [SIRKET.unvan, SIRKET.mersis, SIRKET.sicil, SIRKET.vergiNo, SIRKET.adres, SIRKET.kep, SIRKET.telefon]) {
    expect(h, v).toContain(v);
    expect(gen, v).toContain(v);
  }
  expect(h).not.toMatch(/noindex|Taslak|class="ph"/);
  expect(h).toContain('<meta name="robots" content="index,follow,max-image-preview:large"/>');
  expect(dengeli(h)).toBe('');
});

test('gizlilik: veri sorumlusu, işleyiciler, yurt dışı aktarım, saklama süreleri, KVKK m. 11 hakları ve başvuru yolları', () => {
  const h = html.gizlilik;
  for (const v of ['Supabase', 'Hostinger', 'Sentry', 'RevenueCat', 'Apple', 'Google', 'Cloudflare', 'Turnstile', 'EVDS', 'Frankfurt', 'APNs', 'Firebase Cloud Messaging']) expect(h, v).toContain(v);
  expect(h).not.toMatch(/GitHub|Resend/);                               // gerçek işleyici listesinde olmayanlar
  expect(h).toContain('KVKK m. 9');
  expect(h).toMatch(/standart sözleşme/);
  expect(h).toMatch(/açık rıza anlamına gelmez/);
  for (const s of ['m. 5/2', 'm. 11', 'm. 7']) expect(h).toContain(s);
  for (const s of ['30 gün', '90 gün', '2 gün', '6 ay', '10 yıl']) expect(h, s).toContain(s);
  expect(h).toMatch(/18 yaşından küçükler/);
  expect(h).toMatch(/reklam, takip ya da analiz amaçlı çerez/);
  expect(h).toContain('href="mailto:info@anahtar.io"');
  expect(h).toContain('id="saklama"');
  expect(h).toMatch(/Ayarlar → Hesap → Hesabı sil/);
});

test('kosullar: fiyatlar config.js ile aynı; otomatik yenileme, iptal, deneme, iade, Apple EULA, sıfır tolerans, yetkili mahkeme', () => {
  const h = html.kosullar;
  const cfg = read('app/src/domain/config.js');
  const tl = (n) => Number(n).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  for (const id of ['tek', 'bes']) {
    const m = new RegExp(`id:'${id}'[^}]*?price:([0-9.]+),\\s*yearly:([0-9.]+)`).exec(cfg);
    expect(m, id).not.toBeNull();
    expect(h, `${id} aylık`).toContain(`${tl(m[1])} ₺ / mülk / ay`);
    expect(h, `${id} yıllık`).toContain(`${tl(m[2])} ₺ / mülk / yıl`);
  }
  const deneme = /trialUnits:\s*(\d+)/.exec(cfg)[1];
  expect(h).toContain(`${deneme} mülke kadar`);
  expect(h).toMatch(/30 gün ücretsiz/);
  expect(h).toMatch(/dönem bitiminden en az 24 saat önce iptal edilmezse/);
  expect(h).toMatch(/kendiliğinden yenilenir/);
  expect(h).toMatch(/Apple Kimliği/);
  expect(h).toMatch(/Ayarlar → \[adınız\] → Abonelikler/);
  expect(h).toMatch(/Google Play → profil simgesi → Ödemeler ve abonelikler/);
  expect(h).toMatch(/hesabınızı silmek mağaza aboneliğinizi iptal etmez/);
  expect(h).toMatch(/iade politikalarına/);
  expect(h).toContain('https://www.apple.com/legal/internet-services/itunes/dev/stdeula/');
  expect(h).toMatch(/Kötüye kullanıma sıfır tolerans/);
  expect(h).toMatch(/24 saat içinde incelenir/);
  expect(h).toMatch(/İstanbul \(Merkez\) Mahkemeleri ve İcra Daireleri/);
  expect(h).toMatch(/Tüketici Hakem Heyetleri/);
  expect(h).toMatch(/18 yaşını doldurmuş/);
  expect(h).toMatch(/hukuki destek/i);
  expect(h).toContain('href="../gizlilik/"');
  // İngilizce bölümde de aynı fiyatlar var.
  const en = h.slice(h.indexOf('<section id="english"'));
  for (const s of ['99.99', '999.99', '199.99', '1,999.99', 'auto-renew', '24 hours', 'Cancel']) expect(en, s).toContain(s);
});

test('hesap-silme: uygulama ve geliştirici adı görünür; uygulamadan ve e-postayla silme; silinenler, saklananlar ve süreler; abonelik uyarısı', () => {
  const h = html['hesap-silme'];
  expect(h).toContain('anahtar: Kira Yönetimi');
  expect(h).toContain('Devredin Bilgi Teknolojileri Yazılım ve Ticaret A.Ş.');
  expect(h).toContain('io.anahtar.app');
  expect(h).toMatch(/Ayarlar<\/b> \(sağ üstteki dişli\) → <b>Hesap<\/b> sekmesi/);
  expect(h).toContain('<b>Hesabı sil</b>');
  expect(h).toContain('mailto:info@anahtar.io');
  for (const s of ['Neler silinir?', 'Neler, ne kadar saklanır?', '30 gün', '90 gün', '10 yıl', 'yedek']) expect(h, s).toContain(s);
  expect(h).toMatch(/kendiliğinden\s+iptal etmez/);
  expect(h).toMatch(/App Store ya da Google Play/);
  // Mağazalara bildirilen adres (config.legal) bu sayfanın adresidir.
  const cfg = read('app/src/domain/config.js');
  expect(cfg).toContain("deletion: 'https://anahtar.io/hesap-silme/'");
  expect(cfg).toContain("privacy: 'https://anahtar.io/gizlilik/'");
  expect(cfg).toContain("terms: 'https://anahtar.io/kosullar/'");
});

test('site haritası: yasal sayfalar sondaki eğik çizgiyle, tekrarsız; harita üreticisi bu satırları korur', () => {
  const xml = read('app/public/sitemap.xml');
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  for (const s of SAYFALAR) expect(locs.filter((l) => l === `https://anahtar.io/${s}/`), s).toHaveLength(1);
  expect(locs).toContain('https://anahtar.io/destek/');
  // blog/build.mjs sitemap(): yalnızca blog, hesaplayıcı, kurumsal ve çözüm satırlarını yeniden üretir; diğerlerini olduğu gibi tutar.
  const gen = read('app/scripts/blog/build.mjs');
  expect(gen).toContain("!l.includes('/blog/') && !/\\/(kira-artis-hesaplama|kurumsal|cozumler)/.test(l)");
  for (const s of SAYFALAR) expect(`  <url><loc>https://anahtar.io/${s}/</loc></url>`).not.toMatch(/\/blog\/|\/(kira-artis-hesaplama|kurumsal|cozumler)/);
});
