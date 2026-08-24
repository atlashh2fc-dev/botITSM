#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

required_files=(
  supabase/config.toml
  supabase/migrations/20260612150917_bot_itsm_schema_and_memory.sql
  supabase/migrations/20260810175405_telephony_call_ingestion.sql
  supabase/migrations/20260810180030_telephony_call_ingestion.sql
  supabase/migrations/20260824173719_harden_itsm_foreign_key_indexes.sql
  supabase/rollback/20260824173719_harden_itsm_foreign_key_indexes.sql
  supabase/tests/itsm_security_contract.sql
  supabase/tests/itsm_migration_history_contract.sql
)

for path in "${required_files[@]}"; do
  if [[ ! -f "$path" ]]; then
    printf 'Missing required Supabase artifact: %s\n' "$path" >&2
    exit 1
  fi
done

baseline_md5="$(perl -0pe 's/\n\z//' \
  supabase/migrations/20260612150917_bot_itsm_schema_and_memory.sql | md5 -q)"
if [[ "$baseline_md5" != "d67468fc8a5362425879f0911bbf83ee" ]]; then
  printf 'Recovered production baseline hash mismatch: %s\n' "$baseline_md5" >&2
  exit 1
fi

legacy_telephony="supabase/migrations/20260810175405_telephony_call_ingestion.sql"
if ! grep -q 'create table if not exists public.telephony_calls' "$legacy_telephony" \
  || ! grep -q 'create table if not exists public.telephony_events' "$legacy_telephony"; then
  printf 'Legacy telephony migration is not safe to replay\n' >&2
  exit 1
fi

if ! grep -q '0dad664af03fca3ae7d609cf784554c7' \
  supabase/migrations/20260810180030_telephony_call_ingestion.sql; then
  printf 'Production telephony reconciliation evidence is missing\n' >&2
  exit 1
fi

printf 'Static Supabase migration and drift checks: PASS\n'

if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  if ! command -v supabase >/dev/null 2>&1; then
    printf 'Supabase CLI is required for local recreation\n' >&2
    exit 1
  fi
  if ! command -v psql >/dev/null 2>&1; then
    printf 'psql is required for SQL contract verification\n' >&2
    exit 1
  fi

  supabase db reset --local --no-seed
  psql 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' \
    --file supabase/tests/itsm_security_contract.sql
else
  printf 'Docker unavailable: local db reset and SQL contract checks skipped\n'
fi
