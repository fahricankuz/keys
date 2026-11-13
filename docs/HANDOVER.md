# HANDOVER: anahtar, state after the 2026-11-13 launch day

> **Living document.** It is updated whenever the release moves forward; the change log at the bottom says what changed and when.
> Last updated: **2026-11-13 22:45 (Istanbul, UTC+3)**.
> Audience: an AI coding agent (Claude Code, Codex, others) with **no prior context**, working for the repo owners.
> The repo is **public**: this file contains IDs and names, never secret values. Do not add any.

---

## 0. Read this first (for the agent)

1. Read in this order: **this file** → [`AGENTS.md`](../AGENTS.md) (rules, how to run and test, approval matrix) →
   [`CLAUDE.md`](../CLAUDE.md) (owners' Turkish rules: migrations, release, commits) → [`docs/README.md`](README.md) (index of every doc).
2. **Talk to the owners in Turkish**, in plain language. They are partly non-technical. Prove every claim (command + output, PR link).
3. **You do not merge.** Open a PR into `main` and stop. Erdem (DevirVentures, he runs the release) merges. The owners agreed not to merge.
4. **Release 1.0.0 is in flight from Erdem's session** (section 4). Until this file says the store submissions are done:
   do **not** start EAS builds, store submissions, OTA updates, migrations, Edge Function deploys or production data changes.
   Opening PRs is fine.
5. Before saying something is unknown, look here, in [`docs/diary/2026-11-13.md`](diary/2026-11-13.md) (what was done, why, how) and
   [`docs/infrastructure.md`](infrastructure.md) (where everything runs, who owns it, where every secret **name** lives).

---

## 1. Status in one table

| Area | State | Details |
|---|---|---|
| Web `anahtar.io` | **Live**, new site since 2026-11-13 ~16:14 UTC | Static Expo web export on Hostinger, published from the `site` branch by `hostinger.yml` on every push to `main` |
| Backend (Supabase production `nfpefnrgtnwvclwbriaw`, Frankfurt) | **Live**: 51 migrations, 9 Edge Functions, Vault-based cron/webhooks | 21 real users. Compute Micro. Daily backups |
| Payments | **On** (`app_config.billing_paused = false` since 18:17 UTC) | In-app purchase via RevenueCat, phones only. Web points to the app |
| Monitoring | **On**: Sentry EU org `anahtar` (web, mobile, edge) | Alerts, error-spike and crash-rate monitors, uptime on `https://anahtar.io/` |
| iOS | TestFlight: build **(2)** waiting for external beta review, build **(4)** in internal testing | App Store version **1.0.0: PREPARE_FOR_SUBMISSION**, release type **MANUAL** |
| Android | Play **internal testing**: builds (2), (3) | Production release not yet submitted |
| Store subscriptions | App Store: 36 products in group `anahtar`, attached to RevenueCat `pro`; worldwide prices being written (section 4) | Play: **not created yet** (Google API permission still 403, section 4) |
| OTA updates | `expo-updates` merged (#117). First builds that can receive OTA: iOS **(5)**, Android **(4)** (not built yet) | EAS env variables for OTA fixed 2026-11-13 (section 5.6) |
| Repo | `main` = #112, #113, #114, #116, #117 merged; #115 closed | Open: native-fix PR (in progress), docs PR (this file), Dependabot #105 #106 #108 |

---

## 2. What changed on 2026-11-13 (short; full story in the diary)

| # | Change | Why | Where |
|---|---|---|---|
| 1 | **Security hardening** (PR #112): role-escalation fix (column grants + guard trigger), anon `EXECUTE` revoked on definer functions (6 allowlisted), 80-bit invite codes bound to email + throttles, storage prefix-proof rules + size/MIME limits, rate limits, push endpoint allowlist, webhook/cron secrets moved to **Vault** and rotated, Edge Functions on new secret keys, PKCE (no tokens in URLs), SecureStore sessions on phones, Android `allowBackup` off, CodeQL highs fixed, data-retention jobs | Audit found real privilege and data-exposure holes before going public | [`docs/security-guidelines.md`](security-guidelines.md) section 2 |
| 2 | **In-app purchase** with RevenueCat (36-product catalog: 1–9 properties × Başlangıç/Profesyonel × monthly/yearly), server-side entitlement re-read, daily reconcile, deletion queue | Store rules require IAP for digital subscriptions on phones | `supabase/functions/billing`, `app/src/domain/iap*.js`, [`docs/abonelik.md`](abonelik.md) |
| 3 | **Native push** (APNs + FCM) next to web push | Reminders on phones | `supabase/functions/push` |
| 4 | **Sentry EU** for web, mobile and Edge Functions, with PII scrubbing | Error visibility after launch | [`docs/loglar.md`](loglar.md), `app/src/domain/sentry*.js` |
| 5 | **Legal pages final** (`/gizlilik/`, `/kosullar/`, `/hesap-silme/`, `/destek/`), Devredin A.Ş. as data controller | Store requirement + KVKK | `app/public/*/index.html` |
| 6 | **Hotfix #113**: SSR build crashed (`window is not defined`) and stopped the web deploy | Fake-backend tests never ran the real-env static build | `app/src/domain/secure-storage.js` |
| 7 | **Store review demo accounts** script (#114) | Apple/Google reviewers need a landlord and a tenant account | `app/scripts/inceleme-hesaplari.mjs` |
| 8 | **Default branch renamed to `main`** (owner), workflows updated | Old `claude/...` name | `.github/workflows/*` |
| 9 | **English labels + saved language fix** (#116) | `t()` ran at module load; saved language reset to Turkish on start | `app/src/domain/en-*.js`, i18n |
| 10 | **OTA updates** (#117): `expo-updates`, channels per build profile | JS/UI fixes without a store release | `app/app.json`, `app/eas.json` |
| 11 | **Native Turnstile removed on phones** (PR in progress): the WebView widget opened Safari on `challenges.cloudflare.com` | Broke sign-in on iOS. Decision: **no CAPTCHA on phones**; Supabase CAPTCHA enforcement stays **off**; abuse limited by Supabase rate limits. Web keeps its Turnstile widget | branch `fix/native-turnstile-safearea` |
| 12 | **Safe-area fixes** on auth top bar and all screens (same PR) | Content under the notch/Dynamic Island | same branch |
| 13 | **Agent docs** (this PR): `AGENTS.md`, `CLAUDE.md` header, infrastructure, release/OTA runbooks, coding, security, SEO/GEO guidelines, diary, owners' guide (`docs/ai-ile-calisma.md`), `.claude/settings.json` guardrails | So any agent can work safely without Erdem's chat history | `docs/` |
| 14 | **Console work** (no code): Supabase auth settings, Apple/Google/Firebase/RevenueCat/Cloudflare/Expo setup, store listings TR/EN, screenshots, privacy forms, TestFlight groups | Store launch | [`docs/infrastructure.md`](infrastructure.md), [`docs/magaza.md`](magaza.md) |

---

## 3. Decisions already taken (do not reopen without the owners)

- DevirVentures publishes; **Devredin Bilgi Teknolojileri Yazılım ve Ticaret A.Ş.** is the data controller and store publisher.
- Purchases **only in the phone apps** (RevenueCat). The server gives a **30-day trial**. No intro offers. iPhone only (no iPad).
- **No CAPTCHA on phones**; web Turnstile widget stays but Supabase does not enforce CAPTCHA.
- Sentry in the **EU** region. No session replay, no analytics, no cookies today (any analytics needs a KVKK/consent decision first).
- Universal links for `/katil`, `/dogrula`, `/yeni-sifre`. Native push yes, SMS no.
- **Manual release** after store approval. Age rating 4+ (no 18+ override). Available in all countries; subscriptions in all countries with store-converted prices.
- **No branch protection rules** on GitHub (owner decision); the rule is process: PRs only, Erdem merges.

---

## 4. In flight right now (Erdem's session; do not duplicate)

| Step | State | Next |
|---|---|---|
| Native fix PR (Turnstile removal + safe area) | Being finished on branch `fix/native-turnstile-safearea`; simulator check + tests | Erdem merges it as soon as it is open |
| Builds iOS **1.0.0 (5)** and Android **1.0.0 (4)** from `main` | Waiting for the merge above | `eas build --profile production`; iOS auto-submits to TestFlight; Android goes to Play internal |
| App Store prices for all 36 subscriptions in 175 territories | Script running on Erdem's Mac (descending; at `tek_7` at 22:29, ~5 min per product) | Expected to finish ~23:35 Istanbul time |
| **App Review submission** | After build (5) is processed and prices are done | Version 1.0.0 + 36 subscriptions, manual release |
| **Play production release** | After build (4) | Managed publishing; **do not publish until Play subscriptions exist and are attached to RevenueCat** (otherwise the Android paywall is empty) |
| Play subscriptions `tek` / `bes` (18 base plans each, `N-aylik` / `N-yillik`) | Retry every 15 min from Erdem's Mac; Google API returns **403 PERMISSION_DENIED** on `pricing:convertRegionPrices` for service account `eas-submit@anahtario` since ~21:51 | Usually permission propagation (up to ~24–36 h). If still 403 on **2026-11-15**, check that account's app permissions in Play Console → Users and permissions (it must be allowed to manage subscriptions/products), then add the 36 Play products to RevenueCat entitlement `pro` |
| TestFlight external beta review (build 2) | Waiting for Apple | Public link `https://testflight.apple.com/join/zhpWEbFX` works after approval |

When these are done, this section is rewritten and section 1 updated.

---

## 5. Critical things not to forget (prioritised)

### 5.1 P0: search visibility (owner actions; see [`docs/seo-geo.md`](seo-geo.md) sections 7, 9, 10)
1. **Verify Google Search Console** for `anahtar.io` (Domain property, DNS TXT record at **Hostinger** hPanel → DNS) and **Bing Webmaster Tools**
   (import from Search Console). Submit `https://anahtar.io/sitemap.xml` in both. Today **neither is verified**, so nobody can see indexing, queries or errors.
2. **Prove real crawlers get through Hostinger's CDN.** A read-only audit with spoofed user agents got **403** for Googlebot/Bingbot and **429** for GPTBot
   (ClaudeBot, PerplexityBot, OAI-SearchBot got 200). Spoofed agents prove nothing by themselves: run **URL Inspection → Test live URL** in Search
   Console right after verification. If real Googlebot is blocked, fix the Hostinger bot/CDN setting first; this would block all indexing.
3. **Decide the GPTBot policy** (allow or block training crawler; search agents should stay allowed) and write it into `app/public/robots.txt`.

### 5.2 P0/P1: store and launch
- **Play trader status** (EU DSA): only the Play account owner can declare it; deadline **February 2027**, otherwise the app is removed from EU storefronts.
- After Apple/Google approval, the release is **manual**: someone must press "Release" (App Store) and "Publish" (Play managed publishing).
- `info@anahtar.io` must **accept the invites** (App Store Connect, Play Console, RevenueCat) and turn on **2FA** (also Sentry, Expo).
- iOS distribution certificate expires **2027-11-13**.

### 5.3 P1: security follow-ups ([`docs/security-guidelines.md`](security-guidelines.md) section 14)
1. **Follow-up migrations** in `specs/followup-migrations/` (`sistem_mesaji_kapat`: closes direct inserts of system messages; `site_residents_kod_gizle`:
   hides `site_residents.code`). Allowed only after the new site has been live ≥24 h: **from 2026-11-14 16:14 UTC**. New PR, **fresh timestamps**
   (`npm run db:yeni`), then the four-step Actions apply (staging plan → apply → production plan → apply, plan shown to the owners each time). See its README.
2. **Disable Supabase legacy JWT API keys** after function logs are clean on the new keys (Supabase dashboard, Erdem).
3. **Rotate the `info@anahtar.io` mailbox password** and update `SMTP_PASS` (function secret) and the Supabase Auth SMTP password together.
4. **Edge Functions still return raw error text** to callers: `invite-mail`, `site-invite`, `welcome`, `lead-mail` (only `billing` is generic). Fix in a PR
   (generic body, details to logs/Sentry); deploy needs Erdem.
5. `safeEqual` is copy-pasted in six functions: move to `supabase/functions/_shared/`.
6. **Staging** (`omckqypxpcamrfhnmbyx`, Paris) has no pg_cron/pg_net/Vault and is on a withdrawn release channel: upgrade or recreate before the next extension-dependent migration.
7. Delete the old US Sentry org `anahtario` (scheduled); decide whether to re-enable the auth-health uptime monitor (plan quota).
8. Verify DMARC, CAA and DNSSEC for `anahtar.io` at Hostinger.

### 5.4 P1: SEO code fixes (agent PRs; details and acceptance checks in [`docs/seo-geo.md`](seo-geo.md) section 10)
- **P1-1** `noindex,nofollow` on private routes (`/giris`, `/kayit`, `/sifre`, `/katil`, `/dogrula`, `/yeni-sifre`, `/uygulama`, `/admin`, `/belge`, `/satin-al`)
  and remove `/giris/`, `/kayit/` from the sitemap: `app/scripts/harden-html.mjs`, `app/scripts/blog/build.mjs`.
- **P1-2** Real `<h1>` and `<a href>` links on Expo marketing pages (home, `/cozumler/*`, calculator, `/kurumsal/`): today 0 of each in raw HTML.
- **P1-3/4** `Organization`/`WebSite`/`SoftwareApplication` JSON-LD on home; `og:image`/Twitter cards on Expo pages.
- **P1-5** Calculator page shows placeholders ("Oran tablosu yakında burada") and `tufe.json` is empty: make it a sourced TÜFE data page.
- **P1-6/7/8** internal links to `/cozumler/*`, slash-consistent hrefs, truthful sitemap `lastmod`, blog template with sources and publisher line.

### 5.5 P2: housekeeping
- Dependabot **#105, #106, #108**: review and test; Erdem merges. No major-version jumps.
- `docs/test.md` mentions `tests/i18n.spec.mjs`, which does not exist (English checks are in `tests/app-admin.spec.mjs`, `tests/paketler.spec.mjs`).
- `docs/guvenlik.md`, `docs/yol-haritasi.md`, `docs/magaza.md` are being updated by the native-fix PR (no CAPTCHA on phones). Check after it merges.

### 5.6 Traps learned the hard way
- **OTA environment:** `eas update` (SDK 55+) needs `--environment production` and reads **only EAS environment variables**, not the `env` blocks
  in `app/eas.json`. Without `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` an OTA bundle starts in "local account mode" (no backend).
  They were added to EAS `production` and `preview` on 2026-11-13. **If you change them in `eas.json`, change them in EAS too.** Test the first OTA on `preview`.
- **OTA scope:** JS/UI only. Anything native (new module, permission, `app.json` native keys, SDK bump) needs a store build and review.
- **Site deploys before migrations** when a PR merges: migrations must work with the old client and the new client with the old schema
  (`rpc-missing.js` fallbacks). Destructive changes go into a later PR.
- **Real-environment build:** if you touch session, storage, auth or build code, run `expo export -p web` with real public env values set; fake-backend
  tests missed the SSR crash that stopped the deploy (#113).
- **WebViews and origins:** an `originWhitelist` mismatch made the native Turnstile open Safari. Avoid WebViews for auth.
- **Apple certificate limit** and **Google permission propagation** cost hours: read [`docs/release-and-ota.md`](release-and-ota.md) before touching credentials.
- **Secrets:** never in code, SQL, docs, PRs, chat or logs. Cron/webhook secrets live in **Supabase Vault**; function secrets via `supabase secrets set`.
  Rotation = change both within minutes. Never run `supabase link` (blocked in `.claude/settings.json`).

---

## 6. Who owns what and what an agent can reach

| Thing | Who | Agent access |
|---|---|---|
| GitHub repo `fahricankuz/keys` | Owner `fahricankuz`; write: `erdemylmaz`, `busekuz`, `Bora-colpan23` | `gh` as the logged-in user; PRs only |
| Supabase org "Anahtar" (production + staging) | Erdem (verify members in the dashboard) | Migrations only via Actions "Veritabanı migration"; read-only SQL if a connector is given; no writes without approval |
| Expo `anahtar_io` | Owner login `info@anahtar.io`, admin Erdem | `eas` CLI when logged in; builds/OTA only with approval |
| Apple team `F5DQK4ZWFP`, App Store Connect app `6834434284` | Devredin company account (Erdem); `info@anahtar.io` invited | Console by a human; API key held by Erdem |
| Google Play app `io.anahtar.app`, Firebase/GCP `anahtario` | Devredin company Google account (Erdem); `info@anahtar.io` invited | Console by a human; service-account files held by Erdem |
| RevenueCat project `anahtar` | DevirVentures; `info@anahtar.io` invited | Console by a human |
| Sentry org `anahtar` (EU) | Erdem | Read issues if a Sentry connector is given |
| Hostinger (web, DNS, mailbox) | Erdem / mailbox owner | Console by a human |
| Cloudflare (web Turnstile only) | Devredin account | Console by a human |
| Local secrets (`.p8` keys, service accounts, webhook/cron secrets, demo password) | Erdem's Mac only | Never. Ask a human to do the step |

Full map with IDs, regions, cron jobs, webhooks and every secret **name**: [`docs/infrastructure.md`](infrastructure.md).

---

## 7. What needs an explicit "yes" from the owners/Erdem

Merge · migration apply (each of the four steps) · Edge Function deploy · production data change · EAS build · store submission or release ·
OTA publish · secret rotation · sending emails/notifications to real users · any console/account setting · new paid service.
Everything else (reading, local tests, branches, PRs, docs) is fine. Details: [`AGENTS.md`](../AGENTS.md) section 7.

---

## 8. How to check the state yourself (read-only)

```bash
gh pr list -R fahricankuz/keys --state open                     # open PRs
gh run list -R fahricankuz/keys --limit 10                       # CI, deploys, migrations
git log --oneline -15 origin/main                                # what is on main
curl -sI https://anahtar.io/ | head -3                           # site up
cd app && npx eas-cli build:list --limit 5 --non-interactive     # builds (needs Expo login)
cd app && npx eas-cli update:list --branch production --limit 3  # OTA updates (needs Expo login)
```
Store state from the API (read-only; needs the Apple key / Play service account env, see README): `npm run magaza:durum --prefix app`; all store scripts: `app/scripts/magaza/README.md`.
Sentry: `https://anahtar.sentry.io` (projects `anahtar-web`, `anahtar-mobile`, `anahtar-edge`). Store states: App Store Connect / Play Console (humans).

---

## 9. Good next tasks for an agent (safe, PR-only)

1. SEO P1-1 and P1-2 (noindex + sitemap, real `<h1>`/`<a href>`): web only, no store impact. Verify raw HTML with the commands in `docs/seo-geo.md` section 11.
2. Generic error bodies in the four Edge Functions + shared `safeEqual` (deploy later, by Erdem).
3. Follow-up migrations PR **after 2026-11-14 16:14 UTC** (fresh timestamps; SQL tests per migration).
4. Fix `docs/test.md` reference; review Dependabot PRs.
5. **Hold native app changes** until builds (5)/(4) are submitted; after launch, JS/UI fixes can ship by OTA (with approval).

---

## 10. Change log of this handover

| When (Istanbul) | Change |
|---|---|
| 2026-11-13 22:45 | First version: launch-day state, in-flight release steps, critical items (SEO, security, store), traps, ownership |
