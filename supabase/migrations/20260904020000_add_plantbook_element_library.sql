-- Reusable element library for Plantbook formulas.
CREATE TABLE IF NOT EXISTS plantbook_elements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  anon_id TEXT,
  title TEXT NOT NULL,
  image_url TEXT,
  image_path TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW()),
  CONSTRAINT plantbook_element_title_not_blank CHECK (btrim(title) <> '')
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_plantbook_elements_normalized_title
  ON plantbook_elements (lower(btrim(title)));

ALTER TABLE plantbook_elements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations on plantbook_elements"
  ON plantbook_elements
  FOR ALL
  USING (true)
  WITH CHECK (true);

DROP TRIGGER IF EXISTS update_plantbook_elements_updated_at ON plantbook_elements;
CREATE TRIGGER update_plantbook_elements_updated_at
  BEFORE UPDATE ON plantbook_elements
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Promote every existing inline element into the shared library. If an element
-- title was used more than once, its earliest image becomes the canonical one.
INSERT INTO plantbook_elements (anon_id, title, image_url, image_path, created_at, updated_at)
SELECT DISTINCT ON (lower(btrim(element_title)))
  anon_id,
  btrim(element_title),
  element_image_url,
  element_image_path,
  created_at,
  updated_at
FROM plantbook_entries
ORDER BY lower(btrim(element_title)), created_at ASC
ON CONFLICT DO NOTHING;

ALTER TABLE plantbook_entries
  ADD COLUMN IF NOT EXISTS element_id UUID REFERENCES plantbook_elements(id) ON DELETE SET NULL;

ALTER TABLE plantbook_entries
  ADD COLUMN IF NOT EXISTS condition_text TEXT,
  ADD COLUMN IF NOT EXISTS notes TEXT;

UPDATE plantbook_entries AS entry
SET element_id = element.id
FROM plantbook_elements AS element
WHERE entry.element_id IS NULL
  AND lower(btrim(entry.element_title)) = lower(btrim(element.title));

CREATE INDEX IF NOT EXISTS idx_plantbook_entries_element_id
  ON plantbook_entries(element_id);

NOTIFY pgrst, 'reload schema';
