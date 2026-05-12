-- Sports progress tracker: dated weight achievements with equipment imagery
CREATE TABLE IF NOT EXISTS sport_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  anon_id TEXT,
  sport_name TEXT NOT NULL DEFAULT 'Strength',
  equipment_name TEXT NOT NULL,
  equipment_image_url TEXT,
  achieved_on DATE NOT NULL,
  weight_value NUMERIC(8, 2) NOT NULL CHECK (weight_value >= 0),
  weight_unit TEXT NOT NULL DEFAULT 'lb' CHECK (weight_unit IN ('lb', 'kg')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW())
);

CREATE INDEX IF NOT EXISTS idx_sport_entries_achieved_on
  ON sport_entries(achieved_on DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sport_entries_equipment
  ON sport_entries(equipment_name, achieved_on DESC);

ALTER TABLE sport_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations on sport_entries"
  ON sport_entries
  FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE TRIGGER update_sport_entries_updated_at
  BEFORE UPDATE ON sport_entries
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Public storage bucket for equipment photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('sport-equipment-images', 'sport-equipment-images', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Allow public access to sport equipment images"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'sport-equipment-images');

CREATE POLICY "Allow uploads to sport equipment images"
  ON storage.objects
  FOR INSERT
  WITH CHECK (bucket_id = 'sport-equipment-images');

CREATE POLICY "Allow deletes from sport equipment images"
  ON storage.objects
  FOR DELETE
  USING (bucket_id = 'sport-equipment-images');

NOTIFY pgrst, 'reload schema';
