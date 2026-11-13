# anahtar

Kira ve site yönetimi: mülk sahibi, kiracı, site sakini, site/portföy yöneticisi ve ekip **aynı veriye kendi tarafından** bakar.
Konut, ofis, mağaza, depo; site, AVM, depo ve GYO portföyleri. Kira ve aidat tahsilatı, talepler, belgeler, giriş/çıkış tutanağı,
depozito, giderler, genel kurul, yatırımcı raporu. Türkçe ve İngilizce. Web (anahtar.io) ve iOS/Android uygulaması aynı koddan çıkar.

## Depo düzeni

| Klasör | İçerik |
|---|---|
| `app/` | Uygulama (Expo, React Native, expo-router). Web, iOS ve Android. Ayrıntı: `app/` içindeki betikler ve [docs/mobil.md](docs/mobil.md). |
| `app/public/` | Statik sayfalar ve varlıklar (blog, destek, gizlilik, koşullar, site.css, sitemap). |
| `supabase/` | Veritabanı: `migrations/` (tek doğru kaynak), `schema.sql` (migration'lardan derlenir), edge `functions/`. |
| `tests/` | Playwright testleri: uygulama (sahte sunucuyla, `*.app.spec.mjs`), veritabanı (PGlite, `*.sql.spec.mjs`), birim testleri. |
| `hostinger/` | Web yayını: `.htaccess` (güvenlik başlıkları, yönlendirmeler) ve paketleme. |
| `scripts/` | Migration betikleri (`db-yeni`, `db-derle`), mağaza ekran görüntüleri. |
| `docs/` | Kurulum, yayın, güvenlik, test, mağaza ve ürün belgeleri. |
| `yuk/` | Yük testi (k6), yalnız deneme projesinde. |

## Sık kullanılan komutlar

```bash
npm ci && npm ci --prefix app        # bağımlılıklar
npm test                             # tüm testler (uygulama testleri app/dist-fake derlemesini kullanır)
npm run db:yeni -- ad                # yeni migration dosyası
npm run db:derle                     # supabase/schema.sql'i migration'lardan yeniden üret
```

Uygulamayı yerelde çalıştırmak ve sahte sunucuyla derlemek için `app/` klasöründeki `npm` betiklerine bakın.

## Belgeler

- **[docs/HANDOVER.md](docs/HANDOVER.md)**: güncel durum ve devir notu; yeni bir yapay zekâ ajanına önce bunu verin (İngilizce).
- **[AGENTS.md](AGENTS.md)**: yapay zekâ ajanları için tek ve tam rehber (kurallar, test, yayın akışı, onay matrisi, raporlama). İngilizcedir; Claude Code ayrıca [CLAUDE.md](CLAUDE.md) dosyasını okur.
- **[docs/README.md](docs/README.md)**: bütün belgelerin dizini.
- Depo sahipleri için: [docs/ai-ile-calisma.md](docs/ai-ile-calisma.md) (yapay zekâ ile güvenli çalışma, neyi onaylamalı, neyi asla yapıştırmamalı, bir şey bozulursa ne yapmalı).
- Altyapı haritası: [docs/infrastructure.md](docs/infrastructure.md). Yayın, migration, OTA ve geri alma adımları: [docs/release-and-ota.md](docs/release-and-ota.md).

## Çalışma kuralları

Veritabanı değişikliği her zaman yeni bir migration'dır; `schema.sql` elle düzenlenmez. Migration'lar yalnız GitHub Actions →
"Veritabanı migration" ile uygulanır (staging plan → apply → production plan → apply). Ayrıntı: [CLAUDE.md](CLAUDE.md),
[docs/migrations.md](docs/migrations.md), [docs/canliya-alma.md](docs/canliya-alma.md), [docs/guvenlik.md](docs/guvenlik.md).

> Eski tek sayfalık web uygulaması (kökteki `index.html`, `assets/js`, Capacitor `android/` ve `ios/`) kaldırıldı; tüm ürün `app/` içindedir.
