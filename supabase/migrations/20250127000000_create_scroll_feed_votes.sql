-- Create table for Scroll Mode likes (independent from journal votes)
create table if not exists public.scroll_feed_votes (
  id uuid primary key default gen_random_uuid(),
  item_id text not null,
  anon_id text not null,
  created_at timestamptz not null default now(),
  unique (item_id, anon_id)
);

-- Enable RLS
alter table public.scroll_feed_votes enable row level security;

-- Allow reads for everyone
create policy "Allow read scroll votes"
  on public.scroll_feed_votes
  for select
  using (true);

-- Allow inserts for everyone (anon ids are already pseudo-random)
create policy "Allow insert scroll votes"
  on public.scroll_feed_votes
  for insert
  with check (true);
