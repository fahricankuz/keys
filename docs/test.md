# Test ve kalite güvencesi

Hepsini çalıştırmak: `npx playwright test` (ilk çalıştırmada uygulama derlenir, birkaç dakika sürer).
Yalnızca bir grup: `npx playwright test tests/qa-db.spec.mjs` gibi.

| Tür | Dosya | Ne sınanır |
| --- | --- | --- |
| **Birim** (beyaz kutu) | `tests/qa-unit.spec.mjs` | Kira mantığı (vade, dönem, ödenmemiş, stopaj, kira geçmişi), tarih/para biçimleri, yönetici özeti, eşitleme farkı. Tarayıcısız, Node'da. |
| **Entegrasyon** | `tests/qa-unit.spec.mjs`, `tests/app-admin.spec.mjs`, `tests/live.spec.mjs` | Eşitleme katmanı ↔ sahte Supabase, yönetici akışları, giriş/kayıt. |
| **Veritabanı** | `tests/sql.spec.mjs`, `tests/admin.sql.spec.mjs`, `tests/qa-db.spec.mjs` | Gerçek Postgres (PGlite): satır düzeyi güvenlik, yetki ihlali denemeleri, yasaklama, denetim kaydı, hatırlatmalar. |
| **Performans** | `tests/qa-app.spec.mjs`, `tests/qa-db.spec.mjs` | Ana sayfa bütçesi (görünme, LCP, betik boyutu, istek sayısı), etkileşim süresi; 30.000 mesaj/400 mülk altında sorgu süresi ve dizin kullanımı. |
| **Stres** | `tests/qa-app.spec.mjs`, `tests/qa-db.spec.mjs` | 1.500 mesajlık yazışma, çift tıklama, hızlı gezinme; hacimli veride yasak ve yönetici sorguları. |
| **Kurtarma** | `tests/qa-app.spec.mjs`, `tests/qa-db.spec.mjs` | Sunucu yazmayı reddederken/çevrimdışıyken veri kaybı yok, çevrimdışı açılış, şema üç kez çalıştırma, yarıda kesilen işlem geri alınır. |
| **Uygunluk** | `tests/qa-db.spec.mjs`, `tests/qa-app.spec.mjs`, `tests/i18n.spec.mjs` | Her tabloda RLS, search_path, dışarıdan çağrılabilen işlevler listesi; manifest, dil, başlık, CSP; İngilizce çeviri tamlığı. |
| **Kullanılabilirlik** | `tests/qa-app.spec.mjs` | axe (WCAG 2 A/AA) tüm ana ekranlarda, açık ve koyu temada; dokunma hedefi, klavye, anlaşılır hata iletileri. |
| **Güvenlik** | `tests/qa-app.spec.mjs`, `tests/qa-db.spec.mjs` | XSS, yetkisiz rota, yetki yükseltme, IDOR, sahte bildirim/denetim sıfırlama, SQL enjeksiyonu metni. |
| **Kabul** | `tests/qa-app.spec.mjs` | Uçtan uca yolculuk: mülk sahibi kaydı → mülk → davet → kiracı kaydı → dekont → yönetici onayı → mülk sahibi görür. |
| **Regresyon** | tüm paket | Her değişiklikte hepsi birlikte çalışır (CI: `.github/workflows/ci.yml`). |

## Bu turda bulunup düzeltilen hatalar

1. **Güvenlik (kritik):** `notify_members`, `upsert_review`, `prop_name` işlevleri Supabase'te herkese açıktı ve satır düzeyi güvenliği aşıyordu: yabancı biri bir mülkün üyelerine sahte bildirim gönderebilir, bir yüklemenin onayını sıfırlayabilirdi. Dışarıdan çağrı kapatıldı; izinli işlev listesi artık testle kilitli.
2. **Veri kaybı:** Sunucuya yazılamayan değişiklik (ör. mesaj), sayfa yenilenince sunucu verisiyle ezilip kayboluyordu. Sunucuda bilinen son hal artık cihazda da tutuluyor; bekleyen değişiklik önce gönderiliyor, gönderilemezse yerel veri korunuyor ve otomatik yeniden deneniyor.
3. **Çevrimdışı açılış:** Bağlantı yokken uygulama kayıtlı veriyle açılmıyor, giriş ekranına atıyordu. Artık önbellekten açılır.
4. **Yanlış gecikme:** Ayın 25'inde başlayan sözleşmeye ayın 5'i vadeli ilk kira "20 gün gecikti" diye görünüyordu (hem ekranda hem günlük hatırlatma işinde). Vade ilk ayda sözleşme başlangıcından önceye düşmez.
5. **Ay sonu hatası:** Ayın 29-31'inde "ay ekle/çıkar" hesabı bir sonraki aya taşıyor, geçmiş ay listelerinde ay yinelenip biri atlanıyordu.
6. **Erişilebilirlik:** Sayfalarda `<title>` yoktu; onay kutusu ve seçeneklerde `aria-checked` eksikti; "Ödendi/Gecikti/vurgu" metinleri ve koyu temadaki ana sayfa etiketleri kontrast eşiğinin altındaydı; dil ve alt bağlantılar dokunma hedefi olarak küçüktü; 12 aylık şeridin etiketi geçersizdi.
7. **Boyut:** Derlemeye kullanılmayan 30 yazı tipi dosyası (≈14 MB) giriyordu; derleme sonrası siliniyor.

## Yayın kapısı ve ek denetimler

- **Yayın testlere bağlıdır.** `hostinger.yml` önce `ci.yml`'deki bütün testleri çalıştırır; geçmezse site paketi üretilmez ve `site` dalı güncellenmez
  (yayın yaklaşık 6-8 dakika gecikir). Acil durumda Actions → *Hostinger paketi* → *Run workflow* → **testleri atla** işaretlenerek elle paketlenebilir.
- **Safari (WebKit).** `.github/workflows/safari.yml` "@mobil" etiketli testleri iPhone 14 profiliyle Safari motorunda çalıştırır. Yayını engellemez,
  sonucu Actions'ta görünür; sürekli yeşil olunca `hostinger.yml` içinde `needs` listesine eklenerek engelleyici yapılabilir.
  Yerelde çalıştırmak için: `npx playwright install webkit` sonra `WEBKIT=1 npx playwright test --project=safari`.
- **Telefon testleri.** `tests/mobil-sohbet.app.spec.mjs` (sohbet düzeni telefona sığar, büyük fotoğraf küçültülür, tik çıkar, bozuk dosyada uyarı).
  Yeni telefon testlerine başlıkta `@mobil` yaz; hem Pixel 7 hem Safari işinde koşar.
- **Gerçek cihaz listesi:** [gercek-cihaz-kontrol.md](gercek-cihaz-kontrol.md). **Yük testi (k6):** `yuk/mesajlasma.k6.js` (yalnız deneme projesinde).

## Bilinen boşluklar ve nasıl kapatılır

| Boşluk | Neden yok | Nasıl yapılır |
| --- | --- | --- |
| Gerçek Supabase'e karşı deneme (Realtime, Storage, RLS) | Ayrı deneme (staging) projesi ve gizli anahtarlar gerekir | Supabase'te ikinci bir proje aç, `schema.sql`'i çalıştır; GitHub'a `STAGING_SUPABASE_URL` ve `STAGING_ANON_KEY` değişkenlerini ekle; mesaj gönder → Realtime ile alındı mı, fotoğraf yüklendi mi diye bakan küçük bir Playwright testi yaz |
| Edge Function testleri (`push`, `billing`, `report`, `tufe-sync`) | Bu ortamda Deno yok; fonksiyonlar Deno API'sine bağlı | Deno kur, `supabase/functions/<ad>/index_test.ts` yaz, `deno test` ile çalıştır; önce `panelPath` gibi saf işlevleri ayrı dosyaya çıkar |
| Kod kapsamı (coverage) ölçümü | Testler Playwright işçi süreçlerinde ve paketlenmiş kodla çalışıyor; `c8` kaynak dosyaları göremedi (denendi, %0 raporladı) | Birim testleri Vitest'e taşıyıp `vitest --coverage` kullan, ya da tarayıcı tarafı için Playwright `page.coverage` (V8) ile `monocart-coverage-reports` |
| Üretimde hata izleme | Sentry/benzeri hesap ve DSN gerekir | sentry.io'da proje aç, DSN'i al; `@sentry/react` yükleyip `app/src/app/_layout.tsx` başında `Sentry.init({ dsn })` çağır |
| Görsel regresyon | Ekran görüntüsü karşılaştırması yazı tipi ve işletim sistemi farkında yanlış alarm verebilir | `expect(page).toHaveScreenshot()` ile birkaç kritik ekranı CI'da (Ubuntu) üretilen referansla karşılaştır; referansları CI'dan al |
| Tarihe bağlı 1 test (AVM ciro ayı) | Bazı günlerde "geçen ay" hesabı farklı çıkıyor; nedeni henüz kesinleşmedi | Playwright `page.clock.setFixedTime('2026-10-29')` ile tarihi sabitleyip sorunu yeniden üret |

