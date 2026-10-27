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
    /** Mülk sahibi paketleri: mülk sınırı (units; null = sınırsız) ve aylık fiyat (null = henüz yok). */
    tiers: [
      { id:'tek', units:1, price:null },
      { id:'bes', units:5, price:null },
      { id:'kurumsal', units:null, price:null }
    ],
    /** Deneme süresince eklenebilecek mülk sayısı. */
    trialUnits: 5,
    /** Toplu içe aktarmada tek seferde en fazla satır. */
    importMax: 50
  }
};
export const LIVE = !!(CONFIG.supabaseUrl && CONFIG.supabaseAnonKey);
