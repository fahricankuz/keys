# Security guidelines

Secure-development rules for this repository, what was found and fixed in the pre-release audit of **2026-11-13** (PR #112 and follow-ups)
and why, a review checklist, an incident runbook and the risks that are still open. The repository is **public**: anything committed is
public forever, so every rule below assumes that.

Companions: [coding-guidelines.md](coding-guidelines.md), [migrations.md](migrations.md), [loglar.md](loglar.md), [abonelik.md](abonelik.md),
`specs/production-release.md` (requirements and rollout of the hardening). No secret value appears in this file or may be added to it:
names of secrets, yes; values, never.

---

## 1. Principles

1. **The database is the security boundary.** The client is untrusted code running on someone else's device. Every permission is enforced by RLS,
   column grants, guard triggers or a `SECURITY DEFINER` function that checks `auth.uid()` itself. Hiding a button is not a control.
2. **Deny by default, allowlist by decision.** New tables have RLS and no policy until you write one; new functions are closed to `anon`; the callable-function
   lists live in `tests/qa-db.spec.mjs`, so opening something is a visible diff with a reason.
3. **Fail closed.** Missing secret, missing Vault entry, unparseable input, unknown caller: refuse (see `billing`: no `BILLING_CRON_SECRET` means the reconcile path answers 401).
4. **One uniform answer where the difference would help an attacker** (invite codes, sign-in).
5. **Least data.** Collect, log and keep only what the feature needs, for as long as the privacy page promises (section 12).
6. **Every security rule has a test that fails when it is broken.** If you cannot write the test, the rule is not finished.

---

## 2. What was fixed on 2026-11-13, and why

The audit combined seven read-only reviews with read-only SQL against production. Everything shipped as re-runnable migrations that also work with the old web client
(the site deploys before migrations are applied), each with a SQL spec that tries the attack role by role.

| # | Hole found | Fix | Migration / code | Test |
|---|---|---|---|---|
| 1 | A tenant could `update memberships set role = 'landlord'` on their own row (the update policy allowed every column) | Update policy kept, but column grant limited to `display_name, phone`; `guard_membership` trigger as a second layer (client roles only) | `yetki_duzeltmeleri` 1 | `yetki-duzeltmeleri.sql.spec.mjs` |
| 2 | `site_report` ran with no session: `auth.uid() is null` skipped the permission check | Session required; only `service_role`/`postgres` may call without one | `yetki_duzeltmeleri` 2 | same |
| 3 | A blocked user could reach the blocker through `from_role = 'system'` messages | `messages_select` hides every row written by a blocked user; the client writes system lines only through `post_system_message` (checks membership, kind, side and text pattern; writes `by_user = auth.uid()`) | `yetki_duzeltmeleri` 3, `sistem_mesaji`, `domain/system-message.js` | `sistem-mesaji.sql.spec.mjs` |
| 4 | `documents.property_id` could be changed (move a file into someone else's list); update had no `WITH CHECK` | `guard_document_property` trigger and a `WITH CHECK` | `yetki_duzeltmeleri` 4 | same |
| 5 | Property ids `site-<org>` / `hukuk-<user>` collided with storage folder names, so creating such a property made you "owner" of that folder; `properties.org_id` could be set to anyone's org | Check constraint on id prefix; storage policies never match those prefixes; `guard_property_org` | `yetki_duzeltmeleri` 5, `depolama_sinirlari` 2 | same, `depolama-sinirlari.sql.spec.mjs` |
| 6 | `team_remove` could plant a fake "team member removed" entry in another owner's feed | Activity row written only when a membership was really deleted | `yetki_duzeltmeleri` 6 | same |
| 7 | 110 of 179 `SECURITY DEFINER` functions were callable by `anon`; 22 helper functions had no fixed `search_path` | Revoke from `anon`/`PUBLIC` on everything except six allowlisted functions; default privileges changed for new functions; `search_path` set | `anon_islev_yetkileri` | `anon-islev-yetkileri.sql.spec.mjs`, `qa-db.spec.mjs` |
| 8 | Invite codes were short (32 bits for a property, 28 for org/resident), unthrottled, enumerable; the anonymous preview returned a resident's name, phone and e-mail; error messages told "wrong" from "used" from "expired"; invites were not tied to an e-mail | New codes at least 80 bits (16 Crockford base32 characters); 10 failures/hour per user and per IP then everything is refused; one `NULL` answer for all failures; e-mail binding; masked previews; `site_resident_code()` gated by permission | `davet_kodlari`, `domain/invite-code.js` | `davet-kodlari.sql.spec.mjs`, `oturum-guvenligi.spec.mjs` |
| 9 | Bucket `evim` had no server-side size or type limit; a site resident could read every file in the site folder; read-only org roles could upload; no per-user quota | 10 MB and a MIME allowlist on the bucket; `site_file_read_ok` / `site_file_write_ok`; restrictive quota policy (1 GiB, 3000 files) | `depolama_sinirlari` | `depolama-sinirlari.sql.spec.mjs` |
| 10 | Support request e-mail came from the client, so `lead-mail` could send a confirmation to any address; `submit_lead`, `report_error`, plan choice, invite mail had no (or weak) limits; `push_subscriptions.endpoint` accepted any URL (the server then calls it: SSRF); a device token could not be reassigned or removed | E-mail forced to the account's; daily caps; per-IP caps; `rate_ok()` counters; endpoint allowlist in the database and in the function; device-token functions | `istek_sinirlari`, `push/endpoint.ts`, `lead-mail` | `istek-sinirlari.sql.spec.mjs`, `lead-ack.spec.mjs`, `push-handler.spec.mjs` |
| 11 | Webhook and cron definitions carried secrets in clear text (one equalled the info@ mailbox password) and a `service_role` JWT; anyone able to read a trigger definition, dump or backup could use them | Secrets live in Supabase Vault and are read at call time by `anahtar_secret` / `anahtar_call` / `anahtar_webhook`; no `Authorization` header; values rotated; each function has its own secret | `kasa_sirlari` | `kasa-sirlari.sql.spec.mjs` (also scans the file for secret-looking strings) |
| 12 | Edge Functions used the legacy `service_role` JWT, which blocked disabling the legacy keys | `_shared/key-env.ts` / `keys.ts`: `SUPABASE_SECRET_KEYS` first, legacy fallback | `supabase/functions/_shared/` | `function-keys.spec.mjs` |
| 13 | Store sync could overwrite admin or promotional grants; missed RevenueCat webhooks left access wrong; Android base plans parsed wrongly; sandbox purchases counted as revenue | `decideWrite`, `guard_grant` trigger, daily reconcile, `normalizeProduct`, sandbox excluded from KPIs and reminders | `abonelik_magaza`, `billing/subscriber.ts` | `billing.spec.mjs`, `billing-handler.spec.mjs`, `abonelik-magaza.sql.spec.mjs` |
| 14 | Privacy page promised retention that no code enforced; deleting an account left the RevenueCat subscriber and support-request contents | `prune_logs` (90 days, 6 months for resolved support requests); `delete_my_account` anonymises, queues RevenueCat deletion | `saklama_sureleri`, `billing/index.ts` | `saklama-sureleri.sql.spec.mjs` |
| 15 | Session tokens from URLs, session in plain AsyncStorage, Android cloud backup, advertising id | PKCE only; SecureStore on phones; `allowBackup: false`; `AD_ID` blocked | `domain/backend.js`, `secure-storage.native.js`, `app.json` | `oturum-guvenligi.spec.mjs`, `oturum-deposu-ssr.spec.mjs` |
| 16 | CodeQL highs: `Math.random` for ids, XSS in generated HTML, open redirect, prototype pollution, stack trace exposure | `randomBytes`/`uid()`, `esc()`, `safeFileUrl()`, generic error bodies | `domain/*`, `billing/index.ts` | `oturum-guvenligi.spec.mjs` |

`rls_performans` (`(select auth.uid())` in 47 policies, 79 foreign-key indexes) shipped in the same release as a performance change with no intended behaviour change; `rls-performans.sql.spec.mjs` proves the rewritten policies are equivalent.

Two pieces of the same work are deliberately **not yet applied** because they break the still-cached old web client: `sistem_mesaji_kapat` and
`site_residents_kod_gizle` (`specs/followup-migrations/`). See section 14 for the exposure until they land.

---

## 3. Database rules (RLS, grants, triggers, definer functions)

**3.1 RLS and policies in the same migration as the table.** `tests/qa-db.spec.mjs` fails when any `public` table has RLS off. A table only
server code should touch has RLS **on, no policy and no grants**: `invite_attempts`, `request_log`, `revenuecat_deletions`.

```sql
alter table public.invite_attempts enable row level security;   -- no policy: only SECURITY DEFINER functions touch it
revoke all on public.invite_attempts from anon, authenticated;
```

**3.2 Every update policy has `WITH CHECK`.** `USING` filters which rows you may touch; without `WITH CHECK` you may write any value into them.

```sql
-- bad: a document can be re-pointed at someone else's property
create policy documents_update on public.documents for update to authenticated using (uploaded_by = (select auth.uid()));
-- good (documents_update after yetki_duzeltmeleri)
create policy documents_update on public.documents for update to authenticated
  using (uploaded_by = (select auth.uid()))
  with check (uploaded_by = (select auth.uid()) and public.is_member(property_id));
```

**3.3 A row the user may edit, but not every column of it: column-level grants.**

```sql
revoke update on public.memberships from authenticated;
grant update (display_name, phone) on public.memberships to authenticated;   -- role, property_id, user_id: no
```

**3.4 Immutable or privileged columns also get a guard trigger as a second layer.** Distinguish clients from server code with `current_user`:
`authenticated`/`anon` are clients; a `SECURITY DEFINER` function runs as its owner; the Edge Functions run as `service_role`.

```sql
if current_user in ('authenticated', 'anon') and new.role is distinct from old.role then
  raise exception 'Üyelik rolü, mülkü ve kullanıcısı değiştirilemez' using errcode = '42501';
end if;
```

(`guard_membership`, `guard_property_org`, `guard_document_property`; `guard_grant` does the same for `service_role` on `subscriptions`.)
Test both layers: the grant alone (client role) and the trigger alone (grant widened on purpose), as `yetki-duzeltmeleri.sql.spec.mjs` does.

**3.5 `SECURITY DEFINER` functions.**

- `set search_path = public` (or an explicit list). `qa-db.spec.mjs` fails without it.
- Check the caller **inside** the function: `auth.uid()` null means refuse (the `site_report` bug was a check that was skipped when `auth.uid()` was null),
  then `is_banned()`, then the specific permission (`org_can(oid, 'reports.view')`, `member_can(pid, 'message')`, `is_admin()`).
- Close it to `anon` and `PUBLIC` explicitly: `revoke execute on function ... from public, anon;`. Defaults now do this for new functions
  (`alter default privileges`), but say it in the migration anyway, and for internal helpers also `from authenticated`.
- A function callable by `authenticated` goes into the allowlist in `tests/qa-db.spec.mjs` with a one-line reason; one callable by `anon`
  goes into the shorter anon list. Today `anon` has exactly: `invite_preview`, `signup_code_ok`, `site_invite_info`, `submit_lead`, `report_error`, `verify_rent_certificate`.
- Returns must not exceed need: previews return masked names (`mask_name`), never phone or e-mail.
- Never build SQL with string concatenation from arguments; use `format('%I')` / `%L` or parameters.

**3.6 Throttles must survive the failure they count.** A function that raises rolls back its own counter row. `accept_invite` therefore
**returns NULL** after `invite_fail()` instead of raising, so the failed attempt is stored (`davet_kodlari` comment 3). Counters of successful
actions (`rate_ok`) are written only on success: say which kind you are building.

**3.7 Identifiers that become paths or folder names are validated.** `properties_id_onek` forbids `site-`/`hukuk-` prefixes, case-insensitively.
Add the new constraint `NOT VALID`, validate it once you have checked production has no violating row (`yetki_duzeltmeleri` 5 shows how).

**3.8 Writes that must not come from the client go through a function that supplies the identity.** `post_system_message` stamps `by_user`;
`guard_support_request` stamps `email`; `register_device_token` binds the token to the caller.

---

## 4. Invite and code design

Applies to property invites, org (`K...`) invites and site resident (`S...`) invites (`domain/invite-code.js`, migration `davet_kodlari`).

- **Entropy at least 80 bits**: 16 characters of Crockford base32 (5 bits each), generated from `gen_random_uuid()` (cryptographic) in SQL; never `random()`.
  Old 8/7-character codes stay valid until they expire; new invites never use them.
- **Throttle**: more than 10 failures per hour per user or per client IP and *even the correct code is refused*. IP comes from `cf-connecting-ip`
  (a client cannot forge it), else the first `x-forwarded-for` entry. The anonymous previews (`invite_preview`, `site_invite_info`, `signup_code_ok`) are throttled by IP.
- **Uniform failure**: not found, used, expired, bound to another e-mail, throttled: all return `NULL`. The client turns that into one message (`inviteRejected()`);
  only errors that are independent of the code (`42501` no session / suspended, `22023` own invite) keep their text.

  ```js
  if (!pid) throw inviteRejected();        // good: one message for every failure
  // bad: throw new Error(res.reason === 'expired' ? 'Davetin süresi dolmuş' : 'Kod yanlış');
  ```
- **E-mail binding**: an invite created with an e-mail is acceptable only by an account with that e-mail (case-insensitive). Code-only invites remain usable
  by whoever holds the code: that is why length and throttle matter.
- **No PII in anonymous previews**: role, property name and a masked owner name (`A*** Y***`); nothing else; a used or expired code reveals nothing.
- **Single use**: `select ... for update`, then `accepted_by`/`accepted_at`.
- **Reading a resident's code needs a permission** (`site_resident_code`, "Malik ve kiracılar"), not membership in the org.
- **Sending invites by e-mail is rate limited** (`site_invite_mail`: same person once per 2 minutes; `invite_mail_claim`: 40 per owner per day).
- Normalise on the server (`invite_norm`: upper case, strip separators, `O -> 0`, `I/L -> 1`); the client only upper-cases and strips (`normalizeInviteCode`).

---

## 5. Storage rules

- **Limits are server-side.** Bucket `evim`: 10 MB per file and an explicit MIME allowlist (jpeg, png, webp, heic, heif, pdf, mp4, m4v, mov, webm; no HTML,
  SVG or scripts). A client-side check (`app-ui/media.ts`) is a courtesy. The global Storage file-size limit must stay above the bucket limit.
- **Folder = authority, so folder checks must be prefix-proof.** Property files live in `<property id>/...`. The policies exclude `site-` and `hukuk-` folders
  with `(storage.foldername(name))[1] !~* '^(site|hukuk)-'` before treating the folder as a property id, and ids with those prefixes cannot exist.
- **Site folder (`site-<org uuid>/<file>`)** is governed by functions, not by membership: `site_file_read_ok` (managers: everything; residents: their own uploads and records
  visible to them) and `site_file_write_ok` (single-level path, an upload-capable permission, or a linked resident). The path regex pins the folder to a UUID.
- **Delete is owner-only** and refused for files of a locked move-in report (`file_in_locked_inspect`).
- **Quota**: `storage_quota_ok()` as a *restrictive* insert policy (1 GiB or 3000 files per user). It is a soft limit by design (the size of the new file is unknown at
  check time); `storage.objects` cannot have our triggers, hence a policy.
- **Opening a URL from stored data**: file URLs can come from a database row written by another user, so they are untrusted. `safeFileUrl()` accepts only https/blob on the
  Supabase or site origin, or image/PDF/video `data:` URLs, and rejects `javascript:`, foreign origins and SVG.
- **New file type?** Update the bucket allowlist in a migration, the client upload path, and the test that asserts the list.

---

## 6. Rate limits

| What | Limit | Where |
|---|---|---|
| Failed invite attempts | 10 / hour / user and / IP | `invite_throttle()`, `invite_attempts` |
| Support requests (app) | 10 / day / user | `guard_support_request` |
| `submit_lead` (public form) | 5 / hour / IP, plus per-e-mail and global limits | `istek_sinirlari` |
| `report_error` | 60 / hour / IP anonymous, 30 / hour / user; the client also sends at most 20 distinct errors per session | `report_error`, `domain/errors.js` |
| Plan choice e-mails | 5 / day / user | `queue_plan_choice` |
| Invite e-mails | 40 / day / owner; same invite once per 2 minutes | `invite_mail_claim`, `site_invite_mail` |
| Device tokens | 20 / user | `register_device_token` |
| Store sync from the app | 1 / 30 s / user (HTTP 429) | `billing` `cooldownLeft` |
| Storage | 1 GiB or 3000 files / user | `storage_quota_ok` |
| Edge Function logging | 30 rows / minute / isolate; Sentry 30 events / minute | `_shared/log.ts`, `_shared/sentry.ts` |
| Sign-up e-mails (Auth) | one per 60 s | Supabase Auth settings |

Rules: every public (`anon`) entry point and every function that sends mail, SMS or push on behalf of a user has a limit; limits are keyed by user **and** IP where
both exist; the limit has a SQL spec that exceeds it and then shows a different subject is unaffected. New counters reuse `request_log` / `rate_ok(kind, subject, limit, window)`;
`prune_logs` removes old counter rows.

---

## 7. Secrets: where they live and how they move

| Kind | Lives in | Never in |
|---|---|---|
| Webhook and cron secrets (`anahtar_lead_secret`, `anahtar_mail_secret`, `anahtar_push_secret`, `anahtar_report_secret`, `anahtar_tufe_secret`, `anahtar_billing_secret`) | **Supabase Vault**; also the same value in the function's own secret | SQL files, trigger/cron definitions, git, chat |
| Function secrets (`LEAD_SECRET`, `MAIL_SECRET`, `WEBHOOK_SECRET`, `REPORT_SECRET`, `TUFE_SECRET`, `BILLING_CRON_SECRET`, `REVENUECAT_SECRET_KEY`, `REVENUECAT_WEBHOOK_AUTH`, `SMTP_*`, `VAPID_*`, `APNS_*`, `FCM_SERVICE_ACCOUNT`, `EVDS_KEY`, `SENTRY_DSN`) | `supabase secrets set NAME=...` (Edge Function environment) | `config.toml`, `.env` in git, the app bundle |
| CI | GitHub secrets (`EXPO_TOKEN`, `SENTRY_AUTH_TOKEN`, environment secret `SUPABASE_DB_URL` for `staging` and `production`) and variables for public values | workflow YAML literals |
| Mobile build | EAS environment (secrets and file env such as `GOOGLE_SERVICES_JSON`) | `eas.json` for anything secret |
| Signing keys, `.p8`/`.p12`/keystore, service-account JSON, Apple/Google/RevenueCat/Turnstile secrets, demo-account password | The owner's local secrets folder (outside any repo, directory `700`, files `600`) and the vendor's own vault (EAS credentials) | the repo, a shared drive, chat, transcripts |

**7.1 Public by design, safe to ship:** the Supabase *publishable* key, the RevenueCat *public SDK* keys, the VAPID *public* key, the Sentry DSN, the Turnstile *site* key.
They still do not go into documents (noise and scanner alerts), and RLS must be written as if the publishable key is known to everyone, because it is.

**7.2 A new function secret** is a random value of at least 32 bytes, **its own** per function (a leaked `LEAD_SECRET` must not open `push`), set with
`supabase secrets set`, and for DB-called functions also created in Vault under the matching `anahtar_*_secret` name. Document the *name* in the migration
header and in this file; not the value.

**7.3 Compare secrets in constant time and fail closed.**

```ts
// good: billing, push, lead-mail, mail-send, report, tufe-sync
const secret = env('LEAD_SECRET');
if (!secret || !safeEqual(req.headers.get('x-anahtar-secret') ?? '', secret)) return new Response('unauthorized', { status: 401 });
// bad: unset secret and empty header compare equal; == leaks timing
if (req.headers.get('x-anahtar-secret') == Deno.env.get('LEAD_SECRET')) { ... }
```

**7.4 No secret in SQL.** A migration that needs a secret reads the *name* from Vault at call time and aborts with an explicit error, before changing anything, when
a Vault entry is missing (`kasa_sirlari` section 0). A test scans the migration for JWTs, `Bearer`, long random strings and key prefixes.

**7.5 Rotation = two writes within minutes**: new random value into Vault *and* `supabase secrets set`. Webhook calls answer 401 in the gap; verify 200s in
`net._http_response` and the function logs afterwards. The runbook per secret is in section 15.

**7.6 Agents and transcripts.** Never print, paste or mint a token or secret in a session transcript, PR or issue. Do not run commands whose job is to print secrets
(`cat .env*`, `env`, reading the secrets folder). `supabase secrets list` shows names and digests, not values; that is the maximum you need. If a value did get printed,
treat it as leaked and rotate it (section 15).

**7.7 Repository hygiene.** `.gitignore` blocks `.env*` (except `.env.example`), `*.p8`, `*.p12`, `*.jks`, `*.keystore`, `*.mobileprovision`, `GoogleService-Info.plist`,
`google-services.json`, `credentials.json`, `.mcp.json`. `guvenlik.yml` runs gitleaks on every push and weekly. **A finding is fixed by rotating, not by editing history**
(the repo is public and forks/caches exist). `.gitleaksignore` holds exactly two fingerprints for one fake test token; a real finding never goes there.

---

## 8. Edge Functions

| Function | `verify_jwt` | Caller | Authentication inside |
|---|---|---|---|
| `billing` | false | RevenueCat, the app, pg_cron | webhook `Authorization` equals `REVENUECAT_WEBHOOK_AUTH`; user JWT via `auth.getUser`; cron `x-anahtar-secret` |
| `push`, `lead-mail`, `mail-send`, `report`, `tufe-sync` | false | DB webhook / cron | secret header, constant time |
| `welcome`, `invite-mail`, `site-invite` | true (default) | the signed-in app | user JWT; authority decided by RLS and DB functions through `userClient(auth)` |

`tests/functions-deploy.spec.mjs` pins this table; a new function must be classified there and in `supabase/config.toml`.

**8.1 Use the least powerful client.** `userClient(authorization)` (publishable key + the caller's JWT, RLS applies) when acting for a user;
`serviceClient()` (secret key, bypasses RLS) only after the caller has been authorised and only for what needs it. Keys are read only through
`_shared/keys.ts` / `key-env.ts`; `function-keys.spec.mjs` fails on direct `SUPABASE_SERVICE_ROLE_KEY` reads elsewhere.

**8.2 Errors to the caller are generic; detail goes to `log.error`.** `billing` is the reference (`{ error: 'Sunucu hatası' }`, `'Yetkisiz'`).

```ts
return json({ error: 'Sunucu hatası' }, 500);                    // good (detail logged with log.error)
return json({ error: error.message }, 500);                      // bad: leaks table/column names or upstream text
```

**8.3 Every outbound call has a timeout** (`AbortSignal.timeout`; `nodemailer` connection/greeting/socket timeouts; `web-push` `timeout`). A hung upstream must not hold a function open.

**8.4 User-supplied URLs are allowlisted before the server fetches them.** Web Push endpoints: `allowedPushEndpoint()` (https, port 443, no credentials, only FCM,
Mozilla, Apple, Windows hosts) in the function and the same list as a database constraint, so a bad row cannot even be stored. Do the same for any new webhook URL, image URL or redirect target.

**8.5 Mail is built defensively.** `_shared/mail.ts` strips CR/LF from recipient and subject (header injection) and validates the address; templates escape every
interpolated value (`esc`); a confirmation goes only to the address of the account that created the request (`lead-mail` `ackAllowed`); anonymous requests get none.
SMTP uses port 465 (the platform blocks 25/587), TLS verification is never disabled.

**8.6 Webhook payloads are triggers, not truth.** The `billing` webhook uses the event only to find user ids, then re-reads RevenueCat (section 10). `push` takes the notification row from the
authenticated webhook, then loads subscriptions itself.

**8.7 CORS `*` is acceptable only because these functions authenticate with a bearer header, never cookies.** Do not add cookie-based auth to a function with `*`.

**8.8 Observability without leakage.** `logger` redacts; `sentryServe` scrubs (`scrubEvent` drops `user`, request headers, bodies and cookies, redacts strings); do not log request bodies.

---

## 9. Auth client (app and web)

- **PKCE only, tokens never accepted from a URL.** `client()` uses `flowType: 'pkce'`, `detectSessionInUrl: false`; the `dogrula` and `yeni-sifre` screens read the
  one-time `code` from the link (`auth/auth-link.ts`, `expo-linking` on phones) and call `exchangeCodeForSession` themselves. There is no `setSession` from URL parameters.
  A link opened on another device than the one that requested it shows an explanation instead of signing in.

  ```js
  await c.auth.exchangeCodeForSession(code, flowId ? { flowId } : undefined);   // good
  await c.auth.setSession({ access_token: params.access_token, refresh_token: params.refresh_token });   // bad
  ```
- **Phones keep the session in the Keychain/Keystore** (`secure-storage.native.js`): `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY`, chunks of 1800 bytes, marker written last so a
  half-written session reads as empty. Old plaintext AsyncStorage sessions are migrated once and the plaintext copy is deleted even when migration fails (the user signs in again).
  If SecureStore is unusable the session stays in memory only.
- **Android `allowBackup: false`, `AD_ID` blocked** (`app.json`); do not add permissions or trackers without a privacy-manifest and data-safety update.
- **Sign-out unregisters the device token** (`unregister_device_token`); a shared phone must not keep receiving the previous user's notifications.
- **No auth token, e-mail or URL fragment in logs or Sentry.** `scrubUrl()` drops `?query` and `#fragment` (confirmation links carry `#access_token`), turns UUIDs and long numbers into
  `:id`/`:n`. Breadcrumb console capture is off. Test: `sentry-temizlik.spec.mjs`.
- **Redirect allow-list in Supabase Auth** contains only `/giris`, `/giris?dogrulandi=1`, `/yeni-sifre`, `/dogrula` on `https://anahtar.io`. Add a route to the allow-list in the same change as the feature.
- **Universal links** (`/katil`, `/dogrula`, `/yeni-sifre`): `apple-app-site-association` and `assetlinks.json` are generated by `app/scripts/well-known.mjs` from the variables
  `APPLE_TEAM_ID` and `ANDROID_SHA256`; they must not be redirected.
- **Role flags in the client (`ui.role`) are presentation only.** Anything a role may or may not do is also enforced by the database (section 3).
- **Auth settings that matter**: password minimum 8 with the leaked-password check on, e-mail send interval 60 s, session inactivity timeout 90 days, unused providers off.
  E-mail confirmation is **off** (instant sign-up, a product decision); that makes the abuse controls in sections 4 and 6 more important, not less.

---

## 10. Payments and entitlements

**10.1 The client never decides what a user has paid for.** The app calls `billing` with an empty body after a purchase or restore; the function re-reads the subscriber from
RevenueCat (`GET /v1/subscribers/<supabase user id>` with the secret key) and writes `subscriptions`. Only the `billing` function writes that table (clients are denied;
tested in `qa-db.spec.mjs`). Plan and property count come from the **store product id** (`normalizeProduct`), never from a price or count the app sends.

**10.2 Webhook, app call and reconcile all converge on the same re-read.** Out-of-order or duplicate webhooks cannot downgrade a user because `decideWrite` compares what is stored with what
RevenueCat now says (an older `expires_at` for the same product is ignored; a changed product is the new truth), and writes use `updated_at` as an optimistic lock.
The daily reconcile (`POST {"action":"reconcile"}` with `x-anahtar-secret`) is the safety net for lost webhooks.

**10.3 Grants are protected twice.** An admin grant (`store = 'admin'`) or an unexpired promotional entitlement is never overwritten by store sync: in code (`decideWrite`, reason `grant`)
and in the database (`guard_grant`, applies to `service_role` only, so admin functions still work). An *expired* grant does not block a real purchase.

**10.4 Sandbox purchases grant access but are not revenue.** `environment = 'sandbox'` is stored; `admin_kpis` and `billing_reminders` exclude it. App Review and testers
need working access in production; the finance numbers must not include them.

**10.5 The kill switch is data.** `public.app_config.billing_paused`: readable by everyone, writable only through the admin policy `app_config_admin`, every change written to the audit log
(`app_config_audit`). Flipping it in production is a production write: it needs Erdem's approval in the current message.

**10.6 Webhook authentication**: raw `Authorization` value equals `REVENUECAT_WEBHOOK_AUTH` (with or without `Bearer`), constant time. If the variable is unset the webhook branch does not
match and the request falls through to JWT validation, which fails with 401.

**10.7 Never initiate payment, checkout or charge flows** in tests, validation or exploration. Store sandbox testing is done by the owner with store tester accounts.

**10.8 Deletion**: `delete_my_account` queues the user id in `revenuecat_deletions`; `billing` deletes the subscriber in RevenueCat on the next reconcile (retries, gives up after 7 days with a
`function_logs` warning). The app warns about an active store subscription before confirming, because deleting the account does not cancel the store billing.

---

## 11. Web: CSP and HTML

`app/scripts/harden-html.mjs` writes a `<meta http-equiv="Content-Security-Policy">` into every page at build time (the host also sends headers from `app/public/.htaccess`: HSTS,
framing, `nosniff`, `.map` blocked).

- `script-src 'self'` plus the **sha256 of each inline script**, computed from the real text on each page. **No `'unsafe-inline'` and no `'unsafe-eval'` for scripts, ever.**
  (`style-src 'unsafe-inline'` is present because React Native Web emits inline styles; this is the one known exception.)
- `connect-src` lists only the Supabase API and realtime origins and the Sentry ingest origin (derived from the DSN, key stripped); `img-src`, `media-src` likewise;
  `frame-src 'none'` (Turnstile origin only when the site key is set); `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`; a frame-busting script hides the page when framed.
- Consequences for code: no inline event handler attributes, no `javascript:` URLs, no `eval`/`new Function`/string timers, no third-party `<script>`/CDN. Tests that need to run code in
  the page use `locator.evaluate`, because `page.waitForFunction` needs `unsafe-eval` (`tests/app-helpers.mjs` `hydrated`).
- A new third-party origin is a deliberate edit of `csp()` in `harden-html.mjs`, a test and a note in the PR; it is never added "just to make it load".
- **HTML built from data is escaped.** `inspect-html.js` and `investor-html.js` build HTML strings (documents, reports); every interpolated value goes through `esc()` from `util.js`.

  ```js
  `<td>${esc(row.name)}</td>`      // good
  `<td>${row.name}</td>`           // bad: stored XSS through a name field
  ```
- Source maps are uploaded to Sentry during the build and **deleted from the published site**.
- The CSP only exists in the built site; `expo start` has none. Check CSP-sensitive changes against a real export (coding guidelines 7.6).

---

## 12. Privacy and KVKK

Devredin Bilgi Teknolojileri Yazılım ve Ticaret A.Ş. is the data controller; DevirVentures publishes the app. The privacy page (`/gizlilik/`) and the deletion page (`/hesap-silme/`) are promises: the code must keep them.

- **Minimise.** Do not add a field, log line, analytics event or Sentry attachment unless the feature needs it. Sentry: IP storage off, enhanced privacy on, no session replay, no screenshots or view
  hierarchy, user = UUID only. App Store privacy answers (13 data types, no tracking) and the Play data-safety form must change in the same release as any new collection.
- **Retention is code** (`prune_logs`, nightly): `client_errors` and `function_logs` 90 days, `mail_outbox` 90 days (it holds addresses), resolved support requests 6 months,
  throttle counters 2 days. `admin_audit` is immutable and kept longer (up to 10 years, stated in the policy). A new table with personal data comes with its retention rule in the same migration.
- **Deletion flow** (`delete_my_account`, and `admin_delete_user` which follows the same rules): support requests anonymised (the ticket remains, the person goes), legal requests cascade, messages lose `by_user`,
  an "account deleted" mail is queued with only address, language and name, the RevenueCat subscriber is queued for deletion, then `auth.users` is deleted. Failures are shown to the user and the session stays signed in.
- **Data subject requests** arrive at `info@anahtar.io` or through the in-app support form; answer within the statutory 30 days.
- **Third parties** (Supabase EU, Sentry EU, RevenueCat, Apple, Google, Hostinger mail) are listed in the privacy policy; adding one is a legal change, not just a code change.
- **Test data is fake** (`ornek.com`, fixed UUIDs). Production data is never copied into tests, fixtures, screenshots or the public repo.

---

## 13. Review checklist for pull requests touching auth, database, storage or payments

Answer each in the PR description; a reviewer checks the diff, not the description.

**Database**
- [ ] New table: RLS on, policies in the same migration, no grants to `anon`, FKs indexed, retention stated if it holds personal data.
- [ ] Every `UPDATE` policy has `WITH CHECK`; client-editable columns are listed in a column grant; role/ownership/identity columns have a guard trigger.
- [ ] New or changed `SECURITY DEFINER` function: `search_path` set, caller authorised inside (null `auth.uid()` handled), revoked from `public, anon`, allowlist updated with a reason.
- [ ] Re-runnable (`if not exists`, `create or replace`, `drop ... if exists`); works with the old client; anything that breaks the old client is a follow-up migration.
- [ ] SQL spec has negative tests for tenant, landlord, agent/team, resident, read-only org role, outsider and anon.
- [ ] No secret, key, e-mail, phone or customer name in the SQL.

**Storage and files**
- [ ] Size and type enforced on the server; folder checks prefix-proof; URLs from stored data pass `safeFileUrl()`.

**Edge Functions**
- [ ] Classified in `config.toml` / `functions-deploy.spec.mjs`; secret header compared in constant time and fails closed; own random secret.
- [ ] `userClient` unless service rights are really needed; keys only via `_shared/keys.ts`; `sentryServe` and `logger`; no `console`.
- [ ] Generic error bodies; timeouts on outbound calls; user-supplied URLs allowlisted; no PII in logs.

**Auth**
- [ ] No token read from a URL; no new `setSession`; no token in logs/Sentry; redirect allow-list updated; session storage unchanged or reviewed.
- [ ] Real-env web export run (coding guidelines 7.6) for any change to client init.

**Payments**
- [ ] Entitlement still derived server-side from RevenueCat; grants protected; sandbox excluded from KPIs; no payment flow triggered in tests.

**Web**
- [ ] No inline script/handler, no `eval`; new origins added to `csp()` deliberately; generated HTML escaped.

**General**
- [ ] No new tracking, analytics or collection (and no removal of an existing event without the owner's decision); privacy answers updated if collection changed.
- [ ] No new paid service; dependency additions justified.
- [ ] PR lists what was not run, rollback commits and the ordered production steps (function deploys, then migrations via Actions: staging plan, staging apply, production plan, production apply, each with explicit approval).

---

## 14. Known open risks and open items

Kept current; remove an item only with evidence that it is closed.

| Item | Risk | Next step |
|---|---|---|
| **Legacy JWT API keys are still enabled** in Supabase | A leaked legacy `anon`/`service_role` key remains valid | The functions already prefer `SUPABASE_SECRET_KEYS`. Confirm every function environment has the new keys and the clients ship the publishable key, then disable the legacy keys in the dashboard and watch logs for 401s |
| **`info@anahtar.io` mailbox password (`SMTP_PASS`) not rotated** | It was once identical to a secret stored in clear text in trigger definitions | Rotate in Hostinger, update `SMTP_PASS` in Edge Function secrets **and** the SMTP settings of Supabase Auth |
| **CAPTCHA is off** (decision: Supabase CAPTCHA not enforced; the web has a Turnstile widget but it is not enforced; phones have none) with e-mail confirmation off | Scripted sign-ups, trial abuse, sign-in password guessing | Compensating controls: password minimum 8 + leaked-password check, 60 s e-mail interval, invite throttles, server 30-day trial only. Revisit with sign-up numbers; enforcing it requires a client that sends the token first |
| **Follow-up migrations pending** (`sistem_mesaji_kapat`, `site_residents_kod_gizle`) | Until applied, any property member can still insert free-text `from_role = 'system'` messages, and `site_residents.code` is still selectable by org members (including read-only roles) | Apply in a separate PR once the new site has been live for at least 24 hours (live since 2026-11-13 about 16:14 UTC) and the shipped bundle contains `post_system_message` and `site_resident_code`; steps in `specs/followup-migrations/README.md` |
| **Staging parity** | Staging has no `pg_cron`, `pg_net`, Vault or app secrets, sits in another region and is on a withdrawn Postgres release channel; `kasa_sirlari` is skipped there, so webhook and cron paths are only verified in production | Upgrade or recreate staging with the same extensions and fake secrets; until then the production plan output and the post-apply SQL check are the only verification |
| **Error text still returned by some functions** | `invite-mail`, `site-invite`, `welcome` return `error.message`/the mailer error; `lead-mail` returns the mailer error; `mailMissing()` names missing config | Replace with generic bodies and `log.error`, as in `billing` (rule 8.2), with a handler test |
| **No branch protection or required reviews** (owner decision) | "Nobody pushes to `main`" is convention; one compromised write account could ship code through `hostinger.yml` | Mitigations in place: `hostinger.yml` runs only from the default branch with scoped `contents: write`, merges happen only on Erdem's explicit go, gitleaks and CodeQL run on every change. Reconsider rulesets when the team grows |
| **`style-src 'unsafe-inline'`** | Style injection (low impact) | Accepted while React Native Web emits inline styles; no script exception |
| **Backups: daily, no point-in-time recovery** | Up to a day of data lost in a destructive incident | Decide on PITR when revenue justifies it; take a manual backup before any production data change |
| **Old US Sentry organisation `anahtario`** is scheduled for deletion | Duplicate telemetry in the US | Confirm deletion |
| **Supabase Auth health uptime monitor is disabled** (plan quota) | Sign-in outage is detected only by user reports or error alerts | Re-enable when the quota allows, or add the check to an existing monitor |
| **GCP org policy `iam.allowedPolicyMemberDomains` is relaxed on project `anahtario` only** (needed for Play real-time notifications) | Broader IAM sharing on that project | Keep the project single-purpose; review members quarterly |

---

## 15. Incident response

**Detect.** Sentry alert for new, regressed or re-occurring issues (e-mail), metric monitors (errors above 20/hour web and mobile, above 10/hour edge, mobile crash rate above 2%), uptime check on
`https://anahtar.io/`, cron monitor for `tufe-sync`, `function_logs`/`client_errors` in the admin panel, `admin_audit`, gitleaks and CodeQL, Dependabot, user reports to `info@anahtar.io` and `security.txt`.
Look at the first signal as an incident until proven otherwise when it concerns auth, payments, invites, storage or personal data.

**Contain** (smallest action first; production writes need Erdem's explicit go, read-only investigation does not).
1. Stop the bleeding without code: ban the account (`admin_set_ban`), set `billing_paused` to true for a payment problem, remove a leaked key's access (rotate, below), disable a webhook trigger.
2. Do not describe an unfixed vulnerability in a public PR, issue or commit message (the repo is public). Use the private channel until the fix is live.
3. Preserve evidence before changing anything: copy the relevant `function_logs`, `client_errors`, `admin_audit` rows and Supabase/Sentry log excerpts to the private vault, with no secrets in them.

**Rotate** (assume any printed or committed secret is compromised):

| Secret | Rotate |
|---|---|
| Function webhook/cron secret (`LEAD_SECRET`, `MAIL_SECRET`, `WEBHOOK_SECRET`, `REPORT_SECRET`, `TUFE_SECRET`, `BILLING_CRON_SECRET`) | New random 32+ bytes; update the Vault entry and `supabase secrets set` for that function within minutes; verify 200 responses; value to the owner's local secrets folder only |
| `REVENUECAT_SECRET_KEY`, `REVENUECAT_WEBHOOK_AUTH` | Create new in RevenueCat; update the function secret and the webhook's Authorization value together |
| `SMTP_PASS` | Hostinger mailbox password; Edge Function secret **and** Supabase Auth SMTP settings |
| Supabase secret key (`sb_secret_...`) | Follow Supabase's "Migrating to publishable and secret API keys" guide (cited in `_shared/key-env.ts`): create the new key, confirm the functions use it, then delete the old one |
| `SUPABASE_DB_URL` (GitHub environments) | Reset the database password, update the secret in both environments |
| `EXPO_TOKEN`, `SENTRY_AUTH_TOKEN` (GitHub and EAS) | Revoke and recreate the robot/org token; update every place it is stored |
| APNs, App Store Connect, Play service-account, FCM keys | Revoke at the vendor, create new, update function secrets / EAS credentials |
| A user's session suspected stolen | Admin ban plus sign-out of sessions; the user resets the password |

**Fix.** Write a migration or code change with a test that reproduces the hole, apply the DB fix through Actions (staging plan, staging apply, production plan, production apply) and deploy changed functions first.
If the fix breaks the old client, ship the compatible half now and the strict half as a follow-up migration (the 2026-11-13 pattern). Create a validation event after a bug-fix PR.

**Notify.** If personal data was or may have been exposed: the controller (Devredin A.Ş.) notifies the KVKK Board within **72 hours** of becoming aware, and the affected people as soon as reasonably possible;
involve the controller's legal contact immediately; Apple/Google/RevenueCat only if their data or keys were involved. Keep a timeline: when detected, when contained, what data, how many people, what was done.

**Learn.** Add the missing test, update the rule in this file, and capture follow-ups as todos in the private vault with owner and date.
