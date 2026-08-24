-- Emergency rollback for 20260824173719_harden_itsm_foreign_key_indexes.sql.
-- Do not run proactively. Indexes are intentionally retained because they are
-- additive and do not change application semantics.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

alter table public.chat_messages
  drop constraint if exists chat_messages_tenant_session_fkey;
alter table public.ticket_events
  drop constraint if exists ticket_events_tenant_ticket_fkey;

do $rollback$
declare
  table_name text;
begin
  foreach table_name in array array[
    'itsm_tenants', 'demo_users', 'chat_sessions', 'chat_messages',
    'tickets', 'ticket_events', 'knowledge_articles', 'sla_rules',
    'bot_user_memory', 'user_assets', 'telephony_calls', 'telephony_events'
  ]
  loop
    if to_regclass('public.' || table_name) is not null then
      execute format(
        'grant truncate, references, trigger on table public.%I to service_role',
        table_name
      );
    end if;
  end loop;
end
$rollback$;

commit;
