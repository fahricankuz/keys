# Sonraki PR'ın migration'ları

Bu klasördeki iki dosya `supabase/migrations` içinde DEĞİLDİR; "Üretim sürümü" PR'ının parçası değildir. Sebep: yeni site
migration'lardan ÖNCE yayına çıkar ve tarayıcıda açık kalan eski sekmeler eski istemciyi çalıştırmaya devam eder. Bu iki
migration eski istemciyi bozar:

| Dosya | Ne yapar | Eski istemciyi nasıl bozar |
|---|---|---|
| `20261113141559_sistem_mesaji_kapat.sql` | `messages_insert` politikasındaki `system` dalını kaldırır | Eski istemci olay satırlarını (talep durumu, dekont bildirimi) tabloya doğrudan yazar; yazamaz olur |
| `20261113141601_site_residents_kod_gizle.sql` | `site_residents.code` sütununu istemciden okunamaz yapar | Eski istemci `select *` ve `insert … returning *` kullanır; "permission denied" alır |

## Ne zaman

Yalnız yeni site yayında **en az 24 saat** kaldıktan sonra, ikinci bir PR'la. Önce doğrula: yayındaki paket
`post_system_message` ve `site_resident_code` içeriyor (yeni istemci), ilk PR'ın migration'ları üretimde uygulanmış.

## Nasıl taşınır

1. Yeni dal aç. İki dosyayı `supabase/migrations` içine **taşı** (kopyalama; bu klasörde `.sql` kalmasın) ve her birini
   `npm run db:yeni -- ad` ile alınmış gibi yeni zaman damgasıyla yeniden adlandır (`YYYYMMDDHHMMSS_ad.sql`, mevcut en
   son migration'dan sonra). İçerikleri aynı kalır; yalnız dosyanın başındaki "DİKKAT … sonra uygulanır" satırını,
   ilgili koşul sağlandığı için, kısaltabilirsin.
2. `npm run db:derle` çalıştır (`supabase/schema.sql` yeniden yazılır).
3. Testler: `tests/followup-migrations.sql.spec.mjs` aynı kalır (klasörde `.sql` kalmayınca hiçbir şey uygulamaz ve aynı
   sınavları şemanın kendisine karşı çalıştırır). Ayrıca çalıştır: `tests/migrations.spec.mjs`, `tests/sistem-mesaji.sql.spec.mjs`, `tests/davet-kodlari.sql.spec.mjs`,
   `tests/rls-performans.sql.spec.mjs`, `tests/qa-db.spec.mjs`.
4. `tests/davet-kodlari.sql.spec.mjs` ve `tests/sistem-mesaji.sql.spec.mjs` "kısıt henüz yok, eski istemci çalışır" diye
   iddia eden satırlar içerir (`select *` çalışır, doğrudan `system` insert'ü çalışır, `expect(SCHEMA).not.toMatch(…sistem_mesaji_kapat…)`).
   Bunlar taşımadan sonra yanlış olur: ilgili testleri sil ya da `tests/followup-migrations.sql.spec.mjs`'teki karşılıklarına
   bırak.
5. **`tests/rls-performans.sql.spec.mjs` muafiyeti.** `sistem_mesaji_kapat`, `rls_performans`'tan sonra `messages_insert`'i yeniden
   yazar; politika eşdeğerliği testi (`anlam eşdeğerliği…`) o politikada bilinçli bir fark görür. Taşıdıktan sonra
   `public.messages :: messages_insert` için, `reports_insert`'te olduğu gibi, bilinçli fark istisnası ekle (yeni `with_check`
   `from_role = msg_side(property_id)` içerir ve `'system'` içermez).
6. PR açıklamasına Actions → "Veritabanı migration" dört adımını yaz: staging `plan` → staging `apply` → production `plan` →
   production `apply`; her `apply` öncesi `plan` çıktısını göster ve açık onay al.

## Geri alma

Yeniden çalıştırılabilir yeni bir migration ile eski izinler verilir: `grant select on public.site_residents to authenticated;`
ve `messages_insert` politikasının `system` dalı geri eklenir (baseline'daki tanım). Uygulanmış migration dosyaları değiştirilmez.
