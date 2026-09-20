-- Preserve the source and attribution for externally sourced specimen photos.
ALTER TABLE plantbook2_plants
  ADD COLUMN IF NOT EXISTS image_source_url TEXT,
  ADD COLUMN IF NOT EXISTS image_attribution TEXT;

-- Use a taxon with a canonical, verifiable specimen image for this suggestion.
UPDATE plantbook2_plants
SET title = 'Sapphire Tower'
WHERE title = 'Blue Puya' AND ai_generated = true;

UPDATE plantbook2_crafts
SET notes = 'Real-world taxon: Puya alpestris.'
WHERE result_plant_id IN (
  SELECT id FROM plantbook2_plants
  WHERE title = 'Sapphire Tower' AND ai_generated = true
);

NOTIFY pgrst, 'reload schema';
