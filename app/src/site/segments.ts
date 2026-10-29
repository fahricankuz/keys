/* "Seni en iyi ne tanımlar?" seçenekleri ve her birinin sayfası (/cozumler/<slug>).
   has: bugün üründe olan özellikler. custom: kurumsal kurulumda birlikte yapılandırılan başlıklar (hazır gibi sunulmaz). */
import { t } from '../domain/i18n';

export type Segment = {
  slug: string; name: string; sub: string; icon: string; tone: 'peach' | 'butter' | 'sage' | 'sky';
  title: [string, string, string];          // başlık: önce, vurgulanan sözcük (Tuğla), sonra
  lead: string; plan: 'tek' | 'bes' | 'kurumsal' | 'kiraci'; role?: string;
  pains: [string, string][]; has: string[]; custom?: string[];
};

export const segments = (): Segment[] => [
  { slug: 'mulk-sahibi', name: t('Mülk sahibi'), sub: t('1 mülk'), icon: 'home', tone: 'peach', plan: 'tek',
    title: [t('Tek mülkün kirasını'), t('düzenle'), t('takip et.')],
    lead: t('Kira, dekont, arıza ve sözleşme tarihleri kiracınla aynı ekranda. Hatırlatmalar kendiliğinden gider.'),
    pains: [[t('Dekont peşinde koşmak'), t('Kira yattı mı, eksik mi diye her ay mesajlaşmak.')],
            [t('Unutulan tarihler'), t('Sözleşme yenileme, kira artışı ve DASK tarihleri gözden kaçıyor.')],
            [t('Dağınık yazışmalar'), t('Arıza fotoğrafları ve belgeler WhatsApp’ta kayboluyor.')]],
    has: [t('Ödeme ve dekont takibi, kısmi ödeme'), t('Arıza ve tadilat talepleri, mesajlaşma'), t('Belge arşivi, giriş ve çıkış tutanağı'), t('Kira, DASK ve sözleşme hatırlatmaları'), t('Yasal kira artışı hesabı')] },
  { slug: 'portfoy', name: t('Mülk sahibi'), sub: t('1-9 mülk'), icon: 'grid', tone: 'butter', plan: 'bes',
    title: [t('Birden fazla mülkü'), t('tek'), t('ekrandan yönet.')],
    lead: t('Tüm mülklerin tahsilatı, gideri ve net getirisi bir arada. Emlakçını ve muhasebecini ekibine kat.'),
    pains: [[t('Excel karmaşası'), t('Her mülk için ayrı tablo, ayrı hesap.')],
            [t('Gider ve vergi'), t('Yıl sonunda gider ve kira gelirini toplamak saatler alıyor.')],
            [t('Yardımcılarla çalışmak'), t('Emlakçı ve muhasebeciye ne kadar erişim verileceği belirsiz.')]],
    has: [t('Gider defteri ve mülk başına net getiri'), t('Yıllık rapor, Excel ve vergi tahmini'), t('Ekip üyeleri: emlakçı, muhasebeci, personel'), t('Excel / CSV ile toplu mülk aktarma'), t('Tüm hatırlatmalar tek takvimde')] },
  { slug: 'kiraci', name: t('Kiracı'), sub: t('her zaman ücretsiz'), icon: 'key', tone: 'sage', plan: 'kiraci',
    title: [t('Kiranı'), t('kolayca'), t('öde, kayıt altında tut.')],
    lead: t('Dekontunu yükle, arızayı fotoğrafla bildir, sözleşmen ve belgelerin hep yanında olsun. Kiracı hesabı ücretsizdir.'),
    pains: [[t('Ödemenin kanıtı'), t('Hangi ay ne ödendiği sonradan tartışma konusu oluyor.')],
            [t('Arıza bildirimi'), t('Talebin görülüp görülmediğini bilmemek.')],
            [t('Depozito iadesi'), t('Çıkışta kesintilerin gerekçesi belirsiz kalıyor.')]],
    has: [t('Dekont yükleme ve ödeme geçmişi'), t('Fotoğraflı arıza talebi ve durum takibi'), t('Giriş ve çıkış tutanağı, depozito iadesi'), t('Kira günü ve sözleşme hatırlatmaları'), t('Mülk sahibinle mesajlaşma')] },
  { slug: 'emlak-ofisi', name: t('Emlak ofisi'), sub: t('Kurumsal'), icon: 'office', tone: 'sky', plan: 'kurumsal', role: 'Emlak ofisi',
    title: [t('Yönettiğin her mülk'), t('tek'), t('panelde.')],
    lead: t('Kira, dekont ve talepleri tek yerde topla; mülk sahiplerine her ay düzenli rapor gönder.'),
    pains: [[t('Dağınık takip'), t('Kira, dekont ve arıza bilgisi WhatsApp, Excel ve defter arasında kayboluyor.')],
            [t('Mülk sahibine hesap verme'), t('Her ay hangi kiranın yattığını tek tek sormak zaman alıyor.')],
            [t('Ekip içi düzen'), t('Danışmanların hangi mülkte ne yaptığını görmek zor.')]],
    has: [t('Sınırsız mülk ve ekip üyesi, rol bazlı yetki'), t('Excel ile toplu mülk ve kiracı aktarımı'), t('Mülk sahibine aylık ve yıllık rapor e-postası'), t('Kiracıyla ortak dekont, talep ve belge akışı'), t('İşlem kaydı')],
    custom: [t('Komisyon ve hizmet bedeli kalemleri'), t('Mülk sahibi başına ayrı rapor ve fatura'), t('Portföy listenizin taşınması')] },
  { slug: 'site-yonetimi', name: t('Site ve bina yönetimi'), sub: t('Kurumsal'), icon: 'grid', tone: 'sage', plan: 'kurumsal', role: 'Site / bina yönetimi',
    title: [t('Bloklar, daireler,'), t('kiracılar'), t('tek yerde.')],
    lead: t('Kiralık dairelerin kiracı iletişimini ve taleplerini yönetim ekibinizle birlikte yönetin.'),
    pains: [[t('Kiracı ve malik karmaşası'), t('Hangi dairede kimin oturduğu güncel değil.')],
            [t('Talep yükü'), t('Talepler telefonla geliyor, kimin ilgilendiği izlenemiyor.')],
            [t('Belge dağıtımı'), t('Sözleşme ve tutanaklar farklı yerlerde duruyor.')]],
    has: [t('Fotoğraflı talep akışı: açıldı, görüldü, işlemde, çözüldü'), t('Kiracıyla mesajlaşma ve belge arşivi'), t('Giriş ve çıkış tutanağı'), t('Ekip üyeleri ve yetkiler'), t('Sözleşme, DASK ve tahliye hatırlatmaları')],
    custom: [t('Blok / daire hiyerarşisi'), t('Aidat ve ortak gider dağıtımı'), t('Yönetim kurulu raporu')] },
  { slug: 'avm', name: t('AVM'), sub: t('Kurumsal'), icon: 'shop', tone: 'peach', plan: 'kurumsal', role: 'AVM',
    title: [t('Mağaza kiralarını'), t('tek'), t('panelde izleyin.')],
    lead: t('Mağaza kiraları, stopaj, sözleşme yenilemeleri ve kiracı talepleri bir arada; yönetime düzenli rapor.'),
    pains: [[t('Çok sayıda ticari sözleşme'), t('Farklı vade ve yenileme tarihleri gözden kaçıyor.')],
            [t('Stopaj ve brüt/net kira'), t('Stopaj hesabı ve tahsilat mutabakatı zaman alıyor.')],
            [t('Kiracı talepleri'), t('Teknik talepler ve onaylar dağınık yürüyor.')]],
    has: [t('Mağaza tipi mülk ve yüzde 20 stopaj hesabı'), t('Sözleşme yenileme ve yasal artış sınırı'), t('Mağaza bazında tahsilat ve gecikme takibi'), t('Talep, teklif ve fatura akışı'), t('Aylık ve yıllık rapor e-postası')],
    custom: [t('Ciroya bağlı kira'), t('Ortak alan gideri dağıtımı'), t('Doluluk ve kiracı karması raporu')] },
  { slug: 'gyo', name: t('GYO'), sub: t('Kurumsal'), icon: 'chart', tone: 'butter', plan: 'kurumsal', role: 'GYO',
    title: [t('Portföyün tamamını'), t('net'), t('görün.')],
    lead: t('Konut, ofis, mağaza ve depo portföyünüzde tahsilatı, getiriyi ve sözleşme takvimini tek ekranda izleyin.'),
    pains: [[t('Portföy görünürlüğü'), t('Doluluk, tahsilat ve getiri farklı tablolarda.')],
            [t('Raporlama yükü'), t('Yönetim raporları için veri her ay elle toplanıyor.')],
            [t('Denetim izi'), t('Kimin hangi kaydı değiştirdiğini göstermek gerekiyor.')]],
    has: [t('Mülk başına brüt kira, gider ve net getiri'), t('Aylık ve yıllık rapor e-postası'), t('İşlem kaydı ve rol bazlı yetki'), t('Excel / CSV dışa ve içe aktarma'), t('Konut, ofis, mağaza ve depo tek portföyde')],
    custom: [t('Değerleme ve doluluk panosu'), t('Yatırımcı raporlarına uygun çıktı'), t('Kurumsal sistemlerle bağlantı (API)')] },
  { slug: 'depo-lojistik', name: t('Depo ve lojistik'), sub: t('Kurumsal'), icon: 'box', tone: 'sky', plan: 'kurumsal', role: 'Şirket',
    title: [t('Uzun sözleşmeleri'), t('kaçırmadan'), t('yönetin.')],
    lead: t('Depo kiralarını, uzun vadeli sözleşmeleri ve sigorta tarihlerini tek yerden izleyin.'),
    pains: [[t('Uzun vadeli sözleşmeler'), t('Yenileme ve artış tarihleri yıllar sonra gelir, unutulur.')],
            [t('Alan bazlı kira'), t('Kiralar m² üzerinden belirlenir, değişiklikler izlenmez.')],
            [t('Sigorta ve belgeler'), t('Poliçe ve tutanak tarihleri farklı yerlerde.')]],
    has: [t('Depo tipi mülk ve m² bilgisi'), t('Sözleşme, sigorta ve belge hatırlatmaları'), t('Kira geçmişi ve yasal artış hesabı'), t('Kiracı şirket ve stopaj bilgisi'), t('Toplu içe aktarma')],
    custom: [t('m² başına kira ve endeksleme'), t('Döviz bazlı kira takibi'), t('Çok lokasyonlu portföy görünümü')] },
  { slug: 'family-office', name: t('Family office'), sub: t('Kurumsal'), icon: 'safe', tone: 'sage', plan: 'kurumsal', role: 'Mülk sahibi / yatırımcı',
    title: [t('Aile mülklerini'), t('tek'), t('çatı altında toplayın.')],
    lead: t('Farklı kişi ve şirketler adına tutulan mülklerin kirasını, giderini ve vergisini tek yerde görün.'),
    pains: [[t('Birden çok sahip'), t('Mülkler farklı kişi ve şirketler adına kayıtlı.')],
            [t('Vergi hazırlığı'), t('Kira geliri beyanı için veri yıl sonunda toplanıyor.')],
            [t('Danışman erişimi'), t('Muhasebeci ve emlakçının erişimi kontrolsüz.')]],
    has: [t('Gider defteri, net getiri ve vergi tahmini'), t('Aylık ve yıllık rapor e-postası'), t('Sınırlı yetkili ekip erişimi'), t('Belge arşivi ve hatırlatmalar'), t('Excel dışa aktarma')],
    custom: [t('Sahip ve şirket bazında gruplama'), t('Birden çok vergi numarası için ayrı özet'), t('Size özel kurulum ve veri taşıma')] }
];

export const SEGMENT_SLUGS = ['mulk-sahibi', 'portfoy', 'kiraci', 'emlak-ofisi', 'site-yonetimi', 'avm', 'gyo', 'depo-lojistik', 'family-office'];
