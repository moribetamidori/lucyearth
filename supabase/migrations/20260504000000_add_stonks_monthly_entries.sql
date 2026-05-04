-- Store monthly stonks progress in whole-k increments.
create table if not exists public.stonks_monthly_entries (
  id uuid primary key default gen_random_uuid(),
  anon_id text not null,
  entry_year integer not null,
  month_index integer not null check (month_index >= 0 and month_index <= 11),
  k_made integer not null default 0 check (k_made >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (anon_id, entry_year, month_index)
);

create index if not exists idx_stonks_monthly_entries_anon_year
  on public.stonks_monthly_entries (anon_id, entry_year, month_index);

alter table public.stonks_monthly_entries enable row level security;

create policy "Allow read stonks monthly entries"
  on public.stonks_monthly_entries
  for select
  using (true);

create policy "Allow insert stonks monthly entries"
  on public.stonks_monthly_entries
  for insert
  with check (true);

create policy "Allow update stonks monthly entries"
  on public.stonks_monthly_entries
  for update
  using (true)
  with check (true);

create policy "Allow delete stonks monthly entries"
  on public.stonks_monthly_entries
  for delete
  using (true);

create trigger update_stonks_monthly_entries_updated_at
  before update on public.stonks_monthly_entries
  for each row
  execute function update_updated_at_column();
