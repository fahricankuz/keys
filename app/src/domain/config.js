/* Sunucu yapılandırması. EXPO_PUBLIC_* değişkenleri derleme sırasında gömülür.
   Boşsa uygulama yerel hesap modunda çalışır: hesap ve veri yalnızca bu
   cihazda durur. Supabase kurulunca (docs/kurulum.md) iki değişkeni doldurun;
   "anon" anahtarı herkese açık olacak şekilde tasarlanmıştır, güvenlik
   veritabanındaki satır düzeyi kurallarla sağlanır. */
export const CONFIG = {
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL || '',
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '',
  publicUrl: 'https://anahtar.io/',
  /** Tarayıcı anlık bildirimi (Web Push) için VAPID genel anahtarı; boşsa özellik görünmez (docs/mobil.md). */
  vapidPublicKey: process.env.EXPO_PUBLIC_VAPID_PUBLIC_KEY || '',
  supportEmail: 'info@anahtar.io',
  /** Hukuki süreç desteği: talep başına, KDV dahil (sunucuda da sabit: schema.sql 22. bölüm). */
  legalPrice: 3000,
  legal: {
    terms: 'https://anahtar.io/kosullar/',
    privacy: 'https://anahtar.io/gizlilik/',
    deletion: 'https://anahtar.io/hesap-silme/',
    support: 'https://anahtar.io/destek/'
  },
  /** Sakinin aidat / kira ödemesinde kartla ödeme (sanal POS). İşlem ücreti ödeyene yansır: %2 ödeme kuruluşunun komisyonu,
      %0,5 anahtar hizmet bedeli. Ödeme kuruluşu sözleşmesi yapılıp provider yazılana kadar kartla ödeme "yakında" görünür. */
  cardPay: { provider: '', feeRate: 0.025, providerRate: 0.02 },
  billing: {
    /** Telefon uygulamasında mağaza içi satın alma (RevenueCat). Herkese açık SDK anahtarları (gizli değildir):
        RevenueCat → Project settings → API keys → App Store / Play Store uygulaması. Tanımlı değilse telefonda satın alma
        yerine "web'den yönet" bilgisi gösterilmez, paketler yalnız görüntülenir. Web'deki sanal POS bundan etkilenmez. */
    revenuecatIosKey: process.env.EXPO_PUBLIC_RC_IOS_KEY || '',
    revenuecatAndroidKey: process.env.EXPO_PUBLIC_RC_ANDROID_KEY || '',
    /** Satın alma kapalı mı. Gerçek değer sunucudadır (public.app_config → billing_paused; app-config.js okur ve önbelleğe alır);
        bu değer yalnızca sunucu okunamazken kullanılan yedektir. Mağazalar onaylayınca sunucudaki satır false yapılır. */
    paused: true,
    /** Mülk sahibi paketleri: fiyat MÜLK BAŞINA ve KDV dahildir. Fiyatlar mağaza fiyat basamaklarına (",99") hizalıdır:
        Başlangıç ₺99,99 / ay ve ₺999,99 / yıl; Profesyonel ₺199,99 / ay ve ₺1.999,99 / yıl. Telefonda fiyat mağazadan okunur;
        web bu değerleri gösterir. Mağazada girilecek tam fiyat tablosu: node app/scripts/magaza-fiyatlari.mjs
        (kural store-ids.js → storePricePoint: mülk başı fiyat × adet, en yakın ",99" basamağı).
        Başlangıç ve Profesyonel 1–9 mülk içindir (units = en çok satın alınabilecek mülk, maxUnits); 10 ve üstü Kurumsal (teklif).
        İngilizce sitede dolar fiyatları (usd, usdYearly) gösterilir. Deneme mağazada değil sunucudadır: hesap açılınca 30 gün. */
    tiers: [
      { id:'tek', units:9, price:99.99, yearly:999.99, usd:2.00, usdYearly:20.00 },
      { id:'bes', units:9, price:199.99, yearly:1999.99, usd:4.00, usdYearly:40.00 },
      { id:'kurumsal', units:null, minUnits:10, price:null, yearly:null, usd:null, usdYearly:null }
    ],
    /** Kendi kendine satın alınabilecek en çok mülk; üstü Kurumsal. */
    maxUnits: 9,
    /** Mağaza deneme (introductory) teklifi kullanılmaz; deneme yalnızca sunucudaki 30 günlük hesap denemesidir (karar D12).
        Bu yüzden false kalır; true yapmak sunucudaki card_trial_from kesimiyle birlikte ayrı bir karardır. */
    cardTrial: false,
    /** Uygulama mağazası sayfaları (web satın alma sayfası "uygulamadan abone ol" derken bağlantı verir); boşsa düğme çıkmaz.
        Mağaza yayınlanınca derleme değişkenleri doldurulur (EXPO_PUBLIC_APP_STORE_URL / EXPO_PUBLIC_PLAY_STORE_URL). */
    appStoreUrl: process.env.EXPO_PUBLIC_APP_STORE_URL || '',
    playStoreUrl: process.env.EXPO_PUBLIC_PLAY_STORE_URL || '',
    /** Deneme süresince eklenebilecek mülk sayısı. */
    trialUnits: 5,
    /** Toplu içe aktarmada tek seferde en fazla satır. */
    importMax: 50
  }
};
export const LIVE = !!(CONFIG.supabaseUrl && CONFIG.supabaseAnonKey);
