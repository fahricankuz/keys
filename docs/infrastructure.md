# Infrastructure map

State as verified on **2026-11-13**. Every service anahtar depends on, what it does, who owns it, ids, where it is configured, and where its secrets live.
This repo is **public**: this file contains identifiers and secret **names** only, never a secret value, a password or a personal email address.
If something here disagrees with the live console, the console wins: fix this file in the same PR.

Related: [release-and-ota.md](release-and-ota.md) (how to release), [diary/2026-11-13.md](diary/2026-11-13.md) (how this was set up), [loglar.md](loglar.md) (logs and Sentry), [abonelik.md](abonelik.md) (subscriptions),
[magaza.md](magaza.md) (stores), [guvenlik.md](guvenlik.md) (security controls), [../AGENTS.md](../AGENTS.md) (rules).

## 1. At a glance

```
                       +--------------------+
  browser  --------->  | Hostinger (static) |  anahtar.io  <-- `site` branch <-- GitHub Actions (hostinger.yml)
                       +--------------------+
  web + iOS + Android app  ------>  Supabase (prod, Frankfurt): Postgres + Auth + Storage + 9 Edge Functions + pg_cron/Vault
        |   ^                              ^   |      |
        |   |  push (APNs / FCM)           |   |      +--> Hostinger mailbox (SMTP) --> e-mail
        |   +------------------------------+   |
        |                                      +--> Sentry EU (anahtar-edge)
        +--> RevenueCat (purchases) --webhook--> Supabase function `billing`
        +--> Sentry EU (anahtar-web / anahtar-mobile)
  Apple (App Store, TestFlight, APNs, IAP)   Google (Play, Firebase FCM, Pub/Sub)   Expo EAS (builds, OTA)   Cloudflare (Turnstile, web only)
```

| Service | Role | Plan / cost known |
|---|---|---|
| GitHub (`fahricankuz/keys`) | Code, CI, web build, DB migration runs | Public repo; Actions on standard runners are free for public repos (verify; old "save Actions minutes" rules date from the private period) |
| Hostinger | Web hosting for anahtar.io, DNS, mailbox | Plan and renewal date **not verified** |
| Supabase (org "Anahtar") | Database, auth, storage, Edge Functions, cron, Vault | **Pro** plan; production compute **Micro** (since 2026-11-13, assumed covered by the Pro compute credit: verify on the billing page); daily backups, PITR off |
| Sentry (EU) | Errors, crashes, uptime, cron monitor | Plan not verified; quota is limited (the auth-health uptime monitor is disabled because of it) |
| Expo EAS (`anahtar_io`) | iOS/Android builds, store submit, OTA updates | **Free** plan (low-priority build queue) |
| Apple Developer | App Store, TestFlight, APNs, in-app purchase | Annual membership (amount and renewal date not verified) |
| Google Play + Firebase/GCP | Play Console, FCM push, Pub/Sub notifications | Play registration paid once; Firebase/GCP project on free usage (Analytics off) |
| RevenueCat | Subscription backend for both stores | Free below the revenue threshold ([abonelik.md](abonelik.md)) |
| Cloudflare | Turnstile widget only (web) | Free; anahtar.io DNS is **not** on Cloudflare |

## 2. Account owners and access

Names and roles only. Passwords and 2FA devices are with the owners; agents never receive them (Erdem logs into consoles himself, then the agent continues).

| System | Owner / admin | Others with access | Agent access |
|---|---|---|---|
| GitHub repo | `fahricankuz` (owner, admin) | Write: `erdemylmaz` (Erdem), `busekuz`, `Bora-colpan23` | `gh` CLI as the logged-in user; no admin settings changes unasked |
| Supabase org "Anahtar" | Erdem (verify member list in the console) | | Supabase **MCP read-only by policy**; Supabase CLI 3.x with `--project-ref`/`--db-url` (never `supabase link`); a Management API token is kept locally by Erdem |
| Expo `anahtar_io` | Owner login `info@anahtar.io`; admin `erdem61` | Robot user `github-actions` (Developer) holds the CI token | `eas` CLI as the logged-in user |
| Apple team `F5DQK4ZWFP` (DEVREDIN BILGI TEKNOLOJILERI YAZILIM VE TICARET ANONIM SIRKETI) | Account Holder: the Devredin company account (Erdem) | Erdem; `info@anahtar.io` invited (App Manager, Developer, Marketing, Sales, Support; app `anahtar` only) | App Store Connect API key `CPW6Z9Q984` (App Manager) for EAS Submit and scripts; Erdem logs into the console |
| Google Play developer account "Devredin Bilgi Teknolojileri" (id `6056480897635807028`) | Erdem (company Google account) | `info@anahtar.io` invited (all permissions for app `anahtar` only) | Service account `eas-submit@anahtario.iam.gserviceaccount.com` (releases + store presence) |
| Firebase / GCP project `anahtario` | Company Google account (same as Play) | | Service accounts below; org-policy exception on this project only |
| RevenueCat (DevirVentures account, project `anahtar`, id `4a08cddd`) | DevirVentures | `info@anahtar.io` invited as project admin | Browser console by Erdem; secret key in Supabase function secrets |
| Sentry org `anahtar` | Erdem (verify member list) | Alerts go to the team email | Sentry MCP (org `anahtar`, region `https://de.sentry.io`) |
| Cloudflare (devredin account) | Devredin | | Browser console by Erdem; Turnstile secret key in Supabase Auth settings |
| Hostinger | Erdem (verify) | Mailbox `info@anahtar.io` has its own owner | Browser console by Erdem |

Branch rules: **no rulesets and no environment reviewers** on GitHub (owner decision). The rule is process-based: changes go through PRs to `main`, nobody pushes to `main`, merges only on Erdem's explicit go ([AGENTS.md](../AGENTS.md) section 4.1).

## 3. GitHub

- Default branch `main` (renamed on 2026-11-13 from `claude/github-keys-setup-uzvnzm`). The `site` branch is machine-written by `hostinger.yml` (force-pushed on every web release); never commit to it.
- Workflows:

| Workflow | Trigger | Purpose |
|---|---|---|
| `ci.yml` "Testler" | PR; called by `hostinger.yml` | 2 shards + required check "Testler (tam set)" |
| `hostinger.yml` "Hostinger paketi" | push to `main` (not docs-only); manual (default branch only) | tests, type check, build + harden, write `site` branch, zip artifact |
| `db-migrate.yml` "Veritabanı migration" | manual only | `environment` = staging or production; `mode` = plan, apply, adopt-existing-baseline |
| `expo-mobile.yml` "Mobil uygulama (Expo)" | PR/push touching `app/`; manual | `tsc` + iOS/Android bundle export; manual dispatch starts an EAS build (`EXPO_TOKEN`) |
| `guvenlik.yml` | PR, `main`, weekly | Semgrep, gitleaks, npm audit |
| `codeql.yml` | `main` (code paths), weekly, manual | CodeQL |
| `safari.yml` | PR (not docs-only) | WebKit `@mobil` tests, non-blocking |

- **Secrets:** `EXPO_TOKEN` (Expo robot `github-actions`), `SENTRY_AUTH_TOKEN` (Sentry org token, scope `org:ci`). **Environment secrets** `SUPABASE_DB_URL` in `staging` and in `production` (Session pooler address).
- **Variables:** `SUPABASE_TARGET` (per environment, equals the environment name), `VAPID_PUBLIC_KEY`, `SENTRY_DSN_WEB`, `TURNSTILE_SITE_KEY` (web only), `APPLE_TEAM_ID` (`F5DQK4ZWFP`),
  `ANDROID_SHA256` (Play app-signing certificate). Optional overrides with built-in defaults: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SENTRY_ORG` (`anahtar`), `SENTRY_PROJECT` (`anahtar-web`), `SENTRY_URL` (`https://de.sentry.io/`).
- `.gitleaksignore` holds 2 fingerprints for a fake test token. Dependabot opens monthly grouped PRs (no major versions).

## 4. Web hosting, domain, DNS, mail

- **anahtar.io** is a static Expo web export on Hostinger, which pulls the `site` branch. TLS is Let's Encrypt. `www` redirects to the apex (301). DNS is at Hostinger (NS `dns-parking.com`).
- **Security headers:** CSP per page via `app/scripts/harden-html.mjs` (meta tag); response headers via `app/public/.htaccess`. Hostinger's CDN does not forward `www` to the server, so the `www` redirect also exists client-side (PR #110).
- **`.well-known`:** `security.txt`; `apple-app-site-association` and `assetlinks.json` are generated at build by `app/scripts/well-known.mjs` from `APPLE_TEAM_ID` / `ANDROID_SHA256`
  (universal links for `/katil`, `/dogrula`, `/yeni-sifre`).
- **Legal pages** (final, Devredin A.S. values): `/gizlilik/` (privacy + KVKK), `/kosullar/` (terms + subscription terms), `/hesap-silme/`, `/destek/`. Product contact `info@anahtar.io`.
- **Mail:** Hostinger mailbox `info@anahtar.io` (SMTP `smtp.hostinger.com:465`) is used by the Edge Functions (`SMTP_*` secrets) and by Supabase Auth SMTP. SPF/DKIM come from Hostinger.
  DMARC (`p=quarantine`), CAA (`letsencrypt.org`) and DNSSEC were planned ([guvenlik.md](guvenlik.md) section 2); their current state is **not verified**.

## 5. Supabase

| | Production | Staging |
|---|---|---|
| Project ref | `nfpefnrgtnwvclwbriaw` | `omckqypxpcamrfhnmbyx` |
| Region | `eu-central-1` (Frankfurt) | `eu-west-3` (Paris) |
| Compute | Micro (since 2026-11-13) | |
| Postgres | 17 | |
| Backups | daily, PITR **off** | |
| Extras | pg_cron, pg_net, Vault, app secrets | **none** of pg_cron / pg_net / app secrets; on a withdrawn release channel (should be upgraded or recreated) |

- **Migrations:** 51 applied in staging and production through Actions (as of 2026-11-13). Two follow-up migrations wait in `specs/followup-migrations/` (`sistem_mesaji_kapat`, `site_residents_kod_gizle`):
  apply only in a separate PR once the new site has been live at least 24 hours (live since about 2026-11-13 16:14 UTC), with fresh timestamps.
- **Edge Functions (9)**, deployed manually with `supabase functions deploy <name> --project-ref nfpefnrgtnwvclwbriaw` (the CLI asks for `--yes` consent):

| Function | `verify_jwt` | Auth | Called by |
|---|---|---|---|
| `billing` | false | `x-anahtar-secret` (cron) / RevenueCat `Authorization` value (webhook) | RevenueCat webhook "supabase billing"; cron `anahtar-billing-reconcile`; app sync |
| `push` | false | `x-evim-secret` | DB trigger `bildirim` on `notifications` |
| `lead-mail` | false | `x-anahtar-secret` | DB triggers `talep` (`support_requests`), `hukuki` (`legal_requests`) |
| `mail-send` | false | `x-anahtar-secret` | DB trigger `kuyruk` (`mail_outbox`); cron `anahtar-mail-sweep` |
| `report` | false | `x-anahtar-secret` | cron `anahtar-rapor-aylik`, `anahtar-rapor-yillik` |
| `tufe-sync` | false | `x-anahtar-secret` | cron `tufe-sync-aylik` |
| `welcome`, `invite-mail`, `site-invite` | true | user JWT | the app |

  Functions read the service key through `_shared/keys.ts` (new `SUPABASE_SECRET_KEYS` first, legacy key as fallback).
- **Auth settings:** email confirmation **off** (instant sign-up); CAPTCHA **off** (the web Turnstile widget is present but not enforced; phones have none, native Turnstile was removed); password minimum 8 and
  leaked-password check on; email send interval 60 s; redirect allow-list `/giris`, `/giris?dogrulandi=1`, `/yeni-sifre`, `/dogrula`; PKCE flow in the client.
- **Storage:** bucket `evim`, private, 10 MB limit, MIME allowlist (jpeg, png, webp, heic, heif, pdf, mp4, m4v, mov, webm).
- **Payments switch:** `public.app_config` key `billing_paused` (`false` since 2026-11-13 18:17 UTC).
- **Retention:** `mail_outbox` 90 days, resolved support requests 6 months, logs 90 days, `cron.job_run_details` 14 days.
- **Agent access:** Supabase MCP (read-only by policy unless Erdem approves), Supabase CLI 3.x, Actions for migrations. Never `supabase link`.

### 5.1 Cron jobs (pg_cron, times in UTC)

Check live: `select jobname, schedule from cron.job order by jobname;` (14 jobs expected).

| Job | Schedule | Does | Defined in |
|---|---|---|---|
| `anahtar-mail-sweep` | `*/15 * * * *` | `mail-send` sweep of the mail queue | `kasa_sirlari` |
| `anahtar-rapor-aylik` | `0 6 1 * *` | monthly report via `report` | `kasa_sirlari` |
| `anahtar-rapor-yillik` | `30 6 1 1 *` | yearly report via `report` | `kasa_sirlari` |
| `tufe-sync-aylik` | `0 13 * * *` | inflation (TUFE) sync via `tufe-sync` | `kasa_sirlari` |
| `anahtar-billing-reconcile` | `30 4 * * *` | re-sync store subscriptions via `billing` | `kasa_sirlari` |
| `anahtar-cron-prune` | `20 0 * * *` | delete `cron.job_run_details` older than 14 days | `kasa_sirlari` |
| `evim-daily-reminders` | `0 6 * * *` | `daily_reminders()` | baseline |
| `evim-billing-reminders` | `30 6 * * *` | renewal reminders (`billing_reminders()`) | baseline |
| `anahtar-site-reminders` | `5 6 * * *` | `site_reminders()` | baseline |
| `anahtar-site-auto` | `0 6 * * *` | `site_auto_run()` | baseline |
| `anahtar-site-recurring` | `15 6 * * *` | recurring site expenses | `duzenli_gider_seffaflik` |
| `anahtar-site-late` | `0 6 * * 1` | weekly late-payment digest | `odeyen_ve_bildirim_ayarlari` |
| `anahtar-crm-reminders` | `30 6 * * *` | `crm_reminders()` | `crm` |
| `anahtar-log-prune` | `15 0 * * *` | `prune_logs()` (90-day retention) | `uygulama_loglari` |

Cron and webhook calls never contain a secret: they call `public.anahtar_call(...)` / `public.anahtar_webhook(...)`, which read the Vault entry **at call time**.

### 5.2 Webhooks and callbacks

| From | To | Authenticated by |
|---|---|---|
| DB triggers `talep`, `hukuki` | `lead-mail` | Vault `anahtar_lead_secret` ↔ function secret `LEAD_SECRET` (header `x-anahtar-secret`) |
| DB trigger `bildirim` | `push` | Vault `anahtar_push_secret` ↔ `WEBHOOK_SECRET` (header `x-evim-secret`) |
| DB trigger `kuyruk`, cron sweep | `mail-send` | Vault `anahtar_mail_secret` ↔ `MAIL_SECRET` |
| Cron reports | `report` | Vault `anahtar_report_secret` ↔ `REPORT_SECRET` |
| Cron TUFE | `tufe-sync` | Vault `anahtar_tufe_secret` ↔ `TUFE_SECRET` |
| Cron reconcile | `billing` | Vault `anahtar_billing_secret` ↔ `BILLING_CRON_SECRET` |
| RevenueCat webhook "supabase billing" | `https://nfpefnrgtnwvclwbriaw.supabase.co/functions/v1/billing` | raw `Authorization` value equal to `REVENUECAT_WEBHOOK_AUTH` |
| Apple App Store Server Notifications v2 | RevenueCat | App Store Connect setting |
| Google Play real-time developer notifications (Pub/Sub topic `projects/anahtario/topics/Play-Store-Notifications`) | RevenueCat | verified working |

## 6. Secrets: names and where they live

**Never** write values anywhere. "Where" tells you which console to use; Erdem (or an approved agent action) sets them.

| Place | Names |
|---|---|
| **Supabase Vault** (read by triggers/cron at call time) | `anahtar_functions_url` (setting, not secret), `anahtar_lead_secret`, `anahtar_mail_secret`, `anahtar_push_secret`, `anahtar_report_secret`, `anahtar_tufe_secret`, `anahtar_billing_secret` |
| **Supabase function secrets** (`supabase secrets set`) | `APP_URL`, `EMAIL_FROM`, `EVDS_KEY`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `LEAD_SECRET`, `MAIL_SECRET`, `WEBHOOK_SECRET` (push), `REPORT_SECRET`, `TUFE_SECRET`, `BILLING_CRON_SECRET`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `APNS_KEY`, `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_BUNDLE_ID`, `FCM_SERVICE_ACCOUNT`, `REVENUECAT_SECRET_KEY`, `REVENUECAT_WEBHOOK_AUTH`, `SENTRY_DSN`, `SENTRY_ENV` (plus the `SUPABASE_*` names Supabase injects itself) |
| **GitHub** | secrets `EXPO_TOKEN`, `SENTRY_AUTH_TOKEN`; environment secrets `SUPABASE_DB_URL` (staging, production); variables listed in section 3 |
| **EAS environments** `production` and `preview` | `EXPO_PUBLIC_SENTRY_DSN_MOBILE`, `SENTRY_ORG` (`anahtar`), `SENTRY_PROJECT` (`anahtar-mobile`), `SENTRY_URL` (`https://de.sentry.io/`), `SENTRY_AUTH_TOKEN` (secret), `EXPO_PUBLIC_RC_IOS_KEY`, `EXPO_PUBLIC_RC_ANDROID_KEY`, `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` (publishable, plain text), `EXPO_PUBLIC_APP_ENV`, `GOOGLE_SERVICES_JSON` (secret file). `EXPO_PUBLIC_TURNSTILE_SITE_KEY` was deleted when native Turnstile was removed. The three `EXPO_PUBLIC_SUPABASE_*`/`APP_ENV` values were added on 2026-11-13 for OTA (`eas update` reads only EAS variables) and must stay equal to `app/eas.json` |
| **Supabase Auth settings** (dashboard) | SMTP password (same mailbox as `SMTP_PASS`); CAPTCHA secret (Turnstile, currently not enforced) |
| **Erdem's Mac** `~/.config/anahtar/secrets` (chmod 700/600) | APNs `.p8`, App Store Connect API `.p8`, In-App Purchase `.p8`, iOS distribution key/certificate/`.p12` and its password, App Store provisioning profile, FCM service-account JSON, `google-services.json`, Play service-account JSONs, RevenueCat secret key and webhook auth, Turnstile secret, billing cron secret, rotated function secrets, review demo-account password, Supabase management token |
| In the app bundle (public by design) | Supabase URL and **publishable** key (`app/eas.json`, workflow defaults), RevenueCat public SDK keys, Sentry DSNs, `VAPID_PUBLIC_KEY`, Turnstile **site** key |

The `service_role` / "secret" Supabase key never goes into the repo, a variable, a page or chat. Rotation procedures: [release-and-ota.md](release-and-ota.md) section 4.

## 7. Sentry (EU)

- Org `anahtar` at `https://anahtar.sentry.io`, region `de.sentry.io`. Projects: `anahtar-web`, `anahtar-mobile`, `anahtar-edge`. The old empty US org `anahtario` is scheduled for deletion.
- **Alerts:** issue alert "Yeni sorun, gerileme veya yeniden ortaya çıkan hata" (email to the team). Metric monitors: error spikes (web and mobile more than 20 per hour, edge more than 10 per hour) and mobile crash rate above 2%.
  **Uptime:** `https://anahtar.io/` every 5 minutes (a Supabase auth-health monitor exists but is disabled because of plan quota). **Cron monitor** `tufe-sync` (`0 13 * * *` UTC).
- **Privacy:** IP storage off, data scrubbers required, enhanced privacy on, no session replay. Org auth token `eas-and-github-sourcemaps` (`org:ci`) is in EAS and GitHub.
- **Code:** `app/src/domain/sentry.js` (web, lazy `@sentry/browser`), `sentry.native.js`, `sentry-scrub.js` (mirrors `log_redact`), `supabase/functions/_shared/sentry.ts`. The `client_errors` and `function_logs` tables stay.
- Details: [loglar.md](loglar.md).

## 8. Expo / EAS

- Account `anahtar_io` (owner login `info@anahtar.io`; admin `erdem61`). Project `@anahtar_io/anahtar`, id `033b708c-b12b-455e-9c8e-10d12531d9f5`. Free plan.
- Robot user `github-actions` (Developer) owns the CI token (`EXPO_TOKEN`).
- **Credentials held by EAS:** iOS Apple Distribution certificate `TU8CY5A2T8` (**expires 2027-11-13**), App Store provisioning profile `6A4HTSNTNF`, App Store Connect API key `CPW6Z9Q984` assigned for EAS Submit;
  Android upload keystore (managed by EAS); Play submit service account `eas-submit@anahtario.iam.gserviceaccount.com`.
- `app/eas.json`: `appVersionSource: remote` with `autoIncrement` for `production`; profiles `development`, `preview`, `production`, each with a **channel** of the same name; submit iOS `ascAppId` `6834434284`,
  `appleTeamId` `F5DQK4ZWFP`; submit Android track `internal`, `releaseStatus` `draft`.
- **OTA:** `expo-updates` added 2026-11-13 (PR #117). `runtimeVersion` policy `appVersion`; `updates.url` is `https://u.expo.dev/033b708c-b12b-455e-9c8e-10d12531d9f5`.
  Builds from iOS 1.0.0 (5) and Android 1.0.0 (4) onward can receive `eas update --channel production` (JS/UI only).
- **Builds so far:** iOS 1.0.0 (2) in TestFlight (beta review pending), iOS (4) with the English fixes; Android 1.0.0 (2) and (3) on the Play internal track.

## 9. Apple

- Team `F5DQK4ZWFP` (Account Holder the Devredin company account). App **"anahtar: Kira Yönetimi"** (en: "anahtar: Rent Management"), Apple ID `6834434284`, bundle `io.anahtar.app`, SKU `anahtar-ios`,
  iPhone only, free, all 175 territories, **manual release**. Category Business / Productivity. Age rating 4+ (messaging and user-generated content declared).
- **Keys:** APNs topic-specific production key `2PCKAYNT89` (`io.anahtar.app`); In-App Purchase key `3L6WDN3A8H` (used by RevenueCat); team API key `CPW6Z9Q984` (App Manager) for EAS Submit and automation. Files: Erdem's local secrets folder.
- **Subscriptions:** group "anahtar" (id `22576407`), 36 auto-renewable products `tek_N_aylik`/`tek_N_yillik`, `bes_N_aylik`/`bes_N_yillik` (N = 1 to 9), no introductory offers, all territories with Apple-equalised prices from the TRY base
  (Başlangıç 99,99 TRY per property per month, 999,99 per year; Profesyonel 199,99 / 1.999,99; table: `node app/scripts/magaza-fiyatlari.mjs`).
- **TestFlight:** internal group **Ekip** (all builds; Erdem and the company technical address); external group **Dış test**, public link <https://testflight.apple.com/join/zhpWEbFX> (works after beta review).
- **App Privacy** published (13 data types, linked, no tracking, app functionality). **Review demo accounts:** `inceleme-mulk@anahtar.io` (landlord, permanent `bes_3` admin plan) and `inceleme-kiraci@anahtar.io` (tenant);
  password only in Erdem's local secrets folder; script `app/scripts/inceleme-hesaplari.mjs`.

## 10. Google (Play, Firebase, GCP)

- Play developer account "Devredin Bilgi Teknolojileri" (id `6056480897635807028`). App **"anahtar"** (Play app id `4975702664716824305`), package `io.anahtar.app`, 178 countries, category Business, contact `info@anahtar.io`.
  All App content declarations done (data safety, IARC rating, 18+ audience, no ads, no financial features). Internal testing track with tester list **Ekip**.
  **Trader status must be declared by the account owner (deadline February 2027).**
- **App signing SHA-256** (public, also in the `ANDROID_SHA256` variable): `6D:99:2F:BA:44:FD:A8:B0:F8:C6:69:37:FA:9D:B1:B2:3B:32:4B:4A:BB:56:F6:3B:14:FF:D7:BE:EC:CD:9A:D1`.
- **GCP / Firebase project `anahtario`** (Firebase sender id `1046081165109`; Analytics off). Service accounts: `eas-submit@anahtario.iam.gserviceaccount.com` (Play releases + store presence) and
  `revenuecat@anahtario.iam.gserviceaccount.com` (financial data, orders/subscriptions; Pub/Sub admin). The org policy `iam.allowedPolicyMemberDomains` was reset **on project `anahtario` only** so Play notifications can reach RevenueCat.
  RTDN topic `projects/anahtario/topics/Play-Store-Notifications` → RevenueCat (verified).
- **Play subscriptions** `tek` and `bes`, 18 base plans each (`N-aylik` P1M, `N-yillik` P1Y), all regions via Google price conversion: **creation pending Google permission propagation** (script ready).

## 11. RevenueCat

- DevirVentures account, project **"anahtar"** (id `4a08cddd`), next to Benzersor, Devredin and Zinciri Kırma. Apps: App Store (bundle `io.anahtar.app`, IAP key `3L6WDN3A8H`) and Play (app `app3dcdcb6b09`, service account `revenuecat@…`).
- Entitlement **`pro`** (36 App Store products attached; the 36 Play products are added after they exist). No offerings (the app fetches products directly). Restore behaviour "Keep with original App User ID". `app_user_id` = Supabase user UUID.
- Webhook "supabase billing" → function `billing` (section 5.2). The server re-reads the subscriber through the REST v1 secret key; a daily reconcile cron backs it up; RevenueCat records are deleted when an account is deleted.

## 12. Cloudflare

- Turnstile widget **"anahtar"** (domains `anahtar.io`, `www`) in the devredin Cloudflare account. **Web only**: the phones have no CAPTCHA and Supabase CAPTCHA enforcement is off. anahtar.io DNS is **not** on Cloudflare.

## 13. Decisions of record (2026-11-13)

DevirVentures publishes; Devredin A.S. is data controller. In-app purchase via RevenueCat; purchasing on phones only (web points to the app). Server 30-day trial only. Catalog: 1 to 9 properties x 2 tiers x monthly/yearly.
iPhone only. Sentry in the EU. Universal links yes. Invite codes at least 80 bits, bound to the e-mail when one is set. Native push yes, SMS no. No CAPTCHA on phones. Manual release after approval. No repo protections (owner decision).

## 14. Open items

| # | Item | Owner | When |
|---|---|---|---|
| 1 | Disable the legacy JWT API keys in Supabase (functions already use the new secret keys; verify first) | Erdem (console) | after one clean day of function logs |
| 2 | Rotate the `info@anahtar.io` mailbox password and update `SMTP_PASS` (and the Supabase Auth SMTP setting) | Mailbox owner + Erdem | soon; it was equal to a plaintext trigger secret before the fix |
| 3 | Staging parity: upgrade or recreate staging (withdrawn release channel; no pg_cron, pg_net, app secrets) | Erdem | before the next migration that depends on those extensions |
| 4 | Apply the two follow-up migrations in a separate PR (new site live at least 24 h; earliest 2026-11-14 about 16:14 UTC) | Agent opens PR; Erdem approves merge and applies | from 2026-11-14 |
| 5 | Create Play subscriptions `tek` and `bes` (18 base plans each) once Google permission propagates, then add the 36 Play products to RevenueCat entitlement `pro` | Agent (script ready) + Erdem | when permission is active |
| 6 | Declare Play trader status | Play account owner (Erdem) | before February 2027 |
| 7 | TestFlight external beta review (`Dış test` opens after approval); then store review submission and manual release | Erdem approves | pending |
| 8 | Merge the PR that removes native Turnstile and fixes the safe area, then ship a new build (or OTA if JS-only) | Erdem approves merge | in progress |
| 9 | Delete the old US Sentry org `anahtario` (scheduled) and re-enable the auth-health uptime monitor if the plan allows | Erdem | |
| 10 | Verify DMARC, CAA, DNSSEC at Hostinger; confirm unused GitHub secrets (`SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_REF`) are deleted | Erdem / `fahricankuz` | |
| 11 | Open Dependabot PRs #105, #106, #108 (patch/minor bumps) | Agent reviews; Erdem approves | |
| 12 | iOS distribution certificate expires 2027-11-13: renew through EAS | Erdem | October 2027 |
| 13 | Apple Small Business Program application ([abonelik.md](abonelik.md) section 1) | Erdem | verify status |
| 14 | `docs/magaza.md`, `docs/guvenlik.md`, `docs/yol-haritasi.md`, `docs/canliya-alma.md` (section 2a), `docs/mobil.md` still describe some pre-launch states (legal pages "draft", native Turnstile); another PR updates them | Agent | in progress |
| 15 | **First OTA test:** `eas update` (SDK 55+) uses only EAS environment variables, not the `env` of `eas.json` build profiles. The Supabase URL, publishable key and `EXPO_PUBLIC_APP_ENV` were added to the EAS `production` and `preview` environments on 2026-11-13; test the first update on `preview` before the first production OTA ([release-and-ota.md](release-and-ota.md) section 7) | Agent + Erdem | before the first production OTA |
