-- Keep Aurora's third curiosity iridescent while using a taxon with a canonical
-- reusable specimen photograph.
UPDATE plantbook2_plants
SET title = 'Peacock Spikemoss'
WHERE title = 'Jewel Alocasia' AND ai_generated = true;

UPDATE plantbook2_crafts
SET notes = 'Real-world taxon: Selaginella uncinata.'
WHERE result_plant_id IN (
  SELECT id FROM plantbook2_plants
  WHERE title = 'Peacock Spikemoss' AND ai_generated = true
);

NOTIFY pgrst, 'reload schema';
