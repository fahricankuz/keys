# Coding guidelines

How we write code in this repository: module boundaries, platform files, the server-as-source-of-truth rule, deploy-order
compatibility, i18n, logging, tests, naming, dependencies and the definition of done. Every rule points at code that already
exists here and has a short good/bad example. Turkish UI strings in the examples stay Turkish (that is the product language).

Companions: [security-guidelines.md](security-guidelines.md) (security rules and the 2026-11-13 hardening),
[migrations.md](migrations.md) (how a database change ships), [loglar.md](loglar.md) (where logs go),
[test.md](test.md) (test families). Where a rule is enforced by a test, the test is named; where it is not, a reviewer enforces it.

---

## 1. Module boundaries

```
app/src/
  app/         expo-router route files            thin: read params, guard, render one screen
  app-ui/      screens, sheets, forms (TSX)       uses ui/ + domain/
  auth/        sign-in/up forms, captcha          uses ui/ + domain/
  site/        marketing site pages (TSX)         uses ui/ + domain/
  ui/          design kit (kit.tsx, theme.ts)     uses domain/state only for theme/hooks
  domain/      logic, state, backend client (JS)  NO imports from the folders above
  testing/     fake-supabase.js                   loaded only when EXPO_PUBLIC_SUPABASE_URL=fake:
supabase/migrations/   source of truth for the schema (schema.sql is generated)
supabase/functions/    Edge Functions (Deno) + _shared/
tests/                 Playwright specs (SQL on PGlite, Node unit, app flows) + stubs/
```

**1.1 Dependencies point one way: `app` -> `app-ui`/`auth`/`site` -> `ui` -> `domain`.** `domain/` is plain JS with no JSX and
never imports a screen. This is true today (no file in `domain/` imports from `app-ui`, `app`, `ui`, `auth` or `site`); keep it that way, because
`domain/` is what the Node unit tests bundle.

```js
// good  app/src/domain/crm.js: returns data, the screen decides how to draw it
export const SOURCES = () => [['web', t('Web formu')], ['telefon', t('Telefon')]];
// bad   domain/ importing a component to render a label
import { Chip } from '../app-ui/blocks';
```

**1.2 Route files stay thin.** `app/src/app/uygulama/mulk.tsx` is 6 lines: read `pid`/`sub`, redirect if the role is wrong, render
`<PropDetail>` from `app-ui/screens.tsx`. Logic goes to `domain/`, drawing to `app-ui/`.

**1.3 Pure logic gets its own small module; `backend.js` only wires.** `domain/backend.js` (1000+ lines) talks to Supabase, state and
realtime and is hard to test. New rules go to a pure file that tests can bundle without a network: `invite-code.js`, `system-message.js`,
`rpc-missing.js`, `store-ids.js`, `mapping.js` ("Saf modül: DOM'a, duruma ya da ağa dokunmaz"). Do not grow `backend.js` with logic that
has no I/O.

**1.4 Reuse before you create.** Use `ui/kit.tsx` (`Button`, `Text`, ...) and colours from `useColors()` (`ui/theme.ts`), never hex
literals in screens. Extend an existing screen instead of replacing it: the paywall `app-ui/store-purchase.tsx` was extended, not rewritten.

```tsx
// good
const c = useColors();  <View style={{ backgroundColor: c.surface }} />
// bad
<View style={{ backgroundColor: '#FFFDFB' }} />
```

**1.5 Explicit column lists for tables the server may later narrow.** `domain/site.js` reads residents with `RESIDENT_COLS`, never
`select *`, so a later column-level `revoke select` (see `specs/followup-migrations/`) cannot break the new client.

---

## 2. Platform files (`x.js` / `x.native.js`)

The same code runs in four places: Hermes on iOS/Android, the browser, **Node during `expo export -p web`** (static pre-render, no
`window`), and Node inside the tests (esbuild bundles `domain/` code). Metro picks `x.native.js` on iOS/Android and `x.js` on web; esbuild
in the tests always picks `x.js`, so the `.native.js` file never enters a unit test.

| Concern | Web / Node (`x.js`) | Phones (`x.native.js`) |
|---|---|---|
| Random bytes | `random.js` (Web Crypto) | `random.native.js` (`expo-crypto`) |
| Session store | `secure-storage.js` (AsyncStorage/localStorage; no-op when `window` is undefined) | `secure-storage.native.js` (`expo-secure-store`, chunked) |
| In-app purchase | `iap.js` (stub: `storeAvailable() === false`) | `iap.native.js` (`react-native-purchases`) |
| Push | `native-push.js` (stub; browser push is `webpush.js`) | `native-push.native.js` (`expo-notifications`) |
| Sentry | `sentry.js` (lazy `@sentry/browser`) | `sentry.native.js` (`@sentry/react-native`) |
| Captcha, font files | `captcha.tsx`, `fontFiles.ts` | `captcha.native.tsx`, `fontFiles.native.ts` |

**2.1 A native-only package is imported only from a `.native.*` file.** `expo-crypto` is imported in exactly one place,
`random.native.js`; callers import `./random` without an extension (`util.js`). Commit `90c1182` moved it out of the shared path because
a top-level `expo-crypto` import broke the web bundle and the Node tests.

```js
// good  util.js
import { randomBytes } from './random';
// bad   any shared file
import { getRandomBytes } from 'expo-crypto';
```

**2.2 Twins export the same names and never throw at import.** `iap.js` exports the whole `iap.native.js` surface as no-ops
(`restoreStore`, `manageStore`, ...), so screens call it on every platform. Add a function to one twin and you add it to the other.

**2.3 Nothing may touch `window`, `document`, `localStorage` or `navigator` at module load or in a first render.** Static export runs in
Node. PR #113 fixed a build that stopped with `window is not defined` because the web session store reached for `window`; the fix is
`ssrStorage` in `secure-storage.js`. `sentry.js` shows the pattern: `if (typeof window === 'undefined' || !DSN) return;`.
Test: `tests/oturum-deposu-ssr.spec.mjs` (stub `async-storage-throws.js` throws if it is touched).

**2.4 Ids and tokens come from `uid()` / `randomBytes()`, never `Math.random()`.** CodeQL flagged it; `tests/oturum-guvenligi.spec.mjs`
makes `Math.random` throw while `uid()` runs.

**2.5 One-line differences use `Platform.OS`; anything larger gets a twin file.** `errors.js` branches on `Platform.OS` for global
handlers; the purchase flow would be unreadable that way, hence `iap.native.js`.

**2.6 `domain/` may import `react-native` only for `Platform`.** The tests alias `react-native`, `@react-native-async-storage/async-storage`
and `expo-secure-store` to `tests/stubs/`. If a shared module needs any other Expo package, put it behind a twin. `errors.js` imports
`expo-constants`, so no unit test can bundle it; that is why `logs.js` (zero dependencies) exists and `errors.js` plugs the sink in at startup.

---

## 3. The server is the source of truth

**3.1 Rules, permissions and limits are enforced in Postgres (RLS, guard triggers, `SECURITY DEFINER` functions). The client may mirror a
rule for UX only, and a parity test pins every mirror.**

| Client mirror | Server rule | Parity test |
|---|---|---|
| `system-message.js` `SYSTEM_KINDS` | `post_system_message` (migration `sistem_mesaji`) | `tests/sistem-mesaji.sql.spec.mjs` sends every `examples` string to the server |
| `invite-code.js` | `invite_norm`, `gen_invite_code` (`davet_kodlari`) | `tests/davet-kodlari.sql.spec.mjs`, `tests/oturum-guvenligi.spec.mjs` |
| `store-ids.js` | `plan_of`, `product_units`, `billing/subscriber.ts` | `tests/magaza-urunleri.spec.mjs` |
| `redact` in `sentry-scrub.js` | `public.log_redact`, `_shared/log.ts` | `tests/loglar.sql.spec.mjs`, `tests/sentry-temizlik.spec.mjs` |

```js
// bad   the only thing hiding a blocked user's messages is a React filter
const shown = messages.filter(m => !blocked.has(m.by_user));
// good  the messages_select policy hides those rows (migration yetki_duzeltmeleri, section 3); the client has no filter
```

**3.2 Anything an operator must change without a release lives in `public.app_config`, with a hard-coded fallback.** The payment switch
`billing_paused` is a row read by `domain/app-config.js` (5 min TTL, 6 s timeout, 30 s retry); `CONFIG.billing.paused` in `config.js` is only the
fallback when the read fails. To add a flag: a migration inserting the row with a safe default (`on conflict do nothing`), a fallback constant, a
cached read like `app-config.js`, and a test of the fallback path.

```js
// good
if (billingPaused()) return <PausedNotice />;
// bad
if (CONFIG.billing.paused) return <PausedNotice />;   // needs a store release to change
```

**3.3 The client never supplies a value it expects to be believed.** `post_system_message` writes `by_user` from `auth.uid()`; the
`guard_support_request` trigger overwrites `support_requests.email` with the account e-mail; the `billing` function derives plan and unit
count from the store product id, not from anything the app sends.

**3.4 Display data in `config.js` (plan prices, `usd` amounts) is display only.** Phones show the live store price; the server decides
entitlement from the RevenueCat record (see the payments section of the security guidelines).

---

## 4. Compatibility between deploys: the site ships before the migrations

`hostinger.yml` publishes the site on merge to `main`; migrations are applied later, by hand, through Actions -> "Veritabanı migration"
(staging plan -> staging apply -> production plan -> production apply). Old browser tabs keep running the old client for hours. Every change
must therefore work in all four combinations of {old, new} client x {old, new} schema.

**4.1 Migrations are additive.** Add columns, functions, policies. Anything that breaks the old client (removing a write path, hiding a
column, renaming) is a **follow-up migration** in `specs/followup-migrations/`, shipped in a second PR at least 24 hours after the new site is
live (`specs/followup-migrations/README.md`). Today it holds `sistem_mesaji_kapat` and `site_residents_kod_gizle`;
`tests/followup-migrations.sql.spec.mjs` already applies them on top of the schema and asserts the end state, so the move is mechanical.

**4.2 A new client calling a new RPC uses `rpcOr`.** `domain/rpc-missing.js` recognises "function does not exist" (HTTP 404, `PGRST202`,
"could not find the function"), runs the fallback and remembers the absence for the session.

```js
// good  domain/site.js
const res = await rpcOr(c, 'site_resident_code', { p_resident: id },
  async () => c.from('site_residents').select('code').eq('id', id).maybeSingle());
// bad   shows an error between the site deploy and the migration
const res = await c.rpc('site_resident_code', { p_resident: id });
```

Test: `tests/rpc-yedek.spec.mjs` feeds a fake client that answers `MISSING` and asserts the old path and the "remembered" behaviour.
`native-push.native.js` does the same for `register_device_token` / `unregister_device_token`; `app-config.js` falls back to `config.js` when the table is absent.

**4.3 Missing is not denied.** `isMissingRpc` must not swallow permission errors or the function's own errors. `writeSystemMessages` shows
the full dance: RPC first; on "missing" write the legacy row; if the legacy insert is then refused by RLS (the follow-up migration landed),
`forgetMissingRpc` and try the RPC once more.

**4.4 Edge Functions are deployed before the migrations and tolerate the old schema.** `billing` skips `revenuecat_deletions` silently when
the table does not exist yet (`if (error) return out`). Order: Vault + function secrets -> `supabase functions deploy` -> migrations.

**4.5 Keep the fake backend honest.** If a migration changes behaviour the client observes, update `app/src/testing/fake-supabase.js` in the
same PR (it already mirrors `invite_norm` and `mask_name`) and keep a test for the old-schema path.

---

## 5. i18n

Turkish is the source: `t('Ödemeler')` returns itself in Turkish and the English dictionary entry in English
(`domain/en.js`, `en-extra.js`, `en-mulk.js`, `en-paket.js`, merged in `loadEn()` and downloaded only when the language is English). A
missing English entry falls back to Turkish and is recorded in `globalThis.__i18nMissing`. `tests/app-admin.spec.mjs` (English tour of the
main screens) and `tests/paketler.spec.mjs` (pricing pages) fail when that set is not empty. A new visible string needs its English entry in
the same PR and must be reachable by one of those sweeps.

**5.1 Never call `t()` at module load.** `lang` is `'tr'` until `initLang()` runs after storage is hydrated, so anything computed at import
time is Turkish forever. That was the bug fixed in PR #116 (`ST` in `logic.js` and `PROP_SUBS` in `screens.tsx`): English users saw
"Ödendi" and "Bekliyor".

```js
// bad   evaluated once, at import
export const ST = { approved: [t('Ödendi'), 'ok'] };
const PROP_SUBS = [['ozet', t('Özet')], ['odeme', t('Ödemeler')]];
// good  evaluated on every read
export const ST = { get approved(){ return [t('Ödendi'), 'ok']; } };      // domain/logic.js
const PROP_SUBS = () => [['ozet', t('Özet')], ['odeme', t('Ödemeler')]];  // call sites: PROP_SUBS()
export const SOURCES = () => [['web', t('Web formu')]];                   // domain/crm.js
```

Sweep for siblings of this bug whenever you touch a label table: every top-level `const X = [ ... t('...') ... ]` or `{ ... t('...') ... }` is a
suspect (`grep -rnE "^(export )?const [A-Za-z_]+ = [\[{].*[^A-Za-z.]t\('" app/src`). Today every hit is a function or getter.
Test: `tests/dil-durum.spec.mjs`.

**5.2 Do not persist a preference before it is known.** The second half of PR #116: a `saveLocal()` before storage hydration wrote
`{ lang: 'tr' }` over the saved English choice. `state.js` now writes `evim-tercih` only after `prefReady`, and `domain/backend.js` reads
`savedLang()`.

```js
// bad
next.lang = S.lang || 'tr';           // 'tr' is the not-yet-hydrated default
// good
next.lang = savedLang() || live.profile.lang || 'tr';
```

**5.3 Stored data stays Turkish; translate when displaying.** Request kinds, cost owners, document categories and `depositKind ===
'Teminat mektubu'` are stored in Turkish. Never compare against a translated label.

**5.4 Placeholders and plurals, never concatenation.** `t('{n} gün önce', { n })`; plural `'{n} day||{n} days'`; context
`'Ara|telefon'` (text before `|` is shown).

```js
t('Kalan ') + n + t(' gün')              // bad: word order differs between languages
t('Kalan {n} gün', { n })                // good
```

**5.5 Dates, numbers and money go through `domain/util.js`** (`fmt`, `fmtFull`, `tl`, `percent`, `numShow`), which use `locale()`; do not
hard-code `'tr-TR'`. The English site shows the `usd` prices from `config.js`.

**5.6 Server-generated text carries a language.** E-mail templates take `lang`; system messages accept the Turkish and English pattern of each
kind (`system-message.js`), because the writer may use either language.

---

## 6. Error handling and logging

| Situation | Use | Lands in |
|---|---|---|
| App caught an error and carries on | `logCaught('Eşitleme hatası', e)` (`domain/logs.js`) | `client_errors` (via `errors.js` -> `report_error`) + Sentry tag `kind=caught` |
| Uncaught error / rejection / render crash | nothing to call; `installErrorReporting()`, `ErrorBoundary` in `_layout.tsx` | `client_errors` + Sentry |
| Edge Function | `const log = logger('fn'); await log.error('...', { ... })` (`_shared/log.ts`) | console JSON; `warn`/`error` also `function_logs` and Sentry |
| Edge Function entry | `sentryServe('fn', handler)`, never `Deno.serve` | per-request Sentry scope, flush |
| Scheduled function | `cronCheckIn('tufe-sync', '0 13 * * *')` ... `run.done(ok)` | Sentry cron monitor |

**6.1 No silent catches.** An empty `catch(e){}` is allowed only for best-effort work, with a comment saying why (removing a legacy
copy, storage quota). Everything else is `logCaught`.

```js
// good  domain/backend.js
} catch(e){ logCaught('Mülk yenilenemedi', e); return null; }
// bad
} catch(e){}
```

**6.2 The context string is a fixed phrase. Data goes nowhere near it.** Bad: `logCaught('Sync failed for ' + user.email, e)`.

**6.3 Expected noise is not logged.** Offline, aborted requests, browser-extension errors: the `NOISE` regex exists in `errors.js` and
`sentry-scrub.js` and the two must stay identical (`tests/sentry-temizlik.spec.mjs`). `errors.js` also drops preview hosts and `__DEV__`
builds, sends each distinct error once per session and at most 20 per session.

**6.4 Never log PII or secrets: names, e-mails, phones, tokens, URLs with `?query` or `#fragment`** (Supabase confirmation links carry
`#access_token=`). Redaction is a safety net, not permission. Log ids (UUIDs). The redaction rules live in three places that must change
together: `public.log_redact` (SQL), `supabase/functions/_shared/log.ts` `redact`, `app/src/domain/sentry-scrub.js` `redact`.
Tests: `tests/loglar.sql.spec.mjs`, `tests/sentry-temizlik.spec.mjs`.

**6.5 Edge Functions never use `console.*` directly** (`tests/loglar.spec.mjs` greps for it). `logger` never throws and never blocks the
request; it writes at most 30 table rows per minute per isolate.

**6.6 Sentry capture rules.** Do not call `Sentry.capture*` from screens: use `logCaught` or throw. Sentry already hooks uncaught errors and
rejections, so `errors.js` forwards only `render` and `caught` (otherwise every crash is reported twice). `sendDefaultPii: false`, no session
replay, no screenshots, user = UUID only (`setSentryUser`), web reports only from `anahtar.io`, phones only from release builds with a DSN.

**6.7 Client-visible errors are generic; detail goes to logs.** The `billing` function returns `{ error: 'Sunucu hatası' }` and logs the
RevenueCat body to `function_logs`. Do not return `error.message` from a database or upstream call (open items in section 12).

**6.8 Failures with security meaning collapse to one message, branched on `code`.** `inviteRejected()` sets `code = 'INVITE'`;
`inviteError()` maps the server's distinguishing errors to it and lets only `42501` (no session, suspended) and `22023` (own invite) through.
Server codes: `42501` authorization, `22023` invalid input, `54000` limit reached (`guard_support_request`).

**6.9 Everything that waits has a timeout.** `app-config.js` `TIMEOUT = 6000`; `AbortSignal.timeout(...)` on every Edge Function `fetch`
(`billing` 10 s, `mail.ts` 15 s, `tufe-sync` 20 s).

---

## 7. Tests

| Change | Test | Pattern |
|---|---|---|
| Migration / RLS / SQL function | `tests/<name>.sql.spec.mjs` | `newDb()` (`tests/db-helpers.mjs`): PGlite, schema applied **twice**; switch roles with `as(uid)` / `as(null, true)` |
| Domain logic | `tests/<name>.spec.mjs` | esbuild `buildSync` bundles `domain/` files with `tests/stubs/` aliases, then `import` (examples: `dil-durum`, `rpc-yedek`, `oturum-guvenligi`) |
| Edge Function | `tests/<name>-handler.spec.mjs` | `withEdge(...)` / `bundleModule(...)` in `tests/edge-harness.mjs`: `npm:` imports stubbed, `Deno.serve` captured |
| App flow | `tests/<name>.app.spec.mjs` | Playwright against `app/dist-fake` (`ensureDist`, `serveDist`, `seed()` in `tests/app-helpers.mjs`) |

**7.1 Every migration ships with a SQL spec containing the allowed path and a negative test per role**: tenant, landlord (owner), agent/team
member, site resident, read-only org role, outsider, anonymous. Assert the error text (`tryCall(...)` then `toMatch(/permission denied/)`).

```js
// good  tests/yetki-duzeltmeleri.sql.spec.mjs
for (const [who, role] of [[T, 'tenant'], [L, 'landlord'], [L2, 'agent']]) {
  await as(who);
  expect(await tryCall(db, `update public.memberships set role = 'landlord' where user_id = '${who}'`)).toMatch(/permission denied/);
}
// bad: only proving that the owner can still do it
```

**7.2 Update the guard rails in `tests/qa-db.spec.mjs` when you add a function or table**: RLS on every `public` table, `search_path` on
every definer function, and the two allowlists of externally callable `SECURITY DEFINER` functions (authenticated, anon). A new entry is a
deliberate decision with a one-line reason in the comment next to it. Run `npm run db:derle` after every migration and `npm run db:kontrol`
to check `schema.sql` is current (`tests/migrations.spec.mjs` fails otherwise).

**7.3 Unit-test `domain/` code without Expo.** The modules under test must not import native packages (section 2) and every load gets fresh
module state, so "the RPC is missing" memory or language state does not leak between tests.

**7.4 Put Edge Function logic in Deno-free files** (`billing/subscriber.ts`, `push/endpoint.ts`, `lead-mail/ack.ts`) so tests call it
directly. A new function must use `sentryServe`, be listed with the right `verify_jwt` in `supabase/config.toml` (add it to the lists pinned by
`tests/functions-deploy.spec.mjs`) and compile (`tests/functions-build.spec.mjs` builds every `index.ts`).

**7.5 App specs use the fake backend; the fake is not the server.** `app/src/testing/fake-supabase.js` keeps a subset of the Supabase API in
`localStorage`. RLS and triggers are proven in PGlite, flows are proven here. Use `hydrated(page, locator)` before typing into a field (the
static HTML is replaced by React shortly after load), `midMonth(page)` for date-dependent screens and finish with `expect(errors).toEqual([])`
from `watchErrors(page)`.

**7.6 The real-environment SSR gap. Run the web export with real public env before merging changes to auth or client init.** Every app spec
builds `dist-fake` with `EXPO_PUBLIC_SUPABASE_URL=fake:`, and `client()` in `backend.js` takes the fake branch, so the real
`createClient(..., { auth: { storage: authStorage, ... } })` path never runs during static pre-render in CI tests. PR #113 was exactly that: the
`hostinger.yml` build (real env) died with `window is not defined`, which no test had seen. Before merging a change to `backend.js` `client()`,
`secure-storage*`, `auth/*`, `sentry*`, `config.js`, `app/_layout.tsx` or any module-level code a route reaches:

```bash
cd app
EXPO_PUBLIC_SUPABASE_URL=<project url> EXPO_PUBLIC_SUPABASE_ANON_KEY=<publishable key> npm run build:web
```

Use the public values from the `hostinger.yml` build step (they are the same ones the live site ships) and put them in the shell, not in a file.
The export must finish with exit status 0 and `harden-html` must print its page count. `dist/` is git-ignored. Where you can, add a Node unit
test that loads the module without `window` and a throwing stub, like `tests/oturum-deposu-ssr.spec.mjs`.

**7.7 Run only what you changed, one file at a time, with Node 22 and a time limit.** `npx playwright test tests/davet-kodlari.sql.spec.mjs`.
The full set runs in CI ("Testler (tam set)", two shards). Each push to a PR re-runs about 15 minutes of Actions: finish locally, commit per
task, push once.

**7.8 Deterministic and side-effect free.** No real Supabase, Sentry, RevenueCat or SMTP; fixed clock; no payment, checkout or charge
flow in any test or manual check.

**7.9 A bug fix includes the regression test that fails without the fix.** Test names are one Turkish sentence describing behaviour,
as in the existing files.

---

## 8. Readability and performance basics

- **Small pure functions, early returns, one idea per file.** `store-ids.js` is the model: every export is a short, documented, pure function.
- **Write only the diff.** The sync layer compares previous and new state and writes changed rows (`mapping.js` `diffProperty`); do not
  add "save everything" paths.
- **RLS policies use `(select auth.uid())`**, so Postgres evaluates it once per query instead of once per row; **every foreign key has an
  index** (`rls_performans`, guarded by `tests/rls-performans.sql.spec.mjs`).

  ```sql
  using (user_id = auth.uid())            -- bad: per row
  using (user_id = (select auth.uid()))   -- good: initplan
  ```
- **A policy must not query its own table.** It recurses ("infinite recursion detected in policy"). Move the lookup into a `SECURITY DEFINER`
  helper, as `reports_today(uid)` does for `content_reports`.
- **Keep the first load small.** `@sentry/browser` is imported lazily on idle, the English dictionary (~170 KB) loads only for English, unused font
  files are deleted by `harden-html.mjs`. Budgets are asserted in `tests/qa-app.spec.mjs`.
- **Subscribe, do not poll.** Shared values use `useSyncExternalStore` (`useBillingPaused`), not timers in components.

---

## 9. Naming and comments

- **Identifiers are English** (`camelCase` JS, `snake_case` SQL, `kebab-case` file names: `invite-code.js`, `rpc-missing.js`). **Turkish** is used
  for user-visible strings, URLs (`/giris`, `/katil`), migration and test file names (`davet_kodlari`, `davet-kodlari.sql.spec.mjs`) and comments.
- **Comments explain why**: the constraint, the incident, the sibling that must change with it. They do not narrate the code. Mirrors point
  both ways ("Kalıplar supabase/migrations -> sistem_mesaji ile birebir aynıdır" in `system-message.js`; "Kalıplar app/src/domain/system-message.js
  ile birebir aynıdır" in the migration).
- **A module starts with a header comment**: purpose, invariants, which twin or server object it mirrors. A migration starts with the problem, the fix,
  the compatibility statement, the test file name and "Yeniden çalıştırılabilir".
- **JSDoc on exported `domain/` functions.** `checkJs` is off for JS (`app/tsconfig.json`), TSX is `strict`; `npm run typecheck --prefix app` must pass.
- **No secrets, real names, e-mails or phone numbers in code, comments, fixtures or commit messages.** Test data uses `ornek.com`, fixed UUIDs
  (`tests/db-helpers.mjs` `ID`) and fake tokens (the two `.gitleaksignore` entries are for one fake token, not a precedent).
- **Commits are Turkish imperative sentences, one logical task each**; stage only your own files.

---

## 10. Dependencies

- **npm everywhere** (`package-lock.json` at the root and in `app/`), Node 22, `npm ci` in CI.
- **SDK-aligned versions via `npx expo install <pkg>`** inside `app/` (Expo SDK 58, React Native 0.88, React 19). Never `npm install` a package that has
  native code at a version of your choosing. Keep `npx expo install --check` clean.
- **A new native module is a store build, not an OTA update.** `expo-updates` (runtimeVersion policy `appVersion`) ships JS/asset changes only.
  Decide before adding a native dependency.
- **No new paid third-party service without a cost estimate and Erdem's approval**, including free tiers that turn paid at scale. Existing:
  Supabase Pro, RevenueCat, Sentry (EU), Expo (free plan), Cloudflare Turnstile, Hostinger.
- **Supply chain.** Root `overrides` pin `uuid`, `glob`, `minimatch` (`tests/bagimlilik-guvenlik.spec.mjs` guards `uuid`); Dependabot opens weekly PRs; `guvenlik.yml`
  runs Semgrep, gitleaks and `npm audit`. In Edge Functions import with an exact version (`npm:nodemailer@10.3.1`, `npm:@sentry/deno@10.75.2`).
- **Do not add a dependency for ten lines.** Tooling goes in root `devDependencies`, runtime code in `app/package.json`.

---

## 11. Definition of done

- [ ] The change is scoped: no unrequested design, colour, copy, name or deleted section (check deletions against the merge base).
- [ ] Tests written with the change; the relevant spec files run one at a time under Node 22 with command and exit status recorded.
- [ ] Database change: `npm run db:yeni -- name` -> SQL -> `npm run db:derle`; re-runnable; RLS and policies in the same migration; `qa-db` allowlists updated; negative
      test per role; old client works against it (or it is a follow-up migration).
- [ ] New RPC used by the client has an `rpcOr` fallback and a test; fake backend updated if the client-visible behaviour changed.
- [ ] i18n: English entries added, no `t()` at module load, no concatenated sentences.
- [ ] Logging: fixed context strings, no PII, no secrets; Edge Functions use `logger` and `sentryServe`.
- [ ] `npm run typecheck --prefix app` passes; web export with real public env run when section 7.6 applies.
- [ ] Docs updated when behaviour or operations changed (`docs/`).
- [ ] One commit per task, one push, PR to `main` opened ready (not draft) with what/why, evidence, the list of what was **not** run, rollback commits and the
      validation plan. Nobody pushes to `main`; merge only on Erdem's explicit go.
- [ ] Migrations and function deploys are listed in the PR as the ordered steps for the person applying them (plan, approval, apply); nothing is applied
      from a laptop and `supabase link` is never used.
- [ ] No "TODO later" in code: finish it, or record the blocker as a todo.

---

## 12. Known debt (update when fixed)

- `safeEqual` is copy-pasted into six Edge Functions (`billing`, `push`, `lead-mail`, `mail-send`, `report`, `tufe-sync`); it is pure and belongs in `_shared/`.
- `backend.js` (~1000 lines) and `app-ui/sheets.tsx` (~1100 lines) are too large; split by feature only when you are already changing the area.
- Generic-error rule (6.7) is not applied everywhere: `invite-mail`, `site-invite`, `welcome` and `lead-mail` still return `error.message` or the mailer's
  error text to the caller. See the security guidelines, section 14.
- `docs/test.md` mentions `tests/i18n.spec.mjs`; the English sweeps are in `app-admin.spec.mjs` and `paketler.spec.mjs`.
