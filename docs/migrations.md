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
npm i -g supabase            # ya da her komutun başına npx ekle
supabase login
supabase link --project-ref PROJE_KIMLIGI
supabase migration repair --status applied 20261101000000
```

Bilgisayarında CLI kurmak istemezsen aynı işi GitHub'dan yap: Actions → "Veritabanı migration" → Run workflow → **baseline_isaretle** işaretli, **dry_run** işaretli bırak → Run. (Yalnızca bir kez.)

```bash
supabase migration list      # 20261101000000 hem "Local" hem "Remote" sütununda görünmeli
```

### A) Kendi bilgisayarından
```bash
supabase db push --dry-run   # neyin uygulanacağını gösterir, dokunmaz
supabase db push             # uygular
```

### B) GitHub Actions'tan (önerilen)
1. Settings → Environments → **production** oluştur; "Required reviewers" olarak kendini ekle.
2. Environment secrets: `SUPABASE_ACCESS_TOKEN` (Supabase → Account → Access Tokens), `SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_REF`.
3. Actions → **Veritabanı migration** → Run workflow. Önce **dry run** açık çalıştır, çıktıyı oku, sonra dry run'ı kapatıp yeniden çalıştır.

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
