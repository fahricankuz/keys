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
  legal: {
    terms: 'https://anahtar.io/kosullar/',
    privacy: 'https://anahtar.io/gizlilik/',
    deletion: 'https://anahtar.io/hesap-silme/',
    support: 'https://anahtar.io/destek/'
  },
  billing: {
    /** Fiyatlar tanımlanana kadar satın alma kapalıdır; herkes deneme ya da yöneticinin verdiği paketle kullanır. */
    paused: true,
    /** Mülk sahibi paketleri: mülk sınırı (units; null = sınırsız), aylık fiyat (null = teklif) ve yıllık fiyat
        (aylığın 10 katı: 2 ay bedava). İngilizce sitede dolar fiyatları (usd, usdYearly) gösterilir.
        Her paket 1 ay ücretsiz denemeyle başlar. */
    tiers: [
      { id:'tek', units:1, price:249.99, yearly:2499.90, usd:4.99, usdYearly:49.90 },
      { id:'bes', units:5, price:999.99, yearly:9999.90, usd:19.99, usdYearly:199.90 },
      { id:'kurumsal', units:null, price:null, yearly:null, usd:null, usdYearly:null }
    ],
    /** Deneme süresince eklenebilecek mülk sayısı. */
    trialUnits: 5,
    /** Toplu içe aktarmada tek seferde en fazla satır. */
    importMax: 50
  }
};
export const LIVE = !!(CONFIG.supabaseUrl && CONFIG.supabaseAnonKey);
