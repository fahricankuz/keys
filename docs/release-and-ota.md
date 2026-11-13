# Release runbooks: web, functions, database, secrets, builds, stores, OTA

Step-by-step procedures. Each runbook has: **before**, **steps**, **check**, **rollback**. Facts and ids (project refs, accounts, secret names) are in [infrastructure.md](infrastructure.md).
Rules and who must approve what: [../AGENTS.md](../AGENTS.md) sections 4 and 7. The full order for a big release (security + stores) is [canliya-alma.md](canliya-alma.md) section 6 (Turkish).

**Golden rules**

- Nothing here starts without Erdem's explicit yes for that action (merge, migration apply, function deploy, build, store submit, OTA, secret change). Show the plan first.
- No secret value is ever typed into chat, a PR, a log or a command line that is saved in history. Use shell variables read from the local secrets folder or paste inside the console yourself.
- Report each claim separately: merged, web deployed, function deployed, migration applied, build uploaded, live-verified.
- Normal order of a release that touches several layers: **merge (site) → secrets → edge functions → migrations → post-apply checks → builds/OTA → stores.** The site deploys before migrations,
  so code must tolerate the old schema; functions go before migrations because they tolerate it too.

| Runbook | Section |
|---|---|
| Web deploy | 1 |
| Edge Function deploy | 2 |
| Database migration | 3 |
| Secret rotation | 4 |
| EAS build, TestFlight, Play internal | 5 |
| Store review and manual release | 6 |
| OTA update | 7 |
| Version bumps | 8 |
| Rollback summary | 9 |
| Sentry checks after every release | 10 |

## 1. Web deploy (PR → merge → `hostinger.yml` → `site` branch)

**Before:** PR is ready (not draft); required checks green (**Testler (tam set)**, **Mobil uygulama (Expo)** if `app/` changed, **Güvenlik taraması**); independent review done; PR body has evidence, not-run list and rollback.

**Steps**

1. Erdem says "merge" for this PR. Merge into `main` (never push to `main`).
2. The push to `main` starts **Hostinger paketi** (`.github/workflows/hostinger.yml`; docs-only changes are skipped). It runs `test` (calls `ci.yml`, two shards), then `package`:
   `npm ci`, `tsc --noEmit`, `npm run build:hostinger` (static web export with source maps → `harden-html.mjs` CSP → upload source maps to Sentry and delete the `.map` files → `well-known.mjs` → copy to `hostinger-site`),
   zip artifact `anahtar-hostinger` (kept 30 days), then force-write the `site` branch (commit "Site derlemesi `<sha7>`").
3. Hostinger pulls the `site` branch and publishes it (a few minutes after the run). Total time roughly 10 to 15 minutes.
4. Emergency only, with Erdem's approval: Actions → **Hostinger paketi** → Run workflow (default branch only) with `testleri_atla` ticked.

**Check** (the run must be green first; do these after the `site` commit appears)

- `curl -sI https://anahtar.io/ | head` shows 200 and the security headers; `curl -sI https://www.anahtar.io/` redirects (301) to the apex.
- Open `https://anahtar.io/`, hard refresh, no red CSP errors in the console; sign-in page loads; `/gizlilik/`, `/kosullar/`, `/hesap-silme/`, `/destek/` open.
- `https://anahtar.io/.well-known/apple-app-site-association` and `/.well-known/assetlinks.json` return JSON without redirect.
- Sentry `anahtar-web`: release equals the commit sha; no new issue burst (section 10).
- If the page is stale: hPanel cache purge (Cache Manager), then re-check.

**Rollback:** open a PR that reverts the commit (`git revert <sha>` on a branch), get the same approvals, merge; the workflow rebuilds. If the site is broken *now*: re-upload the previous run's `anahtar-hostinger.zip` artifact through
hPanel File Manager (see [hostinger.md](hostinger.md), zip method) while the revert PR runs. Never roll back the database with the site: schema changes need a reverse migration (section 3).

## 2. Edge Function deploy

**Before:** the change is merged (or Erdem explicitly asks for a pre-merge deploy). New or changed secrets are already set (section 4). CLI: `supabase` 3.x, logged in by Erdem.
A change under `supabase/functions/_shared/` means **every function that imports it** must be redeployed. Tests: `tests/functions-build.spec.mjs`, `tests/functions-deploy.spec.mjs`, `tests/function-keys.spec.mjs` and the function's handler spec.

**Steps** (production project ref `nfpefnrgtnwvclwbriaw`)

```bash
git switch main && git pull --ff-only
supabase functions deploy <name> --project-ref nfpefnrgtnwvclwbriaw     # consent prompt: --yes only after Erdem approved
supabase functions list --project-ref nfpefnrgtnwvclwbriaw               # version and update time moved
```

Do not pass `--no-verify-jwt`: `supabase/config.toml` decides (`billing`, `push`, `lead-mail`, `mail-send`, `report`, `tufe-sync` = false; `welcome`, `invite-mail`, `site-invite` = true).
Deploy one function at a time; start with the least critical.

**Check:** Supabase dashboard → Edge Functions → Logs: new invocations return 200 (401 means the function secret and the Vault entry differ; 5xx means a crash); Sentry `anahtar-edge`;
admin panel → Hatalar → Sunucu kayıtları (`function_logs`). A harmless trigger: `mail-send`/`push` only with a test account of Erdem's, never real users.

**Rollback:** deploy the previous version of the code. Create a clean checkout at the last good commit (`git worktree add ../keys-rollback <good-sha>`), run the same `supabase functions deploy` from there, then remove the worktree.
Then fix forward through a normal PR. Never leave the function on code that does not match `main` without writing it down.

## 3. Database migration (staging plan → apply → production plan → apply)

**Before:** the migration file exists in `main` (created with `npm run db:yeni -- name`, re-runnable, has a test, `schema.sql` regenerated). The site with the compatible client is already live and edge functions are deployed (section 2).
If it deletes or rewrites data: Erdem takes a backup first (`pg_dump` through the Session pooler address, or a Supabase backup check); the daily backup exists but PITR is off.
**Staging is not representative** for anything that needs pg_cron, pg_net or Vault (see [infrastructure.md](infrastructure.md) section 5): verify those parts in production.

**Steps** (GitHub → Actions → **Veritabanı migration** → Run workflow, branch `main`)

| # | environment | mode | You should see |
|---|---|---|---|
| 1 | staging | plan | "Would push these migrations:" with **only the new file** |
| 2 | staging | apply | "Applying migration …" and a green tick |
| 3 | production | plan | again only the new file. **Show this output to Erdem and wait for explicit approval.** |
| 4 | production | apply | "Applying migration …" and a green tick |

Optional fifth run: production `plan` should say "Remote database is up to date". A red step means **stop** and read the log; a failed `apply` leaves nothing half-done.
Do not use `adopt-existing-baseline` unless a database was never linked to the migration ledger. See [migrations.md](migrations.md) for the common errors.

**Check after production apply** (read only, in the Supabase SQL Editor or a read-only MCP session; **never select `decrypted_secret`**):

```sql
-- 1) Seven Vault entries (names only): anahtar_billing_secret, anahtar_functions_url, anahtar_lead_secret,
--    anahtar_mail_secret, anahtar_push_secret, anahtar_report_secret, anahtar_tufe_secret
select name from vault.secrets where name like 'anahtar\_%' order by name;
-- 2) No literal secret, JWT or old webhook method left in triggers -> 0 rows
select tgrelid::regclass as tablo, tgname from pg_trigger
 where not tgisinternal and pg_get_triggerdef(oid) ~* '(eyJ|bearer|authorization|http_request)';
-- 3) No literal secret or JWT in cron jobs -> 0 rows
select jobname from cron.job where command ~* '(eyJ|bearer|authorization)';
-- 4) Cron jobs installed (14 expected, see infrastructure.md section 5.1)
select jobname, schedule from cron.job where jobname like 'anahtar-%' or jobname like 'tufe-%' or jobname like 'evim-%' order by jobname;
-- 5) Webhook and cron call results in the last hour: 200 expected (401 = function secret differs from Vault)
select status_code, count(*) from net._http_response where created > now() - interval '1 hour' group by 1;
-- 6) Payments switch
select key, value from public.app_config where key = 'billing_paused';
```

Then one functional probe with Erdem's own test account (for example a support request) and look for a 200 from `lead-mail`/`push` in Edge Functions → Logs. Also read the Supabase advisors (security and performance) through the read-only MCP.
For a **follow-up migration** PR (`specs/followup-migrations/README.md`): only after the new site has been live at least 24 hours; same four steps.

**Rollback:** migrations only go forward. Write a **new** re-runnable migration that reverses the change, with a test, and run the same four steps. Never edit an applied file. If a backup restore is the only option, that is an incident: stop and ask Erdem.

## 4. Secret rotation (Vault and function secrets together)

Applies to the webhook/cron secrets (Vault `anahtar_*_secret` ↔ function secret) and other keys. Rotate on leak, on a team change, or periodically. **Tell Erdem first.** Values never appear in chat or logs.

**Webhook/cron secret (example `lead-mail`: Vault `anahtar_lead_secret`, function secret `LEAD_SECRET`)**

1. Generate a random value in your shell without printing it: `NEW=$(openssl rand -hex 32)` (at least 32 bytes).
2. Set the function secret: `supabase secrets set LEAD_SECRET="$NEW" --project-ref nfpefnrgtnwvclwbriaw`.
3. **Within minutes** set the same value in Vault (SQL Editor, Erdem pastes it himself; the value comes from his clipboard or the local secrets folder, not from chat):
   `select vault.update_secret((select id from vault.secrets where name = 'anahtar_lead_secret'), '<new value>');` (use `vault.create_secret(value, name)` if the entry does not exist).
   In the gap between steps 2 and 3 calls answer 401; triggers only log a warning (they never block an insert) and cron retries on its next tick.
4. Save the new value in Erdem's local secrets folder (`~/.config/anahtar/secrets`), then unset the shell variable (`unset NEW`).
5. If a migration reads the entry (`kasa_sirlari`), no re-apply is needed for a rotation; only re-apply if an entry was missing.

| Pair | Vault entry | Function secret | Header |
|---|---|---|---|
| lead-mail | `anahtar_lead_secret` | `LEAD_SECRET` | `x-anahtar-secret` |
| mail-send | `anahtar_mail_secret` | `MAIL_SECRET` | `x-anahtar-secret` |
| push | `anahtar_push_secret` | `WEBHOOK_SECRET` | `x-evim-secret` |
| report | `anahtar_report_secret` | `REPORT_SECRET` | `x-anahtar-secret` |
| tufe-sync | `anahtar_tufe_secret` | `TUFE_SECRET` | `x-anahtar-secret` |
| billing reconcile | `anahtar_billing_secret` | `BILLING_CRON_SECRET` | `x-anahtar-secret` |

**Check:** after 5 to 15 minutes `select status_code, count(*) from net._http_response where created > now() - interval '15 minutes' group by 1;` shows 200s only for the rotated path; Edge Functions → Logs clean; Sentry `anahtar-edge` quiet.
**Rollback:** the old value is gone by design; if the new one fails, set a **new** value in both places again. Do not paste the old value back from memory or logs.

**Other secrets**

| Secret | Procedure |
|---|---|
| `SMTP_PASS` (mailbox `info@anahtar.io`) | Mailbox owner changes the password in Hostinger → `supabase secrets set SMTP_PASS=…` **and** the SMTP password in Supabase Auth settings → test email to Erdem only |
| `REVENUECAT_WEBHOOK_AUTH` | Change the Authorization value in the RevenueCat webhook **and** `supabase secrets set REVENUECAT_WEBHOOK_AUTH=…` together; send RevenueCat's test event; `billing` logs 200 |
| `REVENUECAT_SECRET_KEY` | New secret key in RevenueCat → `supabase secrets set` → revoke the old key → reconcile cron or a test event confirms |
| `APNS_KEY`, `APNS_KEY_ID` | New topic-specific production key for `io.anahtar.app` in Apple → set both → send a push to Erdem's device → revoke the old key |
| `FCM_SERVICE_ACCOUNT` | New key for the FCM service account in GCP `anahtario` → set → test push on Android → delete the old key |
| `EXPO_TOKEN`, `SENTRY_AUTH_TOKEN` | Create the new token (Expo robot `github-actions` / Sentry org token `org:ci`) → update GitHub and EAS (`eas env:update`) → delete the old token |
| `SUPABASE_DB_URL` (GitHub environments) | Rotate the DB password in Supabase → update **both** environment secrets (staging, production) → run a `plan` to confirm |
| Supabase legacy JWT keys | After one clean day of function logs on the new secret keys, Erdem disables the legacy keys in the Supabase dashboard (listed in the open items) |

## 5. EAS build and TestFlight / Play internal

**Before:** Erdem approved a build. `main` is clean and up to date. `eas whoami` shows the Expo account (`erdem61` or the robot in CI). Version rules: section 8. EAS environment `production` has the names listed in
[infrastructure.md](infrastructure.md) section 6 (`eas env:list production`; secret values are not shown). The free plan queues builds at low priority, so waiting 30 minutes or more is normal.

**Steps**

```bash
cd app && npm ci && npx tsc --noEmit
# iOS: build and upload to TestFlight in one go
npx eas-cli build --profile production --platform ios --auto-submit
# Android: build the .aab, then send it to the Play internal track (draft release)
npx eas-cli build --profile production --platform android
npx eas-cli submit --platform android --profile production --latest
```

(If a flag is rejected, check `eas build --help`/`eas submit --help`; the workflow pins eas-cli 27.9.0.) Alternative with no local tools: Actions → **Mobil uygulama (Expo)** → Run workflow → profile `production`, platform `ios`/`android`/`all`
(uses the `EXPO_TOKEN` robot; it only queues the build). Submit afterwards with `eas submit … --latest` (iOS: `--platform ios --profile production --latest`, which uses the App Store Connect API key `CPW6Z9Q984` stored in EAS).

- **iOS → TestFlight:** after upload, App Store Connect processes the build (usually 10 to 30 minutes). Internal group **Ekip** receives every build automatically. For the external group **Dış test**
  (public link <https://testflight.apple.com/join/zhpWEbFX>) add the build; the first build of a version goes through Beta App Review.
- **Android → Play:** `eas submit` creates a **draft** release on the internal track (`releaseStatus: draft`). In Play Console → Testing → Internal testing → the draft → review and roll out. Testers are the list **Ekip** (opt-in link from the console).
  (The very first `.aab` had to be uploaded by hand; later ones go through the API.)
- Build numbers are managed by EAS (`appVersionSource: remote`, `autoIncrement`); never edit `buildNumber`/`versionCode` by hand.

**Check on a real device** ([gercek-cihaz-kontrol.md](gercek-cihaz-kontrol.md), [magaza.md](magaza.md) section 10): sign-in, universal links (`/katil`, `/dogrula`, `/yeni-sifre`), push, photo upload, sandbox purchase + restore + plan change
(Erdem asks; sandbox only), account deletion, a Sentry test event in `anahtar-mobile` (release shows the app version). Note the build number you tested.

Scripted store checks and uploads (read-only or dry-run by default; `--apply` needs Erdem's approval): `app/scripts/magaza/README.md` (`npm run magaza:durum --prefix app` shows builds, TestFlight, subscription prices; `magaza:play-yukle` sends an `.aab` to Play internal).

**Rollback:** a build cannot be recalled. Stop distribution instead: TestFlight → expire the build or remove it from the groups; Play → halt the rollout or replace the draft. Ship the fix as a **new** build (version codes only go up) or, if it is JavaScript-only, as an OTA (section 7).

## 6. Store review submission and manual release

Always Erdem's explicit go, separately per store. Checklist before submitting: [magaza.md](magaza.md) section 10 (legal pages final, screenshots, privacy forms, demo accounts `inceleme-mulk@anahtar.io` / `inceleme-kiraci@anahtar.io` still work, `ITSAppUsesNonExemptEncryption` false).

**Apple (App Store Connect, Erdem logs in)**
1. App **anahtar: Kira Yönetimi** → iOS version → select the tested TestFlight build → confirm metadata (TR/EN text, screenshots, App Privacy published, review notes and demo account, age rating 4+).
2. **Add for Review / Submit.** Release mode is **manual** ("Manually release this version"). Status path: Waiting for Review → In Review → Pending Developer Release.
3. After approval **Erdem clicks "Release this version"**. Then check the App Store page and install from it.

**Google (Play Console, Erdem logs in)**
1. App **anahtar** → Production (or the track Play allows) → create a release from the tested internal build; release notes TR/EN → send for review. Complete anything the console lists as required (for example trader status, which must be declared by the account owner by February 2027).
2. Use managed publishing so approval does not publish automatically; after approval **Erdem publishes**.

**After both are live:** `billing_paused` is currently `false` (since 2026-11-13 18:17 UTC). To pause purchases in an emergency (Erdem's approval): `update public.app_config set value = 'true'::jsonb where key = 'billing_paused';`
(the app picks it up within 5 minutes). Then watch RevenueCat events and `billing` logs.

**Rollback:** a released version cannot be pulled back to an older binary. Apple: remove from sale or submit a fixed build as a new version. Google: halt the staged rollout or release a new, higher version code. JavaScript-only fixes can go through OTA while the new build is in review.

## 7. OTA update (EAS Update)

`expo-updates` is in builds from iOS 1.0.0 (5) and Android 1.0.0 (4). `runtimeVersion` policy is `appVersion`, so an update reaches **only builds with the same `version`** in `app.json` and the same channel (`production` build = `production` channel).

| Can go OTA | Cannot go OTA (needs a store build) |
|---|---|
| JavaScript/TypeScript, screens, copy, translations (`en-*.js`), styles, bundled images | New or updated native modules, Expo SDK/React Native upgrades |
| Bug fixes in domain logic | `app.json`/`app.config.js` native settings: permissions, plugins, icons, splash, intent filters, entitlements, privacy manifest |
| Config reading from the server | Anything that changes `version` (that is a new runtime) |

**Before:** Erdem approved; the fix is **merged to `main`** (never publish an unmerged branch unless Erdem says so); the diff since the installed build has no native change:
`git diff <build-commit>..HEAD -- app/app.json app/app.config.js app/package.json` shows no native-relevant change. `npx tsc --noEmit` and the related tests pass.

**Steps**

```bash
git switch main && git pull --ff-only
cd app && npm ci && npx tsc --noEmit
npx eas-cli update --channel production --environment production --message "short description (PR #NNN)"
```

- `--environment production` is **required from SDK 55** (Expo docs): only the variables stored in the EAS `production` environment are used during the update, **not** `.env` files, and **secret-type variables are not available**.
  **Trap (fixed 2026-11-13):** the Supabase URL, the publishable key and `EXPO_PUBLIC_APP_ENV` are defined in the `env` blocks of `app/eas.json` build profiles, which `eas update` does not read. Without them an OTA bundle starts without a backend ("local account mode").
  They were added to the EAS `production` and `preview` environments as plain-text variables (public values, same as `eas.json`). **If you ever change them in `eas.json`, change them in the EAS environment too** (`eas env:list --environment production`). Still confirm the first OTA on the `preview` channel with a `preview` build before publishing to `production`.
- Sentry source maps are uploaded with the secret `SENTRY_AUTH_TOKEN`, which is not available during `eas update`; stack traces from OTA bundles may be unreadable until maps are uploaded by hand (Sentry CLI, Erdem's token). Check this on the first OTA.
- Updates are staged per channel; there is no gradual rollout by default. Users get the update on the next app start (downloaded in the background, applied on the following launch).

**Check:** `eas update:list --branch production --limit 3` shows the new group; install a build from the channel, open the app twice, confirm the fix and the app still talks to the backend; Sentry `anahtar-mobile` shows the new update id in events; section 10 checks.

**Rollback**
- `npx eas-cli update:rollback` (roll back to the embedded bundle or an earlier update; choose in the prompt), **or**
- republish the previous good group: `eas update:list --branch production` → `eas update:republish --group <previous-group-id> --message "rollback"`, **or**
- merge a revert PR and publish a new update (fix forward).
Verify with a device twice-launch test. Check flags with `eas update:rollback --help` if the CLI changed.

## 8. Version bumps

| Where | Rule |
|---|---|
| `app/app.json` → `version` (now `1.0.0`) | The marketing version and the OTA runtime (`runtimeVersion: appVersion`). Change it **only** for a store release with native changes or a new App Store/Play version. After the bump, old installs no longer receive OTA from the new line. Keep `app/package.json` `version` equal. |
| `ios.buildNumber`, `android.versionCode` in `app.json` | Not authoritative: EAS keeps the real numbers remotely (`appVersionSource: remote`) and increments on every `production` build. Do not edit by hand. |
| Apple | Each submitted version must be higher than the last released one; a rejected binary needs a new build number, never a reused one. |
| Google | `versionCode` strictly increases (EAS handles it). |
| Root `package.json` `version` | Not a release number; leave alone. |

## 9. Rollback summary

| Layer | Fast rollback | Notes |
|---|---|---|
| Web | Revert PR → merge → workflow rebuilds (or re-upload the previous `anahtar-hostinger.zip` artifact in hPanel for an emergency) | `site` is force-written; there is no history in it |
| Edge Function | Redeploy the previous commit's code from a clean checkout | Then fix forward |
| Database | New reverse migration (four steps) | No "down"; backups only for incidents with Erdem |
| Secrets | New value in both places | The old value is not recoverable by design |
| Phone build | Stop distribution; ship a new build or an OTA | Version codes never decrease |
| OTA | `eas update:rollback` or republish the previous group | Takes effect on next app launch |
| Stores | Remove from sale / halt rollout / new version | Cannot restore an old binary |
| Payments | `billing_paused = true` (Erdem approves) | Takes up to 5 minutes |

## 10. Sentry checks after every release

Use the Sentry console or the Sentry MCP (org `anahtar`, region `https://de.sentry.io`). Look at 15 minutes, 1 hour and 24 hours after the release. Read only; do not resolve or delete issues unasked.

1. **New issues** in the project of the layer you touched: `anahtar-web` (release = commit sha), `anahtar-mobile` (release = app version, plus update id for OTA), `anahtar-edge` (function name tag). Any new issue with more than a handful of events, or on a funnel route
   (sign-up, sign-in, invite, payment), is a **P1 regardless of the user count**: stop and tell Erdem.
2. **Alerts:** the "new issue / regression" alert and the spike monitors (web/mobile above 20 events per hour, edge above 10) have not fired; **crash-free** stays at or above 98%; uptime monitor for `https://anahtar.io/` is green;
   the `tufe-sync` cron monitor did not miss its `0 13 * * *` UTC check-in.
3. **Backend side:** Supabase Edge Functions logs (4xx/5xx), `net._http_response` status counts after a migration or rotation, admin panel → Hatalar (`client_errors`, `function_logs`), read-only security/performance advisors.
4. **Store side** (after a build or review): TestFlight crash feedback, Play Console → Android vitals, RevenueCat events (webhook delivery to `billing`).
5. Write the result in the PR or the diary with the time and what you looked at; schedule a follow-up check if something is still open.
