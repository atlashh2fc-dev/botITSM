\set ON_ERROR_STOP on

begin transaction read only;

do $test$
begin
  if not exists (
    select 1
    from supabase_migrations.schema_migrations
    where version = '20260612150917'
      and name = 'bot_itsm_schema_and_memory'
      and md5(statements[1]) = 'd67468fc8a5362425879f0911bbf83ee'
  ) then
    raise exception 'Missing or changed production ITSM baseline migration 20260612150917';
  end if;

  if not exists (
    select 1
    from supabase_migrations.schema_migrations
    where version = '20260810180030'
      and name = 'telephony_call_ingestion'
      and md5(statements[1]) = '0dad664af03fca3ae7d609cf784554c7'
  ) then
    raise exception 'Missing or changed production telephony migration 20260810180030';
  end if;
end
$test$;

rollback;

\echo 'ITSM Supabase production migration history: PASS'
