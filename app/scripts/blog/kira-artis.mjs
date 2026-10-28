// Kira artış oranı hesaplama sayfası (public/kira-artis-hesaplama.html). build.mjs ortak üst çubuk ve alt bilgiyle üretir.
// Oranlar çalışma anında okunur: canlıda Supabase public.cpi_rates (adres ve herkese açık anahtarı harden-html
// <meta name="anahtar-api"> içine yazar), yoksa /data/tufe.json. Oran bulunamazsa kullanıcı TÜİK oranını elle girer.

const FAQ = [
  ['Kira artış oranı nasıl hesaplanır?', 'Konut ve çatılı işyeri kiralarında yenilenen dönemdeki artış, bir önceki kira yılında TÜFE’nin 12 aylık ortalamalara göre değişim oranını geçemez (TBK 344). Yeni kira = mevcut kira × (1 + oran ÷ 100).'],
  ['Hangi ayın TÜFE oranını kullanmalıyım?', 'Kira yılının dolduğu ayda açıklanmış en son TÜİK bültenini kullanın. Örneğin sözleşmeniz Kasım’da yenileniyorsa, Kasım başında açıklanan Ekim verisindeki 12 aylık ortalama değişim oranı uygulanır.'],
  ['Yüzde 25 kira artış sınırı hâlâ geçerli mi?', 'Hayır. Konut kiralarına uygulanan geçici yüzde 25 sınırı Temmuz 2024’te sona erdi. Bugün sınır, TÜFE 12 aylık ortalamalara göre değişim oranıdır.'],
  ['İşyeri kiralarında da aynı sınır var mı?', 'Evet. Türk Borçlar Kanunu’nun 344. maddesi konut ve çatılı işyeri kiralarında aynı TÜFE sınırını öngörür. İşyeri kiralarında stopaj ayrıca hesaplanır.'],
  ['Sözleşmede daha düşük oran yazıyorsa ne olur?', 'Sözleşmede yazan oran yasal sınırdan düşükse o oran uygulanır. Daha yüksekse yasal sınır geçerlidir.'],
  ['Beş yıldan uzun kiralarda ne değişir?', 'Kira ilişkisi beş yılı aştığında yeni kira bedeli, TÜFE ile birlikte emsal kiralar ve mülkün durumu dikkate alınarak hâkim tarafından hakkaniyete göre belirlenebilir (kira tespit davası). Dava öncesinde arabuluculuk zorunludur.']
];

const SCRIPT = `
(function(){
  var $ = function(id){ return document.getElementById(id); };
  var MONTHS = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];
  var rates = {};
  var tl = function(n){ return '₺' + Math.round(n).toLocaleString('tr-TR'); };
  var pct = function(n){ return '%' + Number(n).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
  var label = function(k){ var p = k.split('-'); return MONTHS[Number(p[1]) - 1] + ' ' + p[0]; };
  var prevKey = function(v){ var p = v.split('-').map(Number); var d = new Date(p[0], p[1] - 2, 1); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); };
  var num = function(el){ var v = String(el.value || '').replace(/\\./g, '').replace(',', '.'); return v === '' ? NaN : Number(v); };

  function table(){
    var keys = Object.keys(rates).sort().reverse().slice(0, 24);
    var box = $('oranlar');
    if (!keys.length){ box.innerHTML = '<p class="hint">Oran tablosu yakında burada. Şimdilik TÜİK bülteninden oranı girerek hesaplayabilirsin.</p>'; return; }
    box.innerHTML = '<table><thead><tr><th>Veri ayı</th><th>Uygulandığı yenileme ayı</th><th>Yasal üst sınır</th></tr></thead><tbody>' +
      keys.map(function(k){ var p = k.split('-').map(Number); var n = new Date(p[0], p[1], 1); return '<tr><td>' + label(k) + '</td><td>' + MONTHS[n.getMonth()] + ' ' + n.getFullYear() + '</td><td><b>' + pct(rates[k]) + '</b></td></tr>'; }).join('') + '</tbody></table>';
  }

  function calc(){
    var rent = num($('kira')), when = $('ay').value, contract = num($('sozlesme'));
    var k = when ? prevKey(when) : '';
    var auto = k && rates[k] != null ? rates[k] : null;
    var manual = num($('oran'));
    var cap = !isNaN(manual) ? manual : auto;
    $('oran-bilgi').innerHTML = auto != null
      ? 'TÜİK <b>' + label(k) + '</b> verisi: <b>' + pct(auto) + '</b>. Farklı bir oran kullanmak için alanı doldur.'
      : (when ? label(k) + ' verisi henüz sistemde yok. TÜİK bültenindeki “12 aylık ortalamalara göre değişim” oranını gir.' : 'Yenileme ayını seç; oran kendiliğinden gelir.');
    $('oran').placeholder = auto != null ? String(auto).replace('.', ',') : 'ör. 33,45';
    var out = $('sonuc');
    if (isNaN(rent) || rent <= 0 || cap == null || isNaN(cap)){ out.hidden = true; return; }
    var applied = !isNaN(contract) && contract < cap ? contract : cap;
    var next = rent * (1 + applied / 100);
    $('yeni').textContent = tl(next);
    $('fark').textContent = '+' + tl(next - rent) + ' / ay · +' + tl((next - rent) * 12) + ' / yıl';
    $('uygulanan').textContent = pct(applied) + (applied === contract ? ' (sözleşmedeki oran, yasal sınırın altında)' : ' (yasal üst sınır)');
    out.hidden = false;
  }

  function ready(r){
    rates = r || {};
    table();
    var d = new Date(); $('ay').value = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    calc();
  }
  ['kira','ay','oran','sozlesme'].forEach(function(id){ $(id).addEventListener('input', calc); });
  $('kira').addEventListener('blur', function(){ var n = num($('kira')); if (!isNaN(n)) $('kira').value = Math.round(n).toLocaleString('tr-TR'); });

  var api = (document.querySelector('meta[name="anahtar-api"]') || {}).content || '';
  var parts = api.split('|');
  var fromApi = parts[0] && parts[1] && /^https:/.test(parts[0])
    ? fetch(parts[0] + '/rest/v1/cpi_rates?select=month,avg12&order=month.desc&limit=72', { headers: { apikey: parts[1], authorization: 'Bearer ' + parts[1] } })
        .then(function(r){ if (!r.ok) throw 0; return r.json(); })
        .then(function(rows){ var o = {}; rows.forEach(function(x){ o[x.month] = Number(x.avg12); }); return o; })
    : Promise.reject();
  fromApi.catch(function(){ return fetch('/data/tufe.json').then(function(r){ return r.json(); }).then(function(j){ return j.rates || {}; }); })
    .catch(function(){ return {}; }).then(ready);
})();`;

export function kiraArtisPage({ head, bar, foot }) {
  const path = '/kira-artis-hesaplama';
  const year = new Date().getFullYear();
  const jsonld = [
    { '@context': 'https://schema.org', '@type': 'WebApplication', name: 'Kira artış oranı hesaplama', url: 'https://anahtar.io' + path,
      applicationCategory: 'FinanceApplication', operatingSystem: 'Web', inLanguage: 'tr-TR', isAccessibleForFree: true,
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'TRY' }, publisher: { '@type': 'Organization', name: 'anahtar', url: 'https://anahtar.io' } },
    { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: FAQ.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) },
    { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Ana sayfa', item: 'https://anahtar.io/' },
      { '@type': 'ListItem', position: 2, name: 'Kira artış oranı hesaplama', item: 'https://anahtar.io' + path }] }
  ];
  return `${head({ title: `Kira Artış Oranı Hesaplama ${year}: Yasal Zam Tavanı | anahtar`,
    description: `${year} kira artış oranı hesaplama: TÜİK 12 aylık ortalama TÜFE ile yasal zam tavanını ve yeni kira bedelini saniyeler içinde hesapla. Konut ve işyeri için ücretsiz.`,
    path, image: '/blog/og/kira-artisi-nasil-hesaplanir.jpg', jsonld, extra: '<meta name="anahtar-api" content="%%ANAHTAR_API%%"/>\n' })}
<body>
${bar('hesap')}
<main class="wrap">
<ol class="crumbs" aria-label="Konum"><li><a href="/">Ana sayfa</a></li><li aria-current="page">Kira artış oranı hesaplama</li></ol>
<section class="calc-hero">
  <div>
    <span class="label">Ücretsiz hesaplayıcı</span>
    <h1>Kira artış oranı hesaplama ${year}</h1>
    <p class="lead">Yasal zam tavanını ve yeni kira bedelini TÜİK’in açıkladığı 12 aylık ortalama TÜFE oranıyla hesapla. Konut ve işyeri kiraları için geçerlidir.</p>
    <ul class="ticks"><li>TÜFE oranı her ay kendiliğinden güncellenir</li><li>Sözleşmedeki oran düşükse onu uygular</li><li>Aylık ve yıllık farkı gösterir</li></ul>
  </div>
  <div class="calc" role="form" aria-label="Kira artışı hesaplayıcı">
    <label>Mevcut aylık kira (₺)<input id="kira" inputmode="numeric" autocomplete="off" placeholder="ör. 25.000"/></label>
    <label>Kira yenileme ayı<input id="ay" type="month"/></label>
    <p id="oran-bilgi" class="hint" aria-live="polite"></p>
    <div class="two">
      <label>TÜFE oranı (%)<input id="oran" inputmode="decimal" autocomplete="off"/></label>
      <label>Sözleşmedeki oran (%)<input id="sozlesme" inputmode="decimal" autocomplete="off" placeholder="isteğe bağlı"/></label>
    </div>
    <div id="sonuc" class="result" hidden aria-live="polite">
      <span>Yeni kira en fazla</span>
      <b id="yeni"></b>
      <span id="fark"></span>
      <small>Uygulanan oran: <span id="uygulanan"></span></small>
    </div>
    <noscript><p class="hint">Hesaplayıcı için tarayıcında JavaScript açık olmalı.</p></noscript>
  </div>
</section>

<div class="calc-body">
<article class="prose read">
<h2 id="nasil">Kira artışı nasıl hesaplanır?</h2>
<p>Türk Borçlar Kanunu’nun 344. maddesine göre konut ve çatılı işyeri kiralarında yenilenen kira dönemindeki artış, <strong>bir önceki kira yılında TÜFE’nin 12 aylık ortalamalara göre değişim oranını</strong> geçemez. Formül basittir:</p>
<div class="formula">Yeni kira = Mevcut kira × (1 + TÜFE 12 aylık ortalama ÷ 100)</div>
<h2 id="ornek">Örnek hesap</h2>
<ol><li>Mevcut aylık kira: <strong>25.000 ₺</strong></li><li>Yenileme ayından önce açıklanan 12 aylık ortalama TÜFE: yüzde 40 (örnek)</li><li>Yeni kira en fazla: 25.000 × 1,40 = <strong>35.000 ₺</strong></li></ol>
<p>Taraflar bu tutarın altında anlaşabilir. Üstünde bir tutar istenirse kiracı yasal sınırı hatırlatabilir; sınırı aşan kısım için ödeme yükümlülüğü yoktur.</p>
<h2 id="hangi-ay">Hangi ayın oranı kullanılır?</h2>
<p>TÜİK enflasyon verisini her ayın 3’ünde açıklar. Kira yılının dolduğu ayda açıklanmış en son bülteni kullanın: Kasım’da yenilenen bir sözleşme için Kasım başında açıklanan <em>Ekim</em> verisi. Bültende yan yana duran aylık ve yıllık değişim oranlarıyla karıştırmayın; doğru satır <strong>“12 aylık ortalamalara göre değişim”</strong>dir.</p>
<h2 id="oranlar">Son kira artış oranları</h2>
<div id="oranlar" aria-live="polite"><p class="hint">Oranlar yükleniyor…</p></div>
<h2 id="isyeri">İşyeri kiralarında</h2>
<p>Aynı TÜFE sınırı çatılı işyeri kiralarında da geçerlidir. İşyeri kiralarında ayrıca yüzde 20 stopaj kesilir; brüt ve net kira farkı için <a href="/blog/isyeri-kirasinda-stopaj">stopaj rehberimize</a> bakın.</p>
<h2 id="bes-yil">Beş yıldan uzun kiralar ve döviz kiraları</h2>
<p>Kira ilişkisi beş yılı aştığında yeni bedel hâkim tarafından hakkaniyete göre belirlenebilir (kira tespit davası). Döviz cinsinden kiralarda beş yıl geçmedikçe bedel değiştirilemez. Ayrıntılar için <a href="/blog/kira-artisi-nasil-hesaplanir">kira artışı rehberimizi</a> okuyun.</p>
<h2 id="sss">Sık sorulanlar</h2>
${FAQ.map(([q, a]) => `<details><summary>${q}</summary><p>${a}</p></details>`).join('\n')}
<p class="disclaimer">Hesaplama genel bilgi amaçlıdır. Oranlar TÜİK verisinden alınır; işlem yapmadan önce güncel bülteni ve sözleşmenizi kontrol edin.</p>
</article>
</div>
<section class="cta-band"><div><h2>Kira artışını her yıl kendin hesaplama.</h2><p>anahtar yenileme tarihini hatırlatır, yasal sınırı hesaplar ve teklifi kiracına tek dokunuşla gönderir.</p></div><a class="btn light" href="/kayit/mulk-sahibi">Ücretsiz dene</a></section>
</main>
${foot()}
<script>${SCRIPT}</script>
</body>
</html>
`;
}
