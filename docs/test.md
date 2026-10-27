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
