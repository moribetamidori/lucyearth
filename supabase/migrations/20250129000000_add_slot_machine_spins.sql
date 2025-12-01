-- Track slot machine plays + fortunes
create table if not exists public.slot_machine_spins (
  id uuid primary key default gen_random_uuid(),
  anon_id text,
  reel_one text not null,
  reel_two text not null,
  reel_three text not null,
  fortune_text text not null,
  fortune_model text,
  created_at timestamptz not null default now()
);

create index if not exists idx_slot_machine_spins_created_at
  on public.slot_machine_spins (created_at desc);

alter table public.slot_machine_spins enable row level security;

create policy "Allow read slot machine spins"
  on public.slot_machine_spins
  for select
  using (true);

create policy "Allow insert slot machine spins"
  on public.slot_machine_spins
  for insert
  with check (true);
