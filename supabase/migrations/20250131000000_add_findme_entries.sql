-- Create table to store FindMe highlights
CREATE TABLE IF NOT EXISTS public.findme_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  anon_id TEXT NOT NULL REFERENCES public.anon_users(anon_id) ON DELETE CASCADE,
  place TEXT NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  rating SMALLINT NOT NULL DEFAULT 3,
  radius_m INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_findme_entries_anon_id ON public.findme_entries(anon_id);
CREATE INDEX IF NOT EXISTS idx_findme_entries_start_time ON public.findme_entries(start_time DESC);

-- Enable row level security
ALTER TABLE public.findme_entries ENABLE ROW LEVEL SECURITY;

-- Basic open policies (mirrors other anon features)
CREATE POLICY "Allow read access to findme entries" ON public.findme_entries
  FOR SELECT USING (true);

CREATE POLICY "Allow insert access to findme entries" ON public.findme_entries
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow delete access to findme entries" ON public.findme_entries
  FOR DELETE USING (true);
