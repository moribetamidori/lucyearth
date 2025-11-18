-- Catalog backyard plant species for the Garden modal
CREATE TABLE IF NOT EXISTS garden_species (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  common_name TEXT NOT NULL,
  scientific_name TEXT,
  image_url TEXT NOT NULL,
  sunlight TEXT,
  watering_schedule TEXT,
  soil_type TEXT,
  bloom_season TEXT,
  planted_on DATE,
  last_pruned_on DATE,
  status TEXT,
  location TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT TIMEZONE('utc', NOW()),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT TIMEZONE('utc', NOW())
);

CREATE INDEX IF NOT EXISTS idx_garden_species_common_name
  ON garden_species(common_name);

ALTER TABLE garden_species ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations on garden_species"
  ON garden_species
  FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE TRIGGER update_garden_species_updated_at
  BEFORE UPDATE ON garden_species
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
