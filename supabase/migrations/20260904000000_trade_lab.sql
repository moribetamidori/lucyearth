-- Autonomous Quant Lab. All financial data is server-only; no anonymous policies.
create table public.trade_runtime (
  account_key text primary key,
  broker text not null check (broker in ('simulated','webull_paper')),
  paused boolean not null default true,
  lock_token uuid,
  lock_until timestamptz,
  last_snapshot jsonb,
  updated_at timestamptz not null default now()
);

create table public.trade_strategies (
  id uuid primary key default gen_random_uuid(),
  account_key text not null references public.trade_runtime(account_key),
  version integer not null check (version > 0),
  parent_strategy_id uuid references public.trade_strategies(id),
  status text not null check (status in ('current','candidate','historical_backtest_passed','oos_passed','walk_forward_passed','paper_testing','rejected','archived')),
  strategy_definition jsonb not null,
  created_at timestamptz not null default now(),
  created_by text not null,
  change_summary text not null,
  unique (account_key, version)
);
create unique index trade_one_current on public.trade_strategies(account_key) where status = 'current';

create table public.trade_agent_decisions (
  id uuid primary key default gen_random_uuid(),
  account_key text not null references public.trade_runtime(account_key),
  strategy_id uuid not null references public.trade_strategies(id),
  strategy_version integer not null,
  timestamp timestamptz not null default now(),
  symbol text not null,
  action text not null check (action in ('BUY','SELL','HOLD','NO_TRADE')),
  entry_price numeric, stop_loss numeric, take_profit numeric, position_size numeric,
  confidence numeric not null check (confidence between 0 and 1),
  reasoning_summary text not null,
  market_context jsonb not null,
  raw_agent_output jsonb not null,
  proposal jsonb not null,
  risk_result jsonb not null,
  model text not null,
  prompt_version text not null,
  source text not null check (source in ('llm','deterministic_simulator'))
);
create index trade_decision_history on public.trade_agent_decisions(account_key, timestamp desc);

create table public.trade_orders (
  id uuid primary key default gen_random_uuid(),
  account_key text not null references public.trade_runtime(account_key),
  decision_id uuid not null references public.trade_agent_decisions(id),
  broker_order_id text,
  client_order_id text not null check (length(client_order_id) <= 32),
  symbol text not null,
  side text not null check (side in ('BUY','SELL')),
  quantity numeric check (quantity > 0),
  notional numeric check (notional >= 5),
  order_type text not null check (order_type in ('MARKET','LIMIT')),
  limit_price numeric,
  status text not null check (status in ('pending_approval','submitting','submitted','partial','filled','cancelled','rejected','expired','unknown')),
  request jsonb not null,
  preview jsonb not null,
  approval_hash text not null,
  approval_expires_at timestamptz not null,
  approved_by uuid,
  approved_at timestamptz,
  submitted_at timestamptz,
  filled_at timestamptz,
  fill_price numeric,
  filled_quantity numeric not null default 0 check (filled_quantity >= 0),
  filled_notional numeric not null default 0 check (filled_notional >= 0),
  fees numeric not null default 0 check (fees >= 0),
  fees_final boolean not null default false,
  created_at timestamptz not null default now(),
  check ((quantity is null) <> (notional is null)),
  unique(account_key, client_order_id)
);
create index trade_order_history on public.trade_orders(account_key, created_at desc);
create unique index trade_one_pending_decision on public.trade_orders(decision_id)
  where status in ('pending_approval','submitting','submitted','partial','unknown','filled');

create table public.trade_order_approvals (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.trade_orders(id),
  approved_by uuid not null,
  approval_hash text not null,
  approved_at timestamptz not null default now()
);

create table public.trade_fills (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.trade_orders(id),
  cumulative_quantity numeric not null,
  quantity numeric not null check (quantity > 0),
  price numeric not null check (price > 0),
  fees numeric not null default 0,
  timestamp timestamptz not null,
  unique (order_id, cumulative_quantity)
);

create table public.trade_trades (
  id uuid primary key default gen_random_uuid(),
  account_key text not null references public.trade_runtime(account_key),
  strategy_id uuid not null references public.trade_strategies(id),
  strategy_version integer not null,
  symbol text not null,
  entry_order_id uuid not null references public.trade_orders(id),
  exit_order_id uuid references public.trade_orders(id),
  entry_time timestamptz not null,
  entry_price numeric not null,
  exit_time timestamptz,
  exit_price numeric,
  quantity numeric not null check (quantity > 0),
  entry_fees numeric not null default 0,
  realized_pnl numeric,
  return_pct numeric,
  max_adverse_excursion numeric,
  max_favorable_excursion numeric
);
create index trade_open_lots on public.trade_trades(account_key, symbol, entry_time) where exit_time is null;

create table public.trade_strategy_reviews (
  id uuid primary key default gen_random_uuid(),
  strategy_id uuid not null references public.trade_strategies(id),
  strategy_version integer not null,
  review_period_start timestamptz not null, review_period_end timestamptz not null,
  critic_summary text not null, identified_failures jsonb not null,
  identified_strengths jsonb not null, suggested_changes jsonb not null,
  created_at timestamptz not null default now(),
  check (review_period_end > review_period_start)
);
create table public.trade_strategy_experiments (
  id uuid primary key default gen_random_uuid(),
  parent_strategy uuid not null references public.trade_strategies(id),
  candidate_strategy uuid not null references public.trade_strategies(id),
  hypothesis text not null, evaluation_status text not null default 'pending',
  backtest_metrics jsonb, oos_metrics jsonb, walk_forward_metrics jsonb,
  adversarial_metrics jsonb, dataset_manifest jsonb, rejection_reason text,
  created_at timestamptz not null default now()
);
create table public.trade_system_events (
  id bigint generated always as identity primary key,
  account_key text not null references public.trade_runtime(account_key),
  created_at timestamptz not null default now(),
  kind text not null, message text not null, details jsonb not null default '{}'
);
create index trade_events_history on public.trade_system_events(account_key, created_at desc);
create table public.trade_job_runs (
  id uuid primary key default gen_random_uuid(),
  account_key text not null references public.trade_runtime(account_key),
  kind text not null, status text not null check (status in ('running','completed','failed')),
  started_at timestamptz not null default now(), completed_at timestamptz,
  actor_id uuid not null, result jsonb, error_code text
);
create table public.trade_account_snapshots (
  id uuid primary key default gen_random_uuid(),
  account_key text not null references public.trade_runtime(account_key),
  timestamp timestamptz not null default now(), account jsonb not null, positions jsonb not null
);
create table public.trade_simulated_orders (
  account_key text not null references public.trade_runtime(account_key),
  client_order_id text not null,
  payload jsonb not null,
  primary key(account_key, client_order_id)
);
create table public.trade_rate_limits (
  bucket text primary key, window_start timestamptz not null, count integer not null
);

create function public.trade_immutable_record() returns trigger language plpgsql set search_path = public as $$
begin raise exception 'Trade research records are append-only'; end;
$$;
create trigger trade_decisions_immutable before update or delete on public.trade_agent_decisions
  for each row execute function public.trade_immutable_record();
create trigger trade_fills_immutable before update or delete on public.trade_fills
  for each row execute function public.trade_immutable_record();
create trigger trade_approvals_immutable before update or delete on public.trade_order_approvals
  for each row execute function public.trade_immutable_record();
create trigger trade_events_immutable before update or delete on public.trade_system_events
  for each row execute function public.trade_immutable_record();
create trigger trade_account_snapshots_immutable before update or delete on public.trade_account_snapshots
  for each row execute function public.trade_immutable_record();

create function public.trade_protect_strategy() returns trigger language plpgsql set search_path = public as $$
begin
  if new.strategy_definition is distinct from old.strategy_definition or new.version <> old.version
    or new.account_key <> old.account_key or new.parent_strategy_id is distinct from old.parent_strategy_id then
    raise exception 'Create a new strategy version instead of changing history';
  end if;
  return new;
end;
$$;
create trigger trade_strategy_definition_immutable before update on public.trade_strategies
  for each row execute function public.trade_protect_strategy();

create function public.trade_acquire_lock(p_key text, p_token uuid) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  update trade_runtime set lock_token = p_token, lock_until = clock_timestamp() + interval '180 seconds'
  where account_key = p_key and (lock_until is null or lock_until < clock_timestamp());
  return found;
end;
$$;
create function public.trade_release_lock(p_key text, p_token uuid) returns void
language sql security definer set search_path = public as $$
  update trade_runtime set lock_token = null, lock_until = null where account_key = p_key and lock_token = p_token;
$$;
create function public.trade_assert_lock(p_key text, p_token uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform 1 from trade_runtime where account_key = p_key and lock_token = p_token and lock_until > clock_timestamp() for update;
  if not found then raise exception 'Account lock expired; refresh and retry'; end if;
end;
$$;

create function public.trade_begin_order(p_key text, p_token uuid, p_order uuid, p_hash text, p_actor uuid)
returns public.trade_orders language plpgsql security definer set search_path = public as $$
declare o trade_orders;
begin
  perform trade_assert_lock(p_key,p_token);
  select * into o from trade_orders where id=p_order and account_key=p_key for update;
  if not found then raise exception 'Order not found'; end if;
  if o.status <> 'pending_approval' then raise exception 'Order has already been processed'; end if;
  if o.approval_hash <> p_hash or o.approval_expires_at <= clock_timestamp() then raise exception 'Order approval has expired or changed'; end if;
  if o.side = 'BUY' and (select paused from trade_runtime where account_key=p_key) then raise exception 'New exposure is paused'; end if;
  if exists(select 1 from trade_orders where account_key=p_key and status in ('submitting','unknown')) then raise exception 'Reconcile uncertain orders first'; end if;
  if not exists(select 1 from trade_agent_decisions d join trade_strategies s on s.id=d.strategy_id where d.id=o.decision_id and s.status='current') then raise exception 'Strategy is no longer current'; end if;
  insert into trade_order_approvals(order_id,approved_by,approval_hash) values(o.id,p_actor,p_hash);
  update trade_orders set status='submitting', approved_by=p_actor, approved_at=clock_timestamp(), submitted_at=clock_timestamp() where id=o.id returning * into o;
  insert into trade_system_events(account_key,kind,message,details) values(p_key,'order_approved','Exact paper order approved by operator',jsonb_build_object('orderId',o.id,'actorId',p_actor));
  return o;
end;
$$;

-- Cumulative-fill reconciliation is atomic and idempotent. FIFO lots preserve entry strategy attribution.
create function public.trade_reconcile_order(p_key text, p_token uuid, p_order uuid, p_result jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare o trade_orders; d trade_agent_decisions; lot trade_trades;
  cumulative numeric; delta numeric; cumulative_value numeric; delta_value numeric;
  delta_fee numeric; execution_price numeric; remaining numeric; matched numeric; allocated_entry_fee numeric;
  t timestamptz; new_status text;
begin
  perform trade_assert_lock(p_key,p_token);
  select * into o from trade_orders where id=p_order and account_key=p_key for update;
  if not found then raise exception 'Order not found'; end if;
  if p_result->>'clientOrderId' is distinct from o.client_order_id or p_result->>'symbol' is distinct from o.symbol or p_result->>'side' is distinct from o.side or p_result->>'orderType' is distinct from o.order_type then raise exception 'Broker order identity mismatch'; end if;
  if (p_result->>'limitPrice')::numeric is distinct from o.limit_price then raise exception 'Broker limit price mismatch'; end if;
  new_status := p_result->>'status';
  if new_status not in ('submitted','partial','filled','cancelled','rejected','expired','unknown') then raise exception 'Invalid broker status'; end if;
  cumulative := (p_result->>'filledQuantity')::numeric;
  if cumulative is null or cumulative < o.filled_quantity then raise exception 'Broker cumulative fill regressed'; end if;
  if cumulative > 0 and ((p_result->>'averageFillPrice')::numeric is null or (p_result->>'averageFillPrice')::numeric <= 0) then raise exception 'Missing fill price'; end if;
  cumulative_value := coalesce((p_result->>'filledNotional')::numeric, cumulative * (p_result->>'averageFillPrice')::numeric, 0);
  if o.quantity is not null and cumulative > o.quantity then raise exception 'Broker filled more than approved quantity'; end if;
  if o.notional is not null and cumulative_value > o.notional + 0.01 then raise exception 'Broker filled more than approved cash notional'; end if;
  delta := cumulative - o.filled_quantity;
  delta_value := cumulative_value - o.filled_notional;
  delta_fee := coalesce((p_result->>'fees')::numeric,0) - o.fees;
  if delta_value < 0 or (delta > 0 and delta_fee < 0) or (p_result->>'fees')::numeric < 0 then raise exception 'Broker fill value regressed'; end if;
  if delta = 0 and delta_value <> 0 then raise exception 'Broker corrected prior fill price; manual reconciliation required'; end if;
  -- Fee-only settlement updates never invent executions or mutate immutable fill records.
  if delta = 0 and delta_fee <> 0 then
    if cumulative <= 0 then raise exception 'Fee adjustment without fills requires manual reconciliation'; end if;
    if o.side = 'BUY' then
      update trade_trades set entry_fees=entry_fees+delta_fee*quantity/cumulative,
        realized_pnl=case when exit_time is not null then realized_pnl-delta_fee*quantity/cumulative else null end,
        return_pct=case when exit_time is not null then (realized_pnl-delta_fee*quantity/cumulative)/(entry_price*quantity)*100 else null end
      where entry_order_id=o.id;
    else
      update trade_trades set realized_pnl=realized_pnl-delta_fee*quantity/cumulative,
        return_pct=(realized_pnl-delta_fee*quantity/cumulative)/(entry_price*quantity)*100
      where exit_order_id=o.id;
    end if;
    insert into trade_system_events(account_key,kind,message,details)
      values(p_key,'fee_settlement','Broker fee settlement updated attributed lots',jsonb_build_object('orderId',o.id,'previousFees',o.fees,'fees',p_result->'fees'));
  end if;
  if o.status in ('filled','cancelled','rejected','expired') and new_status in ('submitted','partial','unknown') then raise exception 'Broker order status regressed'; end if;
  if delta > 0 then
    t := (p_result->>'filledAt')::timestamptz;
    if t is null then raise exception 'Missing execution timestamp'; end if;
    execution_price := delta_value / delta;
    insert into trade_fills(order_id,cumulative_quantity,quantity,price,fees,timestamp) values(o.id,cumulative,delta,execution_price,delta_fee,t);
    select * into d from trade_agent_decisions where id=o.decision_id;
    if o.side = 'BUY' then
      insert into trade_trades(account_key,strategy_id,strategy_version,symbol,entry_order_id,entry_time,entry_price,quantity,entry_fees)
      values(p_key,d.strategy_id,d.strategy_version,o.symbol,o.id,t,execution_price,delta,delta_fee);
    else
      remaining := delta;
      for lot in select * from trade_trades where account_key=p_key and symbol=o.symbol and exit_time is null order by entry_time,id for update loop
        exit when remaining <= 0;
        matched := least(remaining,lot.quantity);
        allocated_entry_fee := lot.entry_fees * matched / lot.quantity;
        if matched < lot.quantity then
          insert into trade_trades(account_key,strategy_id,strategy_version,symbol,entry_order_id,entry_time,entry_price,quantity,entry_fees)
          values(p_key,lot.strategy_id,lot.strategy_version,lot.symbol,lot.entry_order_id,lot.entry_time,lot.entry_price,lot.quantity-matched,lot.entry_fees-allocated_entry_fee);
        end if;
        update trade_trades set quantity=matched,entry_fees=allocated_entry_fee,exit_order_id=o.id,exit_time=t,exit_price=execution_price,
          realized_pnl=(execution_price-lot.entry_price)*matched-allocated_entry_fee-delta_fee*matched/delta,
          return_pct=((execution_price-lot.entry_price)*matched-allocated_entry_fee-delta_fee*matched/delta)/(lot.entry_price*matched)*100
        where id=lot.id;
        remaining := remaining-matched;
      end loop;
      if remaining > 0.000000001 then raise exception 'Sell fill cannot be attributed to recorded entry lots'; end if;
    end if;
  end if;
  update trade_orders set broker_order_id=p_result->>'id',status=new_status,
    filled_quantity=cumulative,filled_notional=cumulative_value,fill_price=(p_result->>'averageFillPrice')::numeric,
    filled_at=(p_result->>'filledAt')::timestamptz,fees=coalesce((p_result->>'fees')::numeric,0),fees_final=coalesce((p_result->>'feesFinal')::boolean,false)
  where id=o.id;
end;
$$;

create function public.trade_summary(p_key text) returns jsonb
language sql security definer set search_path=public as $$
  select jsonb_build_object(
    'realizedPnl', (select coalesce(sum(realized_pnl),0) from trade_trades where account_key=p_key and exit_time is not null),
    'closedLots', (select count(*) from trade_trades where account_key=p_key and exit_time is not null),
    'provisionalFees', exists(select 1 from trade_orders where account_key=p_key and filled_quantity>0 and not fees_final)
  );
$$;

create function public.trade_rate_limit(p_bucket text, p_limit integer, p_seconds integer) returns boolean
language plpgsql security definer set search_path=public as $$
declare n integer;
begin
  insert into trade_rate_limits(bucket,window_start,count) values(p_bucket,clock_timestamp(),1)
  on conflict(bucket) do update set
    count=case when trade_rate_limits.window_start < clock_timestamp()-make_interval(secs=>p_seconds) then 1 else trade_rate_limits.count+1 end,
    window_start=case when trade_rate_limits.window_start < clock_timestamp()-make_interval(secs=>p_seconds) then clock_timestamp() else trade_rate_limits.window_start end
  returning count into n;
  return n <= p_limit;
end;
$$;

-- Apply permissions to this feature only; do not change existing site tables.
do $$ declare r record; begin
  for r in select tablename from pg_tables where schemaname='public' and tablename like 'trade\_%' escape '\' loop
    execute format('alter table public.%I enable row level security',r.tablename);
    execute format('revoke all on table public.%I from anon, authenticated',r.tablename);
    execute format('grant all on table public.%I to service_role',r.tablename);
  end loop;
  for r in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'trade\_%' escape '\' loop
    execute format('revoke all on function %s from public, anon, authenticated',r.signature);
    execute format('grant execute on function %s to service_role',r.signature);
  end loop;
end $$;
grant usage,select on sequence public.trade_system_events_id_seq to service_role;
notify pgrst,'reload schema';
