# AGENTS.md: guide for AI agents working on anahtar

This is the **single, complete guide** for every agent working in this repo (Claude Code, Claude Code web, Codex, others). Read it first.
**Current state, the release in flight and the critical open items are in [docs/HANDOVER.md](docs/HANDOVER.md): read it before starting any task.**
Claude Code also reads [CLAUDE.md](CLAUDE.md) (the owners' Turkish rules for database, release and commits; it does not contradict this file).

The repo owners speak Turkish and are partly non-technical. **Talk to them in Turkish**, in plain language, with a short summary, and prove
everything (command, output, PR link). Code identifiers, commands and product names stay as they are. All user-visible app text is Turkish
(English counterparts live in `app/src/domain/en-*.js`). Commit messages and PR descriptions follow the repo convention (Turkish, with a prefix such
as `Düzeltme:`, `Güvenlik:`, `Belgeler:`) because the owners read them.

> **The repo is PUBLIC** (`fahricankuz/keys`). Never write a secret (password, key, token, `.p8`, `google-services.json`), a customer email/phone or a
> personal email into code, docs, PR text, logs or chat. Write secret **names** only.

## 1. What the product is

**anahtar** is rent and building (site) management. Landlord, tenant, building resident, building/portfolio manager and staff all look at **the same
data from their own side** (rent and dues collection, requests, documents, move-in/out report, deposit, expenses, general assembly, investor report).
Turkish and English. The web site (https://anahtar.io) and the iPhone/Android app are built from **the same code**. Tenants are free; landlords subscribe
(30-day server-side trial; purchases happen on phones only via in-app purchase + RevenueCat; no payment on the web).
Publisher: DevirVentures; data controller: Devredin A.S. Store id `io.anahtar.app`; iPhone only (no iPad) and Android phones.

## 2. Repo map

| Path | What is there |
|---|---|
| `app/` | The app: Expo SDK 58, React Native 0.88, React 19.3, expo-router, react-native-web. Web, iOS, Android. |
| `app/src/app/` | Routes (expo-router). `app/src/app-ui/`, `ui/`, `site/`, `auth/`, `web/`: screens and components. |
| `app/src/domain/` | Business logic. English strings `en*.js`, `i18n.js`. Phone-only files are `*.native.js`. |
| `app/public/` | Static pages (blog, support, privacy, terms, account deletion), `.htaccess` (security headers). |
| `app/scripts/` | `harden-html.mjs` (CSP), `well-known.mjs` (universal links), `sentry-sourcemaps.mjs`, `magaza-fiyatlari.mjs` (store price table), `inceleme-hesaplari.mjs` (store review demo accounts). |
| `app/eas.json`, `app/app.json` | EAS profiles/channels and app config (`runtimeVersion`, `updates`). |
| `supabase/migrations/` | The **single source of truth** for the database. `supabase/schema.sql` is a **generated summary**, never hand-edited. |
| `supabase/functions/` | 9 Edge Functions (`billing`, `push`, `lead-mail`, `mail-send`, `report`, `tufe-sync`, `welcome`, `invite-mail`, `site-invite`) and `_shared/`. |
| `specs/followup-migrations/` | 2 migrations that wait (section 4.2). Files here are never applied automatically. |
| `tests/` | Playwright: `*.app.spec.mjs` (fake backend), `*.sql.spec.mjs` (PGlite), `*.spec.mjs` (unit). |
| `scripts/` | `db-yeni.mjs`, `db-derle.mjs`, `db-preflight.sh`, `magaza-ekranlari.mjs`. |
| `.github/workflows/` | `ci.yml`, `hostinger.yml`, `db-migrate.yml`, `expo-mobile.yml`, `guvenlik.yml`, `codeql.yml`, `safari.yml`. |
| `docs/`, `specs/` | Documentation; index in [docs/README.md](docs/README.md). `hostinger/`: deploy helpers. `yuk/`: k6 load test. |

## 3. Run and test

- **npm** (`package-lock.json`), **Node 22** (`nvm use 22`; the machine default may differ). EAS builds pin Node 22.23.1.
- Install: `npm ci && npm ci --prefix app`
- Run the app: `cd app && npx expo start --web` (web), `npx expo start` (phone). Type check: `npm run typecheck --prefix app`.
- Database: `npm run db:yeni -- short_name`, `npm run db:derle` (regenerate `schema.sql`), `npm run db:kontrol` (is `schema.sql` current).
- **Never run the whole suite locally.** `npm test` runs every test; hundreds of tests exhaust memory (CI splits them into two shards). Run only the files
  related to your change, **one at a time**, with capped workers and a time limit: `npx playwright test tests/<file>.spec.mjs --workers=2`.
- The first `*.app.spec.mjs` run builds the fake-backend app into `app/dist-fake` (a few minutes). If app code changed, delete the old build so a new one is made.

| Change | Run locally | Leave to CI |
|---|---|---|
| Migration | Your new test + `tests/migrations.spec.mjs`, `tests/qa-db.spec.mjs`, `tests/sql.spec.mjs` | Full set |
| Edge Function | The related `*-handler.spec.mjs`, `tests/functions-build.spec.mjs`, `tests/function-keys.spec.mjs`, `tests/functions-deploy.spec.mjs` | Full set |
| Screen / logic | The related `*.app.spec.mjs` and `*.spec.mjs` + `tsc --noEmit` | Full set, Safari (`@mobil`), CodeQL, Semgrep |
| Docs only | Check links and the absence of secrets by hand | Full set still reports (required check) |

- CI on every PR: **Testler (parça 1/2, 2/2)** and **Testler (tam set)** (required), **Mobil uygulama (Expo)** (`tsc` + iOS/Android bundle export),
  **Güvenlik taraması** (Semgrep, gitleaks, npm audit), **Safari denemesi** (non-blocking). CodeQL runs on `main` and weekly.
- If a test fails locally and you cannot prove it is unrelated, leave it to CI but **say so explicitly** in the PR.
- Fake-backend tests do not see real-environment paths (static SSR build, real Supabase). In PR #113 such a bug stopped the web deploy
  ([diary](docs/diary/2026-11-13.md)). If you touch session, storage or build code, also run `expo export -p web` with real
  `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` values set.

## 4. Hard rules (not negotiable)

### 4.1 Git and PRs

- **PRs only.** No direct push to `main`. Branch names: `fix/…`, `feat/…`, `chore/…`, `docs/…`. Open the PR against `main` as **ready** (not draft).
- **Never** `git push --force`, rewrite published history (`amend`, `rebase` of pushed commits, `reset --hard`), or delete someone else's branch.
- **Merge only with Erdem's explicit "merge" in his current message.** Green CI is not approval. Never merge another person's PR.
- Stage **only the files you changed**, by name (no `git add -A`). The repo is shared with other agents and people.
- Accumulate small commits locally and **push once** (every push re-runs CI, ~15 min).
- No `--no-verify`; satisfy the hook.
- PR body: **what and why**, **verification evidence** (command, result), **not-run list**, **rollback** (which commit to revert), and for DB work the four migration steps.
- Docs-only changes (`docs/`, `*.md`) do not trigger a site rebuild.

### 4.2 Database: new migrations only

- Every database change is a new file: `npm run db:yeni -- short_name` → `supabase/migrations/<timestamp>_<name>.sql`, then `npm run db:derle`.
  Never touch `schema.sql` by hand (`tests/migrations.spec.mjs` breaks). Never edit an **applied** migration; fix mistakes with a new migration.
- SQL must be **re-runnable** (`if not exists`, `create or replace`, `drop … if exists`); tests run the schema twice.
- New table: RLS and policies in the **same** migration. A new `SECURITY DEFINER` function is closed to `anon` by default; it is only opened by adding it to the
  allowlist in `tests/qa-db.spec.mjs`.
- **Stay compatible with the deployed client.** The site deploys **before** migrations, and stale open tabs keep running the old client. **Add** columns;
  dropping, renaming or closing a write path belongs in a later, separate PR.
- **Follow-up migration rule:** migrations that break the old client (`sistem_mesaji_kapat`, `site_residents_kod_gizle`) wait in `specs/followup-migrations/`.
  They move into `supabase/migrations/` (with a **fresh timestamp**, in a separate PR) only after the new site has been live **at least 24 hours**
  (steps: `specs/followup-migrations/README.md`). Verify the live bundle is the new client first. No `.sql` may remain in that folder after the move.
- Never write a secret into a migration. SQL only reads the **name** of a Vault entry (see `kasa_sirlari`); if an entry is missing it fails without changing anything.
- Every migration gets a test that exercises it.
- **Apply only through** Actions → "Veritabanı migration", from `main`, in order: staging `plan` → staging `apply` → production `plan` → production `apply`.
  Show Erdem the `plan` output and get **explicit approval** before each production `apply`. Steps: [docs/release-and-ota.md](docs/release-and-ota.md), [docs/migrations.md](docs/migrations.md).
- **Never `supabase link`.** Always pass `--project-ref` or `--db-url`.

### 4.3 Edge Functions

- Release order: **merge → deploy changed functions → apply migrations** (functions tolerate the old schema; the reverse order can break the old function).
- Deploy is manual: `supabase functions deploy <name> --project-ref nfpefnrgtnwvclwbriaw` (reads `verify_jwt` from `supabase/config.toml`). Secrets first (4.4).
- `billing`, `push`, `lead-mail`, `mail-send`, `report`, `tufe-sync` run with `verify_jwt=false` and authenticate with secret headers (`x-anahtar-secret`, `x-evim-secret`);
  `welcome`, `invite-mail`, `site-invite` require the user JWT. New functions use `sentryServe(...)` instead of `Deno.serve` and `logger(...)` instead of `console` ([docs/loglar.md](docs/loglar.md)).
- Error responses carry no internals (generic message); details go to `function_logs` and Sentry.

### 4.4 Secrets

- A secret goes **nowhere**: code, SQL, docs, PRs, logs, test output, chat. Do not display one even when you can read it (never select `decrypted_secret`; never open
  `.env`, `credentials.json`, `*.p8`; `.claude/settings.json` blocks the Read tool on these files; never read them through the shell either).
- Where they live: **Vault** (the 7 entries read by triggers/cron), **`supabase secrets set`** (function secrets), **GitHub** secrets/variables, **EAS** env,
  Erdem's local `~/.config/anahtar/secrets` folder. Full list (names only): [docs/infrastructure.md](docs/infrastructure.md).
- Rotating a webhook/cron secret: new random value → Vault **and** `supabase secrets set` **together** (minutes apart), then verify 200 responses. Steps: [docs/release-and-ota.md](docs/release-and-ota.md).
- If a secret leaks (chat, log, commit) tell Erdem **immediately**; do not just undo and continue, the secret must be rotated.
- Never type an account password into a console or form. Erdem logs into consoles himself; you continue afterwards.

### 4.5 Production

- Production is **read-only**. Writing needs Erdem's explicit approval: backup first, then dry-run, smallest change, then re-verify.
- Supabase MCP and SQL Editor: `select` only. `apply_migration`, writing via `execute_sql`, `deploy_edge_function`, creating secrets are **forbidden without approval**.
- Never send email, push or SMS to real users and never start a payment/purchase flow. Test sends go to Erdem only. Purchase tests use store **sandbox** accounts, only when Erdem asks.
- Payment switch: `public.app_config` → `billing_paused`. Do not change it by hand.
- No new third-party/paid tool without a cost estimate and Erdem's approval.

### 4.6 Code rules

- **The server is the source of truth.** Authorization and business rules live in the database (RLS, `require_access`, `guard_unit_limit`); the client only displays. No client-side filtering or hard-coded values for access.
- **No hard-coded prices.** Prices live in one place: `app/src/domain/config.js` → `billing.tiers`; phones read the live price from the store. Limits and flags live in `app_config`.
- **Turkish UI, English counterpart** in `app/src/domain/en-*.js`. Every new visible string goes into both; check it in the English UI. The English sweeps live in `tests/app-admin.spec.mjs` and `tests/paketler.spec.mjs` (`docs/test.md` mentions a `tests/i18n.spec.mjs` that does not exist).
  Never call `t()` at module load (language is decided later; PR #116 bug): translate at read time.
- **Platform files.** Native-only modules (`expo-secure-store`, `expo-crypto`, `react-native-purchases`, `@sentry/react-native`, notifications) live in `*.native.js`; the web
  counterpart is the extensionless file (`secure-storage.js` / `secure-storage.native.js`). Never import a native module from a web file, and web code must not touch `window` at import
  time (static SSR build breaks).
- **No TODO, placeholder or "later".** Finish the work or state the blocker in the PR. Leave no dead code or unused flags.
- **Scope discipline.** Change only what was asked. Do not change design, colours, copy or names; do not delete shipped sections. Check deletions against the merge base.
- Reuse existing components and the design system (`app/src/ui/`); search before creating anything.
- **Never remove or weaken a tracking/error event.** Adding is fine; removal is asked first. No personal data in any log/Sentry event (`log_redact` rules; [docs/loglar.md](docs/loglar.md)).
- If a new data type is collected, update the `app.json` privacy manifest and the store privacy forms **together** (with Erdem's approval).
- Before adding an app dependency check `npx expo install` compatibility and the `npm audit` impact. No major-version jumps (Dependabot does not open them either).
- After fixing a bug, search for siblings of the same bug class and fix them too. Never ship a known edge case as "accepted"; fix it with a test or record a blocker.

### 4.7 Store review rules (to avoid rejection)

| Rule | What to do |
|---|---|
| Apple 5.1.1(v), Google account deletion | Settings → Account → Delete account must work; on failure show the error; web: `/hesap-silme/` |
| Apple 1.2, Google UGC | Report and block message/person; review within 24 h (admin panel → Şikâyetler) |
| Apple 3.1.1, Google Play Billing | Digital subscription only through in-app purchase; no link from the app to a web payment page; "Restore purchases" and "Manage subscription" stay |
| Apple 2.1 | Review demo accounts keep working (`app/scripts/inceleme-hesaplari.mjs`; the password is only with Erdem) |
| Apple 4.2 | On phones the launch screen is not a marketing page: login or the panel |
| Privacy | No tracking or ads; `AD_ID` and unneeded permissions blocked; camera and photo library only |

Details: [docs/magaza.md](docs/magaza.md). Submitting for review and releasing are done **only with Erdem's explicit approval**.

## 5. Release flow (summary)

| What | Flow | Details |
|---|---|---|
| Web | PR → CI green → Erdem says "merge" → `hostinger.yml` (tests → build → `site` branch) → Hostinger publishes | [release-and-ota.md](docs/release-and-ota.md) section 1 |
| Edge Function | Secrets → `supabase functions deploy` (manual) | section 2 |
| Migration | staging plan → apply → production plan → apply (Actions) | section 3 |
| Secret rotation | Vault + `supabase secrets set` together | section 4 |
| Phone build | `eas build --profile production` → TestFlight / Play internal | section 5 |
| Over-the-air update (OTA) | `eas update --channel production --message "…"` (JS/UI only) | section 7 |
| Stores | Review submission and **manual release** (with Erdem's approval) | section 6 |

For big releases the full order is in [docs/canliya-alma.md](docs/canliya-alma.md) section 6. After every release check Sentry.
Builds, OTA, store submission and notifications are **never started on your own initiative**.

## 6. Where to find what

| Topic | Document |
|---|---|
| Doc index | [docs/README.md](docs/README.md) |
| Infrastructure map (services, accounts, ids, secret names, cron) | [docs/infrastructure.md](docs/infrastructure.md) |
| Release, migration, secret rotation, build, TestFlight, OTA, rollback | [docs/release-and-ota.md](docs/release-and-ota.md) |
| Working with AI, for the non-technical owners (Turkish) | [docs/ai-ile-calisma.md](docs/ai-ile-calisma.md) |
| Coding guidelines | [docs/coding-guidelines.md](docs/coding-guidelines.md) |
| Security guidelines | [docs/security-guidelines.md](docs/security-guidelines.md) |
| SEO / GEO | [docs/seo-geo.md](docs/seo-geo.md) |
| Migrations and post-apply checks | [docs/migrations.md](docs/migrations.md), [specs/followup-migrations/README.md](specs/followup-migrations/README.md) |
| Go-live order | [docs/canliya-alma.md](docs/canliya-alma.md), [specs/production-release.md](specs/production-release.md) |
| Security controls in place | [docs/guvenlik.md](docs/guvenlik.md) |
| Stores (Apple/Google), privacy forms | [docs/magaza.md](docs/magaza.md), [docs/mobil.md](docs/mobil.md) |
| Subscription and RevenueCat | [docs/abonelik.md](docs/abonelik.md) |
| Logs and Sentry | [docs/loglar.md](docs/loglar.md) |
| Email | [docs/eposta.md](docs/eposta.md) |
| Tests | [docs/test.md](docs/test.md), [docs/gercek-cihaz-kontrol.md](docs/gercek-cihaz-kontrol.md) |
| Hostinger | [docs/hostinger.md](docs/hostinger.md) |
| Roadmap | [docs/yol-haritasi.md](docs/yol-haritasi.md) |
| Work diaries (what happened when, lessons) | [docs/diary/2026-11-13.md](docs/diary/2026-11-13.md) |

Most older docs are in Turkish. If docs conflict with something you see, **code and live state win**; fix the doc or state the conflict in the PR.

## 7. Approval matrix: what needs Erdem's explicit yes

"Explicit yes" means Erdem **names that action** in his current message. A generic "go on" or "sort it out" does not cover the hard-to-reverse items below.

| Action | Approval | Note |
|---|---|---|
| Merging a PR into `main` | Required | Always; green CI alone is not enough |
| Production migration `apply` | Required | Show the `plan` output first; tell him before a staging `apply` too |
| Edge Function deploy | Required | Secrets must be ready first |
| Creating/rotating/deleting a secret (Vault, `supabase secrets`, GitHub, EAS) | Required | Never put the value in chat |
| Writing production data | Required | Backup, dry-run, smallest change, re-verify |
| EAS `production` build, upload to TestFlight/Play | Required | The free plan queue can be long |
| Submitting to store review, manual release | Required | Separate for each store |
| OTA (`eas update --channel production`) | Required | Reaches users immediately |
| Email, push, SMS to real users | Required | Tests go to Erdem only |
| Account/console change (Apple, Google, Supabase panel, Sentry, RevenueCat, Cloudflare, Hostinger, GitHub settings) | Required | Erdem logs in himself |
| `billing_paused`, granting a plan/subscription by hand | Required | |
| New paid tool or third-party service | Required | With a cost estimate |
| Removing an analytics/tracking event or changing collected data | Required | |
| Opening the follow-up migration PR | Open it when ready; merging and applying need approval | 24-hour rule |
| Code, tests, docs; opening a PR; read-only review; staging `plan` | Not required | Open PRs as ready |

## 8. How to report your work

Every task ends with a **summary** (Turkish, short):

1. **What changed** and why (with file paths; code only if essential).
2. **Evidence:** the command you ran and the tail of its output/exit status, test counts, PR link, screenshot path. "It works" is not evidence.
3. **What you did NOT run:** skipped tests, things you could not verify, things only CI covers. Write "none" if none.
4. **Decisions:** reasonable calls you made and the alternatives.
5. **What is left:** blockers with an owner and a date.
6. **Ledger:** repo, branch, commits, PR, what is live where.

Keep claims separate: **local tests**, **CI green**, **merged**, **web deployed**, **function deployed**, **migration applied**, **verified live**.
When you learn something important (a new trap, a new rule), add it to the relevant doc or to the [diary](docs/diary/2026-11-13.md).
