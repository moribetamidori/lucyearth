-- Canonical sports equipment records so repeated logs reuse one image source.
CREATE TABLE IF NOT EXISTS sport_equipment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  anon_id TEXT,
  sport_name TEXT NOT NULL DEFAULT 'Strength',
  name TEXT NOT NULL,
  normalized_name TEXT GENERATED ALWAYS AS (lower(btrim(name))) STORED,
  image_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW()),
  CONSTRAINT sport_equipment_name_not_blank CHECK (btrim(name) <> ''),
  CONSTRAINT sport_equipment_normalized_name_unique UNIQUE (normalized_name)
);

ALTER TABLE sport_entries
  ADD COLUMN IF NOT EXISTS sport_equipment_id UUID REFERENCES sport_equipment(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sport_entries_equipment_id
  ON sport_entries(sport_equipment_id);

ALTER TABLE sport_equipment ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations on sport_equipment"
  ON sport_equipment
  FOR ALL
  USING (true)
  WITH CHECK (true);

DROP TRIGGER IF EXISTS update_sport_equipment_updated_at ON sport_equipment;
CREATE TRIGGER update_sport_equipment_updated_at
  BEFORE UPDATE ON sport_equipment
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

WITH ranked_equipment AS (
  SELECT
    equipment_name,
    sport_name,
    equipment_image_url,
    anon_id,
    ROW_NUMBER() OVER (
      PARTITION BY lower(btrim(equipment_name))
      ORDER BY
        (equipment_image_url IS NOT NULL) DESC,
        achieved_on ASC,
        created_at ASC
    ) AS rank
  FROM sport_entries
  WHERE btrim(equipment_name) <> ''
)
INSERT INTO sport_equipment (name, sport_name, image_url, anon_id)
SELECT equipment_name, sport_name, equipment_image_url, anon_id
FROM ranked_equipment
WHERE rank = 1
ON CONFLICT (normalized_name) DO UPDATE
SET
  image_url = COALESCE(sport_equipment.image_url, EXCLUDED.image_url),
  sport_name = COALESCE(NULLIF(sport_equipment.sport_name, ''), EXCLUDED.sport_name),
  anon_id = COALESCE(sport_equipment.anon_id, EXCLUDED.anon_id);

UPDATE sport_entries
SET sport_equipment_id = sport_equipment.id
FROM sport_equipment
WHERE sport_entries.sport_equipment_id IS NULL
  AND lower(btrim(sport_entries.equipment_name)) = sport_equipment.normalized_name;

NOTIFY pgrst, 'reload schema';
