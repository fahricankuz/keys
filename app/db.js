// Supabase bağlantı denemesi: `node db.js` (app/ klasöründe).
// Uygulama bu dosyayı kullanmaz; bağlantıyı src/domain/config.js kurar.
// Değişkenler: EXPO_PUBLIC_SUPABASE_URL ve EXPO_PUBLIC_SUPABASE_ANON_KEY
// (Supabase'in örneğindeki SUPABASE_URL / SUPABASE_API_KEY adları da kabul edilir).
const { createClient } = require('@supabase/supabase-js');

const url = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_API_KEY;

if (!url || !key) {
  console.error('EXPO_PUBLIC_SUPABASE_URL ve EXPO_PUBLIC_SUPABASE_ANON_KEY tanımlı değil.');
  process.exit(1);
}

const supabase = createClient(url, key);

// Bağlantıyı dene (profiles tablosu supabase/schema.sql ile oluşur; girişsiz istekte boş liste normaldir)
if (require.main === module) {
  supabase
    .from('profiles')
    .select('id')
    .limit(1)
    .then(({ data, error }) => {
      if (error) {
        console.error('Bağlantı hatası:', error);
        process.exit(1);
      }
      console.log('Bağlandı:', data);
    });
}

module.exports = supabase;
