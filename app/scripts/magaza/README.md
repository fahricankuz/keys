# Store scripts (App Store Connect and Google Play)

Plain Node ESM, zero new dependencies (Node 22, global `fetch`, `node:crypto`). Replaces the ad-hoc Python helpers that were
used to set up the stores. Comments and output are Turkish like the rest of `app/scripts/`.

**Rules for agents:** every script that can write is a **dry run by default**. Always run the dry run first and show the output
to Erdem. `--apply` needs his explicit approval in the current message (it changes Apple/Google production state).
Never print or commit key files, key IDs, issuer IDs or tokens; config comes only from env vars or flags.

## Scripts

| Script | npm script (run in `app/`) | Writes? | What it does |
|---|---|---|---|
| `asc-durum.mjs` | `magaza:durum` | never | Builds and TestFlight states, App Store version state, TestFlight groups, subscriptions by state and how many territories have a price. `--fiyatsiz` skips the per-subscription price count, `--json` prints JSON. |
| `asc-abonelik-fiyatlari.mjs` | `magaza:asc-fiyat` | `--apply` | For each of the 36 subscriptions: picks the TRY (TUR) price point from the price table, then writes Apple's equalized price to every other territory. Skips territories already priced (idempotent). `--urun tek_3_aylik,bes_1_yillik` filters. About 1.1 s per write (Apple limit 3600 requests/hour), so a full run takes hours; re-run after an interruption. |
| `play-abonelikler.mjs` | `magaza:play-abonelik` | `--apply` | Creates/updates subscriptions `tek` and `bes` with 18 base plans each (`N-aylik` = P1M, `N-yillik` = P1Y, N = 1-9), regional prices from `pricing:convertRegionPrices`, TR price pinned to the table, then activates the plans. Existing base plans are skipped. `--abonelik tek` filters. |
| `play-yukle.mjs <file.aab>` | `magaza:play-yukle` | `--apply` | Uploads an `.aab` to a track (default `internal`, status `draft`), with optional `--kanal`, `--durum`, `--ad`, `--not-tr`, `--not-en`. The `production` track also needs `--uretim-onayi`. |

The price table is the single source in `app/src/domain/store-ids.js` + `config.js` (same as `magaza-fiyatlari.mjs`). If prices
change there, the scripts follow; only missing prices/plans are written, existing ones are never changed.

Run from the repo root, for example:

```bash
export ASC_KEY_ID=... ASC_ISSUER_ID=... ASC_KEY_PATH=/path/to/AuthKey_XXXX.p8
npm run magaza:durum --prefix app
npm run magaza:asc-fiyat --prefix app -- --urun tek_3_aylik        # dry run
npm run magaza:asc-fiyat --prefix app -- --urun tek_3_aylik --apply # only after approval
```

## Environment

| Variable | Used by | Meaning |
|---|---|---|
| `ASC_KEY_ID` | asc-* | App Store Connect API key ID |
| `ASC_ISSUER_ID` | asc-* | Issuer ID (App Store Connect → Users and Access → Integrations) |
| `ASC_KEY_PATH` | asc-* | Path to the `.p8` private key file (read in memory only) |
| `ASC_APP_ID` | asc-* | Optional, default `6834434284` |
| `PLAY_SA_PATH` | play-* | Path to the service-account JSON (read in memory only) |
| `PLAY_PACKAGE` | play-* | Optional, default `io.anahtar.app` |

The key files live only on Erdem's Mac (HANDOVER.md section 6: local secrets); key and issuer IDs are not stored in the repo. Ask Erdem for the values or run on his machine.

## Permissions needed

- **Apple API key:** role **App Manager** or **Admin** (Users and Access → Integrations → App Store Connect API). Read-only status works with a key that can see the app and its subscriptions; writing prices needs App Manager or Admin. A 401 means key ID / issuer / `.p8` do not match; a 403 means the role is too low.
- **Play service account:** invited in Play Console → Users and permissions with app access to `io.anahtar.app` and the permissions *View app information*, *Manage store presence* (subscriptions/prices) and *Release to testing tracks* / *Manage testing track releases* (uploads). The Google Cloud project must have the *Google Play Android Developer API* enabled.

## Known traps

- **Play 403 `PERMISSION_DENIED` right after granting the service account access is propagation delay, up to 24-36 hours.** The script appends this hint to 403 errors. Retry later (a cheap read: `play-abonelikler.mjs` dry run) instead of changing permissions again.
- Apple prices cannot be freely typed: a price point must exist for the TRY value (the script reports `NOKTA YOK` if Apple has no point for a table price). Equalized prices exist for most but not all territories; the dry run lists territories without an equivalent.
- Play subscription base plans cannot be deleted/renamed once created; the script never touches existing ones. Check the dry run's plan list before `--apply`.
- A Play upload creates a **draft** release; rollout stays a manual step in Play Console (see `docs/release-and-ota.md` sections 5 and 6).
- The first `.aab` of a new app must be uploaded by hand in Play Console; the API only works afterwards.
