-- Tenant isolation for the ITSM bot. Run once in the existing Supabase project
-- before assigning the Forum hostname in Vercel.
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

alter table public.chat_sessions add column if not exists tenant_id text references public.tenants(id);
alter table public.chat_messages add column if not exists tenant_id text references public.tenants(id);
alter table public.tickets add column if not exists tenant_id text references public.tenants(id);
alter table public.ticket_events add column if not exists tenant_id text references public.tenants(id);
alter table public.knowledge_articles add column if not exists tenant_id text references public.tenants(id);
alter table public.sla_rules add column if not exists tenant_id text references public.tenants(id);
alter table public.bot_user_memory add column if not exists tenant_id text references public.tenants(id);

-- Existing bot data belongs to the current Geimser tenant.
update public.chat_sessions set tenant_id = 'geimser' where tenant_id is null;
update public.chat_messages set tenant_id = 'geimser' where tenant_id is null;
update public.tickets set tenant_id = 'geimser' where tenant_id is null;
update public.ticket_events set tenant_id = 'geimser' where tenant_id is null;
update public.knowledge_articles set tenant_id = 'geimser' where tenant_id is null;
update public.sla_rules set tenant_id = 'geimser' where tenant_id is null;
update public.bot_user_memory set tenant_id = 'geimser' where tenant_id is null;

alter table public.chat_sessions alter column tenant_id set not null;
alter table public.chat_messages alter column tenant_id set not null;
alter table public.tickets alter column tenant_id set not null;
alter table public.ticket_events alter column tenant_id set not null;
alter table public.knowledge_articles alter column tenant_id set not null;
alter table public.sla_rules alter column tenant_id set not null;
alter table public.bot_user_memory alter column tenant_id set not null;

-- IDs/emails can now repeat only across different tenants.
alter table public.bot_user_memory drop constraint if exists bot_user_memory_pkey;
alter table public.bot_user_memory add primary key (tenant_id, email);
alter table public.sla_rules drop constraint if exists sla_rules_priority_key;
create unique index if not exists tickets_tenant_external_id_idx on public.tickets (tenant_id, external_id) where external_id is not null;
create unique index if not exists bot_user_memory_tenant_email_idx on public.bot_user_memory (tenant_id, email);
create unique index if not exists sla_rules_tenant_priority_idx on public.sla_rules (tenant_id, priority);

create index if not exists chat_sessions_tenant_created_idx on public.chat_sessions (tenant_id, created_at desc);
create index if not exists chat_messages_tenant_session_idx on public.chat_messages (tenant_id, session_id);
create index if not exists tickets_tenant_created_idx on public.tickets (tenant_id, created_at desc);

-- The application uses service_role on server-only routes. Browser roles remain
-- denied by RLS; never grant anon/authenticated broad table access here.
alter table public.tenants enable row level security;
grant select, insert, update, delete on public.tenants to service_role;
