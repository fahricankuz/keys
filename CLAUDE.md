# anahtar: Claude için proje kuralları

## Veritabanı değişiklikleri = yeni migration
- Veritabanını değiştiren her iş (tablo, sütun, işlev, politika, tetikleyici, yayın ayarı) için **yeni bir migration** aç:
  `npm run db:yeni -- kisa_ad` → `supabase/migrations/<zaman>_<ad>.sql`. SQL'i o dosyaya yaz, sonra `npm run db:derle`.
- `supabase/schema.sql` **üretilmiş özettir**: elle düzenleme, sonuna ekleme yapma (`tests/migrations.spec.mjs` kırılır).
- Uygulanmış bir migration dosyasını **değiştirme**; hata varsa yeni bir migration ile düzelt.
- SQL **yeniden çalıştırılabilir** olsun (`if not exists`, `create or replace`, `drop … if exists`); testler şemayı iki kez çalıştırır.
- Yeni tabloda RLS'i ve politikaları aynı migration'da yaz. Dışarıdan çağrılan yeni işlevi `tests/qa-db.spec.mjs` izin listesine ekle.
- Migration eski kodla da çalışmalı (birleştirme siteyi migration'dan önce yayınlar); silme/yeniden adlandırma ayrı, sonraki PR'da.
- Her migration'a değişikliği deneyen bir test ekle. Yerelde yalnız ilgili testleri Node 22 ile ve süre sınırıyla çalıştır; tam set CI'da.
- Uygulama yalnızca Actions → "Veritabanı migration" ile, ana daldan, şu sırayla: staging `plan` → staging `apply` → production `plan`
  → production `apply`. Her `apply` öncesi `plan` çıktısını kullanıcıya göster ve açık onay al. `supabase link` kullanma.
- Yayın mesajında kullanıcıya bu dört adımı yaz; Edge Function değiştiyse `supabase functions deploy <ad>` adımını da ekle.
- Ayrıntı ve teknik olmayan anlatım: `docs/migrations.md`.

## Yayın
- Kullanıcının açık onayı olmadan yayına alma (PR birleştirme). Yayın testlere bağlıdır (`.github/workflows/hostinger.yml`).
- Yan etkili işlerde (Supabase, e-posta, bildirim kurulumu) kullanıcının yapacağı adımları sırayla yaz.

## Dil ve ton
- Kullanıcıyla Türkçe konuş; kullanıcıya görünen metinler Türkçe, İngilizce karşılıkları `app/src/domain/en-*.js` içinde.
