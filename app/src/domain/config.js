/* Sunucu yapılandırması. EXPO_PUBLIC_* değişkenleri derleme sırasında gömülür.
   Boşsa uygulama yerel hesap modunda çalışır: hesap ve veri yalnızca bu
   cihazda durur. Supabase kurulunca (docs/kurulum.md) iki değişkeni doldurun;
   "anon" anahtarı herkese açık olacak şekilde tasarlanmıştır, güvenlik
   veritabanındaki satır düzeyi kurallarla sağlanır. */
export const CONFIG = {
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL || '',
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '',
  publicUrl: 'https://anahtar.io/',
  supportEmail: 'info@anahtar.io',
  /** Hukuki süreç desteği: talep başına, KDV dahil (sunucuda da sabit: schema.sql 22. bölüm). */
  legalPrice: 3000,
  legal: {
    terms: 'https://anahtar.io/kosullar/',
    privacy: 'https://anahtar.io/gizlilik/',
    deletion: 'https://anahtar.io/hesap-silme/',
    support: 'https://anahtar.io/destek/'
  },
  billing: {
    /** Fiyatlar tanımlanana kadar satın alma kapalıdır; herkes deneme ya da yöneticinin verdiği paketle kullanır. */
    paused: true,
    /** Mülk sahibi paketleri: fiyat MÜLK BAŞINA ve KDV dahildir (aylık ve yıllık; yıllık = aylığın 10 katı, 2 ay bedava).
        Başlangıç ve Profesyonel 1–9 mülk içindir (units = en çok satın alınabilecek mülk, maxUnits); 10 ve üstü Kurumsal (teklif).
        İngilizce sitede dolar fiyatları (usd, usdYearly) gösterilir. Her paket 1 ay ücretsiz denemeyle başlar. */
    tiers: [
      { id:'tek', units:9, price:99.99, yearly:999.90, usd:2.00, usdYearly:20.00 },
      { id:'bes', units:9, price:199.99, yearly:1999.90, usd:4.00, usdYearly:40.00 },
      { id:'kurumsal', units:null, minUnits:10, price:null, yearly:null, usd:null, usdYearly:null }
    ],
    /** Kendi kendine satın alınabilecek en çok mülk; üstü Kurumsal. */
    maxUnits: 9,
    /** Kartsız deneme kapatıldığında (sunucuda anahtar.card_trial) deneme yalnızca mağaza / ödeme aboneliğinin
        ücretsiz ayıdır; uygulama metinleri buna göre değişir. Ödeme açılana kadar false kalır. */
    cardTrial: false,
    /** Deneme süresince eklenebilecek mülk sayısı. */
    trialUnits: 5,
    /** Toplu içe aktarmada tek seferde en fazla satır. */
    importMax: 50
  }
};
export const LIVE = !!(CONFIG.supabaseUrl && CONFIG.supabaseAnonKey);
