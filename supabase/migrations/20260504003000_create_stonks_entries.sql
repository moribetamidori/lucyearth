-- Dedicated Stonks storage. This uses a fresh table name so it is not tied to
-- any partially-applied earlier stonks_monthly_entries attempts.
create table if not exists public.stonks_entries (
  id uuid primary key default gen_random_uuid(),
  anon_id text not null,
  entry_year integer not null,
  month_index integer not null,
  k_made integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint stonks_entries_month_index_range
    check (month_index >= 0 and month_index <= 11),
  constraint stonks_entries_k_made_nonnegative
    check (k_made >= 0),
  constraint stonks_entries_anon_year_month_unique
    unique (anon_id, entry_year, month_index)
);

create index if not exists idx_stonks_entries_anon_year
  on public.stonks_entries (anon_id, entry_year, month_index);

alter table public.stonks_entries enable row level security;

drop policy if exists "Allow all operations on stonks_entries"
  on public.stonks_entries;

create policy "Allow all operations on stonks_entries"
  on public.stonks_entries
  for all
  using (true)
  with check (true);

create or replace function public.update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists update_stonks_entries_updated_at
  on public.stonks_entries;

create trigger update_stonks_entries_updated_at
  before update on public.stonks_entries
  for each row
  execute function public.update_updated_at_column();

notify pgrst, 'reload schema';
