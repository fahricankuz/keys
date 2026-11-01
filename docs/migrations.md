# Veritabanı migration'ları

Veritabanı değişiklikleri artık **sürümlü migration dosyalarıyla** yapılır. Böylece "hangi değişiklik yayında, hangisi değil" sorusunun cevabı
dosyalarda ve Supabase'in kendi kayıt tablosundadır; SQL Editor'e dosyanın tamamını yapıştırmak gerekmez.

## Nasıl çalışır
- `supabase/migrations/<ZAMAN>_<ad>.sql`: her değişiklik ayrı bir dosya. Sırayı zaman damgası belirler. **Gerçek kaynak bunlardır.**
- `supabase/migrations/20261101000000_baseline.sql`: şimdiye kadarki bütün şema (eski `schema.sql`'in birebir kopyası).
- `supabase/schema.sql`: migration'lardan **üretilen** özet. Testler (PGlite) ve SQL Editor ile elle kurulum bunu kullanır. Elle düzenlenmez.
- `.github/workflows/db-migrate.yml`: migration'ları Supabase'e uygulayan, yalnızca elle çalışan iş akışı.

## Günlük kullanım
**Yeni değişiklik (tablo, sütun, işlev, politika…):**
```bash
npm run db:yeni -- kullanici_silme     # supabase/migrations/20261102093000_kullanici_silme.sql açar, schema.sql'i günceller
# dosyayı düzenle, SQL'ini yaz
npm run db:derle                       # dosyayı değiştirdikten sonra schema.sql'i yeniden üret
npx playwright test tests/sql.spec.mjs # şemanın temiz kurulduğunu ve ikinci kez çalıştığını doğrula
```
Kurallar:
1. **Yeniden çalıştırılabilir yaz:** `create table if not exists`, `create or replace function`, `drop policy if exists …; create policy …`, `add column if not exists`.
   Testler `schema.sql`'i aynı veritabanında iki kez çalıştırır; tekrarlanamayan SQL testte kırılır.
2. **Uygulanmış migration'ı asla düzenleme.** Hata bulursan yeni bir migration ile düzelt. (Dosyayı değiştirmek Supabase'te uygulanmış kaydı ile çelişir.)
3. Yeni tabloda **RLS'i aynı dosyada aç** ve politikaları aynı dosyada yaz.
4. Dışarıdan çağrılabilir yeni işlev (`grant execute … to authenticated`) eklediysen `tests/qa-db.spec.mjs` izin listesine ekle.
5. `schema.sql` migration'larla uyumsuzsa testler kırılır (`tests/migrations.spec.mjs`); çözüm: `npm run db:derle`.

## Uygulama (Supabase'e gönderme)
Üç yol; ilk kurulumdaki tek seferlik adım hepsi için aynı.

### Tek seferlik: mevcut veritabanını baseline'a bağla
Canlı veritabanında baseline zaten uygulanmış (daha önce `schema.sql`'i çalıştırdın). Supabase'e bunu söylemezsen baseline'ı yeniden uygulamaya çalışır.
```bash
En kolayı GitHub'dan: Actions → "Veritabanı migration" → Run workflow → environment seç, mode **adopt-existing-baseline** → Run. (Her ortam için yalnızca bir kez; ayrıntı aşağıda B bölümünde.) İş önce veritabanında uygulamanın tabloları olduğunu denetler; boş veritabanında durur.

Kendi bilgisayarından yapmak istersen `supabase link` gerekmez (hesap yetkisi isteyen adım odur); doğrudan bağlantı adresini ver:
```bash
export DB_URL='postgresql://postgres.<ref>:<parola>@aws-…pooler.supabase.com:5432/postgres'   # Supabase → Connect → Session pooler
npx supabase@2.120.0 migration repair --db-url "$DB_URL" --status applied 20261101000000
npx supabase@2.120.0 migration list --db-url "$DB_URL"   # 20261101000000 hem "Local" hem "Remote" sütununda görünmeli
```

### A) Kendi bilgisayarından
```bash
bash scripts/db-preflight.sh apply                              # yalnız okur; psql gerekir (brew install libpq)
npx supabase@2.120.0 db push --db-url "$DB_URL" --dry-run     # neyin uygulanacağını gösterir, dokunmaz
npx supabase@2.120.0 db push --db-url "$DB_URL"               # uygular
```

### B) GitHub Actions'tan (önerilen)
1. Settings → Environments altında **staging** ve **production** oluştur. Production'a "Required reviewers" ekle.
2. Her environment'a ayrı şunları ekle:
   - **Secret** `SUPABASE_DB_URL`: Supabase → **Connect** → **Session pooler** adresi (`postgresql://postgres.<ref>:<parola>@aws-…pooler.supabase.com:5432/postgres`). `[YOUR-PASSWORD]` yerine veritabanı parolasını yaz; parolada `@ : / # ?` gibi karakter varsa URL-kodla. GitHub sunucularında IPv6 olmadığından "Direct connection" çalışmaz.
   - **Variable** `SUPABASE_TARGET`: environment'ın adı (`staging` / `production`). Eşleşmezse iş bağlanmadan durur; depo düzeyindeki bir secret yüzünden yanlış veritabanına gitmeyi önler.
   - İş `supabase link` kullanmaz; Supabase erişim jetonu ve Management API yetkisi gerekmez (önceki "Your account does not have the necessary privileges" hatası buradan geliyordu).
   - Staging ve production adresleri farklı projelere ait olmalı.
3. Actions → **Veritabanı migration** → Run workflow:
   - `plan`: yalnız bekleyen SQL'i gösterir; veritabanına yazmaz.
   - `adopt-existing-baseline`: yalnızca daha önce eski `schema.sql` kurulmuş **mevcut** veritabanı için, bir kez. Şema oluşturmaz ve doğrulamaz; boş ya da farklı şemalı veritabanında çalıştırma.
   - `apply`: yalnızca plan gözden geçirildikten ve staging testi geçtikten sonra bekleyen migration'ları uygular.
4. Sıra daima: staging plan → staging apply → uygulama testi → production plan → production apply → site dağıtımı. Migration işi site dağıtımını otomatik tetiklemez.

### C) SQL Editor ile elle (eski yöntem)
Tek bir migration dosyasının içeriğini SQL Editor'e yapıştırıp çalıştırabilirsin. **Sonra** kaydı işle, yoksa `db push` onu yeniden dener:
```bash
supabase migration repair --status applied 20261102093000
```

## Sık sorunlar
| Belirti | Neden / çözüm |
| --- | --- |
| `db push` "Remote migration versions not found in local" | Uzakta olup yerelde olmayan kayıt var. `supabase migration list` ile bak; `supabase migration repair --status reverted <sürüm>` |
| Baseline yeniden uygulanmaya çalışılıyor | Tek seferlik `migration repair --status applied 20261101000000` adımı atlanmış |
| Testte "schema.sql güncel değil" | `npm run db:derle` çalıştır |
| Yeni dosya sırada baseline'dan önce | Zaman damgası baseline'dan küçük; `npm run db:yeni` her zaman şimdiki zamanı kullanır, elle açma |

## Geri alma
Migration'lar ileri yönlüdür. Bir değişikliği geri almak için **tersini yapan yeni bir migration** yaz (`drop column`, `drop policy`…). Veri silen değişikliklerde önce Supabase'ten
yedek al (Database → Backups; ücretsiz planda günlük yedek yoktur, `pg_dump` ile al).
