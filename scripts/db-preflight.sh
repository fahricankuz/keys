#!/usr/bin/env bash
# Migration öncesi güvenlik denetimi (yalnızca okur, veritabanına yazmaz).
# Kullanım: DB_URL=postgresql://... scripts/db-preflight.sh <plan|adopt-existing-baseline|apply>
# GITHUB_OUTPUT tanımlıysa `baseline_kayitli=true|false` yazar.
#
# Önlediği iki hata:
#  - Şeması dolu ama migration geçmişi boş bir veritabanında `apply`: baseline yeniden çalışırdı.
#  - Boş (şemasız) bir veritabanında `adopt-existing-baseline`: şema yokken "uygulandı" diye işaretlerdi.
set -euo pipefail

MODE="${1:-}"
BASELINE="${BASELINE:-20261101000000}"
: "${DB_URL:?DB_URL tanımlı değil}"

case "$MODE" in plan|adopt-existing-baseline|apply) ;; *) echo "Kullanım: $0 <plan|adopt-existing-baseline|apply>" >&2; exit 2 ;; esac

err()  { if [ -n "${GITHUB_ACTIONS:-}" ]; then echo "::error::$1"; else echo "HATA: $1" >&2; fi; }
warn() { if [ -n "${GITHUB_ACTIONS:-}" ]; then echo "::warning::$1"; else echo "UYARI: $1" >&2; fi; }

q() { psql "$DB_URL" -X -v ON_ERROR_STOP=1 -At -c "$1"; }

sema=$(q "select to_regclass('public.profiles') is not null and to_regclass('public.properties') is not null")
gecmis=$(q "select to_regclass('supabase_migrations.schema_migrations') is not null")
kayitli=f
if [ "$gecmis" = t ]; then
  kayitli=$(q "select exists (select 1 from supabase_migrations.schema_migrations where version = '$BASELINE')")
fi

echo "Şema var: $sema · Migration geçmişi tablosu: $gecmis · Baseline ($BASELINE) kayıtlı: $kayitli"
if [ -n "${GITHUB_OUTPUT:-}" ]; then
  if [ "$kayitli" = t ]; then echo "baseline_kayitli=true"; else echo "baseline_kayitli=false"; fi >> "$GITHUB_OUTPUT"
fi

case "$MODE" in
  adopt-existing-baseline)
    if [ "$sema" != t ]; then
      err "Bu veritabanında uygulamanın tabloları yok (public.profiles / public.properties). adopt-existing-baseline yalnızca eski schema.sql kurulmuş veritabanı içindir. Boş veritabanında 'apply' kullan."
      exit 1
    fi
    if [ "$kayitli" = t ]; then echo "Baseline zaten kayıtlı; yapılacak iş yok."; fi
    ;;
  plan|apply)
    if [ "$sema" = t ] && [ "$kayitli" != t ]; then
      msg="Veritabanında şema var ama baseline ($BASELINE) migration geçmişinde kayıtlı değil. Önce bu environment için bir kez 'adopt-existing-baseline' çalıştır; yoksa baseline yeniden uygulanmaya çalışılır."
      if [ "$MODE" = apply ]; then err "$msg"; exit 1; else warn "$msg"; fi
    fi
    ;;
esac
exit 0
