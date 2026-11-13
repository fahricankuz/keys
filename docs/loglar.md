# Loglar: neyi nerede tutuyoruz

| Ne | Nerede | Kim görür | Saklama |
| --- | --- | --- | --- |
| Uygulama hataları: yakalanmamış hata, ekran hatası, yakalanan hata (eşitleme, yükleme) | `client_errors` tablosu | Yönetici paneli → Hatalar | 90 gün |
| Edge Function uyarı ve hataları | `function_logs` tablosu | Yönetici paneli → Hatalar → Sunucu kayıtları | 90 gün |
| Edge Function'ların tüm çıktısı (tek satır JSON) | Supabase → Edge Functions → Logs | Supabase hesabı olanlar | Supabase planına bağlı |
| Hata izleme: çökmeler, gruplanmış hatalar, uyarılar, performans (web, telefon, edge fonksiyonlar) | Sentry, AB bölgesi (org `anahtar`) | Sentry hesabında yetkili ekip | Sentry planına bağlı |
| Yöneticinin hassas işlemleri | `admin_audit` tablosu | Yönetici paneli → İşlem kaydı | Silinmez, değiştirilemez |
| E-posta gönderim durumu | `mail_outbox` tablosu | Veritabanı | Otomatik silinmez |
| Yayın ve iş çıktıları | GitHub Actions | Depoya erişenler | GitHub ayarına bağlı |

Site statik olarak Hostinger'da durur; erişim logları hPanel'dedir ve bu düzenin dışındadır.

## Kod yazarken

- **Edge Function:** `console` kullanma. `const log = logger('fonksiyon-adı')` (`_shared/log.ts`), sonra `await log.error('ne oldu', { ayrıntı })`.
  `info` yalnız konsola, `warn` ve `error` tabloya da yazılır (ayrıca Sentry'ye de gider, aşağıya bak). Log işi durdurmaz, hata fırlatmaz. `tests/loglar.spec.mjs` doğrudan `console` kullanımını yakalar.
  Yeni fonksiyonda `Deno.serve` yerine `sentryServe('fonksiyon-adı', async (req) => …)` (`_shared/sentry.ts`) kullan.
- **Uygulama:** Yakalayıp sürdürdüğün hatada `logCaught('Ne başarısız oldu', e)` (`domain/logs.js`). Ağ kopması gibi beklenen hatalar kaydedilmez.

## Kişisel veri

`public.log_redact` iki tabloya yazılan metinden e-posta, telefon, jeton ve parolayı tetikleyiciyle temizler; yazan kim olursa olsun çalışır.
`_shared/log.ts` içindeki `redact` aynı kuralları Supabase konsoluna çıkmadan uygular; `tests/loglar.sql.spec.mjs` ikisini karşılaştırır. Sentry'ye giden veri de **aynı kurallardan** geçer (aşağıda); kural eklerken üçünü birlikte değiştir: `log_redact` (SQL), `_shared/log.ts` ve `app/src/domain/sentry-scrub.js`.
Kullanıcı kimliği (UUID) hata ayıklama için tutulur; hesap silinince `client_errors.user_id` boşalır.

## Sentry (hata izleme)

Sentry, mevcut kayıtlara **ek** olarak çalışır; onların yerini almaz. Hata gruplama, uyarı, çökme ve performans için kullanılır;
`client_errors` ve `function_logs` olduğu gibi sürer ve yönetici paneli → Hatalar yine ana yerdir.

| Proje | Ne izler | Nasıl etkinleşir |
| --- | --- | --- |
| `anahtar-web` | Web sitesi ve web uygulaması (yalnız `anahtar.io`; önizleme ve localhost göndermez) | GitHub değişkeni `SENTRY_DSN_WEB` (derlemede `EXPO_PUBLIC_SENTRY_DSN_WEB`) |
| `anahtar-mobile` | iPhone ve Android uygulaması (yalnız yayın derlemeleri; yerel çökmeler dahil) | EAS ortam değişkeni `EXPO_PUBLIC_SENTRY_DSN_MOBILE` |
| `anahtar-edge` | 9 Edge Function (`sentryServe` sarmalayıcısı; `tufe-sync` için zamanlanmış iş izleme) | Supabase gizli değişkeni `SENTRY_DSN` |

- **Hesap:** Sentry'nin **AB bölgesi** (de.sentry.io), kuruluş `anahtar`. Veri AB'de kalır (KVKK).
- **DSN yoksa** ilgili parça tamamen kapalıdır; uygulama ve fonksiyonlar eskisi gibi çalışır. DSN herkese açık istemci adresidir
  ama yine de belgeye yazılmaz.
- **Kişisel veri (KVKK):** gönderilen her olay `log_redact` ile aynı kurallardan geçer: e-posta, telefon, jeton ve parola
  temizlenir; adreslerin `?sorgu` ve `#parça` kısmı atılır (onay bağlantıları jeton taşır); yol kimlikleri `:id` yapılır.
  Kullanıcı olarak yalnız rastgele kimlik (UUID) gönderilir; e-posta, ad, telefon yok. Sentry'de IP saklama kapalıdır.
  Edge'de istek gövdesi, başlıkları ve çerezler de atılır.
- **Oturum tekrarı (replay), ekran görüntüsü ve ekran hiyerarşisi yoktur.** Konsol çıktısı iz olarak toplanmaz.
- **Kaynak haritaları:** web'de derleme sırasında Sentry'ye yüklenir ve **siteden silinir** (haritalar hiçbir zaman yayına çıkmaz);
  telefonda EAS derlemesi hata ayıklama dosyalarını yükler. Gerekli gizli anahtar (`SENTRY_AUTH_TOKEN`) yalnız GitHub
  sırlarında ve EAS ortamında durur. Yükleme başarısız olsa bile site yayını durmaz.
- **İçerik güvenlik politikası (CSP):** web yalnız Sentry'nin alım adresine bağlanabilir (DSN'den türetilir, başka adres açılmaz).
- **Uyarılar:** yeni sorun, gerileme (regression), ani artış ve telefonda "çökmesiz kullanıcı oranı %98'in altına düşerse";
  ayrıca anahtar.io ve giriş servisi için çalışma süresi izleme ve `tufe-sync` zamanlanmış iş izleme. Bildirim e-postası
  teknik adrese ve `info@anahtar.io`'ya gider.
- **Sınanır:** `tests/sentry-temizlik.spec.mjs` ve `tests/sentry.spec.mjs` (temizlik kurallarının `_shared/log.ts` ile aynı olduğunu, adres parçalarının atıldığını ve web modülünün sözleşmesini denetler; `tests/loglar.sql.spec.mjs` de SQL ile TS'yi karşılaştırır).

## Saklama

`public.prune_logs()` 90 günden eski kayıtları siler; pg_cron varsa her gece 03:15'te (İstanbul) çalışır.
pg_cron açık değilse kayıtlar silinmez: Supabase → Database → Extensions'tan aç ve migration'ı yeniden uygula.
