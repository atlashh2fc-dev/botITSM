-- The original production change assumed public.chat_sessions had already been
-- created manually. Keep that deployment history intact while making a clean
-- migration replay deterministic.
create table if not exists public.chat_sessions (
  id text primary key,
  channel text not null default 'web-demo',
  status text not null default 'open',
  created_at timestamptz not null default now(),
  closed_at timestamptz
);

alter table public.chat_sessions
  add column if not exists context jsonb not null default '{}',
  add column if not exists active_article_id text,
  add column if not exists detected_intent text,
  add column if not exists priority text,
  add column if not exists updated_at timestamptz not null default now();

update public.chat_sessions
set context = coalesce(context, '{}'),
    updated_at = coalesce(updated_at, now());

grant select, insert, update, delete on public.chat_sessions to service_role;
