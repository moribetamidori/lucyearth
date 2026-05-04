-- Follow-up for already-applied Stonks migrations.
-- Give PostgREST a named unique table constraint for upserts and force schema reload.
do $$
begin
  if to_regclass('public.stonks_monthly_entries') is null then
    create table public.stonks_monthly_entries (
      id uuid primary key default gen_random_uuid(),
      anon_id text not null,
      entry_year integer not null,
      month_index integer not null,
      k_made integer not null default 0,
      active boolean not null default true,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.stonks_monthly_entries'::regclass
      and conname = 'stonks_monthly_entries_month_index_range'
  ) then
    alter table public.stonks_monthly_entries
      add constraint stonks_monthly_entries_month_index_range
      check (month_index >= 0 and month_index <= 11);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.stonks_monthly_entries'::regclass
      and conname = 'stonks_monthly_entries_k_made_nonnegative'
  ) then
    alter table public.stonks_monthly_entries
      add constraint stonks_monthly_entries_k_made_nonnegative
      check (k_made >= 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.stonks_monthly_entries'::regclass
      and conname = 'stonks_monthly_entries_anon_year_month_unique'
  ) then
    alter table public.stonks_monthly_entries
      add constraint stonks_monthly_entries_anon_year_month_unique
      unique (anon_id, entry_year, month_index);
  end if;
end
$$;

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

notify pgrst, 'reload schema';
