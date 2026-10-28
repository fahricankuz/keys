// anahtar blog yazıları. `node scripts/blog/build.mjs` bu listeden public/blog altındaki sayfaları,
// blog/rss.xml'i ve site haritasını üretir. Yeni yazı: listeye ekle, betiği çalıştır, (isteğe bağlı) kapak
// görselleri için `node scripts/blog/og.mjs`.
//
// Her yazıda: title (≤ 60 karakter, arama sonucu başlığı), h1 (sayfa başlığı), description (≤ 160 karakter),
// category, keywords, date / updated (YYYY-MM-DD), summary (kartlarda), body (HTML; h2'lere id verilir,
// içindekiler bunlardan çıkar), faq (sayfada görünür ve FAQPage yapılandırılmış verisine girer), related (slug).

export const CATEGORIES = {
  hukuk: { name: 'Kira hukuku', tone: 'gul' },
  vergi: { name: 'Vergi', tone: 'bal' },
  rehber: { name: 'Rehber', tone: 'fes' },
  odeme: { name: 'Ödeme', tone: 'kil' }
};

export const POSTS = [
  {
    slug: 'kira-artisi-nasil-hesaplanir',
    title: 'Kira artışı nasıl hesaplanır? Örnekli rehber',
    h1: 'Kira artışı nasıl hesaplanır?',
    description: 'Konut kirasında yasal artış sınırı TÜFE 12 aylık ortalamasıdır. Oranı nereden bulacağınızı ve adım adım örnek hesabı anlatıyoruz.',
    category: 'hukuk', keywords: ['kira artışı', 'kira artış oranı', 'TÜFE 12 aylık ortalama', 'kira zammı hesaplama', 'TBK 344'],
    date: '2026-10-01', updated: '2026-10-27',
    summary: 'Konut kirasında yıllık artış sınırı, TÜFE 12 aylık ortalaması ve adım adım örnek hesap.',
    body: `
<p>Kira sözleşmesi yenilendiğinde mülk sahibi ile kiracının en çok konuştuğu konu artış oranıdır. Konut ve çatılı işyeri kiralarında bu oranın yasal bir üst sınırı vardır; sınırı bilmek iki tarafı da gereksiz tartışmadan korur.</p>
<div class="callout"><p>Hemen hesaplamak için <a href="/kira-artis-hesaplama"><strong>ücretsiz kira artış hesaplayıcımızı</strong></a> kullan: güncel TÜFE oranı kendiliğinden gelir.</p></div>
<h2 id="ust-sinir">Üst sınır: TÜFE 12 aylık ortalaması</h2>
<p>Türk Borçlar Kanunu'nun 344. maddesine göre yenilenen kira dönemindeki artış, bir önceki kira yılında <strong>TÜFE'nin 12 aylık ortalamalara göre değişim oranını</strong> geçemez. Sözleşmede daha düşük bir oran yazıyorsa o oran geçerlidir; daha yüksek bir oran yazılsa bile sınır uygulanır.</p>
<div class="callout"><p>2022–2024 arasında konut kiraları için geçici olarak yüzde 25 sınırı uygulanmıştı. Bu uygulama Temmuz 2024'te sona erdi; bugün geçerli olan sınır TÜFE 12 aylık ortalamasıdır.</p></div>
<h2 id="oran-nerede">Oranı nereden bulurum?</h2>
<p>TÜİK enflasyon verilerini her ayın başında açıklar. Kira yılının dolduğu ayın verisinde yer alan <strong>12 aylık ortalamalara göre değişim</strong> oranını kullanın. Aylık ya da yıllık değişim oranıyla karıştırmayın; üçü aynı bültende yan yana yazar.</p>
<h2 id="ornek">Adım adım örnek hesap</h2>
<ol><li>Mevcut aylık kira: <strong>30.000 ₺</strong></li><li>Kira yılının dolduğu ayda açıklanan 12 aylık ortalama TÜFE değişimi: yüzde 40 (örnek)</li><li>Çarpan: 1 + 0,40 = 1,40</li><li>En fazla yeni kira: 30.000 × 1,40 = <strong>42.000 ₺</strong></li></ol>
<p>Taraflar bu tutarın altında anlaşabilir. Üstünde bir tutar istenirse kiracı yasal sınırı hatırlatabilir; sınırı aşan kısım için kiracının ödeme yükümlülüğü yoktur.</p>
<h2 id="bes-yil">Beş yıldan uzun kiralarda</h2>
<p>Kira ilişkisi beş yılı aştıysa ya da her beş yılda bir, yeni kira bedeli hâkim tarafından TÜFE ile birlikte emsal kiralar ve mülkün durumu dikkate alınarak hakkaniyete göre belirlenebilir. Buna <strong>kira tespit davası</strong> denir. Dava açmadan önce arabulucuya başvurmak zorunludur.</p>
<h2 id="yabanci-para">Döviz cinsinden kiralar</h2>
<p>Kira bedeli yabancı para olarak belirlendiyse beş yıl geçmedikçe kira bedelinde değişiklik yapılamaz; beş yıl sonunda yine hakkaniyete göre belirlenir. Mevzuat zaman zaman değiştiği için döviz kiralarında güncel kuralı mutlaka kontrol edin.</p>
<h2 id="anahtar">anahtar'da</h2>
<p>anahtar kira artış tarihini <a href="/#ozellikler">takvimde</a> gösterir ve iki tarafa önceden hatırlatır. Mülk sahibi yenileme teklifini uygulamadan gönderir; teklif yasal sınırı aşamaz, kiracı tek dokunuşla kabul eder ya da görüşmeye çağırır. Yeni tutar kabul edilince kira geçmişi ve beklenen ödemeler kendiliğinden güncellenir.</p>`,
    faq: [
      ['Kira artışı yüzde 25 ile mi sınırlı?', 'Hayır. Konut kiralarındaki yüzde 25 sınırı geçici bir uygulamaydı ve Temmuz 2024\'te sona erdi. Bugün artış, bir önceki kira yılının TÜFE 12 aylık ortalamalara göre değişim oranını geçemez.'],
      ['Sözleşmede daha yüksek bir oran yazıyorsa ne olur?', 'Yasal sınır uygulanır. Sözleşmede daha düşük bir oran yazıyorsa o daha düşük oran geçerli olur.'],
      ['Hangi ayın enflasyon verisini kullanmalıyım?', 'Kira yılının dolduğu ayda TÜİK\'in açıkladığı bültendeki 12 aylık ortalamalara göre değişim oranını kullanın.'],
      ['Ev sahibi sınırın üstünde artış isterse ne yapabilirim?', 'Yasal sınırı yazılı olarak hatırlatın ve sınıra kadar olan tutarı ödemeye devam edin. Uyuşmazlık sürerse dava öncesi arabuluculuk zorunludur.']
    ],
    related: ['kira-sozlesmesinde-dikkat-edilecekler', 'kiraci-tahliyesi', 'kira-geliri-beyannamesi']
  },
  {
    slug: 'isyeri-kirasinda-stopaj',
    title: 'İşyeri kirasında stopaj: oran, hesap ve beyan',
    h1: 'İşyeri kirasında stopaj nedir, nasıl hesaplanır?',
    description: 'İşyeri kiralarında yüzde 20 stopajı kim keser, brütten nete nasıl hesaplanır, mülk sahibi nasıl beyan eder? Örneklerle anlattık.',
    category: 'vergi', keywords: ['kira stopajı', 'işyeri kira stopajı', 'brüt kira net kira', 'stopaj hesaplama', 'GVK 94'],
    date: '2026-09-15', updated: '2026-10-27',
    summary: 'Yüzde 20 stopaj, brüt ve net kira farkı, kimin ödediği ve mülk sahibinin beyanı.',
    body: `
<p>İşyeri kiralarında kiracı, kiranın tamamını mülk sahibine ödemez: bir kısmını vergi olarak keser ve vergi dairesine yatırır. Bu kesintiye <strong>stopaj</strong> (gelir vergisi tevkifatı) denir.</p>
<h2 id="kim-keser">Kim keser, ne kadar?</h2>
<p>Gelir Vergisi Kanunu'nun 94. maddesine göre işyerini kiralayan şirketler, esnaf ve serbest meslek sahipleri gibi vergi mükellefleri, ödedikleri kira üzerinden <strong>yüzde 20</strong> stopaj keser ve muhtasar beyannameyle vergi dairesine öder.</p>
<p>Konut kiralarında, kiracı bir işletme değilse stopaj yoktur. Bir şirket çalışanına lojman olarak konut kiraladığında ise stopaj gündeme gelebilir.</p>
<h2 id="brut-net">Brüt ve net kira</h2>
<ul><li>Sözleşmede yazan tutar genellikle <strong>brüt</strong> kiradır.</li><li>Mülk sahibinin hesabına geçen tutar <strong>net</strong> kiradır: net = brüt × 0,80</li><li>Net tutar üzerinden anlaşıldıysa brüt kira: brüt = net ÷ 0,80</li></ul>
<table><thead><tr><th>Brüt kira</th><th>Stopaj (%20)</th><th>Mülk sahibine geçen</th></tr></thead><tbody>
<tr><td>25.000 ₺</td><td>5.000 ₺</td><td>20.000 ₺</td></tr>
<tr><td>50.000 ₺</td><td>10.000 ₺</td><td>40.000 ₺</td></tr>
<tr><td>62.500 ₺</td><td>12.500 ₺</td><td>50.000 ₺</td></tr></tbody></table>
<div class="callout"><p>"Net 50.000 ₺" diye anlaşılan bir kirada sözleşmeye brüt 62.500 ₺ yazılması gerekir; yoksa kesintiden sonra mülk sahibinin eline beklediğinden az para geçer.</p></div>
<h2 id="beyan">Mülk sahibinin beyanı</h2>
<p>Kesilen stopaj mülk sahibinin vergisinden düşülür. İşyeri kira geliri yıllık gelir vergisi beyannamesiyle beyan edilir ve hesaplanan vergiden kesilen stopaj <strong>mahsup</strong> edilir. Stopaja tabi işyeri kira geliri her yıl güncellenen belirli bir tutarın altında kalıyorsa ve başka beyan edilecek gelir yoksa beyan gerekmeyebilir. Ayrıntılar için <a href="/blog/kira-geliri-beyannamesi">kira geliri beyannamesi rehberimize</a> bakın.</p>
<h2 id="anahtar">anahtar'da</h2>
<p>Mülkü işyeri olarak ekleyip stopajı işaretlediğinizde anahtar beklenen tutarı net olarak gösterir, raporda brüt kirayı ve kesilen stopajı ayrı tutar. Vergi tahmini stopajı mahsup ederek hesaplanır.</p>`,
    faq: [
      ['İşyeri kira stopaj oranı kaç?', 'Gelir Vergisi Kanunu\'nun 94. maddesine göre işyeri kiralarında stopaj oranı yüzde 20\'dir.'],
      ['Stopajı kim öder?', 'Kiracı keser ve muhtasar beyannameyle vergi dairesine öder; vergi yükü mülk sahibinin gelir vergisinden mahsup edilir.'],
      ['Netten brüte nasıl çevrilir?', 'Net kirayı 0,80\'e bölün. Örneğin net 40.000 ₺ için brüt kira 50.000 ₺\'dir.'],
      ['Konut kirasında stopaj var mı?', 'Kiracı bir işletme değilse konut kirasında stopaj yoktur.']
    ],
    related: ['kira-geliri-beyannamesi', 'kira-odemesi-banka-dekont', 'kira-artisi-nasil-hesaplanir']
  },
  {
    slug: 'depozito-kurallari',
    title: 'Depozito kuralları: üst sınır ve iade süreci',
    h1: 'Depozito kuralları: ne kadar alınır, nasıl iade edilir?',
    description: 'Kira depozitosu en fazla kaç aylık kira olabilir, bankada nasıl tutulur, ne zaman iade edilir? Anlaşmazlığı önleyen kontrol listesiyle.',
    category: 'hukuk', keywords: ['depozito', 'kira depozitosu iadesi', 'güvence bedeli', 'TBK 342', 'depozito kesintisi'],
    date: '2026-09-01', updated: '2026-10-27',
    summary: 'Depozitonun üst sınırı, bankada tutulması, iade süreci ve anlaşmazlıkları önlemenin yolları.',
    body: `
<p>Depozito (güvence bedeli), kira sonunda ödenmemiş kira ya da mülkteki hasar için mülk sahibini güvenceye alır. Kuralları Türk Borçlar Kanunu'nun 342. maddesinde yer alır ve konut ile çatılı işyeri kiralarında uygulanır.</p>
<h2 id="ust-sinir">Üst sınır: üç aylık kira</h2>
<p>Depozito <strong>üç aylık kira bedelini aşamaz</strong>. Örneğin aylık kira 25.000 ₺ ise depozito en fazla 75.000 ₺ olabilir. Sınırı aşan kısım için kiracının ödeme yükümlülüğü yoktur.</p>
<h2 id="banka">Para olarak verildiyse</h2>
<p>Kanuna göre para olarak verilen depozito, kiracı tarafından bir bankada <strong>vadeli tasarruf hesabına</strong> yatırılır. Banka bu parayı ancak iki tarafın birlikte onayıyla ya da icra takibi veya mahkeme kararıyla öder. Kıymetli evrak olarak verildiyse bankaya depo edilir.</p>
<p>Uygulamada depozitonun doğrudan mülk sahibine verildiği de sık görülür. Bu durumda tutarı ve iade koşullarını sözleşmeye yazmak, ödemeyi de açıklamalı banka transferiyle yapmak ispat açısından önemlidir.</p>
<h2 id="iade">İade ne zaman?</h2>
<p>Kira sözleşmesi bittikten sonra <strong>üç ay içinde</strong> mülk sahibi kiracıya karşı dava açmamış ya da icra takibi başlatmamışsa banka, kiracının isteği üzerine güvenceyi iade eder.</p>
<h2 id="kesinti">Hangi durumlarda kesinti yapılabilir?</h2>
<ul><li>Ödenmemiş kira, aidat ya da fatura borcu</li><li>Normal kullanımı aşan hasar (kırık kapı, yanık parke gibi)</li><li>Sözleşmede kiracıya ait olduğu yazan, yapılmamış bakım</li></ul>
<p>Duvardaki küçük çivi izleri, güneşten solan perde gibi <strong>olağan kullanımdan doğan yıpranma</strong> kesinti nedeni değildir.</p>
<h2 id="kontrol">Anlaşmazlığı önleyen kontrol listesi</h2>
<ul><li>Girişte mülkün durumunu <strong>fotoğraflı bir tutanakla</strong> kayda geçirin ve iki taraf da onaylasın.</li><li>Çıkışta aynı odaları aynı açıdan yeniden fotoğraflayın.</li><li>Kesinti yapılacaksa her kalemi tutar ve gerekçesiyle yazılı bildirin.</li><li>Sayaç değerlerini (elektrik, su, doğalgaz) giriş ve çıkışta not edin.</li></ul>
<h2 id="anahtar">anahtar'da</h2>
<p>Giriş ve çıkış tutanakları oda oda fotoğraflı tutulur ve iki tarafın onayıyla kilitlenir. Çıkışta kesintiler kalem kalem eklenir, iade edilecek tutar kendiliğinden hesaplanır ve iki taraf aynı dökümü görür.</p>`,
    faq: [
      ['Depozito en fazla ne kadar olabilir?', 'Türk Borçlar Kanunu\'nun 342. maddesine göre depozito üç aylık kira bedelini aşamaz.'],
      ['Depozito ne zaman iade edilir?', 'Sözleşme bittikten sonra üç ay içinde mülk sahibi dava açmamış ya da icra takibi başlatmamışsa banka, kiracının isteği üzerine güvenceyi iade eder.'],
      ['Ev sahibi boya parasını depozitodan kesebilir mi?', 'Olağan kullanımdan doğan yıpranma kesinti nedeni değildir. Sözleşmede aksi kararlaştırılmışsa ya da normal kullanımı aşan bir hasar varsa kesinti gündeme gelebilir.'],
      ['Depozito döviz olarak alınabilir mi?', 'Taraflar anlaşabilir; ancak üç aylık kira sınırı yine geçerlidir ve tutarın sözleşmeye açıkça yazılması gerekir.']
    ],
    related: ['kira-sozlesmesinde-dikkat-edilecekler', 'aidat-kim-oder', 'kiraci-tahliyesi']
  },
  {
    slug: 'kira-sozlesmesinde-dikkat-edilecekler',
    title: 'Kira sözleşmesinde dikkat edilecek 10 madde',
    h1: 'Kira sözleşmesinde dikkat edilecek 10 madde',
    description: 'Kira sözleşmesi hazırlarken ya da imzalarken kontrol edilecek 10 madde; noter, e-Devlet ve elektronik sözleşme seçenekleriyle.',
    category: 'rehber', keywords: ['kira sözleşmesi', 'kira kontratı', 'kira sözleşmesi maddeleri', 'e-Devlet kira sözleşmesi', 'tahliye taahhüdü'],
    date: '2026-08-15', updated: '2026-10-27',
    summary: 'İmzalamadan önce kontrol edilecek maddeler; noter ve elektronik sözleşme seçenekleri.',
    body: `
<p>İyi hazırlanmış bir kira sözleşmesi, iki tarafı da sonradan çıkabilecek anlaşmazlıklardan korur. İster matbu bir sözleşme kullanın ister kendiniz hazırlayın, imzalamadan önce şu maddeleri kontrol edin.</p>
<h2 id="kontrol">Kontrol listesi</h2>
<ol><li><strong>Taraflar ve mülk:</strong> ad soyad, T.C. kimlik numarası, iletişim bilgisi, adres ve tapu bilgileri eksiksiz olmalı.</li><li><strong>Kira bedeli ve ödeme günü:</strong> tutar, ödemenin yapılacağı gün ve banka hesabı yazılmalı.</li><li><strong>Artış oranı:</strong> yenilemede uygulanacak oran yazılabilir; konut kiralarında <a href="/blog/kira-artisi-nasil-hesaplanir">yasal üst sınır</a> geçerlidir.</li><li><strong>Depozito:</strong> tutar (en fazla üç aylık kira) ve nasıl tutulacağı. Bkz. <a href="/blog/depozito-kurallari">depozito kuralları</a>.</li><li><strong>Aidat ve giderler:</strong> aidat, yakıt ve demirbaş giderlerini kimin ödeyeceği. Bkz. <a href="/blog/aidat-kim-oder">aidatı kim öder?</a></li><li><strong>Süre:</strong> başlangıç ve bitiş tarihi. Konut kiralarında süre dolsa da kiracı en az 15 gün önce bildirmedikçe sözleşme aynı koşullarla bir yıl uzar.</li><li><strong>Kullanım amacı:</strong> konut, işyeri ya da karma kullanım; alt kiraya izin verilip verilmediği.</li><li><strong>Demirbaşlar:</strong> mülkle birlikte teslim edilen eşyalar listelenmeli.</li><li><strong>Teslim tutanağı:</strong> mülkün teslimdeki durumu fotoğraflı tutanakla eklenmeli.</li><li><strong>Tebligat adresleri:</strong> ihtar ve bildirimlerin gönderileceği adresler yazılmalı.</li></ol>
<h2 id="gecersiz">Geçersiz sayılan hükümler</h2>
<p>Konut ve çatılı işyeri kiralarında kiracı aleyhine bazı hükümler geçersizdir: örneğin kira bedeli dışında ceza koşulu ya da muacceliyet (bir ay ödenmezse tüm yılın kirasının istenmesi) kaydı. Sözleşmeyle birlikte imzalatılan tarihsiz <strong>tahliye taahhütnamesi</strong> de geçerli değildir; tahliye taahhüdü ancak mülk teslim edildikten sonra verilmişse hüküm doğurur.</p>
<h2 id="nasil">Sözleşme nasıl yapılır?</h2>
<p>Kira sözleşmesi yazılı olarak taraflar arasında imzalanabilir; noterde düzenletmek ya da onaylatmak ispat açısından güçlü bir seçenektir. e-Devlet üzerinden elektronik kira sözleşmesi düzenleme olanakları da sunulmaktadır; güncel hizmetler için e-Devlet'te "kira sözleşmesi" araması yapın ya da noterinize danışın.</p>
<h2 id="anahtar">anahtar'da</h2>
<p>Sözleşmeyi anahtar'a yükleyin; bitiş ve yenileme tarihleri takvime eklenir, iki tarafa zamanında hatırlatılır. Kiracınız davet koduyla katılınca ödemeler, talepler ve belgeler aynı yerde toplanır.</p>`,
    faq: [
      ['Kira sözleşmesi sözlü yapılabilir mi?', 'Kanun yazılı şekil şartı aramaz; ancak ispat ve vergi açısından yazılı sözleşme her zaman önerilir.'],
      ['Kira sözleşmesi süresi bitince ne olur?', 'Konut ve çatılı işyeri kiralarında kiracı süre bitiminden en az 15 gün önce bildirimde bulunmadıkça sözleşme aynı koşullarla bir yıl uzar.'],
      ['Sözleşmeyle birlikte imzalanan tahliye taahhüdü geçerli mi?', 'Hayır. Tahliye taahhüdünün geçerli olması için mülk kiracıya teslim edildikten sonra yazılı olarak verilmiş olması gerekir.'],
      ['Kira sözleşmesi noterde yapılmak zorunda mı?', 'Zorunlu değildir. Noter onayı ispat ve icra takibi açısından kolaylık sağlar.']
    ],
    related: ['depozito-kurallari', 'kira-artisi-nasil-hesaplanir', 'aidat-kim-oder']
  },
  {
    slug: 'kira-odemesi-banka-dekont',
    title: 'Kira ödemesi bankadan mı yapılmalı? Dekont rehberi',
    h1: 'Kira ödemesi bankadan mı yapılmalı? Dekontun önemi',
    description: 'Kira bedeli hangi durumlarda banka ya da PTT ile ödenmeli, dekonta ne yazılmalı, geç ödemede ne olur? Kiracı ve ev sahibi için rehber.',
    category: 'odeme', keywords: ['kira ödemesi', 'kira dekontu', 'kira bankadan ödeme zorunluluğu', 'kira açıklaması', 'kira geç ödeme'],
    date: '2026-10-20', updated: '2026-10-27',
    summary: 'Banka ile ödeme zorunluluğu, dekont açıklaması ve geç ödemenin sonuçları.',
    body: `
<p>Kirayı elden ödemek pratik görünse de anlaşmazlık çıktığında ödemeyi ispatlamak zorlaşır. Bazı durumlarda da banka ya da PTT aracılığıyla ödeme vergi mevzuatı gereği zorunludur.</p>
<h2 id="zorunluluk">Banka ile ödeme ne zaman zorunlu?</h2>
<p>Vergi Usul Kanunu'na dayanan düzenlemelere göre <strong>aylık 500 ₺ ve üzerindeki konut kiraları</strong> ile <strong>tutarı ne olursa olsun işyeri kiraları</strong> banka ya da PTT aracılığıyla ödenmeli ve bu yolla belgelendirilmelidir. Bu kurala uyulmaması, kiracı ve mülk sahibi için ayrı ayrı özel usulsüzlük cezası doğurabilir.</p>
<div class="callout"><p>Bugünkü kira tutarları düşünüldüğünde neredeyse tüm konut kiraları bu sınırın üzerindedir; yani kirayı banka ya da PTT ile ödemek pratikte herkes için zorunludur.</p></div>
<h2 id="aciklama">Dekonta ne yazılmalı?</h2>
<ul><li>Ödemenin <strong>kira</strong> olduğu ve hangi aya ait olduğu: "Kasım 2026 kira bedeli"</li><li>Mülkün kısa adresi: "Moda Mah. … No:5 D:3"</li><li>Kısmi ödemeyse: "Kasım 2026 kirasının 15.000 ₺'lik kısmı"</li></ul>
<p>Açıklamasız ya da "borç" gibi belirsiz açıklamalı ödemeler, sonradan kira ödemesi olarak ispatlanmakta zorluk çıkarabilir.</p>
<h2 id="kime">Kime ödenmeli?</h2>
<p>Kira, sözleşmede yazan kiraya verenin ya da yazılı olarak bildirdiği kişinin hesabına ödenir. Mülk satıldıysa yeni malikin hesabına ödeme yapmadan önce satışın yazılı olarak bildirildiğinden emin olun.</p>
<h2 id="gec">Geç ödersem ne olur?</h2>
<p>Türk Borçlar Kanunu'nun 315. maddesine göre kiracı kirayı ödemezse mülk sahibi yazılı olarak süre verir; konut ve çatılı işyeri kiralarında bu süre en az <strong>30 gündür</strong>. Süre içinde ödenmezse sözleşme feshedilebilir. Bir kira yılı içinde iki kez haklı ihtara neden olmak da tahliye sebebidir; ayrıntılar <a href="/blog/kiraci-tahliyesi">tahliye rehberimizde</a>.</p>
<h2 id="anahtar">anahtar'da</h2>
<p>Kiracı dekontu uygulamaya yükler; ay, tutar ve tarih kayda geçer. Mülk sahibi onaylayınca ödeme iki tarafta da "ödendi" görünür; kısmi ödemelerde kalan bakiye ayrıca izlenir. Yıl sonunda tüm ödemeler Excel olarak indirilebilir.</p>`,
    faq: [
      ['Kira elden ödenebilir mi?', 'Aylık 500 ₺ ve üzerindeki konut kiraları ile tüm işyeri kiralarının banka ya da PTT aracılığıyla ödenmesi gerekir. Elden ödeme hem ispat güçlüğü hem de vergi cezası riski taşır.'],
      ['Kira dekontuna ne yazılmalı?', 'Ödemenin kira olduğu, hangi aya ait olduğu ve mülkün adresi. Kısmi ödemelerde ödenen tutarın hangi kiranın parçası olduğu belirtilmelidir.'],
      ['Kirayı geç ödersem ev sahibi hemen çıkarabilir mi?', 'Hayır. Mülk sahibi yazılı olarak en az 30 günlük süre vermelidir; süre içinde ödenmezse sözleşmeyi feshedebilir.']
    ],
    related: ['kiraci-tahliyesi', 'isyeri-kirasinda-stopaj', 'depozito-kurallari']
  },
  {
    slug: 'aidat-kim-oder',
    title: 'Aidatı kim öder: kiracı mı, ev sahibi mi?',
    h1: 'Aidatı kim öder: kiracı mı, ev sahibi mi?',
    description: 'Aidat, yakıt, kapıcı, demirbaş ve DASK giderlerinden hangisi kiracıya, hangisi ev sahibine aittir? Kanun ve uygulamayla tek tabloda.',
    category: 'rehber', keywords: ['aidatı kim öder', 'demirbaş aidatı', 'kiracı aidat', 'ev sahibi aidat', 'ortak gider'],
    date: '2026-10-12', updated: '2026-10-27',
    summary: 'Aidat, yakıt, demirbaş ve sigorta giderlerinin kiracı ile ev sahibi arasında paylaşımı.',
    body: `
<p>Kiracı ile ev sahibi arasında en sık yaşanan küçük anlaşmazlıkların başında aidat gelir. Genel kural basittir: <strong>kullanımdan doğan giderleri kiracı, mülkün değerini koruyan ve artıran giderleri ev sahibi</strong> öder. Sözleşmede farklı bir paylaşım kararlaştırılabilir.</p>
<h2 id="kural">Kanun ne diyor?</h2>
<p>Türk Borçlar Kanunu'na göre kiracı, kiralananın olağan kullanımı için gerekli temizlik ve bakım giderlerini öder (TBK 341). Kiraya veren ise kiralananla ilgili zorunlu sigorta, vergi ve benzeri yükümlülüklere katlanır (TBK 302). Kat Mülkiyeti Kanunu da ortak giderlerin kat malikleri arasında nasıl paylaşılacağını düzenler.</p>
<h2 id="tablo">Hangi gider kime ait?</h2>
<table><thead><tr><th>Gider</th><th>Genellikle</th></tr></thead><tbody>
<tr><td>Aylık işletme aidatı (temizlik, ortak elektrik, bahçe)</td><td>Kiracı</td></tr>
<tr><td>Yakıt / merkezi ısınma</td><td>Kiracı</td></tr>
<tr><td>Kapıcı, güvenlik</td><td>Kiracı</td></tr>
<tr><td>Asansör bakımı</td><td>Kiracı</td></tr>
<tr><td>Asansör yenileme, çatı, dış cephe, mantolama</td><td>Ev sahibi</td></tr>
<tr><td>Demirbaş ve yatırım aidatı</td><td>Ev sahibi</td></tr>
<tr><td>DASK (zorunlu deprem sigortası)</td><td>Ev sahibi</td></tr>
<tr><td>Emlak vergisi</td><td>Ev sahibi</td></tr></tbody></table>
<div class="callout"><p>Site yönetimi aidatı tek kalemde istiyorsa dökümü isteyin: işletme ve demirbaş kısmı ayrıldığında kimin neyi ödeyeceği netleşir.</p></div>
<h2 id="kiracidan">Yönetim aidatı kiracıdan isteyebilir mi?</h2>
<p>Kat Mülkiyeti Kanunu'na göre bazı ortak giderlerde kiracı, kat maliki ile birlikte sorumlu tutulabilir. Kiracının sözleşmeye göre kendisine ait olmayan bir gideri ödemesi durumunda bu tutarı kiradan mahsup etmesi ya da ev sahibinden istemesi mümkündür. En sağlıklısı paylaşımı sözleşmeye açıkça yazmaktır.</p>
<h2 id="anahtar">anahtar'da</h2>
<p>Mülkü eklerken aidatı kimin ödediğini seçersiniz; kiracı ödüyorsa aidat hatırlatmaları ona gider. Ev sahibinin ödediği demirbaş, vergi ve sigorta giderleri gider defterine eklenir ve yıllık net getiriden düşülür.</p>`,
    faq: [
      ['Demirbaş aidatını kiracı öder mi?', 'Genellikle hayır. Demirbaş ve yatırım giderleri mülkün değerini artırdığı için ev sahibine aittir; sözleşmede farklı bir paylaşım kararlaştırılabilir.'],
      ['Doğalgaz ve yakıt giderini kim öder?', 'Kullanımdan doğduğu için kiracı öder.'],
      ['DASK\'ı kim yaptırır?', 'Zorunlu deprem sigortası mülkle ilgili zorunlu bir sigorta olduğundan ev sahibine aittir.']
    ],
    related: ['kira-sozlesmesinde-dikkat-edilecekler', 'depozito-kurallari', 'kira-geliri-beyannamesi']
  },
  {
    slug: 'kiraci-tahliyesi',
    title: 'Kiracı tahliyesi: yasal yollar, süreler ve ihtar',
    h1: 'Kiracı tahliyesi: yasal yollar ve süreler',
    description: 'Ev sahibi kiracıyı hangi durumlarda çıkarabilir? İhtiyaç, tahliye taahhüdü, iki haklı ihtar, 10 yıllık süre ve zorunlu arabuluculuk.',
    category: 'hukuk', keywords: ['kiracı tahliyesi', 'tahliye davası', 'tahliye taahhüdü', 'iki haklı ihtar', 'ihtiyaç nedeniyle tahliye', 'kira arabuluculuk'],
    date: '2026-10-06', updated: '2026-10-27',
    summary: 'İhtiyaç, tahliye taahhüdü, iki haklı ihtar ve 10 yıllık uzama süresi; arabuluculuk şartı.',
    body: `
<p>Konut ve çatılı işyeri kiralarında kiracı güçlü bir korumaya sahiptir: sözleşme süresi dolsa bile ev sahibi kiracıyı ancak kanunda sayılan sebeplerle ve belirli süreler içinde çıkarabilir.</p>
<h2 id="kiraciya-bagli">Kiracıdan kaynaklanan sebepler</h2>
<ul>
<li><strong>Tahliye taahhüdü:</strong> Kiracı, mülk teslim edildikten sonra belirli bir tarihte çıkacağını yazılı olarak taahhüt ettiyse ve o tarihte çıkmazsa ev sahibi bir ay içinde icra takibi ya da dava yoluna gidebilir (TBK 352).</li>
<li><strong>İki haklı ihtar:</strong> Bir kira yılı içinde kirayı ödemediği için kiracıya iki kez yazılı ihtar çekildiyse ev sahibi, kira yılının bitiminden itibaren bir ay içinde dava açabilir.</li>
<li><strong>Kiracının aynı ilçede konutu:</strong> Kiracının ya da eşinin aynı ilçe veya belde sınırları içinde oturmaya elverişli bir konutu varsa ve bunu sözleşme kurulurken ev sahibi bilmiyorsa tahliye istenebilir.</li>
<li><strong>Ödememe (temerrüt):</strong> Kira ödenmezse ev sahibi yazılı olarak en az 30 günlük süre verir; süre içinde ödenmezse sözleşme feshedilebilir (TBK 315).</li>
</ul>
<h2 id="ev-sahibine-bagli">Ev sahibinden kaynaklanan sebepler</h2>
<ul>
<li><strong>Konut ya da işyeri ihtiyacı:</strong> Ev sahibi kendisi, eşi, altsoyu, üstsoyu ya da bakmakla yükümlü olduğu kişiler için mülke gerçekten ve zorunlu olarak ihtiyaç duyuyorsa (TBK 350).</li>
<li><strong>Yeniden inşa ve imar:</strong> Esaslı onarım ya da yeniden yapım gerekiyor ve bu sırada mülkün kullanılması imkânsızsa.</li>
<li><strong>Yeni malik:</strong> Mülkü satın alan yeni malik, ihtiyacı varsa edinmeden itibaren bir ay içinde durumu kiracıya yazılı bildirir ve altı ay sonra dava açabilir (TBK 351).</li>
</ul>
<h2 id="on-yil">10 yıllık uzama süresi</h2>
<p>Sözleşme süresi bittikten sonra <strong>10 yıllık uzama süresi</strong> dolduğunda ev sahibi, herhangi bir sebep göstermeden, izleyen her uzama yılının bitiminden en az üç ay önce bildirimde bulunarak sözleşmeyi sona erdirebilir (TBK 347).</p>
<h2 id="arabuluculuk">Önce arabuluculuk</h2>
<p>1 Eylül 2023'ten bu yana kira ilişkisinden doğan uyuşmazlıklarda dava açmadan önce <strong>arabulucuya başvurmak zorunludur</strong>. Anlaşma sağlanamazsa sulh hukuk mahkemesinde dava açılabilir. Süreler kaçırılırsa hak kaybı yaşanabileceği için bir avukata danışmak iyi olur.</p>
<h2 id="anahtar">anahtar'da</h2>
<p>Kira ödemeleri, ihtarlar ve yazışmalar tarih sırasıyla kayıtlı kalır; sözleşme ve uzama tarihleri takvimde görünür. Tahliye tarihi belli olduğunda iki tarafa önceden hatırlatma gider ve çıkış tutanağı aynı ekrandan hazırlanır.</p>`,
    faq: [
      ['Kira sözleşmesi bitince ev sahibi kiracıyı çıkarabilir mi?', 'Konut ve çatılı işyeri kiralarında hayır. Sözleşme kendiliğinden bir yıl uzar; ev sahibi ancak kanundaki sebeplerle ya da 10 yıllık uzama süresi sonunda bildirimle sözleşmeyi sona erdirebilir.'],
      ['İki haklı ihtar ne demek?', 'Bir kira yılı içinde kiranın ödenmemesi nedeniyle kiracıya iki kez yazılı ihtar gönderilmesidir. Bu durumda ev sahibi kira yılının bitiminden itibaren bir ay içinde tahliye davası açabilir.'],
      ['Tahliye davası için arabuluculuk zorunlu mu?', 'Evet. 1 Eylül 2023\'ten bu yana kira uyuşmazlıklarında dava açmadan önce arabulucuya başvurmak zorunludur.'],
      ['Yeni ev sahibi beni hemen çıkarabilir mi?', 'Hayır. Yeni malik ihtiyacını edinmeden itibaren bir ay içinde yazılı bildirmeli ve altı ay geçtikten sonra dava açabilir.']
    ],
    related: ['kira-odemesi-banka-dekont', 'kira-sozlesmesinde-dikkat-edilecekler', 'depozito-kurallari']
  },
  {
    slug: 'kira-geliri-beyannamesi',
    title: 'Kira geliri beyannamesi: kimler verir, nasıl hesaplanır?',
    h1: 'Kira geliri beyannamesi: kimler verir, nasıl hesaplanır?',
    description: 'Konut ve işyeri kira gelirinin beyanı: istisna, götürü ve gerçek gider, Mart ayı beyan süresi, taksitler ve hazır beyan sistemi.',
    category: 'vergi', keywords: ['kira geliri beyannamesi', 'kira geliri vergisi', 'konut kira geliri istisnası', 'götürü gider', 'hazır beyan sistemi'],
    date: '2026-09-25', updated: '2026-10-27',
    summary: 'İstisna, gider yöntemleri, beyan süresi ve taksitler; hazır beyan sistemiyle adım adım.',
    body: `
<p>Kira geliri elde eden mülk sahipleri, belirli tutarları aştığında bu geliri her yıl beyan eder ve vergisini öder. Beyan basittir; doğru yöntemi seçmek ise ödenecek vergiyi belirgin biçimde değiştirebilir.</p>
<h2 id="kimler">Kimler beyan eder?</h2>
<ul><li><strong>Konut:</strong> Yıllık konut kira geliri, her yıl yeniden belirlenen <strong>istisna tutarını</strong> aşıyorsa beyan edilir. İstisnanın altında kalan gelir için beyanname gerekmez. Ticari, zirai ya da mesleki kazancı nedeniyle beyanname verenler gibi bazı mükellefler istisnadan yararlanamaz.</li><li><strong>İşyeri:</strong> Stopaja tabi işyeri kira geliri, yine her yıl belirlenen beyan sınırını aşıyorsa beyan edilir; kesilen stopaj hesaplanan vergiden düşülür. Bkz. <a href="/blog/isyeri-kirasinda-stopaj">işyeri kirasında stopaj</a>.</li></ul>
<div class="callout"><p>İstisna ve beyan sınırları her yıl değişir. Beyandan önce Gelir İdaresi Başkanlığı'nın (GİB) o yıl için açıkladığı tutarları kontrol edin.</p></div>
<h2 id="gider">Götürü gider mi, gerçek gider mi?</h2>
<ul><li><strong>Götürü gider:</strong> Gelirin yüzde 15'i belge aranmadan gider sayılır. Bu yöntemi seçen iki yıl geçmeden gerçek gidere dönemez.</li><li><strong>Gerçek gider:</strong> Emlak vergisi, sigorta, onarım, yönetim gideri, amortisman gibi belgelenen giderler düşülür. Mevzuattaki koşullara göre konut kredisi faizi gibi kalemler de gider yazılabilir.</li></ul>
<p>Yıl içinde belgeli giderleriniz gelirin yüzde 15'inden fazlaysa gerçek gider yöntemi genellikle daha avantajlıdır.</p>
<h2 id="ne-zaman">Ne zaman, nasıl beyan edilir?</h2>
<p>Bir önceki yılın kira geliri <strong>1–31 Mart</strong> arasında beyan edilir. Vergi Mart ve Temmuz aylarında <strong>iki eşit taksitle</strong> ödenir. Beyan, GİB'in hazır beyan sistemi üzerinden e-Devlet şifresiyle birkaç dakikada yapılabilir.</p>
<h2 id="hazirlik">Beyana hazırlık listesi</h2>
<ol><li>Yıl içinde her mülkten tahsil edilen kiraların toplamı</li><li>İşyerlerinde brüt kira ve kesilen stopaj tutarı</li><li>Gerçek gider seçilecekse faturalar ve ödeme belgeleri</li><li>Hisseli mülklerde hisse oranı</li></ol>
<h2 id="anahtar">anahtar'da</h2>
<p>Onaylanan ödemeler ve girilen giderler yıl boyunca toplanır. Rapor ekranında mülk başına brüt kira, stopaj, gider ve net getiri hazır gelir; "Beyanname özeti" düğmesi bu özeti mali müşavirinizle paylaşmaya uygun biçimde çıkarır.</p>`,
    faq: [
      ['Kira geliri beyannamesi ne zaman verilir?', 'Bir önceki yılın kira geliri her yıl 1–31 Mart arasında beyan edilir; vergi Mart ve Temmuz aylarında iki taksitte ödenir.'],
      ['Konut kira geliri istisnası ne kadar?', 'İstisna tutarı her yıl yeniden belirlenir. Beyan etmeden önce Gelir İdaresi Başkanlığı\'nın ilgili yıl için açıkladığı tutarı kontrol edin.'],
      ['Götürü gider oranı kaç?', 'Götürü gider yönteminde gelirin yüzde 15\'i belge aranmadan gider sayılır.'],
      ['Kira gelirini nereden beyan ederim?', 'GİB\'in hazır beyan sistemi üzerinden e-Devlet şifrenizle beyan edebilirsiniz.']
    ],
    related: ['isyeri-kirasinda-stopaj', 'aidat-kim-oder', 'kira-odemesi-banka-dekont']
  }
];
