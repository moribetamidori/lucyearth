-- Women profiles + tag graph
CREATE TABLE IF NOT EXISTS women_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  image_url TEXT,
  intro TEXT,
  accomplishments TEXT,
  tags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Helpful indexes for filtering + sorting
CREATE INDEX IF NOT EXISTS idx_women_profiles_tags ON women_profiles USING GIN (tags);
CREATE INDEX IF NOT EXISTS idx_women_profiles_created_at ON women_profiles (created_at DESC);

-- Auto-update updated_at on change
CREATE OR REPLACE FUNCTION set_women_profiles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_women_profiles_updated_at ON women_profiles;
CREATE TRIGGER trg_women_profiles_updated_at
BEFORE UPDATE ON women_profiles
FOR EACH ROW
EXECUTE FUNCTION set_women_profiles_updated_at();

-- Row level security - open to anon for now
ALTER TABLE women_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable all operations for women_profiles" ON women_profiles
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Storage bucket for profile photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('women-profiles', 'women-profiles', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Enable all operations for women-profiles" ON storage.objects
  FOR ALL
  USING (bucket_id = 'women-profiles')
  WITH CHECK (bucket_id = 'women-profiles');
