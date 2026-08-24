-- Hardening is additive and safe to replay. Browser roles remain fail-closed;
-- only server-side service_role DML and the two ingestion RPCs are allowed.
set lock_timeout = '5s';
set statement_timeout = '2min';

-- Cover the foreign keys reported by the Supabase performance advisor.
create index if not exists knowledge_articles_tenant_id_idx
  on public.knowledge_articles (tenant_id);
create index if not exists ticket_events_tenant_ticket_idx
  on public.ticket_events (tenant_id, ticket_id);
create index if not exists ticket_events_ticket_id_idx
  on public.ticket_events (ticket_id);

-- Tenant identity is part of each relationship, preventing an application bug
-- from attaching a message or event to an object owned by another tenant.
create unique index if not exists chat_sessions_tenant_id_id_uidx
  on public.chat_sessions (tenant_id, id);
create unique index if not exists tickets_tenant_id_id_uidx
  on public.tickets (tenant_id, id);

do $migration$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'chat_messages_tenant_session_fkey'
      and conrelid = 'public.chat_messages'::regclass
  ) then
    alter table public.chat_messages
      add constraint chat_messages_tenant_session_fkey
      foreign key (tenant_id, session_id)
      references public.chat_sessions (tenant_id, id)
      not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'ticket_events_tenant_ticket_fkey'
      and conrelid = 'public.ticket_events'::regclass
  ) then
    alter table public.ticket_events
      add constraint ticket_events_tenant_ticket_fkey
      foreign key (tenant_id, ticket_id)
      references public.tickets (tenant_id, id)
      not valid;
  end if;
end
$migration$;

alter table public.chat_messages
  validate constraint chat_messages_tenant_session_fkey;
alter table public.ticket_events
  validate constraint ticket_events_tenant_ticket_fkey;

do $migration$
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
      execute format('alter table public.%I enable row level security', table_name);
      execute format(
        'revoke all on table public.%I from public, anon, authenticated, service_role',
        table_name
      );
      execute format(
        'grant select, insert, update, delete on table public.%I to service_role',
        table_name
      );
    end if;
  end loop;
end
$migration$;

revoke all on function public.claim_telephony_event(
  text, text, text, text, timestamptz, jsonb, integer
) from public, anon, authenticated, service_role;
revoke all on function public.claim_telephony_ticket(
  text, text, integer
) from public, anon, authenticated, service_role;
grant execute on function public.claim_telephony_event(
  text, text, text, text, timestamptz, jsonb, integer
) to service_role;
grant execute on function public.claim_telephony_ticket(
  text, text, integer
) to service_role;
