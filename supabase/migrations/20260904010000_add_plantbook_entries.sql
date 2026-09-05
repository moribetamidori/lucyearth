-- Plantbook formulas: combine a plant with an element to create a result.
CREATE TABLE IF NOT EXISTS plantbook_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  anon_id TEXT,
  plant_title TEXT NOT NULL,
  plant_image_url TEXT,
  plant_image_path TEXT,
  element_title TEXT NOT NULL,
  element_image_url TEXT,
  element_image_path TEXT,
  result_title TEXT NOT NULL,
  result_image_url TEXT,
  result_image_path TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW()),
  CONSTRAINT plantbook_plant_title_not_blank CHECK (btrim(plant_title) <> ''),
  CONSTRAINT plantbook_element_title_not_blank CHECK (btrim(element_title) <> ''),
  CONSTRAINT plantbook_result_title_not_blank CHECK (btrim(result_title) <> '')
);

CREATE INDEX IF NOT EXISTS idx_plantbook_entries_created_at
  ON plantbook_entries(created_at DESC);

ALTER TABLE plantbook_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations on plantbook_entries"
  ON plantbook_entries
  FOR ALL
  USING (true)
  WITH CHECK (true);

DROP TRIGGER IF EXISTS update_plantbook_entries_updated_at ON plantbook_entries;
CREATE TRIGGER update_plantbook_entries_updated_at
  BEFORE UPDATE ON plantbook_entries
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

NOTIFY pgrst, 'reload schema';
