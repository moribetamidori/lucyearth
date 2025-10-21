-- Create table for anonymous user tracking
create table if not exists public.anon_users (
  id uuid primary key default gen_random_uuid(),
  anon_id text unique not null,
  cat_clicks integer default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Enable Row Level Security
alter table public.anon_users enable row level security;

-- Create policy to allow all operations (since these are anonymous users)
create policy "Allow all operations on anon_users"
  on public.anon_users
  for all
  using (true)
  with check (true);

-- Create index on anon_id for faster lookups
create index if not exists idx_anon_users_anon_id on public.anon_users(anon_id);

-- Create a function to update the updated_at timestamp
create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Create trigger to automatically update updated_at
create trigger update_anon_users_updated_at
  before update on public.anon_users
  for each row
  execute function update_updated_at_column();
