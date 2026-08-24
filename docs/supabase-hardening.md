# Supabase ITSM hardening and migration recovery

## Scope and safety

This change is code-only. It does not apply DDL, repair migration history, move
data, or change the production Supabase project. Production was inspected using
read-only catalog and migration-history queries; no user conversation or ticket
content was read.

The current ITSM data lives in the shared project `tlnfkxufoczqxvhwahhc`.
Production metadata showed 81 public tables, of which 11 are required by this
application. This makes the server-side `service_role` credential a larger blast
radius than the application needs.

## Recovered migration evidence

Production records these ITSM migrations:

| Version | Name | Evidence |
| --- | --- | --- |
| `20260526154234` | `persist_chat_context` | Present in Git and production. |
| `20260612120000` | `zammad_omnichannel_memory` | Present in Git and production. |
| `20260612150917` | `bot_itsm_schema_and_memory` | Recovered from production. The SQL, excluding the filesystem newline, is MD5 `d67468fc8a5362425879f0911bbf83ee`. |
| `20260810175405` | `telephony_call_ingestion` | Legacy Git version; absent from the inspected production history. |
| `20260810180030` | `telephony_call_ingestion` | Production version. Its original SQL was byte-for-byte identical to the legacy Git file: 5,571 bytes and MD5 `0dad664af03fca3ae7d609cf784554c7`. |

Production also contains the complete physical result of
`20260804000000_multitenancy` (tenant registry, non-null tenant columns,
compound key and tenant indexes), but that version is absent from migration
history. Its compound-primary-key transition is therefore guarded so replay is
a no-op instead of dropping and rebuilding the already-correct key.

Both telephony IDs are intentionally retained. The legacy SQL is now
idempotent, and the production ID is a compatibility marker that asserts the
tables already exist. This gives three safe paths:

- A clean installation applies the legacy migration and then the marker.
- A legacy installation that already recorded `20260810175405` applies only
  the marker.
- Production, which already recorded `20260810180030`, can apply the idempotent
  legacy ID with `--include-all` without creating the tables again.

The two migrations that predated the recovered baseline now conditionally
create the table shapes they originally assumed had been created manually.
Those statements are no-ops on existing databases and make a fresh replay
deterministic.

`supabase/schema.sql` is explicitly marked as a legacy snapshot. The ordered
migration directory is the only deployment and recreation source of truth.

The local CLI configuration disables seeding and has an empty `sql_paths`
array because this repository has no committed seed dataset. A missing seed
file must never be silently introduced into `db reset` or Preview Branch
creation; enabling seeding requires committing and reviewing the referenced
files in the same change.

The only edits to already-recorded migration files are replay guards:

- `20260526154234` conditionally creates the pre-existing `chat_sessions`
  shape before its original `ALTER TABLE` statements.
- `20260612120000` conditionally creates the pre-existing `tickets` shape
  before its original `ALTER TABLE` statements.
- `20260810175405` changes only `CREATE TABLE` and `CREATE INDEX` statements to
  `IF NOT EXISTS` so the production history can safely record that legacy ID.

These guards do not represent new production DDL and the first two historical
migrations must not be manually re-executed. On the inspected production
history, only `20260810175405` is expected to run once through the reviewed
`db push --include-all` sequence; it is a no-op against the existing telephony
objects apart from reasserting the original RLS, grants, and RPC definitions.

## Security and integrity contract

The hardening migration:

- Adds the missing indexes for `knowledge_articles.tenant_id`,
  `ticket_events.tenant_id`, and `ticket_events.ticket_id`.
- Adds validated tenant-scoped foreign keys for chat messages and ticket events.
  A production read-only audit found zero existing cross-tenant relationships.
- Re-enables RLS and revokes all access from `PUBLIC`, `anon`, and
  `authenticated` on every ITSM table.
- Reduces `service_role` table permissions to `SELECT`, `INSERT`, `UPDATE`, and
  `DELETE`; it removes inherited `TRUNCATE`, `TRIGGER`, and `REFERENCES` grants.
- Keeps the telephony claim functions as `SECURITY INVOKER`, with an empty
  `search_path`, and executable only by `service_role`.

The SQL contract in `supabase/tests/itsm_security_contract.sql` fails on missing
tables, open browser grants, broad server grants, unsafe RPC definitions,
missing indexes, unvalidated tenant foreign keys, or cross-tenant rows.

## Verification before any production change

Run locally with Docker and PostgreSQL client tools installed:

```bash
bash scripts/verify-supabase-hardening.sh
```

The script runs a clean `supabase db reset` and then the read-only security
contract. Without Docker it still verifies the recovered baseline hash,
required artifacts, compatibility marker, and replay-safe telephony DDL.

Before production, validate on a disposable Supabase branch or dedicated
staging project:

```bash
supabase link --project-ref <staging-project-ref>
supabase db push --dry-run --include-all
supabase db push --include-all
psql "$STAGING_DATABASE_URL" --file supabase/tests/itsm_security_contract.sql
```

After a backup and an approved maintenance window, the same dry-run and SQL
contract can be used against production. Never run `db reset --linked` on
production. Only one operator should perform the migration push.

### Production order and rollback gate

1. Confirm the current project reference and capture a fresh managed backup or
   point-in-time recovery checkpoint. Verify the backup job is complete before
   the migration window starts.
2. Export the ITSM schema and grants as an additional logical safety artifact;
   do not export unrelated shared-project data into this repository.
3. Run the migration-history contract against production and record the result.
4. Run `supabase db push --dry-run --include-all`. For the inspected production
   history, the expected pending versions are the replay-safe multitenancy ID
   `20260804000000`, the idempotent legacy telephony ID `20260810175405`, and
   the new hardening migration `20260824173719`.
5. Apply only after the dry-run matches that expectation. Do not seed, reset,
   repair history, or run unrelated migrations in the same window.
6. Immediately run `itsm_security_contract.sql`, then the authenticated bot,
   ticket, knowledge, Zammad, and telephony smoke tests coordinated by the
   application release owner.
7. If SQL or application verification fails, stop writes and run the reviewed
   emergency file in
   `supabase/rollback/20260824173719_harden_itsm_foreign_key_indexes.sql`.
   It removes the two new tenant constraints and restores the prior broad
   `service_role` table grants; additive indexes are intentionally retained.
8. After rollback, repeat the application smoke tests and create a forward
   migration documenting the recovery. Do not edit production migration history
   during incident response.

## Isolation plan for the shared project

Do not move production data as part of this hardening branch. Use a staged
cutover instead:

1. Create a dedicated Supabase project in the same supported region and replay
   these migrations from zero.
2. Run the security contract and application test suite against the empty
   project, then load synthetic fixtures.
3. Export only the 11 ITSM tables. Exclude unrelated public-schema datasets,
   credentials, migration history, and secrets.
4. Import into the dedicated project in dependency order and verify counts,
   foreign keys, tenant distribution, and application read/write smoke tests.
5. Freeze ITSM writes briefly or use a verified delta-copy procedure, reconcile
   again, rotate to a new dedicated server key, and update only server-side
   environment variables.
6. Verify chat, tickets, knowledge, memory, telephony idempotency, and Zammad
   integration before reopening writes.
7. Keep the old ITSM tables read-only for a defined rollback window. Revoke the
   old application key only after rollback acceptance and backup verification.

The target project should expose only the required API schemas, retain RLS as
defense in depth, use a server-only key, and have independent backups, ownership,
alerts, and migration history.
