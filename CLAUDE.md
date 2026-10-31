# anahtar: Claude için proje kuralları

## Veritabanı değişiklikleri = yeni migration
- Veritabanını değiştiren her iş (tablo, sütun, işlev, politika, tetikleyici, yayın ayarı) için **yeni bir migration** aç:
  `npm run db:yeni -- kisa_ad` → `supabase/migrations/<zaman>_<ad>.sql`. SQL'i o dosyaya yaz, sonra `npm run db:derle`.
- `supabase/schema.sql` **üretilmiş özettir**: elle düzenleme, sonuna ekleme yapma (`tests/migrations.spec.mjs` kırılır).
- Uygulanmış bir migration dosyasını **değiştirme**; hata varsa yeni bir migration ile düzelt.
- SQL **yeniden çalıştırılabilir** olsun (`if not exists`, `create or replace`, `drop … if exists`); testler şemayı iki kez çalıştırır.
- Yeni tabloda RLS'i ve politikaları aynı migration'da yaz. Dışarıdan çağrılan yeni işlevi `tests/qa-db.spec.mjs` izin listesine ekle.
- Her yayın mesajında kullanıcıya söyle: önce migration'ı uygula (GitHub → Actions → "Veritabanı migration" ya da `supabase db push`),
  sonra siteyi güncelle; fonksiyon değiştiyse `supabase functions deploy <ad>` de gerekir.
- Ayrıntı: `docs/migrations.md`.

## Yayın
- Kullanıcının açık onayı olmadan yayına alma (PR birleştirme). Yayın testlere bağlıdır (`.github/workflows/hostinger.yml`).
- Yan etkili işlerde (Supabase, e-posta, bildirim kurulumu) kullanıcının yapacağı adımları sırayla yaz.

## Dil ve ton
- Kullanıcıyla Türkçe konuş; kullanıcıya görünen metinler Türkçe, İngilizce karşılıkları `app/src/domain/en-*.js` içinde.
