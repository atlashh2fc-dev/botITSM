-- Phase 1: additive tenant expansion for the ITSM bot.
--
-- This migration is intentionally backward compatible: it adds nullable tenant
-- columns, backfills legacy records as Geimser, and does not replace existing
-- primary keys or unique constraints. Deploy the application code that filters
-- by tenant_id first. Do the NOT NULL/compound-key phase only after auditing the
-- live schema and confirming there are no legacy writers.
create table if not exists public.tenants (
  id text primary key,
  name text not null,
  primary_host text not null unique,
  created_at timestamptz not null default now()
);

insert into public.tenants (id, name, primary_host)
values
  ('geimser', 'Geimser', 'iabot.geimser.cl'),
  ('forum', 'Forum', 'iabot.atlasitsm.geimser.cl')
on conflict (id) do update set name = excluded.name, primary_host = excluded.primary_host;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'chat_sessions', 'chat_messages', 'tickets', 'ticket_events',
    'knowledge_articles', 'sla_rules', 'bot_user_memory', 'demo_users',
    'user_assets'
  ]
  loop
    if to_regclass('public.' || table_name) is not null then
      execute format(
        'alter table public.%I add column if not exists tenant_id text default ''geimser'' references public.tenants(id)',
        table_name
      );
      -- All pre-tenant records belong to the existing Geimser service.
      execute format('update public.%I set tenant_id = ''geimser'' where tenant_id is null', table_name);
      execute format('create index if not exists %I on public.%I (tenant_id)', table_name || '_tenant_idx', table_name);

      -- The browser must not be able to query tenant data directly. All access
      -- goes through the server using the Supabase service-role key, while the
      -- application applies the tenant filter on every query.
      execute format('alter table public.%I enable row level security', table_name);
      execute format('revoke all on public.%I from anon, authenticated', table_name);
      execute format('grant select, insert, update, delete on public.%I to service_role', table_name);
    end if;
  end loop;
end $$;

-- Query-path indexes used by the application after the tenant rollout.
create index if not exists chat_sessions_tenant_created_idx on public.chat_sessions (tenant_id, created_at desc);
create index if not exists chat_messages_tenant_session_idx on public.chat_messages (tenant_id, session_id);
create index if not exists tickets_tenant_created_idx on public.tickets (tenant_id, created_at desc);

-- The application uses service_role on server-only routes. Browser roles remain
-- denied by RLS; never grant anon/authenticated broad table access here.
alter table public.tenants enable row level security;
grant select, insert, update, delete on public.tenants to service_role;
