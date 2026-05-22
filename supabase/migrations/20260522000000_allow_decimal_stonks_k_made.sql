-- Allow Stonks monthly gains to be recorded to tenths of a thousand, e.g. 1.1k.
do $$
begin
  if to_regclass('public.stonks_monthly_entries') is not null then
    alter table public.stonks_monthly_entries
      alter column k_made type numeric(8, 1) using round(k_made::numeric, 1),
      alter column k_made set default 0;
  end if;

  if to_regclass('public.stonks_entries') is not null then
    alter table public.stonks_entries
      alter column k_made type numeric(8, 1) using round(k_made::numeric, 1),
      alter column k_made set default 0;
  end if;
end
$$;

notify pgrst, 'reload schema';
