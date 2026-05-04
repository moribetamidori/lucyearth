-- Keep stonks_monthly_entries as the canonical Stonks table.
-- Drop the duplicate workaround table only when it has no data.
do $$
begin
  if to_regclass('public.stonks_entries') is not null
    and not exists (select 1 from public.stonks_entries limit 1)
  then
    drop table public.stonks_entries;
  end if;
end
$$;

notify pgrst, 'reload schema';
