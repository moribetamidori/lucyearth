-- Create storage bucket for cat pictures
insert into storage.buckets (id, name, public)
values ('cat-pictures', 'cat-pictures', true)
on conflict (id) do nothing;

-- Create storage policy for cat pictures bucket
create policy "Allow public access to cat pictures"
on storage.objects for select
using (bucket_id = 'cat-pictures');

create policy "Allow authenticated uploads to cat pictures"
on storage.objects for insert
with check (bucket_id = 'cat-pictures');

create policy "Allow authenticated deletes from cat pictures"
on storage.objects for delete
using (bucket_id = 'cat-pictures');

-- Create table for cat pictures metadata
create table if not exists public.cat_pictures (
  id uuid primary key default gen_random_uuid(),
  image_url text not null,
  anon_id text,
  created_at timestamptz default now()
);

-- Enable Row Level Security
alter table public.cat_pictures enable row level security;

-- Create policy to allow all operations (since these are public cat pictures)
create policy "Allow all operations on cat_pictures"
  on public.cat_pictures
  for all
  using (true)
  with check (true);

-- Create index on created_at for sorting
create index if not exists idx_cat_pictures_created_at on public.cat_pictures(created_at desc);
