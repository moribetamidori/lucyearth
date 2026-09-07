-- Plantbook2 is a tiered crafting notebook. Plants and elements are reusable
-- ingredients; characters begin with a base plant; recipes create new plants.

CREATE TABLE IF NOT EXISTS plantbook2_plants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  anon_id TEXT,
  title TEXT NOT NULL,
  tier INTEGER NOT NULL DEFAULT 1 CHECK (tier >= 1),
  image_url TEXT,
  image_path TEXT,
  parent_plant_id UUID REFERENCES plantbook2_plants(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW()),
  CONSTRAINT plantbook2_plant_title_not_blank CHECK (btrim(title) <> '')
);

CREATE TABLE IF NOT EXISTS plantbook2_elements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  anon_id TEXT,
  title TEXT NOT NULL,
  tier INTEGER NOT NULL DEFAULT 1 CHECK (tier >= 1),
  image_url TEXT,
  image_path TEXT,
  parent_element_id UUID REFERENCES plantbook2_elements(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW()),
  CONSTRAINT plantbook2_element_title_not_blank CHECK (btrim(title) <> '')
);

CREATE TABLE IF NOT EXISTS plantbook2_characters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  anon_id TEXT,
  name TEXT NOT NULL,
  base_plant_id UUID NOT NULL REFERENCES plantbook2_plants(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW()),
  CONSTRAINT plantbook2_character_name_not_blank CHECK (btrim(name) <> '')
);

CREATE TABLE IF NOT EXISTS plantbook2_crafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  anon_id TEXT,
  plant_id UUID NOT NULL REFERENCES plantbook2_plants(id) ON DELETE RESTRICT,
  element_id UUID NOT NULL REFERENCES plantbook2_elements(id) ON DELETE RESTRICT,
  result_plant_id UUID NOT NULL REFERENCES plantbook2_plants(id) ON DELETE CASCADE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW()),
  CONSTRAINT plantbook2_craft_result_unique UNIQUE (result_plant_id)
);

CREATE INDEX IF NOT EXISTS idx_plantbook2_plants_tier ON plantbook2_plants(tier, title);
CREATE INDEX IF NOT EXISTS idx_plantbook2_elements_tier ON plantbook2_elements(tier, title);
CREATE INDEX IF NOT EXISTS idx_plantbook2_characters_created ON plantbook2_characters(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_plantbook2_crafts_created ON plantbook2_crafts(created_at DESC);

ALTER TABLE plantbook2_plants ENABLE ROW LEVEL SECURITY;
ALTER TABLE plantbook2_elements ENABLE ROW LEVEL SECURITY;
ALTER TABLE plantbook2_characters ENABLE ROW LEVEL SECURITY;
ALTER TABLE plantbook2_crafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations on plantbook2_plants"
  ON plantbook2_plants FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on plantbook2_elements"
  ON plantbook2_elements FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on plantbook2_characters"
  ON plantbook2_characters FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on plantbook2_crafts"
  ON plantbook2_crafts FOR ALL USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS update_plantbook2_plants_updated_at ON plantbook2_plants;
CREATE TRIGGER update_plantbook2_plants_updated_at
  BEFORE UPDATE ON plantbook2_plants FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_plantbook2_elements_updated_at ON plantbook2_elements;
CREATE TRIGGER update_plantbook2_elements_updated_at
  BEFORE UPDATE ON plantbook2_elements FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_plantbook2_characters_updated_at ON plantbook2_characters;
CREATE TRIGGER update_plantbook2_characters_updated_at
  BEFORE UPDATE ON plantbook2_characters FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_plantbook2_crafts_updated_at ON plantbook2_crafts;
CREATE TRIGGER update_plantbook2_crafts_updated_at
  BEFORE UPDATE ON plantbook2_crafts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

NOTIFY pgrst, 'reload schema';
