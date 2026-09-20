-- Restore the Soil fusion if it was removed during curation and connect its
-- already-created plant curiosities. This migration never removes records.
INSERT INTO plantbook2_elements (
  title, tier, parent_element_id, second_parent_element_id,
  ai_generated, curation_status
)
SELECT
  'Soil',
  GREATEST(root.tier, mineral.tier) + 1,
  root.id,
  mineral.id,
  true,
  'pending'
FROM plantbook2_elements root
JOIN plantbook2_elements mineral ON mineral.title = 'Mineral'
WHERE root.title = 'Root'
  AND NOT EXISTS (
    SELECT 1 FROM plantbook2_elements WHERE title = 'Soil'
  );

WITH soil_recipes(source_title, result_title, scientific_name) AS (
  VALUES
    ('Living Stone', 'Living Rock Cactus', 'Ariocarpus fissuratus'),
    ('Living Stone', 'Earth Star Bromeliad', 'Cryptanthus bivittatus'),
    ('Living Stone', 'Peanut Plant', 'Arachis hypogaea')
)
INSERT INTO plantbook2_crafts (
  plant_id, element_id, result_plant_id, notes, ai_generated, curation_status
)
SELECT
  source_plant.id,
  soil.id,
  result_plant.id,
  'Real-world taxon: ' || recipe.scientific_name || '.',
  true,
  'pending'
FROM soil_recipes recipe
JOIN plantbook2_plants source_plant ON source_plant.title = recipe.source_title
JOIN plantbook2_plants result_plant ON result_plant.title = recipe.result_title
JOIN plantbook2_elements soil ON soil.title = 'Soil'
WHERE NOT EXISTS (
  SELECT 1 FROM plantbook2_crafts craft
  WHERE craft.result_plant_id = result_plant.id
);

NOTIFY pgrst, 'reload schema';
