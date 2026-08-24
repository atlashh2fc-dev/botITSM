-- Durable, tenant-scoped ingestion state for Asterisk call events.
-- Browser roles stay denied: events are accepted only by the signed server API
-- and written with the service-role client.
create table if not exists public.telephony_calls (
  tenant_id text not null references public.itsm_tenants(id),
  call_id text not null,
  direction text not null check (direction in ('in', 'out')),
  from_number text not null,
  to_number text not null,
  queue text,
  agent_extension text,
  status text not null default 'ringing'
    check (status in ('ringing', 'answered', 'completed', 'missed', 'failed')),
  cause text,
  duration_seconds integer check (duration_seconds is null or duration_seconds >= 0),
  zammad_ticket_id bigint,
  zammad_ticket_number text,
  local_ticket_id text,
  ticket_processing_started_at timestamptz,
  ticket_processing_error text,
  started_at timestamptz not null default now(),
  answered_at timestamptz,
  ended_at timestamptz,
  last_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, call_id)
);

create table if not exists public.telephony_events (
  tenant_id text not null references public.itsm_tenants(id),
  event_id text not null,
  call_id text not null,
  event_type text not null check (event_type in ('newCall', 'answer', 'hangup')),
  occurred_at timestamptz not null,
  payload jsonb not null,
  processing_started_at timestamptz not null default now(),
  processed_at timestamptz,
  processing_error text,
  cti_processed_at timestamptz,
  cti_error text,
  created_at timestamptz not null default now(),
  primary key (tenant_id, event_id),
  foreign key (tenant_id, call_id)
    references public.telephony_calls(tenant_id, call_id)
    on delete cascade
);

create index if not exists telephony_calls_tenant_started_idx
  on public.telephony_calls (tenant_id, started_at desc);
create index if not exists telephony_calls_tenant_status_idx
  on public.telephony_calls (tenant_id, status, started_at desc);
create index if not exists telephony_events_call_idx
  on public.telephony_events (tenant_id, call_id, occurred_at);

alter table public.telephony_calls enable row level security;
alter table public.telephony_events enable row level security;

revoke all on public.telephony_calls from public, anon, authenticated;
revoke all on public.telephony_events from public, anon, authenticated;
grant select, insert, update, delete on public.telephony_calls to service_role;
grant select, insert, update, delete on public.telephony_events to service_role;

-- Atomically inserts or leases an event. A busy lease is never acknowledged as
-- processed, so another bridge delivery cannot be lost behind an active worker.
create or replace function public.claim_telephony_event(
  p_tenant_id text,
  p_event_id text,
  p_call_id text,
  p_event_type text,
  p_occurred_at timestamptz,
  p_payload jsonb,
  p_lease_seconds integer default 120
)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
begin
  insert into public.telephony_events (
    tenant_id, event_id, call_id, event_type, occurred_at, payload
  ) values (
    p_tenant_id, p_event_id, p_call_id, p_event_type, p_occurred_at, p_payload
  )
  on conflict (tenant_id, event_id) do nothing;

  if found then
    return 'claimed';
  end if;

  if exists (
    select 1
    from public.telephony_events
    where tenant_id = p_tenant_id
      and event_id = p_event_id
      and processed_at is not null
  ) then
    return 'processed';
  end if;

  update public.telephony_events
  set processing_started_at = pg_catalog.now(),
      processing_error = null,
      payload = p_payload,
      occurred_at = p_occurred_at
  where tenant_id = p_tenant_id
    and event_id = p_event_id
    and processed_at is null
    and (
      processing_error is not null
      or processing_started_at < pg_catalog.now()
        - pg_catalog.make_interval(secs => greatest(p_lease_seconds, 30))
    );

  if found then
    return 'claimed';
  end if;
  return 'busy';
end;
$$;

-- Serializes the external Zammad ticket side effect per tenant/call.
create or replace function public.claim_telephony_ticket(
  p_tenant_id text,
  p_call_id text,
  p_lease_seconds integer default 120
)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.telephony_calls
    where tenant_id = p_tenant_id
      and call_id = p_call_id
      and zammad_ticket_id is not null
  ) then
    return 'ready';
  end if;

  update public.telephony_calls
  set ticket_processing_started_at = pg_catalog.now(),
      ticket_processing_error = null,
      updated_at = pg_catalog.now()
  where tenant_id = p_tenant_id
    and call_id = p_call_id
    and zammad_ticket_id is null
    and (
      ticket_processing_started_at is null
      or ticket_processing_error is not null
      or ticket_processing_started_at < pg_catalog.now()
        - pg_catalog.make_interval(secs => greatest(p_lease_seconds, 30))
    );

  if found then
    return 'claimed';
  end if;
  return 'busy';
end;
$$;

revoke all on function public.claim_telephony_event(text, text, text, text, timestamptz, jsonb, integer)
  from public, anon, authenticated;
revoke all on function public.claim_telephony_ticket(text, text, integer)
  from public, anon, authenticated;
grant execute on function public.claim_telephony_event(text, text, text, text, timestamptz, jsonb, integer)
  to service_role;
grant execute on function public.claim_telephony_ticket(text, text, integer)
  to service_role;
