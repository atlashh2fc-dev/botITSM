\set ON_ERROR_STOP on

begin transaction read only;

do $test$
declare
  table_name text;
  missing_tables text[] := '{}';
  unsafe_tables text[] := '{}';
  overprivileged_tables text[] := '{}';
begin
  foreach table_name in array array[
    'itsm_tenants', 'demo_users', 'chat_sessions', 'chat_messages',
    'tickets', 'ticket_events', 'knowledge_articles', 'sla_rules',
    'bot_user_memory', 'telephony_calls', 'telephony_events'
  ]
  loop
    if to_regclass('public.' || table_name) is null then
      missing_tables := array_append(missing_tables, table_name);
      continue;
    end if;

    if not exists (
      select 1
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname = table_name
        and c.relrowsecurity
    ) or has_table_privilege('anon', 'public.' || table_name, 'SELECT')
      or has_table_privilege('anon', 'public.' || table_name, 'INSERT')
      or has_table_privilege('anon', 'public.' || table_name, 'UPDATE')
      or has_table_privilege('anon', 'public.' || table_name, 'DELETE')
      or has_table_privilege('authenticated', 'public.' || table_name, 'SELECT')
      or has_table_privilege('authenticated', 'public.' || table_name, 'INSERT')
      or has_table_privilege('authenticated', 'public.' || table_name, 'UPDATE')
      or has_table_privilege('authenticated', 'public.' || table_name, 'DELETE') then
      unsafe_tables := array_append(unsafe_tables, table_name);
    end if;

    if not has_table_privilege('service_role', 'public.' || table_name, 'SELECT')
      or not has_table_privilege('service_role', 'public.' || table_name, 'INSERT')
      or not has_table_privilege('service_role', 'public.' || table_name, 'UPDATE')
      or not has_table_privilege('service_role', 'public.' || table_name, 'DELETE')
      or has_table_privilege('service_role', 'public.' || table_name, 'TRUNCATE')
      or has_table_privilege('service_role', 'public.' || table_name, 'TRIGGER')
      or has_table_privilege('service_role', 'public.' || table_name, 'REFERENCES') then
      overprivileged_tables := array_append(overprivileged_tables, table_name);
    end if;
  end loop;

  if cardinality(missing_tables) > 0 then
    raise exception 'Missing required ITSM tables: %', missing_tables;
  end if;
  if cardinality(unsafe_tables) > 0 then
    raise exception 'RLS/browser grant contract failed for: %', unsafe_tables;
  end if;
  if cardinality(overprivileged_tables) > 0 then
    raise exception 'service_role least-privilege contract failed for: %', overprivileged_tables;
  end if;
end
$test$;

do $test$
declare
  function_oid oid;
begin
  foreach function_oid in array array[
    'public.claim_telephony_event(text,text,text,text,timestamptz,jsonb,integer)'::regprocedure::oid,
    'public.claim_telephony_ticket(text,text,integer)'::regprocedure::oid
  ]
  loop
    if exists (
      select 1 from pg_proc
      where oid = function_oid
        and (prosecdef or not coalesce(proconfig, '{}') @> array['search_path=""'])
    ) then
      raise exception 'Unsafe telephony function definition: %', function_oid::regprocedure;
    end if;
    if has_function_privilege('anon', function_oid, 'EXECUTE')
      or has_function_privilege('authenticated', function_oid, 'EXECUTE')
      or not has_function_privilege('service_role', function_oid, 'EXECUTE') then
      raise exception 'Unsafe telephony function ACL: %', function_oid::regprocedure;
    end if;
  end loop;
end
$test$;

do $test$
begin
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and tablename = 'knowledge_articles'
      and indexname = 'knowledge_articles_tenant_id_idx'
  ) or not exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and tablename = 'ticket_events'
      and indexname = 'ticket_events_tenant_ticket_idx'
  ) or not exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and tablename = 'ticket_events'
      and indexname = 'ticket_events_ticket_id_idx'
  ) then
    raise exception 'Required ITSM foreign-key indexes are missing';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.chat_messages'::regclass
      and conname = 'chat_messages_tenant_session_fkey'
      and convalidated
  ) or not exists (
    select 1 from pg_constraint
    where conrelid = 'public.ticket_events'::regclass
      and conname = 'ticket_events_tenant_ticket_fkey'
      and convalidated
  ) then
    raise exception 'Tenant-scoped relationship constraints are missing or unvalidated';
  end if;

  if exists (
    select 1
    from public.chat_messages m
    join public.chat_sessions s on s.id = m.session_id
    where m.tenant_id is distinct from s.tenant_id
  ) or exists (
    select 1
    from public.ticket_events e
    join public.tickets t on t.id = e.ticket_id
    where e.tenant_id is distinct from t.tenant_id
  ) then
    raise exception 'Cross-tenant relationships detected';
  end if;
end
$test$;

rollback;

\echo 'ITSM Supabase security contract: PASS'
