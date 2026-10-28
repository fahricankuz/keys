// Kurumsal paket sektör sayfaları (public/kurumsal/<sektör>.html). build.mjs üretir.
// "has": bugün üründe olan özellikler. "custom": kurumsal kurulumda kuruma göre yapılandırılan / geliştirilen başlıklar
// (sayfada açıkça "birlikte yapılandırılır" diye anlatılır; hazır özellik gibi sunulmaz).

export const SECTORS = [
  {
    slug: 'emlak-ofisi', name: 'Emlak ofisi', role: 'Emlak ofisi',
    title: 'Emlak ofisleri için kira yönetimi',
    lead: 'Yönettiğin her mülkün kirasını, dekontunu ve talebini tek panelde topla; mülk sahiplerine her ay düzenli rapor gönder.',
    pains: [['Dağınık takip', 'Kira, dekont ve arıza bilgisi WhatsApp, Excel ve defter arasında kayboluyor.'],
            ['Mülk sahibine hesap verme', 'Her ay hangi kiranın yattığını tek tek sormak ve raporlamak zaman alıyor.'],
            ['Ekip içi düzen', 'Danışmanların hangi mülkte ne yaptığını görmek zor.']],
    has: ['Sınırsız mülk ve ekip üyesi; rol bazlı yetki (emlakçı, muhasebeci, personel)', 'Excel ile toplu mülk ve kiracı aktarımı', 'Mülk sahibine aylık ve yıllık rapor e-postası', 'Dekont, talep ve belge akışı kiracıyla ortak ekranda', 'Kimin neyi değiştirdiğini gösteren işlem kaydı'],
    custom: ['Ofisinize özel komisyon ve hizmet bedeli kalemleri', 'Mülk sahibi başına ayrı rapor ve fatura düzeni', 'Mevcut portföy listenizin bizim tarafımızdan taşınması']
  },
  {
    slug: 'site-yonetimi', name: 'Site ve bina yönetimi', role: 'Site / bina yönetimi',
    title: 'Site ve bina yönetimleri için kira ve sakin takibi',
    lead: 'Bloklardaki kiralık daireleri, kiracı iletişimini ve talepleri yönetim ekibinizle birlikte tek yerden yönetin.',
    pains: [['Kiracı ve malik karmaşası', 'Hangi dairede kimin oturduğu ve iletişim bilgisi güncel değil.'],
            ['Arıza ve talep yükü', 'Talepler telefonla geliyor, kimin ilgilendiği takip edilemiyor.'],
            ['Duyuru ve belge dağıtımı', 'Sözleşme ve tutanaklar farklı yerlerde duruyor.']],
    has: ['Talep akışı: açıldı → görüldü → işlemde → çözüldü, fotoğraflı', 'Kiracıyla mesajlaşma ve belge arşivi', 'Giriş ve çıkış tutanağı, depozito iadesi', 'Ekip üyeleri ve yetkiler', 'Sözleşme, DASK ve tahliye hatırlatmaları'],
    custom: ['Blok / daire hiyerarşisi ve toplu görünüm', 'Aidat ve ortak gider dağıtımı', 'Yönetim kurulu için dönemsel rapor']
  },
  {
    slug: 'avm', name: 'AVM', role: 'AVM',
    title: 'AVM ve ticari merkezler için kiracı yönetimi',
    lead: 'Mağaza kiralarını, stopajı, sözleşme yenilemelerini ve kiracı taleplerini tek panelde izleyin; yönetime düzenli rapor alın.',
    pains: [['Çok sayıda ticari sözleşme', 'Farklı vade, artış ve yenileme tarihleri gözden kaçıyor.'],
            ['Stopaj ve brüt/net kira', 'İşyeri kiralarında stopaj hesabı ve tahsilat mutabakatı zaman alıyor.'],
            ['Kiracı talepleri', 'Teknik talepler ve onay süreçleri dağınık yürüyor.']],
    has: ['Mağaza tipi mülk, kiracı şirket bilgisi ve yüzde 20 stopaj hesabı', 'Sözleşme yenileme ve yasal artış sınırı hesabı', 'Mağaza bazında tahsilat ve gecikme takibi', 'Talep, teklif ve fatura akışı', 'Aylık ve yıllık yönetim raporu e-postası'],
    custom: ['Ciroya bağlı kira (sabit kira + ciro payı)', 'Ortak alan gideri dağıtımı', 'Kiracı karması ve doluluk raporları']
  },
  {
    slug: 'gyo', name: 'GYO', role: 'GYO',
    title: 'Gayrimenkul yatırım ortaklıkları için portföy ve kira takibi',
    lead: 'Konut, ofis, mağaza ve depo portföyünüzde tahsilatı, getiriyi ve sözleşme takvimini tek ekranda görün.',
    pains: [['Portföy görünürlüğü', 'Doluluk, tahsilat ve getiri farklı tablolarda.'],
            ['Raporlama yükü', 'Yönetim ve yatırımcı raporları için veri her ay elle toplanıyor.'],
            ['Denetim izi', 'Kimin hangi kaydı değiştirdiğini göstermek gerekiyor.']],
    has: ['Mülk başına brüt kira, gider ve net getiri', 'Aylık ve yıllık rapor e-postası', 'Değiştirilemez işlem kaydı ve rol bazlı yetki', 'Excel / CSV dışa ve içe aktarma', 'Konut, ofis, mağaza ve depo tek portföyde'],
    custom: ['Değerleme ve doluluk panosu', 'Yatırımcı / KAP raporlarına uygun çıktı', 'Kurumsal sistemlerle veri bağlantısı (API)']
  },
  {
    slug: 'depo-lojistik', name: 'Depo ve lojistik', role: 'Şirket',
    title: 'Depo ve lojistik alanları için kira yönetimi',
    lead: 'Depo ve antrepo kiralarını, uzun vadeli sözleşmeleri ve sigorta tarihlerini kaçırmadan yönetin.',
    pains: [['Uzun vadeli sözleşmeler', 'Yenileme ve artış tarihleri yıllar sonra gelir, unutulur.'],
            ['Alan bazlı kira', 'Kiralar m² üzerinden belirlenir, değişiklikler izlenmez.'],
            ['Sigorta ve belgeler', 'Poliçe ve tutanak tarihleri farklı yerlerde.']],
    has: ['Depo tipi mülk ve m² bilgisi', 'Sözleşme, sigorta ve belge bitiş hatırlatmaları', 'Kira geçmişi ve yasal artış sınırı hesabı', 'Kiracı şirket ve stopaj bilgisi', 'Toplu içe aktarma'],
    custom: ['m² başına kira ve endeksleme kuralları', 'Döviz bazlı kira takibi', 'Çok lokasyonlu portföy görünümü']
  },
  {
    slug: 'family-office', name: 'Family office', role: 'Mülk sahibi / yatırımcı',
    title: 'Family office ve büyük mülk sahipleri için kira yönetimi',
    lead: 'Aile ya da şirket adına tutulan mülklerin kirasını, giderini ve vergisini tek yerde toplayın; her ay özet rapor alın.',
    pains: [['Birden çok sahip ve şirket', 'Mülkler farklı kişi ve şirketler adına kayıtlı.'],
            ['Vergi hazırlığı', 'Kira geliri beyanı için veri yıl sonunda toplanıyor.'],
            ['Temsilci ve danışmanlar', 'Muhasebeci ve emlakçının erişimi kontrolsüz.']],
    has: ['Gider defteri, net getiri ve vergi tahmini', 'Aylık ve yıllık rapor e-postası', 'Muhasebeci ve emlakçı için sınırlı yetkili ekip erişimi', 'Belge arşivi ve hatırlatmalar', 'Excel dışa aktarma'],
    custom: ['Sahip / şirket bazında gruplama ve rapor', 'Birden çok vergi numarası için ayrı özet', 'Size özel kurulum ve veri taşıma']
  }
];

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const tick = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 12 4 4 8-8"/></svg>';

export function sectorPage(x, { head, bar, foot }) {
  const path = '/kurumsal/' + x.slug;
  const form = '/kurumsal?sektor=' + encodeURIComponent(x.role) + '#form';
  const others = SECTORS.filter((o) => o !== x);
  const jsonld = [
    { '@context': 'https://schema.org', '@type': 'Service', name: x.title, serviceType: 'Kira ve portföy yönetimi yazılımı', areaServed: 'TR',
      provider: { '@type': 'Organization', name: 'anahtar', url: 'https://anahtar.io' }, url: 'https://anahtar.io' + path, description: x.lead },
    { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Ana sayfa', item: 'https://anahtar.io/' },
      { '@type': 'ListItem', position: 2, name: 'Kurumsal', item: 'https://anahtar.io/kurumsal' },
      { '@type': 'ListItem', position: 3, name: x.name, item: 'https://anahtar.io' + path }] }
  ];
  return `${head({ title: `${x.title} | anahtar Kurumsal`, description: x.lead, path, jsonld })}
<body>
${bar('kurumsal')}
<main class="wrap">
<ol class="crumbs" aria-label="Konum"><li><a href="/">Ana sayfa</a></li><li><a href="/kurumsal">Kurumsal</a></li><li aria-current="page">${esc(x.name)}</li></ol>
<section class="sector-hero">
  <span class="label">Kurumsal · ${esc(x.name)}</span>
  <h1>${esc(x.title)}</h1>
  <p class="lead">${esc(x.lead)}</p>
  <div class="row"><a class="btn" href="${form}">Teklif al</a><a class="btn ghost" href="/kurumsal">Kurumsal paketi incele</a></div>
</section>
<section>
  <h2>Bugün yaşanan</h2>
  <div class="pains">${x.pains.map(([a, b]) => `<div class="pain"><b>${esc(a)}</b><span>${esc(b)}</span></div>`).join('')}</div>
</section>
<section class="split">
  <div class="box">
    <span class="tag t-fes">anahtar’da hazır</span>
    <ul class="list">${x.has.map((h) => `<li>${tick}<span>${esc(h)}</span></li>`).join('')}</ul>
  </div>
  <div class="box">
    <span class="tag t-bal">Size özel yapılandırma</span>
    <ul class="list">${x.custom.map((h) => `<li>${tick}<span>${esc(h)}</span></li>`).join('')}</ul>
    <p class="hint">Bu başlıklar kurumsal kurulumda ihtiyacınıza göre birlikte yapılandırılır; kapsam ve takvim teklifte netleşir.</p>
  </div>
</section>
<section class="cta-band"><div><h2>Portföyünüzü konuşalım.</h2><p>Kısa formu doldurun; uygun fiyatı ve kurulum planını iki iş günü içinde iletelim.</p></div><a class="btn light" href="${form}">Teklif al</a></section>
<p class="others">Diğer sektörler: ${others.map((o) => `<a href="/kurumsal/${o.slug}">${esc(o.name)}</a>`).join(' · ')}</p>
</main>
${foot()}
</body>
</html>
`;
}
