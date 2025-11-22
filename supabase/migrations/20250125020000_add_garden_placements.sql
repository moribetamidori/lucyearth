-- Map plants onto a 100x50 garden grid with multi-block placements
CREATE TABLE IF NOT EXISTS garden_placements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  species_id UUID NOT NULL REFERENCES garden_species(id) ON DELETE CASCADE,
  cells INTEGER[] NOT NULL CHECK (array_length(cells, 1) > 0),
  color TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW())
);

CREATE INDEX IF NOT EXISTS idx_garden_placements_species_id
  ON garden_placements(species_id);

CREATE INDEX IF NOT EXISTS idx_garden_placements_cells_gin
  ON garden_placements
  USING GIN (cells);

ALTER TABLE garden_placements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations on garden_placements"
  ON garden_placements
  FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE TRIGGER update_garden_placements_updated_at
  BEFORE UPDATE ON garden_placements
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
