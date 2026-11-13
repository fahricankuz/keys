# Feature: Production release — App Store + Google Play, security hardening, Sentry, in-app purchase

Status: interview complete 2026-11-13 (Erdem). Source evidence: 7 read-only audits on 2026-11-13 (DB authz/storage,
edge functions/client auth, live Supabase config, mobile store readiness, IAP/RevenueCat, Sentry plan, web/DNS/CI) plus
live read-only SQL against production `nfpefnrgtnwvclwbriaw`. No secret values appear in this document.

## Summary

Ship anahtar (Expo SDK 58 app in `app/`, Supabase backend, static web on Hostinger) to the App Store and Google Play,
published from the DevirVentures developer accounts, with in-app subscriptions through a new RevenueCat project, native
push, universal links, and Sentry (EU) on web, mobile and edge functions. Before any store build, close the confirmed
authorization holes that are live in production today (a tenant can promote themselves to landlord; anonymous
`site_report`; storage folder collision; guessable invite codes that leak resident PII; plaintext secrets in database
triggers, one of which equals the info@anahtar.io mailbox password). Everything lands as one combined PR plus a
sequenced runbook of console and dashboard steps; store submission waits for the legal company details.

## Decisions (interview)

| # | Topic | Decision |
|---|---|---|
| D1 | Fix rollout | One combined PR (security + release prep) |
| D2 | Payments on phones | Launch with in-app purchase (RevenueCat) |
| D3 | iPad | iPhone only (`supportsTablet: false`) |
| D4 | Sentry region | New EU org; delete the empty US org `anahtario` |
| D5 | Store publisher | DevirVentures Apple Developer + Google Play accounts (Play/Firebase owner: teknik@devredin.com) |
| D6 | RevenueCat | New project `anahtar` in the existing DevirVentures RevenueCat account |
| D7 | Legal entity | Company details provided later — hard blocker for store submission |
| D8 | Universal links | Yes, in v1 (iOS associated domains + Android App Links) |
| D9 | Invite codes | ≥80-bit codes + attempt limits; bound to the invited email when the invite has one |
| D10 | Channels at launch | Native push (iOS + Android); web push stays as is; no SMS |
| D11 | Firebase / GCP | Separate project `anahtario` under teknik@devredin.com |
| D12 | Trial | Server 30-day trial only; no store intro offers |
| D13 | Catalog | Keep 1–9 properties × Başlangıç/Profesyonel × monthly/yearly; App Store 36 products in one group; Play 2 subscriptions (`tek`, `bes`) × 18 base plans |
| D14 | Prices | Align config prices to store price points; phones show the live store price |
| D15 | Web payment | Phones only in v1; web tells users to subscribe in the app |
| D16 | Bot protection | ASSUMED (unanswered, recommended): Turnstile on web + phones, Supabase CAPTCHA enforced, email confirmation stays off |
| D17 | Database | ASSUMED: Nano → Micro compute (covered by Pro credit), daily backups; no PITR |
| D18 | Alerts | ASSUMED: email to teknik@devredin.com and info@anahtar.io |
| D19 | Store listing | ASSUMED: name "anahtar", fallback "anahtar: Kira Yönetimi"; category Business; TR + EN |

## Requirements

1. No authenticated user can change `memberships.role`, `property_id` or `user_id`; a tenant cannot gain landlord rights.
2. `site_report` and every other SECURITY DEFINER function are not executable by `anon` except an explicit allowlist
   (kept in `tests/qa-db.spec.mjs`); default privileges revoke EXECUTE from `anon` for new functions.
3. Property ids cannot start with `site-` or `hukuk-` (any case); storage member/owner policies never match those prefixes.
4. A blocked user cannot reach the blocker through `from_role='system'` messages (`messages_select` hides every row written by a blocked user);
   the client writes system messages only through `post_system_message`. Closing the direct insert path (clients cannot insert
   `from_role='system'` rows) ships in the follow-up migration PR (Rollout step 9), because the live old web client still inserts them.
5. `documents.property_id` is immutable after insert and updates are checked (`WITH CHECK`).
6. Site storage: residents read only their own uploads and site documents whose audience includes them; managers with the
   right permission read all; read-only org roles cannot read resident invite codes (the new client reads codes only through
   `site_resident_code`; hiding the `code` column from direct reads ships in the follow-up migration PR, Rollout step 9).
7. Invite codes (property, org `K…`, resident `S…`) are ≥80 bits for new invites; old codes stay valid until expiry;
   failures are throttled per user and per IP with one uniform error; anon preview functions return no phone/email;
   an invite that carries an email can only be accepted by an account with that email.
8. Storage bucket `evim`: 10 MB per file; MIME allowlist (images, PDF, and any type the app legitimately uploads —
   derive from `app-ui/media.ts`); quota trigger per user.
9. No secret is stored in trigger or cron definitions. Webhooks and cron read per-function secrets from Supabase Vault;
   each function has its own random ≥32-byte secret; no `service_role` JWT is sent to `verify_jwt=false` functions.
10. Edge functions use the new secret key (`SUPABASE_SECRET_KEYS`) with fallback, so legacy JWT keys can be disabled.
11. `support_requests` inserts force `email` to the caller's account email and are capped per day; `lead-mail` sends the
    acknowledgement only to the account email (a lead without `user_id`, i.e. anonymous, gets no acknowledgement; the internal
    notification to the team is always sent). `submit_lead`, `report_error`, `queue_plan_choice` get per-IP/per-user caps.
12. `push_subscriptions.endpoint` limited to known push services; push requests have a timeout.
13. Auth: PKCE flow on web and native; no `setSession` from URL tokens; native session in SecureStore (chunked) with a
    one-time migration from AsyncStorage; Android `allowBackup=false`; `AD_ID` blocked.
14. Turnstile challenge on sign-in, sign-up and password reset on web and native (WebView); Supabase CAPTCHA enforced
    only after the web and the first store build carry it.
15. Universal links: `applinks:anahtar.io` and Android `autoVerify` intent filters for `/katil*`, `/dogrula*`,
    `/yeni-sifre*`; `/.well-known/apple-app-site-association` and `/.well-known/assetlinks.json` generated at web build
    time from GitHub variables `APPLE_TEAM_ID` and `ANDROID_SHA256`; `dogrula` and `yeni-sifre` screens read params
    through `expo-linking` instead of `window.location`.
16. Sentry (EU): `@sentry/react-native` on native, lazily loaded `@sentry/browser` on web, `@sentry/deno` wrapper for
    the 9 edge functions; PII scrubbing that mirrors `log_redact`; no Session Replay; existing `client_errors` and
    `function_logs` logging stays unchanged; source maps uploaded from EAS and the Hostinger build; CSP allows the ingest
    origin only.
17. In-app purchase works end to end on both stores: correct unit limit for Android base plans, Android plan changes
    replace (never duplicate) the subscription, admin/promotional grants are never overwritten by store sync, a daily
    reconcile plus foreground sync catch missed webhooks, sandbox purchases count for access but not for revenue KPIs.
18. Paywall (existing `store-purchase.tsx`, extended, not replaced): live store price and period, auto-renew terms,
    Terms/EULA and Privacy links, restore, current plan, change timing; hidden purchase CTAs when the store is
    unavailable; the billing pause flag is served by the database (`billing_paused`) instead of hard-coded.
19. Native push works: payload `body.url` on iOS taps, token unregistered on sign-out even after restart, permission
    asked after a short in-app explanation (not right after login), Android notification icon and default channel.
20. Account deletion surfaces failures and warns about active store subscriptions before confirming.
21. Store build hygiene: splash configured (light/dark), opaque 1024 icon, adaptive icon inside the safe zone,
    `newArchEnabled` removed, `expo install --fix` clean, privacy manifest matches real collection (add
    PurchaseHistory, PerformanceData, OtherDiagnosticData, DeviceID if push token counts; remove PaymentInfo),
    admin login link hidden on native, Excel export works on native (file + share sheet).
22. CodeQL high alerts fixed: XSS (`backend.js:678`, `inspect-html.js:177`, legacy `assets/js/sheets.js:662`), URL
    redirect, prototype pollution (`services.js:315`), stack trace exposure (`billing/index.ts:42`), `sw.js` origin
    check, `Math.random` used for ids/tokens replaced by crypto randomness.
23. CI hardening: `hostinger.yml` dispatch only from the default branch, scoped `contents: write`, no persisted
    credentials; `expo-mobile.yml` pins `eas-version`; `.gitignore` covers `.env*`, `*.p8`, `*.jks`, `*.keystore`,
    `*.p12`, `*.mobileprovision`, `GoogleService-Info.plist`, `google-services.json`, `credentials.json`, `.mcp.json`.
24. Docs (Turkish) updated: `abonelik.md`, `magaza.md`, `mobil.md`, `guvenlik.md`, `canliya-alma.md`, `loglar.md`.
25. Canonical URLs and the sitemap use trailing slashes (decided: the server redirects `/x` → `/x/`, so the canonical must not
    point at a redirect): every `<link rel="canonical">` and `og:url` (hand-written, blog and support pages, via `harden-html.mjs` and
    `scripts/blog/build.mjs`) is `https://anahtar.io/<path>/` (root `https://anahtar.io/`; file URLs with an extension are unchanged);
    `sitemap.xml` lists each page once, with a trailing slash and no redirected URL (e.g. no `/cozumler/portfoy`); the `.htaccess`
    redirect for the removed page goes to the trailing-slash target in one step; `.well-known/*` files stay redirect-free.

## Data Model Changes

All as new, re-runnable migrations (`npm run db:yeni -- <ad>`, then `npm run db:derle`), each compatible with the
currently deployed code (the site deploys before migrations are applied), each with a test.

| Migration | Contents |
|---|---|
| `yetki_duzeltmeleri` | Drop `memberships_update`; column-level `grant update (display_name, phone)`; BEFORE UPDATE guard on role/property_id/user_id; `site_report` requires a session or service role; `messages_select` hides rows written by a blocked user (the `system` branch of `messages_insert` stays until the follow-up); `documents_update` WITH CHECK + immutable `property_id`; `properties` id prefix check (`NOT VALID` then validate after confirming no rows match); guard client-set `properties.org_id`; fix `team_remove` activity injection |
| `anon_islev_yetkileri` | Revoke EXECUTE from `anon` on all SECURITY DEFINER functions except the allowlist; `alter default privileges ... revoke execute on functions from anon`; set `search_path` on the 22 helper functions |
| `davet_kodlari` | ≥80-bit code generators for new property/org/resident invites; `invite_attempts` table (RLS, no client grants) + `invite_throttle()`; uniform errors; email binding in `accept_invite`, `accept_org_invite`, `accept_site_invite`; `site_invite_info` returns a masked hint only; resident `code` readable through a function gated on `residents.manage` (column-level `revoke select` is in the follow-up) |
| `depolama_sinirlari` | Bucket `evim` size + MIME limits; per-user quota trigger; site folder read/write rules by object path |
| `istek_sinirlari` | `support_requests` email forcing + daily cap; per-IP caps for `submit_lead`/`report_error` using PostgREST request headers; `queue_plan_choice` cap; `push_subscriptions.endpoint` allowlist (`NOT VALID` for old rows) |
| `kasa_sirlari` | Recreate the 4 webhook triggers and 4 HTTP cron jobs to read Vault secrets (`anahtar_lead_secret`, `anahtar_mail_secret`, `anahtar_push_secret`, `anahtar_report_secret`, `anahtar_tufe_secret`); no Authorization header; webhook timeout 10 s; aborts with an explicit error if a Vault secret is missing; prune job for `cron.job_run_details` |
| `abonelik_magaza` | `app_config` (public read) with `billing_paused`; `access_state` keeps honoring sandbox; revenue/KPI functions and `billing_reminders` exclude `environment='sandbox'`; protect `store in ('admin','promotional')` rows from store sync; reconcile helper listing subscriptions expiring within 2 days |
| `rls_performans` | `auth.uid()` → `(select auth.uid())` in the 47 flagged policies; indexes for the 79 unindexed foreign keys |
| `saklama_sureleri` | `prune_logs()` also deletes `mail_outbox` rows older than 90 days and resolved (`done`) `support_requests` older than 6 months (`created_at`; no update timestamp exists); `delete_my_account()` anonymizes the caller's support requests and queues the user id in `revenuecat_deletions` (RLS on, no client grants); the `billing` daily reconcile deletes those RevenueCat subscribers (retry, give up after 7 days with a `function_logs` warning). `admin_audit` unchanged (up to 10 years) |
| `sistem_mesaji` | `post_system_message(p_property, p_kind, p_payload)` (membership, kind, side and text-pattern checks; the row carries the caller's id); the direct-insert branch stays |
| Follow-up (NOT in this PR; `specs/followup-migrations/`) | `sistem_mesaji_kapat` (remove the `system` branch of `messages_insert`) and `site_residents_kod_gizle` (`revoke select` on `site_residents`, column-level `grant select` without `code`). Both break the live old web client, so they ship in a second PR once the new site has been live ≥24 h (Rollout step 9) |

## API Endpoints

| Function / RPC | Change | Auth |
|---|---|---|
| `billing` (edge, `verify_jwt=false`) | Android `product_identifier` + `product_plan_identifier` → canonical `tek_3_aylik`; skip admin/promotional rows; never downgrade an active row from a stale snapshot; generic error body; new `POST /billing/reconcile` (daily pg_cron, Vault secret) | RevenueCat Authorization header / user JWT / cron secret |
| `push` | iOS payload `body.url`; request timeout; endpoint allowlist; secret from env, header from Vault | `x-evim-secret` |
| `lead-mail` | Ack only when email equals the account email | `x-anahtar-secret` |
| `mail-send`, `report`, `tufe-sync` | New per-function secrets; Sentry wrapper; `tufe-sync` cron check-in | `x-*-secret` |
| `welcome`, `invite-mail`, `site-invite` | Sentry wrapper; `site-invite` 2-minute resend throttle; `invite-mail` daily cap per owner | user JWT |
| `_shared/keys.ts` (new) | Service client from `SUPABASE_SECRET_KEYS`, fallback `SUPABASE_SERVICE_ROLE_KEY` | — |
| `_shared/sentry.ts` (new) | `sentryServe(name, handler)`, scrubbed, per-request scope | — |
| RPC `accept_*invite*`, `invite_preview`, `site_invite_info`, `signup_code_ok` | Throttled, uniform errors, masked output | as today |
| RPC `site_report` | Session required | authenticated |

## Module Structure

App (`app/`):
- `src/domain/backend.js` — PKCE, SecureStore storage adapter (native), crypto ids, XSS/redirect fixes.
- `src/domain/secure-storage.native.js` (new) — chunked SecureStore adapter + AsyncStorage migration.
- `src/domain/sentry.js`, `sentry.native.js`, `sentry-scrub.js` (new); `src/domain/errors.js` (+1 capture line).
- `src/app/_layout.tsx`, `src/app/dogrula.tsx`, `src/app/yeni-sifre.tsx` — Sentry wrap, Linking-based params, PKCE.
- `src/auth/auth.tsx`, `src/auth/captcha.tsx` (+ native WebView Turnstile), `src/auth/LoginForm.tsx` (hide admin link).
- `src/domain/iap.native.js`, `src/domain/store-ids.js`, `src/domain/config.js`, `src/app-ui/store-purchase.tsx`,
  `src/app-ui/sheets.tsx` — Play base plans, product change, live prices, deletion warning, CTA gating.
- `src/domain/native-push.native.js`, `src/app/uygulama/_layout.tsx` — sign-out unregister, permission priming.
- `src/ui/overlays.tsx` + callers — native Excel export via expo-file-system + expo-sharing.
- `app.json`, `app.config.js`, `eas.json`, `metro.config.js`, `package.json`, `scripts/harden-html.mjs`,
  `scripts/sentry-sourcemaps.mjs` (new), `scripts/well-known.mjs` (new), assets (icon, adaptive, splash, notification).

Backend: `supabase/functions/*` as above; new migrations; `supabase/schema.sql` regenerated.

Repo: `.github/workflows/hostinger.yml`, `expo-mobile.yml`, `.gitignore`, `docs/*.md`, tests under `tests/`.

## Business Logic

**Invite acceptance.** Caller → `invite_throttle()` (≤10 failures/hour per user and per IP, else uniform error) →
look up code (old 8/7-char or new ≥16-char) → expired/used → uniform error → if `invite.email` is set and differs from
`auth.email()` → uniform error → accept (single use) → audit.

**Purchase (native).** Paywall loads store products → user picks tier + units + period → iOS: `purchaseStoreProduct`
(Apple handles crossgrade in the group); Android: purchase the base plan option of `tek`/`bes` with
`googleProductChangeInfo` when an active plan exists → app calls `billing` (user JWT) → server fetches RevenueCat
subscriber → canonical product id → units/tier → upsert `subscriptions` unless the row is admin/promotional.

**Missed webhook safety net.** Daily pg_cron → `billing/reconcile` → re-sync every store subscription expiring within
2 days or already past; app foreground sync when the local plan expires within 2 days.

**Secret rotation (no downtime beyond minutes).** Generate new random secrets → insert into Vault (SQL editor, values
never in git) → `supabase secrets set` the same values → apply `kasa_sirlari` → verify 200s in `net._http_response`
and function logs → rotate the info@anahtar.io mailbox password in Hostinger and update `SMTP_PASS`.

**Universal links.** Web build reads `APPLE_TEAM_ID` / `ANDROID_SHA256` variables → writes the two `.well-known`
files (served as JSON by `.htaccess`) → app opens `/katil`, `/dogrula`, `/yeni-sifre` natively.

## Edge Cases & Error Handling

- PKCE link opened on a different device than the one that requested it → friendly "open this link on the device where
  you requested it, or sign in" screen (email confirmation is off, so this affects only password reset/email change).
- Existing native sessions in AsyncStorage → migrated once to SecureStore, then removed; failure falls back to re-login.
- Old invite codes in flight → still accepted until expiry; new invites use long codes.
- Code-only invites (no email) → accepted by any account holding the code (long code + throttling).
- Vault secret missing when applying `kasa_sirlari` → migration aborts before changing triggers.
- RevenueCat says "no entitlement" for a user with an admin grant → admin row kept.
- Out-of-order or duplicate webhooks → handler re-fetches the subscriber state, so the latest truth wins; concurrent
  syncs compare `expires_at`/`updated_at` before overwriting.
- Store unavailable on device (no RC key / store error) → purchase CTAs hidden, message shown, restore still offered
  where possible.
- `billing_paused` read failure → fall back to the config default.
- Account deletion RPC fails → error shown, user stays signed in.
- Push token belongs to a previous user on a shared device → server-side upsert via definer function reassigns it.
- Turnstile fails to load in WebView (offline/blocked) → retry and clear error; never silently submit without a token.

## Security Considerations

- IDOR: membership role escalation, storage prefix collision, document move, site folder reads, invite enumeration,
  anonymous `site_report` — all fixed in migrations with negative tests per role (tenant, landlord, agent, resident,
  read-only org role, anon).
- Secrets: none in git, triggers, cron or app bundle; Vault for DB-side secrets; per-function random secrets; legacy
  JWT keys disabled after edge functions move to `SUPABASE_SECRET_KEYS`; the values printed in a 2026-11-13 audit
  transcript are rotated (todo `anahtar-rotate-webhook-secrets`).
- Auth: PKCE, SecureStore, CAPTCHA, password min 8 + leaked-password protection + secure password change, email send
  interval 60 s, redirect allow-list adds `https://anahtar.io/dogrula`, session inactivity timeout 90 days.
- Uploads: server-side size/MIME limits, quotas.
- Privacy/KVKK: Sentry EU region, PII scrubbing, no replay, UUID-only user context, IP storage disabled in Sentry.
- Supply chain/CI: scoped workflow permissions, dispatch restricted to the default branch, version pins.

## External Setup Runbook (who does what)

Erdem logs into each console himself in Chrome; Claude does the rest through claude-in-chrome, CLIs and MCPs. Nothing
is submitted, merged, applied to production or sent to real users without Erdem's explicit go in that message.

| Area | Steps | Owner |
|---|---|---|
| Supabase dashboard | Rate limits; password policy; redirect URL; session inactivity; SSL enforcement; Micro compute (restart); CAPTCHA after rollout; disable legacy API keys after functions deploy | Claude via Chrome, Erdem approves each |
| Supabase secrets | New per-function secrets, Vault entries, APNs, FCM, RevenueCat, Sentry DSN | Claude via CLI, Erdem approves |
| GitHub (repo admin: fahricankuz) | Ruleset on default branch (PR + required checks), protect `site`, `production` env reviewers + branch policy, delete unused `SUPABASE_ACCESS_TOKEN`/`SUPABASE_DB_PASSWORD`/`SUPABASE_PROJECT_REF`; add `EXPO_TOKEN`, `SENTRY_AUTH_TOKEN`, variables `SENTRY_DSN_WEB`, `TURNSTILE_SITE_KEY`, `APPLE_TEAM_ID`, `ANDROID_SHA256` | Repo owner (Erdem lacks admin) |
| Apple (DevirVentures) | Identifier `io.anahtar.app` (Push, Associated Domains, In-App Purchase); APNs key; App Store Connect app; ASC API key for automation + IAP key for RevenueCat; subscription group + 36 products (scripted via ASC API); privacy labels; age rating; review info + demo accounts; EULA; Server Notifications v2 → RevenueCat; sandbox testers | Erdem logs in, Claude configures |
| Google Play (teknik@devredin.com) | App `io.anahtar.app`; listing; content rating; data safety; financial features; app access; 2 subscriptions × 18 base plans; RTDN Pub/Sub; service accounts (RevenueCat, EAS submit); license testers; first AAB manual upload to internal testing; signing SHA-256 | Erdem logs in, Claude configures |
| Firebase / GCP `anahtario` | Android app, `google-services.json` → EAS file env `GOOGLE_SERVICES_JSON`; FCM v1; service account → `FCM_SERVICE_ACCOUNT` | Claude via Chrome |
| RevenueCat (DevirVentures) | Project `anahtar`; App Store + Play apps; entitlement `pro`; import products; restore behavior "Keep with original App User ID"; webhook → `billing`; secret key → Supabase; public SDK keys → `eas.json` | Claude via Chrome |
| Sentry | Delete empty US org; create EU org; projects `anahtar-web`, `anahtar-mobile`, `anahtar-edge`; org token (`org:ci`); alerts (new, regression, spike, crash-free < 98%); uptime (anahtar.io, auth health); cron monitor `tufe-sync`; IP storage off; 2FA required; notify teknik@ + info@ | Claude via Chrome + MCP (re-auth MCP to the new org) |
| Cloudflare | Turnstile widget for anahtar.io in the devredin account; secret → Supabase Attack Protection; site key → GitHub variable | Claude via Chrome |
| Expo `anahtar_io` | `EXPO_TOKEN`; EAS env (`SENTRY_AUTH_TOKEN` secret, `GOOGLE_SERVICES_JSON` file); iOS credentials on first build; 2FA for members | Erdem (Apple 2FA) + Claude |
| Hostinger / DNS | DMARC `p=quarantine; rua=…`, CAA `letsencrypt.org`, DNSSEC; rotate info@anahtar.io password; check SMTP daily quota | Erdem logs in, Claude configures |

## Rollout Order

The new web site deploys BEFORE the migrations are applied, and browser tabs opened earlier keep running the old client after
the migrations are applied. Every change therefore has to work in both windows: the new client falls back to the old schema
when an RPC is missing (`post_system_message`, `site_resident_code`, `register_device_token`/`unregister_device_token`;
`app_config` falls back to `config.js`), and nothing that breaks the old client is applied in step 2 (see step 9).

1. Combined PR → CI green → independent review → Erdem says merge → site deploys (code tolerates old schema).
2. Vault + function secrets → **deploy the changed edge functions first** (`supabase functions deploy` for every changed
   function; they tolerate the old schema) → **then apply the migrations** with `Veritabanı migration`: staging plan → apply →
   production plan → apply (plan output shown and approved before each apply). Keep the gap between `supabase secrets set` and the
   `kasa_sirlari` apply to minutes (webhooks answer 401 in that gap). After the production apply run the post-apply SQL check:

   ```sql
   -- must return 0 rows: no webhook trigger or cron job carries a header (secret or Authorization) as a literal;
   -- the secrets are read from Vault at call time (public.anahtar_webhook / public.anahtar_call).
   select 'trigger' as kind, c.relname || '.' || t.tgname as name
     from pg_trigger t join pg_class c on c.oid = t.tgrelid
    where not t.tgisinternal
      and pg_get_triggerdef(t.oid) ~* '"(x-anahtar-secret|x-evim-secret|authorization)"|http_request|net\.http_post|bearer'
   union all
   select 'cron', coalesce(jobname, jobid::text) from cron.job
    where command ~* '"(x-anahtar-secret|x-evim-secret|authorization)"|http_request|net\.http_post|bearer';
   ```

   The old objects carried the literals as JSON header keys (`"x-anahtar-secret":"<value>"`) in `supabase_functions.http_request(...)`;
   that is what the pattern matches. The new objects contain only the header NAME as a plain string argument
   (`anahtar_webhook('lead-mail', 'anahtar_lead_secret', 'x-anahtar-secret')`), which is expected and not a finding. Also confirm that
   the four triggers `talep`, `hukuki`, `bildirim`, `kuyruk` call `anahtar_webhook` and that the cron jobs call `anahtar_call`.
3. Supabase dashboard auth/infra settings; disable legacy keys once functions run on the secret key.
4. Consoles in parallel: Apple, Google, Firebase, RevenueCat, Sentry, Turnstile; fill secrets and variables.
5. Web redeploy with `.well-known` files and Turnstile; enforce Supabase CAPTCHA.
6. EAS production builds → TestFlight + Play internal → device smoke tests (login, PKCE links, push, sandbox purchase +
   restore + plan change, deletion, Sentry test crash) → store screenshots (TR/EN).
7. Legal pages filled and reviewed (blocked on D7) → listings → submit for review on Erdem's explicit go.
8. Flip `billing_paused` to false in the database when both stores approve.
9. **Follow-up migration PR** (can run in parallel with steps 3–8): once the new site has been live for ≥24 h and the live bundle
   contains `post_system_message` and `site_resident_code`, move the two files in `specs/followup-migrations/`
   (`sistem_mesaji_kapat`, `site_residents_kod_gizle`) into `supabase/migrations` with fresh timestamps, `npm run db:derle`, open a
   second PR (steps in `specs/followup-migrations/README.md`, including the `rls_performans` policy-equivalence exemption) and apply
   it with the same four steps (staging plan → apply → production plan → apply, approval before each apply).

## Testing Plan

- Given a tenant session, when it PATCHes its membership role to landlord, then the request is denied and the role is unchanged.
- Given a landlord, when it inserts a property with id `hukuk-<uuid>`, then the insert fails.
- Given an anon client, when it calls `site_report(<org id>)`, then permission is denied.
- Given 11 wrong invite codes from one user within an hour, when the 12th (correct) code is sent, then it is throttled.
- Given an invite bound to a@x, when b@x accepts it, then it fails with the uniform error.
- Given an anon client, when it calls `site_invite_info(<valid code>)`, then no phone or email is returned.
- Given a blocked user, when it inserts a message with `from_role='system'`, then the insert fails.
- Given an uploader, when it changes `documents.property_id`, then the update fails.
- Given a 20 MB file or an HTML file, when uploaded to `evim`, then storage rejects it.
- Given a missing Vault secret, when `kasa_sirlari` is applied, then it aborts and triggers are unchanged.
- Given a RevenueCat REST response with `product_identifier=tek_3` and `product_plan_identifier=3-aylik`, when synced,
  then the subscription is `tek_3_aylik` with 3 units.
- Given an admin-granted plan, when a restore sync returns no entitlement, then the admin row stays.
- Given a subscription past `expires_at` with a renewal in RevenueCat, when reconcile runs, then `expires_at` moves forward.
- Given a URL fragment with `access_token`, when Sentry scrubs the event, then the fragment is removed (parity with `log_redact`).
- Given `EXPO_PUBLIC_SENTRY_DSN_WEB`, when the web build is hardened, then CSP `connect-src` contains only that ingest origin.
- Given `APPLE_TEAM_ID`/`ANDROID_SHA256`, when the web builds, then both `.well-known` files are valid JSON with the right ids.
- Given a failed `delete_my_account`, when the user confirms deletion, then an error shows and the session stays.
- Given an iOS push for a request, when tapped, then the request screen opens.
- Local runs: only the touched specs, Node 22, with timeouts; the full suite runs in CI.

## Open Questions

1. Legal company details (title, address, MERSİS, tax office/number, effective date) for `gizlilik`, `kosullar`,
   `hesap-silme` plus legal review — blocks store submission (D7).
2. Confirm the four assumed decisions D16–D19 (bot protection, compute, alert recipients, listing name/category).
3. GitHub admin actions need the repo owner (fahricankuz). Decided 2026-11-13: rename the default branch
   `claude/github-keys-setup-uzvnzm` to `main` (owner command in todo `anahtar-github-admin-steps`); workflows accept
   both names until then, and the old name is removed from `push.branches` right after the rename.
4. Sentry plan after the trial (free Developer plan: 1 user, limited quota) vs Team plan.
5. Hostinger SMTP daily quota versus the Supabase auth email limit; mailbox password rotation by the mailbox owner.
6. Staging project is on a withdrawn Postgres release channel and lacks pg_cron/pg_net/secrets — upgrade/recreate it so
   staging plans are representative.
7. App Store age-rating questionnaire answers (messaging/UGC present; terms require 18+).
8. Store screenshots: the current script captures the web build; native screenshots from a device/simulator build are
   preferable for review.
