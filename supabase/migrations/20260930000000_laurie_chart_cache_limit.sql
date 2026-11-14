-- Bound the shared cache so exploring many minute series does not consume the database quota.
create index if not exists laurie_chart_candles_received
  on public.laurie_chart_candles (received_at, timestamp);

create or replace function public.laurie_prune_chart_cache() returns integer
language plpgsql security definer set search_path = public as $$
declare removed integer;
begin
  with excess as (
    select greatest(count(*) - 200000, 0)::integer as n from public.laurie_chart_candles
  ), oldest as (
    select ctid from public.laurie_chart_candles order by received_at, timestamp limit (select n from excess)
  )
  delete from public.laurie_chart_candles where ctid in (select ctid from oldest);
  get diagnostics removed = row_count;
  return removed;
end;
$$;

revoke all on function public.laurie_prune_chart_cache() from public, anon, authenticated;
grant execute on function public.laurie_prune_chart_cache() to service_role;
