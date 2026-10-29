import { t } from '../domain/i18n';
import { tiers, planLabel, priceText, monthlyEquivalent, rangeText, tierPoints } from '../domain/plans';
import { CONFIG } from '../domain/config';

/** Tanıtım metinleri: yalnızca uygulamada bulunan özellikler (README → "Ne yapabiliyor"). */

/**
 * Özellikler kategorilere ayrılır. Üst menü ve "Özellikler" bölümü aynı listeyi kullanır:
 * menüden bir kategori ya da madde seçilince bölüm o kategorinin sekmesiyle açılır.
 */
export type Category = { id: string; icon: string; title: string; lead: string; items: { title: string; body: string }[] };

export const categories = (): Category[] => [
  { id: 'odeme', icon: 'card', title: t('Ödemeler'),
    lead: t('Dekont tutar, tarih ve notla yüklenir. Eksik tutar kısmi ödeme olur, kalan bakiye takip edilir. Mülk sahibi onaylar ya da gerekçeyle reddeder; gecikme iki tarafta aynı görünür.'),
    items: [
      { title: t('Dekont yükleme'), body: t('Tutar, tarih ve notla; görsel ya da PDF.') },
      { title: t('Kısmi ödeme'), body: t('Eksik tutar bakiye olarak takip edilir.') },
      { title: t('Onay ve red'), body: t('Mülk sahibi onaylar ya da gerekçeyle reddeder.') },
      { title: t('Kira geçmişi'), body: t('Her tutar değişikliği geçerlilik tarihiyle saklanır.') }
    ] },
  { id: 'talep', icon: 'wrench', title: t('Talepler'),
    lead: t('Arıza, tadilat ve ek talep dört adımda ilerler: Açıldı, Görüldü, İşlemde, Çözüldü. Usta teklifleri karşılaştırılır; fatura otomatik olarak gider defterine işlenir.'),
    items: [
      { title: t('Fotoğraflı anlatım'), body: t('Arızayı fotoğrafla anlat, adım adım izle.') },
      { title: t('Usta teklifleri'), body: t('Teklifleri karşılaştır, birini seç.') },
      { title: t('Masraf paylaşımı'), body: t('Kiracı, mülk sahibi ya da yarı yarıya; iki taraf onaylar.') },
      { title: t('Fatura ve gider'), body: t('Fatura gider defterine kendiliğinden işlenir.') }
    ] },
  { id: 'yazisma', icon: 'chat', title: t('Yazışma ve belgeler'),
    lead: t('Kiracı ve mülk sahibi aynı yazışmada buluşur; sözleşme, sigorta ve DASK gibi belgeler tarihleriyle saklanır.'),
    items: [
      { title: t('Fotoğraflı mesaj'), body: t('Fotoğraf mesajın içinde görünür.') },
      { title: t('Belge arşivi'), body: t('Sözleşme, sigorta ve DASK tarihleri hatırlatılır.') },
      { title: t('Kontrol edilen yüklemeler'), body: t('Dekont ve belgeler anahtar ekibince kontrol edilir.') },
      { title: t('Giriş tutanağı'), body: t('Oda oda, fotoğraflı ve iki tarafın onayıyla.') }
    ] },
  { id: 'cikis', icon: 'key', title: t('Çıkış ve depozito'),
    lead: t('Çıkış tutanağı giriş tutanağıyla oda oda karşılaştırılır. Mülk sahibi kesinti girer, iki taraf onaylar, iade hesaplanır.'),
    items: [
      { title: t('Çıkış tutanağı'), body: t('Giriş tutanağıyla karşılaştırılır.') },
      { title: t('Kesintiler'), body: t('Temizlik, boya, onarım ve ödenmemiş kira.') },
      { title: t('İade hesabı'), body: t('İade edilecek tutar kendiliğinden hesaplanır.') },
      { title: t('İki taraflı onay'), body: t('Kesinti değişirse onaylar sıfırlanır.') }
    ] },
  { id: 'yenileme', icon: 'calendar', title: t('Yenileme ve vergi'),
    lead: t('TÜFE ortalamasıyla yasal üst sınır hesaplanır. Teklif sınırı aşamaz; kiracı kabul eder ya da görüşmeye çağırır.'),
    items: [
      { title: t('TÜFE üst sınırı'), body: t('12 aylık ortalamayla yasal sınır hesaplanır.') },
      { title: t('Yenileme teklifi'), body: t('Kiracı kabul eder ya da görüşmeye çağırır.') },
      { title: t('Vergi tahmini'), body: t('Götürü ve gerçek gider yöntemi karşılaştırılır.') },
      { title: t('Şirket kiracı ve stopaj'), body: t('Brüt, stopaj ve net ayrı görünür.') }
    ] },
  { id: 'rapor', icon: 'chart', title: t('Giderler ve rapor'),
    lead: t('Emlak vergisi, aidat, sigorta, tamir. Mülk başına yıllık net getiri, ay ay tahsilat ve Excel raporu.'),
    items: [
      { title: t('Gider defteri'), body: t('Vergi, aidat, sigorta ve tamir kayıtları.') },
      { title: t('Net getiri'), body: t('Mülk başına yıllık net getiri ve oran.') },
      { title: t('Excel ve CSV'), body: t('Ödemeler ve giderler ayrı sayfalarda.') },
      { title: t('Rapor e-postası'), body: t('Kurumsal’da her ay ve yıl sonunda genel durum e-postana gelir.') }
    ] },
  { id: 'ekip', icon: 'landlord', title: t('Ekip ve portföy'),
    lead: t('Emlakçını, muhasebecini ya da personelini davet et; her biri yalnızca rolünün izin verdiğini görür. Mülklerini Excel ile tek seferde ekle.'),
    items: [
      { title: t('Ekip üyeleri'), body: t('Emlakçı, muhasebeci ve personel, ücretsiz.') },
      { title: t('Rol ve yetki'), body: t('Kim neyi görür ve değiştirir, baştan belli.') },
      { title: t('İşlem geçmişi'), body: t('Kimin neyi değiştirdiği kayıtlı.') },
      { title: t('Toplu içe aktarma'), body: t('Excel ya da CSV ile mülk ve kiracı listesi.') }
    ] }
];

/** Mülk sahibi paketleri (ana sayfa fiyat kartları). */
export const plans = (yearly = false) => tiers().map((x: any) => ({
  id: x.id,
  name: planLabel(x.id),
  price: priceText(x, yearly),
  per: x.price != null ? (yearly ? t('/ mülk / yıl') : t('/ mülk / ay')) : '',
  monthlyEq: yearly ? monthlyEquivalent(x) : '',
  units: rangeText(x),
  points: tierPoints(x.id),
  best: x.id === 'bes',
  corp: x.id === 'kurumsal',
  vat: x.price != null,
  sub: x.id === 'kurumsal' ? t('Mülk sayına ve sektörüne göre') : undefined
}));

export const faq = () => [
  { q: t('Anahtar nedir?'), a: t('Kiracı ve mülk sahibinin aynı veriye iki taraftan baktığı bir kira yönetimi uygulamasıdır: kira ödemeleri, talepler, belgeler, giriş ve çıkış tutanağı, depozito iadesi, giderler ve sözleşme yenileme tek akışta.') },
  { q: t('Kiracı için ücretli mi?'), a: t('Hayır. Kiracı hesabı her zaman ücretsizdir; dekont yükleyebilir, talep açabilir, mesajlaşabilir ve belgelerine bakabilirsin.') },
  { q: t('Fiyat nasıl hesaplanıyor?'), a: t('Fiyat mülk başınadır ve KDV dahildir: Başlangıç mülk başına ayda ₺99,99, Portföy ₺199,99. 3 mülkün varsa Başlangıç ayda ₺299,97, Portföy ₺599,97 eder. Yıllık ödemede 2 ay ücretsizdir. 1-9 mülk için bu iki paketten birini seçersin; 10 ve üstü mülk için Kurumsal paketle iletişime geçersin.') },
  { q: t('Ücretsiz deneme nasıl işliyor?'), a: CONFIG.billing.cardTrial
    ? t('Her paket 1 ay ücretsiz başlar. Başlamak için kart bilgin ya da App Store / Google Play hesabın gerekir. 1 ayın sonunda iptal etmezsen seçtiğin dönem (aylık ya da yıllık) otomatik başlar ve kartından çekilir; çekimden 1 gün önce e-posta ve bildirimle hatırlatırız. İptal edersen ücret alınmaz, kayıtların silinmez, salt okunur olur.')
    : t('Her paket 1 ay ücretsiz denemeyle başlar; deneme süresince bütün özellikleri kullanabilirsin. Süre bitince kayıtların silinmez, salt okunur olur; okuma ve mesajlaşma açık kalır, kiracının işleri etkilenmez.') },
  { q: t('Paketler arasındaki fark ne?'), a: t('Başlangıç ödeme, talep, belge, tutanak, sözleşme yenileme, hatırlatmalar ve gider kayıtlarını kapsar. Portföy bunlara ekip üyeleri, Excel ile toplu aktarma, net getiri ve yıllık rapor, vergi tahmini ve SMS hatırlatmalarını ekler. İkisi de 1-9 mülk içindir. Kurumsal 10 ve üstü mülk, kurum hesabı ve roller, site yönetimi, ticari portföy modülleri, rapor e-postası ve öncelikli destek içindir; fiyatı bizimle görüşerek belirlenir.') },
  { q: t('Davet kodum yok, ne yapmalıyım?'), a: t('Kayıt olurken kodu boş bırakabilirsin. Hesabını açtıktan sonra ev sahibinden kodu isteyip panelden girersin; ev sahibin henüz anahtar kullanmıyorsa uygulamadan ona WhatsApp ile öneri gönderebilirsin.') },
  { q: t('Yüklediğim dekont ve belgeleri kim görür?'), a: t('Yüklenen dekont, belge ve faturalar anahtar ekibince kontrol edilir; onaylanınca yalnızca o evin kiracısı ve mülk sahibine görünür. Reddedilirse gerekçesiyle haber alırsın.') },
  { q: t('Hangi mülk tiplerini destekliyor?'), a: t('Konut, ofis, mağaza ve depo. Tutanak alanları, talep önerileri ve belge kategorileri mülk tipine göre gelir.') },
  { q: t('Kira artışını nasıl hesaplıyor?'), a: t('TÜFE ortalamasıyla yasal üst sınır hesaplanır; teklif bu sınırı aşamaz. Kiracı kabul eder ya da görüşmeye çağırır.') },
  { q: t('Verimi dışa aktarabilir ya da silebilir miyim?'), a: t('Evet. Ödeme ve giderleri Excel olarak, tüm verini JSON olarak indirebilirsin; hesabını ve sahibi olduğun mülklerin verisini uygulamadan silebilirsin. Silme gibi geri dönüşsüz işler onay ister.') }
];
