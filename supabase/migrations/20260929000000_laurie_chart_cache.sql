-- Historical chart pages are reusable across browser sessions and server instances.
-- This cache contains market data only; it does not grant browser access to the service role.
create table if not exists public.laurie_chart_candles (
  symbol text not null,
  category text not null check (category in ('US_STOCK', 'US_ETF')),
  interval text not null check (interval in ('1m', '5m', '15m', '30m', '1h', '4h', '1D', '1W', '1M')),
  timestamp timestamptz not null,
  open numeric not null,
  high numeric not null,
  low numeric not null,
  close numeric not null,
  volume numeric not null,
  received_at timestamptz not null default now(),
  primary key (symbol, category, interval, timestamp)
);

create index if not exists laurie_chart_candles_page
  on public.laurie_chart_candles (symbol, category, interval, timestamp desc);

alter table public.laurie_chart_candles enable row level security;
revoke all on public.laurie_chart_candles from anon, authenticated;
grant all on public.laurie_chart_candles to service_role;
