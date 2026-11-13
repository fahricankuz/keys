@AGENTS.md

# Claude Code specifics

`AGENTS.md` (imported above) is the full guide for every agent: product, repo map, tests, hard rules, release flow, approval matrix and how to report.
The Turkish rules block further down is the owners' own text and stays as written. This section only adds what is specific to Claude Code.

- **Guardrails are enforced.** `.claude/settings.json` denies the Read tool on secret files (never read them through the shell either: `.env*`, `credentials.json`, `*.p8`, `*.jks`, `*.keystore`, `*.p12`,
  `google-services.json`, `GoogleService-Info.plist`) and running `supabase link`, `git push --force`/`-f` and `git reset --hard`. Do not try to work around them;
  if you need something from a denied file, ask Erdem for the **name or the fact** you need, never the value.
- **Use subagents for heavy work** so large output stays out of the main context: running the gates (lint/type check/scoped tests), reading long logs, screenshot
  and browser checks, an independent diff review before every PR, security sign-off for auth/payments/PII. Read every subagent report critically and spot-check it.
- **MCPs available:**
  - **Supabase MCP: read-only by policy.** Inspect schema, logs and advisors, run `select`. Never `apply_migration`, never write through `execute_sql`, never
    `deploy_edge_function` or create secrets without Erdem's explicit approval for that action (production ref `nfpefnrgtnwvclwbriaw`).
  - **Sentry MCP:** org `anahtar` (EU, `https://de.sentry.io`), projects `anahtar-web`, `anahtar-mobile`, `anahtar-edge`. Check it after every release; read first, never resolve or delete issues unasked.
  - **claude-in-chrome** (Erdem's real Chrome) for the web consoles (Apple, Google, Supabase, RevenueCat, Sentry, Cloudflare, Hostinger, GitHub settings): Erdem logs in himself;
    **never type a password, key or one-time code into any web form**, and never paste a secret into a page. Prefer a CLI or API when one exists.
  - Browser checks for UI changes: use Chrome DevTools emulation (desktop and mobile) and reuse the existing browser; do not launch a new one per task.
- **Ask first, then build.** Ask open *product* questions up front with `AskUserQuestion` (2 to 4 per round, recommended option first); decide engineering matters yourself.
  After that build without stopping, and make and note reasonable calls.
- **Parallel sessions are normal.** Erdem and others work on this repo at the same time. Check for concurrent edits before large changes, do not kill dev servers you did not start,
  stage only your own files, and use your own git worktree for a branch of work. Never reset, restore, stash, clean or rewrite history on a shared tree.
- **Finish with the summary from `AGENTS.md` section 8** (what changed, evidence, not-run list, decisions, what is left, ledger). Report in Turkish.

---

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

## Commit ve push düzeni (Actions kotasını korumak için)
- Küçük commit'leri yerelde biriktir; **tek push** yap (her push PR'da testleri yeniden çalıştırır, ~15 dk).
- Test ve yerel kontrolleri push'tan önce yerelde bitir; push'u iş tamamlanınca yap, ara ara değil.
- Yalnız belge değişikliği (`docs/`, `*.md`) siteyi yeniden derletmez; belgeleri koda karıştırmadan ayrı PR'a koymak gerekmez.

## Dil ve ton
- Kullanıcıyla Türkçe konuş; kullanıcıya görünen metinler Türkçe, İngilizce karşılıkları `app/src/domain/en-*.js` içinde.
