-- Ensure stonks production schema exists even if an earlier applied migration
-- was missing part of the final table/policy shape.
create table if not exists public.stonks_monthly_entries (
  id uuid primary key default gen_random_uuid(),
  anon_id text not null,
  entry_year integer not null,
  month_index integer not null,
  k_made integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'stonks_monthly_entries_month_index_check'
  ) then
    alter table public.stonks_monthly_entries
      add constraint stonks_monthly_entries_month_index_check
      check (month_index >= 0 and month_index <= 11)
      not valid;
  end if;

  alter table public.stonks_monthly_entries
    validate constraint stonks_monthly_entries_month_index_check;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'stonks_monthly_entries_k_made_check'
  ) then
    alter table public.stonks_monthly_entries
      add constraint stonks_monthly_entries_k_made_check
      check (k_made >= 0)
      not valid;
  end if;

  alter table public.stonks_monthly_entries
    validate constraint stonks_monthly_entries_k_made_check;
end
$$;

create unique index if not exists stonks_monthly_entries_anon_year_month_key
  on public.stonks_monthly_entries (anon_id, entry_year, month_index);

create index if not exists idx_stonks_monthly_entries_anon_year
  on public.stonks_monthly_entries (anon_id, entry_year, month_index);

alter table public.stonks_monthly_entries enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'stonks_monthly_entries'
      and policyname = 'Allow read stonks monthly entries'
  ) then
    create policy "Allow read stonks monthly entries"
      on public.stonks_monthly_entries
      for select
      using (true);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'stonks_monthly_entries'
      and policyname = 'Allow insert stonks monthly entries'
  ) then
    create policy "Allow insert stonks monthly entries"
      on public.stonks_monthly_entries
      for insert
      with check (true);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'stonks_monthly_entries'
      and policyname = 'Allow update stonks monthly entries'
  ) then
    create policy "Allow update stonks monthly entries"
      on public.stonks_monthly_entries
      for update
      using (true)
      with check (true);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'stonks_monthly_entries'
      and policyname = 'Allow delete stonks monthly entries'
  ) then
    create policy "Allow delete stonks monthly entries"
      on public.stonks_monthly_entries
      for delete
      using (true);
  end if;
end
$$;

drop trigger if exists update_stonks_monthly_entries_updated_at
  on public.stonks_monthly_entries;

create trigger update_stonks_monthly_entries_updated_at
  before update on public.stonks_monthly_entries
  for each row
  execute function update_updated_at_column();
