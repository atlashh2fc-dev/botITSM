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
