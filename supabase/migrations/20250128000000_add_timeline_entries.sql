-- Timeline entries for personal timeline modal
CREATE TABLE IF NOT EXISTS timeline_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  details TEXT,
  event_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  image_url TEXT,
  image_filename TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Helpful index for timeline ordering
CREATE INDEX IF NOT EXISTS idx_timeline_entries_event_time ON timeline_entries (event_time DESC);

-- Keep updated_at fresh
CREATE OR REPLACE FUNCTION set_timeline_entries_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_timeline_entries_updated_at ON timeline_entries;
CREATE TRIGGER trg_timeline_entries_updated_at
BEFORE UPDATE ON timeline_entries
FOR EACH ROW
EXECUTE FUNCTION set_timeline_entries_updated_at();

-- Enable RLS
ALTER TABLE timeline_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable all operations for timeline_entries" ON timeline_entries
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Storage bucket for optional timeline images
INSERT INTO storage.buckets (id, name, public)
VALUES ('timeline-images', 'timeline-images', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Enable all operations for timeline-images" ON storage.objects
  FOR ALL
  USING (bucket_id = 'timeline-images')
  WITH CHECK (bucket_id = 'timeline-images');
