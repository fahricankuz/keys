# Loglar: neyi nerede tutuyoruz

| Ne | Nerede | Kim görür | Saklama |
| --- | --- | --- | --- |
| Uygulama hataları: yakalanmamış hata, ekran hatası, yakalanan hata (eşitleme, yükleme) | `client_errors` tablosu | Yönetici paneli → Hatalar | 90 gün |
| Edge Function uyarı ve hataları | `function_logs` tablosu | Yönetici paneli → Hatalar → Sunucu kayıtları | 90 gün |
| Edge Function'ların tüm çıktısı (tek satır JSON) | Supabase → Edge Functions → Logs | Supabase hesabı olanlar | Supabase planına bağlı |
| Yöneticinin hassas işlemleri | `admin_audit` tablosu | Yönetici paneli → İşlem kaydı | Silinmez, değiştirilemez |
| E-posta gönderim durumu | `mail_outbox` tablosu | Veritabanı | Otomatik silinmez |
| Yayın ve iş çıktıları | GitHub Actions | Depoya erişenler | GitHub ayarına bağlı |

Site statik olarak Hostinger'da durur; erişim logları hPanel'dedir ve bu düzenin dışındadır.

## Kod yazarken

- **Edge Function:** `console` kullanma. `const log = logger('fonksiyon-adı')` (`_shared/log.ts`), sonra `await log.error('ne oldu', { ayrıntı })`.
  `info` yalnız konsola, `warn` ve `error` tabloya da yazılır. Log işi durdurmaz, hata fırlatmaz. `tests/loglar.spec.mjs` doğrudan `console` kullanımını yakalar.
- **Uygulama:** Yakalayıp sürdürdüğün hatada `logCaught('Ne başarısız oldu', e)` (`domain/logs.js`). Ağ kopması gibi beklenen hatalar kaydedilmez.

## Kişisel veri

`public.log_redact` iki tabloya yazılan metinden e-posta, telefon, jeton ve parolayı tetikleyiciyle temizler; yazan kim olursa olsun çalışır.
`_shared/log.ts` içindeki `redact` aynı kuralları Supabase konsoluna çıkmadan uygular; `tests/loglar.sql.spec.mjs` ikisini karşılaştırır, kural eklerken ikisini de değiştir.
Kullanıcı kimliği (UUID) hata ayıklama için tutulur; hesap silinince `client_errors.user_id` boşalır.

## Saklama

`public.prune_logs()` 90 günden eski kayıtları siler; pg_cron varsa her gece 03:15'te (İstanbul) çalışır.
pg_cron açık değilse kayıtlar silinmez: Supabase → Database → Extensions'tan aç ve migration'ı yeniden uygula.
