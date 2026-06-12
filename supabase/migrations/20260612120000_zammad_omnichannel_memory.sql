-- Omnicanal Zammad + capas de memoria (aplicada en supabase-crimson-village el 2026-06-12)

alter table public.chat_sessions add column if not exists user_email text;

alter table public.tickets
  add column if not exists external_id text,
  add column if not exists external_url text,
  add column if not exists provider text;

create table if not exists public.bot_user_memory (
  email text primary key,
  name text,
  area text,
  zammad_user_id integer,
  preferred_tone text,
  profile jsonb not null default '{}',
  episodic_summary text,
  interaction_count integer not null default 0,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_chat_sessions_user_email on public.chat_sessions (user_email);
create index if not exists idx_tickets_external on public.tickets (external_id);

alter table public.bot_user_memory enable row level security;
grant select, insert, update, delete on public.bot_user_memory to service_role;
