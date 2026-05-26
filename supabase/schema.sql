create table if not exists demo_users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null unique,
  area text,
  created_at timestamptz not null default now()
);

create table if not exists chat_sessions (
  id text primary key,
  channel text not null default 'web-demo',
  status text not null default 'open',
  context jsonb not null default '{}',
  active_article_id text,
  detected_intent text,
  priority text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz
);

create table if not exists chat_messages (
  id text primary key,
  session_id text not null references chat_sessions(id),
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create table if not exists tickets (
  id text primary key,
  type text not null,
  priority text not null check (priority in ('P1', 'P2', 'P3', 'P4')),
  category text not null,
  description text not null,
  status text not null default 'created',
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists ticket_events (
  id uuid primary key default gen_random_uuid(),
  ticket_id text not null references tickets(id),
  event_type text not null,
  payload jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists knowledge_articles (
  id text primary key,
  title text not null,
  category text not null,
  intent text not null,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists sla_rules (
  id uuid primary key default gen_random_uuid(),
  priority text not null unique,
  response_minutes int not null,
  resolution_minutes int not null,
  created_at timestamptz not null default now()
);

insert into sla_rules (priority, response_minutes, resolution_minutes)
values
  ('P1', 30, 240),
  ('P2', 120, 480),
  ('P3', 480, 1440),
  ('P4', 1440, 4320)
on conflict (priority) do nothing;

alter table demo_users enable row level security;
alter table chat_sessions enable row level security;
alter table chat_messages enable row level security;
alter table tickets enable row level security;
alter table ticket_events enable row level security;
alter table knowledge_articles enable row level security;
alter table sla_rules enable row level security;

grant usage on schema public to service_role;
grant select, insert, update, delete on
  demo_users,
  chat_sessions,
  chat_messages,
  tickets,
  ticket_events,
  knowledge_articles,
  sla_rules
to service_role;
