-- Laurie is a separate, single-symbol paper experiment. Browser roles have no access.
create table public.laurie_runtime (
  singleton boolean primary key default true check (singleton),
  lock_id uuid,
  lock_until timestamptz
);
insert into public.laurie_runtime(singleton) values (true);

create table public.laurie_agent_runs (
  id uuid primary key,
  symbol text not null check (symbol in ('SPY', 'QQQ')),
  mode text not null check (mode in ('demo', 'webull_sandbox')),
  data_source text not null check (data_source in ('sample', 'webull_sandbox')),
  status text not null check (status in ('running', 'completed', 'failed')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  data_timestamp timestamptz,
  data_delay_seconds integer,
  model_name text not null,
  prompt_version text not null,
  input_summary jsonb,
  estimated_cost_usd numeric not null default 0,
  actual_cost_usd numeric,
  input_tokens integer,
  output_tokens integer,
  error text
);
create index laurie_runs_recent on public.laurie_agent_runs(started_at desc);

create table public.laurie_decisions (
  run_id uuid primary key references public.laurie_agent_runs(id),
  decision text not null check (decision in ('BUY', 'SELL', 'HOLD')),
  explanation text not null,
  risk_allowed boolean not null,
  risk_result jsonb not null,
  order_status text not null,
  created_at timestamptz not null default now()
);

create table public.laurie_order_outcomes (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null unique references public.laurie_agent_runs(id),
  account_id text not null,
  client_order_id text not null unique,
  broker_order_id text,
  side text not null check (side in ('BUY', 'SELL')),
  quantity numeric,
  notional numeric,
  status text not null check (status in ('submitting', 'submitted', 'partial', 'filled', 'cancelled', 'rejected', 'expired', 'unknown')),
  detail jsonb not null default '{}',
  submitted_at timestamptz not null default now(),
  reconciled_at timestamptz,
  error text
);
create index laurie_orders_status on public.laurie_order_outcomes(status);

create table public.laurie_candles (
  symbol text not null check (symbol in ('SPY', 'QQQ')),
  timestamp timestamptz not null,
  open numeric not null,
  high numeric not null,
  low numeric not null,
  close numeric not null,
  volume numeric not null,
  source text not null check (source = 'webull_sandbox'),
  received_at timestamptz not null default now(),
  primary key(symbol, timestamp, source)
);

create function public.laurie_acquire_run(p_id uuid) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  update laurie_runtime set lock_id = p_id, lock_until = clock_timestamp() + interval '180 seconds'
  where singleton and (lock_until is null or lock_until < clock_timestamp());
  return found;
end;
$$;

create function public.laurie_release_run(p_id uuid) returns void
language sql security definer set search_path = public as $$
  update laurie_runtime set lock_id = null, lock_until = null where singleton and lock_id = p_id;
$$;

do $$
declare row record;
begin
  for row in select tablename from pg_tables where schemaname = 'public' and tablename like 'laurie_%' loop
    execute format('alter table public.%I enable row level security', row.tablename);
    execute format('revoke all on table public.%I from anon, authenticated', row.tablename);
    execute format('grant all on table public.%I to service_role', row.tablename);
  end loop;
end;
$$;
revoke all on function public.laurie_acquire_run(uuid) from public, anon, authenticated;
revoke all on function public.laurie_release_run(uuid) from public, anon, authenticated;
grant execute on function public.laurie_acquire_run(uuid), public.laurie_release_run(uuid) to service_role;
