# Veritabanı değişiklikleri (migration)

## Kısaca
Veritabanında bir şeyi değiştirmek (yeni tablo, yeni sütun, bir kuralı düzeltmek) için SQL'i doğrudan Supabase'e yazmıyoruz.
Değişikliği **bir dosyaya** yazıyoruz: `supabase/migrations/` klasöründe, adı tarihle başlayan bir `.sql` dosyası. Buna *migration* denir.

- Her değişiklik ayrı bir dosyadır ve **sırayla** uygulanır.
- Supabase hangi dosyaları uyguladığını kendi defterine yazar; aynı dosyayı iki kez uygulamaz.
- Böylece "canlıda ne var, ne yok" sorusu her zaman cevaplanabilir.

İki veritabanımız var:

| Ortam | Supabase projesi | Ne için |
|---|---|---|
| **staging** | `anahtar-staging` | Deneme. Önce buraya uygulanır; gerçek kullanıcı yok. |
| **production** | `anahtar-database` | Canlı site ve uygulama. Staging'de sorun çıkmazsa buraya uygulanır. |

Staging'de pg_cron, pg_net ve Vault eklentileri yoktur; bu yüzden eklentilere bağlı kısımlar (webhook tetikleyicileri ve zamanlanmış
işler, örn. `kasa_sirlari`) orada atlanır ve yalnız yardımcı işlevler kurulur. Staging planı bu kısımlar için temsil edici değildir:
asıl doğrulama production'da, aşağıdaki "Uygulamadan sonra kontroller" ile yapılır.

## 1. Yeni bir değişiklik hazırlamak (geliştirici)
```bash
npm run db:yeni -- kisa_ad      # supabase/migrations/<tarih>_kisa_ad.sql dosyasını açar
# dosyaya SQL'i yaz
npm run db:derle                # supabase/schema.sql özetini günceller (elle düzenlenmez)
nvm use 22 && npx playwright test tests/sql.spec.mjs tests/qa-db.spec.mjs tests/migrations.spec.mjs
```
Sonra PR aç; CI yeşil olunca birleştir. **Birleştirmek veritabanını değiştirmez**: sadece dosya ana dala girer ve site yayınlanır.

SQL yazarken:
- **Tekrar çalıştırılabilir** yaz: `create table if not exists`, `create or replace function`, `drop policy if exists …; create policy …`, `add column if not exists`.
- **Eski kodla da çalışsın:** site, migration'dan birkaç dakika önce yayına çıkar. Sütun ekle; silme ya da adını değiştirme işini ayrı ve sonraki bir PR'da yap.
- Yeni tabloda RLS'i aç ve politikaları aynı dosyada yaz. Kullanıcının kendi satırını güncellediği tablolarda izin verilen sütunları sınırla (`grant update (sütunlar) …`).
- Dosyaya parola, anahtar ya da kişisel veri yazma. Gizli değer gerekiyorsa Supabase **Vault**'a SQL Editor'den eklenir ve migration yalnız kaydın **adını**
  okur (örnek: `kasa_sirlari`); kayıt eksikse migration hiçbir şeyi değiştirmeden hata vermelidir.
- Yeni `SECURITY DEFINER` işlev varsayılan olarak oturumsuz (`anon`) çağrıya kapalıdır; dışarıdan oturumsuz çağrılması gerekiyorsa `tests/qa-db.spec.mjs` izin listesine ekle.
- Eski istemciyi bozacak kapatma (bir yazma yolunu, politikayı ya da sütunu kaldırma) ayrı bir **takip migration**'ıdır; yeni site yayında olmadan uygulanmaz (aşağıda).
- Değişikliği deneyen bir **test** ekle.
- **Uygulanmış bir dosyayı asla düzenleme.** Hata varsa yeni bir migration yaz.

## 2. Değişikliği uygulamak (teknik bilgi gerekmez)
GitHub'da: **Actions** → soldan **Veritabanı migration** → sağda **Run workflow**. Açılan pencerede iki seçim var:

- **environment:** `staging` ya da `production`
- **mode:** `plan` (sadece gösterir, hiçbir şeyi değiştirmez) ya da `apply` (uygular)

Her yeni migration için bu sırayla dört kez çalıştır:

| # | environment | mode | Ne görmelisin |
|---|---|---|---|
| 1 | staging | plan | "Would push these migrations:" altında **sadece yeni dosya** |
| 2 | staging | apply | "Applying migration …" ve yeşil tik |
| 3 | production | plan | Yine sadece yeni dosya |
| 4 | production | apply | "Applying migration …" ve yeşil tik |

Sonra istersen bir kez daha `plan`: "Remote database is up to date" yazmalı (bekleyen iş yok).

- Bir adım kırmızı biterse **devam etme**; logu geliştiriciye gönder. Kırmızı biten bir `apply` hiçbir şeyi yarım bırakmaz.
- Production'da onay açıksa iş "Waiting" bekler: **Review deployments → Approve**.
- Veri silen ya da değiştiren bir migration'da 4. adımdan önce yedek alınır (geliştirici `pg_dump` ile alır).
- Edge Function da değiştiyse geliştirici ayrıca `supabase functions deploy <ad>` çalıştırır. **Sürüm sırası:** birleştir → değişen edge fonksiyonları (yeni gizli değerler
  önce Vault'a ve `supabase secrets set` ile girilmiş olarak) → bu dört adım (staging, sonra production; production `apply`'dan önce plan çıktısı gösterilir ve onay alınır) →
  uygulamadan sonra kontroller → takip migration PR'ı. Tam sıra: [canliya-alma.md](canliya-alma.md) bölüm 6.

## Uygulamadan sonra kontroller
Production `apply`'dan sonra, gizli değerler ve zamanlanmış işler için (hepsi yalnız okur; **hiçbir sorguda `decrypted_secret` seçme**, değerler ekrana ya da sohbete düşmesin).
Supabase SQL Editor'de:

```sql
-- 1) Vault'ta beklenen 7 kayıt (yalnız adlar): anahtar_billing_secret, anahtar_functions_url, anahtar_lead_secret,
--    anahtar_mail_secret, anahtar_push_secret, anahtar_report_secret, anahtar_tufe_secret
select name from vault.secrets where name like 'anahtar\_%' order by name;

-- 2) Tetikleyicilerde düz metin gizli değer, JWT ya da eski webhook yöntemi kalmadı → 0 satır
select tgrelid::regclass as tablo, tgname from pg_trigger
 where not tgisinternal and pg_get_triggerdef(oid) ~* '(eyJ|bearer|authorization|http_request)';

-- 3) Zamanlanmış işlerde düz metin gizli değer ya da JWT yok → 0 satır
select jobname from cron.job where command ~* '(eyJ|bearer|authorization)';

-- 4) Zamanlanmış işler kurulu: mail-sweep, rapor-aylik, rapor-yillik, tufe-sync-aylik, billing-reconcile, cron-prune (+ mevcutlar)
select jobname, schedule from cron.job where jobname like 'anahtar-%' or jobname like 'tufe-%' order by jobname;

-- 5) Son 1 saatteki webhook ve zamanlanmış çağrıların durumu: 200 beklenir (401 ise fonksiyondaki gizli değer Vault'takiyle aynı değil)
select status_code, count(*) from net._http_response where created > now() - interval '1 hour' group by 1;

-- 6) Ödeme kapalı bayrağı (mağazalar onaylayana kadar true)
select key, value from public.app_config where key = 'billing_paused';
```

Sonra bir deneme: uygulamadan bir destek talebi gönder ya da test hesabına bir bildirim düşür; Supabase → Edge Functions → Logs'ta `lead-mail` / `push`
çağrısının 200 döndüğünü gör. Yanıtlar 401 ise ilgili fonksiyonun gizli değeri ile Vault kaydını **aynı yeni değere** eşitle (değeri konuşmaya yazmadan), migration'ı yeniden uygula.

## Sonra uygulanacak (takip) migration'lar
Bazı değişiklikler yayındaki eski istemciyi bozar: bir yazma yolunu kapatmak gibi. Böyle bir migration'ın ilk satırlarında "yalnız yeni site yayına çıktıktan sonra uygulanır" uyarısı bulunur
(örnek: `sistem_mesaji_kapat`, sohbete doğrudan "sistem" satırı yazma yolunu kapatır). Bunlar asıl sürümle **birlikte uygulanmaz**; ayrı bir takip PR'ıyla (`specs/followup-migrations`) gelir:
1. Yeni site yayında ve çalışıyor (yayındaki paket yeni sürüm; örn. `post_system_message` bundle'da geçiyor).
2. Yayından sonra **en az 24 saat** geçmiş (önbellekteki ya da açık kalmış eski istemciler yenilensin).
3. Aynı dört adım: staging plan → apply → production plan → apply (her production `apply` öncesi plan çıktısı gösterilir ve onay alınır).

## 3. Neyin uygulandığını görmek
- **Supabase panelinde:** proje → **Database** → **Migrations**. Uygulanmış her dosya burada listelenir. Asıl kayıt budur.
- **GitHub'da:** **Actions** → **Veritabanı migration**: kim, ne zaman, hangi ortamda, hangi modda çalıştırmış. (GitHub logları 90 gün tutar.)
- **SQL Editor'de:** `select version, name from supabase_migrations.schema_migrations order by version;`

## Sık sorunlar
| Görünen | Anlamı / çözüm |
|---|---|
| "SUPABASE_DB_URL boş" | O ortamda bağlantı adresi yok. Settings → Environments → ortam → `SUPABASE_DB_URL` secret'ı. |
| "SUPABASE_TARGET değişkeni … değil" | Ortamın `SUPABASE_TARGET` variable'ı ortam adıyla aynı olmalı (`staging` / `production`). |
| "şema var ama baseline … kayıtlı değil" | Bu veritabanı migration defterine hiç bağlanmamış. O ortamda bir kez `adopt-existing-baseline` çalıştır. |
| Bağlantı hatası / zaman aşımı | Supabase projesi duraklatılmış olabilir (ücretsiz plan 7 gün kullanılmayınca durdurur): panelden **Restore**. |
| "Remote migration versions not found in local" | Veritabanında, ana dalda olmayan bir kayıt var. Migration'ı hiçbir zaman ana daldan başka bir yerden uygulama; geliştiriciye haber ver. |
| Testte "schema.sql güncel değil" | `npm run db:derle` çalıştır. |
| "Vault gizli anahtarı eksik: …" | `kasa_sirlari` gerekli Vault kaydını bulamadı ve hiçbir şeyi değiştirmeden durdu. Eksik adları (ileti sıralar) SQL Editor'de `vault.create_secret(değer, ad)` ile ekle (değeri yalnız sen bil; aynısını `supabase secrets set` ile fonksiyona da yaz), sonra `apply`'ı yeniden çalıştır. |
| "anahtar_functions_url geçersiz" | Vault'taki `anahtar_functions_url` kaydı `https://<proje>.supabase.co/functions/v1` biçiminde olmalı. |

## Geri almak
Migration'lar ileri doğru gider. Bir değişikliği geri almak için **tersini yapan yeni bir migration** yazılır ve aynı dört adımla uygulanır.

## Kurulum bilgisi (bir kez yapıldı, 2026-11-01)
- GitHub → Settings → Environments → `staging` ve `production`: her birinde
  secret `SUPABASE_DB_URL` (Supabase → Connect → **Session pooler** adresi, port 5432, parola içinde) ve variable `SUPABASE_TARGET` (ortamın adı).
  Ayarları yalnızca depo sahibi değiştirebilir.
- İki veritabanı da migration defterine bağlandı (`adopt-existing-baseline`). Bu adım bir daha gerekmez; yeni bir boş proje kurulursa
  orada `apply` baseline'ı sıfırdan kurar.
- İş akışı: `.github/workflows/db-migrate.yml`. Sadece elle çalışır; hiçbir push ya da PR veritabanını değiştirmez.
  Yazmadan önce `scripts/db-preflight.sh` yalnız okuyarak denetler (boş veritabanında `adopt`'u, kayıtsız şemada `apply`'ı durdurur).
- Yerelde gerekirse: `npx supabase@2.120.0 db push --db-url "$DB_URL" --dry-run` (`supabase link` kullanılmaz).

## İleride: otomatik uygulama
2. bölümdeki dört adım otomatikleştirilebilir: `supabase/migrations/` değişen bir birleştirmeden sonra staging'e kendiliğinden uygulanır,
production ise bir **Approve** tıklamasıyla gelir. Bunun için production ortamında "Required reviewers" açık olmalı.
