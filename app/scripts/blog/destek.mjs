// Destek merkezi (public/destek/index.html). build.mjs ortak üst çubuk ve alt bilgiyle üretir.
const MAIL = 'info@anahtar.io';
const mail = (subject) => `mailto:${MAIL}?subject=${encodeURIComponent(subject)}`;
const ICON = {
  user: '<path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M17 6l3 3M15 8l2 2"/>',
  card: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M3 10h18M7 15h4"/>',
  tool: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4Z"/>'
};
const icon = (n) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[n]}</svg>`;

const GROUPS = [
  ['baslarken', 'Başlarken', [
    ['Kiracı mıyım, mülk sahibi mi? Hangi hesabı açmalıyım?', 'Kirada oturuyor ya da işyeri kiralıyorsan <b>kiracı</b> hesabı aç; her zaman ücretsizdir. Mülkünü kiraya veriyorsan <b>mülk sahibi</b> hesabı aç; 1 ay ücretsiz denemeyle başlar. Emlakçı, muhasebeci ya da personel olarak bir mülk sahibinin ekibine katılacaksan <b>ekip hesabı</b> aç; o da ücretsizdir.'],
    ['Kiracımı nasıl eklerim?', 'Mülkü ekle, ardından mülk sayfasında <b>Kiracı ekle</b>’ye dokun. Oluşan davet bağlantısını ya da kodu WhatsApp ile gönder; kiracın bağlantıyla kaydolunca mülke kendiliğinden bağlanır. Çok sayıda mülkün varsa <b>Toplu içe aktar</b> ile Excel listeni yükleyebilirsin.'],
    ['Davet kodum yok. Kayıt olabilir miyim?', 'Evet. Kayıt olurken kod alanını boş bırak; hesabın açılır ve paneline girersin. Panelin üstünde davet kodu alanı görünür: ev sahibinden kodu isteyip oraya girdiğinde mülküne bağlanırsın. Ev sahibin henüz anahtar kullanmıyorsa aynı alandan ona WhatsApp ile öneri gönderebilirsin.'],
    ['Davet kodum çalışmıyor.', 'Kodlar 30 gün geçerlidir ve bir kez kullanılır. Kiracı kodunu kiracı hesabıyla, ekip kodunu ekip hesabıyla girdiğinden emin ol. Gerekirse mülk sahibinden yeni bir kod iste.']
  ]],
  ['odemeler', 'Ödemeler ve talepler', [
    ['Dekontumu yükledim ama onaylanmadı.', 'Yüklediğin dekont mülk sahibine gider ve mülk sahibi kontrol edip onaylar. Reddedildiyse gerekçesi ödeme ekranında görünür; düzeltip yeniden yükleyebilirsin.'],
    ['Kiranın bir kısmını ödedim. Ne yapmalıyım?', 'Ödediğin tutarı girip dekontu yükle. Kira kısmi ödeme olarak işaretlenir ve kalan bakiye iki tarafta da görünür. Kalanı ödeyince ikinci dekontu yüklersin.'],
    ['Arıza bildirdim, ne zaman ilgilenilir?', 'Talebin Açıldı → Görüldü → İşlemde → Çözüldü adımlarıyla ilerler ve her adımda bildirim alırsın. Acil durumlar için mülk sahibini ayrıca telefonla aramanı öneririz.']
  ]],
  ['paketler', 'Paketler ve deneme', [
    ['Ücretsiz deneme nasıl işliyor?', 'Mülk sahibi hesabı 1 ay ücretsiz denemeyle başlar; deneme süresince 5 mülke kadar ekleyebilir, bütün özellikleri kullanabilirsin. Deneme bitince kayıtların silinmez, salt okunur olur; okuma, mesajlaşma ve dışa aktarma açık kalır.'],
    ['Paketler arasındaki fark ne?', '<b>Başlangıç</b> tek mülk içindir. <b>Portföy</b> 5 mülke kadar çıkar; ekip üyeleri, Excel ile toplu aktarma, yıllık rapor ve vergi tahmini ekler. <b>Kurumsal</b> sınırsız mülk, aylık ve yıllık rapor e-postası, öncelikli destek ve kurulum yardımı içerir; teklif için bize yaz.'],
    ['Paketimi nasıl iptal ederim?', 'Uygulama mağazasından aldıysan iptali mağazadan yaparsın: iPhone’da <b>Ayarlar → [adın] → Abonelikler</b>, Android’de <b>Google Play → Profil → Ödemeler ve abonelikler</b>. İptal dönemin sonunda geçerli olur. Diğer durumlarda bize yaz.']
  ]],
  ['hesap', 'Hesap ve veri', [
    ['E-postamı, telefonumu ya da şifremi nasıl değiştiririm?', 'Panelde sol menüden (telefonda sağ üstteki dişliden) <b>Ayarlar → Hesap</b>’a git. Ad ve telefonu hemen değiştirebilirsin; yeni e-posta adresi, gelen onay bağlantısına tıklayınca geçerli olur. Şifre değiştirmek için mevcut şifren sorulur.'],
    ['Şifremi unuttum.', 'Giriş ekranında <b>Şifremi unuttum</b>’a dokun; e-postana gelen bağlantıyla yeni şifre belirle. E-posta gelmediyse gereksiz klasörünü kontrol et.'],
    ['Bildirim gelmiyor.', '<b>Ayarlar → Bildirimler</b> sekmesinden istediğin bildirimlerin açık olduğunu kontrol et. Telefonunun ayarlarında da anahtar için bildirim izninin açık olması gerekir.'],
    ['Verilerimi indirebilir miyim?', 'Evet. <b>Ayarlar → Yardım</b> sekmesinden tüm verini JSON olarak, ödeme ve giderleri Excel olarak indirebilirsin.'],
    ['Hesabımı nasıl silerim?', '<b>Ayarlar → Hesap → Hesabı sil</b>. Ayrıntılar için <a href="/hesap-silme/">Hesap silme</a> sayfasına bak.']
  ]]
];

const strip = (s) => s.replace(/<[^>]+>/g, '');

export function destekPage({ head, bar, foot }) {
  const jsonld = [{
    '@context': 'https://schema.org', '@type': 'FAQPage',
    mainEntity: GROUPS.flatMap(([, , qs]) => qs.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: strip(a) } })))
  }];
  return `${head({ title: 'Destek merkezi | anahtar', description: 'anahtar hakkında sık sorulan sorular: hesap, davet kodu, dekont ve ödemeler, paketler, bildirimler ve hesap silme. Bulamazsan bize yaz.', path: '/destek/', jsonld })}
<body>
${bar('destek')}
<main class="wrap">
<section class="hero band">
<span class="label">Destek merkezi</span>
<h1>Nasıl yardımcı olabiliriz?</h1>
<p class="lead">En sık sorulanların yanıtları aşağıda. Bulamazsan bize yaz; genellikle iki iş günü içinde dönüyoruz.</p>
<div class="chips">${GROUPS.map(([id, name]) => `<a href="#${id}">${name}</a>`).join('')}</div>
</section>

<div class="topics">
  <a class="topic" href="${mail('Hesap ve giriş')}"><span class="ic t-gul">${icon('user')}</span><b>Hesap ve giriş</b><span>Şifre, e-posta doğrulama, hesap türü</span></a>
  <a class="topic" href="${mail('Davet kodu')}"><span class="ic t-bal">${icon('key')}</span><b>Davet kodu</b><span>Kod çalışmıyor ya da kodum yok</span></a>
  <a class="topic" href="${mail('Paket ve deneme')}"><span class="ic t-fes">${icon('card')}</span><b>Paket ve deneme</b><span>1 ay deneme, paket seçimi, Kurumsal</span></a>
  <a class="topic" href="${mail('Teknik sorun')}"><span class="ic t-kil">${icon('tool')}</span><b>Teknik sorun</b><span>Hata, yavaşlık, bildirim gelmiyor</span></a>
</div>
<p class="hint">Kutucuklar e-posta uygulamanı konusu yazılı olarak açar. Kullandığın cihazı (iPhone / Android / web) ve hesabının e-posta adresini eklersen daha hızlı yardımcı oluruz.</p>

<div class="faq-layout">
<nav class="faq-nav" aria-label="Konular">${GROUPS.map(([id, name]) => `<a href="#${id}">${name}</a>`).join('')}</nav>
<div>
${GROUPS.map(([id, name, qs]) => `<section class="faq-group" id="${id}"><h2>${name}</h2>
${qs.map(([q, a]) => `<details><summary>${q}</summary><p>${a}</p></details>`).join('\n')}
</section>`).join('\n')}
</div>
</div>

<section class="contact"><div><h2>Hâlâ yardıma mı ihtiyacın var?</h2><p>Bize yaz; sorununu birlikte çözelim.</p></div>
<div class="row" style="margin:0"><a class="btn light" href="mailto:${MAIL}">${MAIL}</a><a class="btn ghost" style="color:#FAF5F0;box-shadow:inset 0 0 0 1.5px #FAF5F0" href="/giris">Uygulamaya giriş yap</a></div></section>
</main>
${foot()}
</body>
</html>
`;
}
