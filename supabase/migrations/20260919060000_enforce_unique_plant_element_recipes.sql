-- One ingredient pair must always resolve to one plant. Preserve every result:
-- move colliding generated recipes to an unused, thematically fitting element,
-- or deepen the family when a repeated generated element naturally forms a chain.

WITH reassignment(result_title, element_title) AS (
  VALUES
    ('Bird''s-foot Trefoil', 'Butterfly'),
    ('Dancing Plant', 'Lightning'),
    ('Ghost Plant', 'Mist'),
    ('Wood Sorrel', 'Dew'),
    ('Subterranean Clover', 'Mineral'),
    ('Alsike Clover', 'Frost'),
    ('Red Clover', 'Ember'),
    ('Monkey Orchid', 'Mist'),
    ('Black Bat Flower', 'Shade'),
    ('Jade Vine', 'Aurora'),
    ('German Chamomile', 'Milk'),
    ('Purple Bladderwort', 'Decay'),
    ('Water Soldier', 'Ice'),
    ('Mosquito Fern', 'Ember'),
    ('Sacred Lotus', 'Aurora'),
    ('Bird of Paradise', 'Star'),
    ('Flame Lily', 'Ember'),
    ('Red Spider Lily', 'Moon'),
    ('Corkscrew Albuca', 'Storm'),
    ('Buddha''s Hand', 'Mineral'),
    ('Miracle Fruit', 'Milk'),
    ('Jabuticaba', 'Dew'),
    ('Wollemi Pine', 'Frost'),
    ('Monkey Puzzle Tree', 'Aurora'),
    ('Sandbox Tree', 'Lightning'),
    ('Cannonball Tree', 'Rain'),
    ('Dragon''s Blood Tree', 'Ash'),
    ('Collared Earthstar', 'Mineral'),
    ('Orange Peel Fungus', 'Ember'),
    ('Bird''s Nest Fungus', 'Root'),
    ('Bioluminescent Bitter Oyster', 'Lightning'),
    ('Wrinkled Peach', 'Dew'),
    ('Dead Man''s Fingers', 'Ash'),
    ('Bleeding Tooth Fungus', 'Radiation'),
    ('Octopus Stinkhorn', 'Storm'),
    ('Black Velvet Alocasia', 'Shade')
)
UPDATE plantbook2_crafts craft
SET element_id = element.id
FROM reassignment
JOIN plantbook2_plants result_plant
  ON result_plant.title = reassignment.result_title
JOIN plantbook2_elements element
  ON element.title = reassignment.element_title
WHERE craft.result_plant_id = result_plant.id
  AND craft.ai_generated = true;

WITH lineage(source_title, result_title) AS (
  VALUES
    ('Fairy Lantern', 'Himalayan Cobra Lily'),
    ('Arctic Poppy', 'Snow Lotus'),
    ('Snow Lotus', 'Frost Flower'),
    ('Cape Sundew', 'Rainbow Plant'),
    ('Lightning Jewel Orchid', 'Hurricane Palm'),
    ('Hurricane Palm', 'Pink Rain Lily'),
    ('Torch Ginger', 'Firecracker Plant'),
    ('Firecracker Plant', 'Flame Azalea'),
    ('Smoke Bush', 'Ashy Hydrangea'),
    ('Ashy Hydrangea', 'European Ash'),
    ('Peacock Begonia', 'Blue Oil Fern'),
    ('Blue Oil Fern', 'Peacock Spikemoss'),
    ('Living Rock Cactus', 'Earth Star Bromeliad'),
    ('Earth Star Bromeliad', 'Peanut Plant')
)
UPDATE plantbook2_crafts craft
SET plant_id = source_plant.id
FROM lineage
JOIN plantbook2_plants source_plant
  ON source_plant.title = lineage.source_title
JOIN plantbook2_plants result_plant
  ON result_plant.title = lineage.result_title
WHERE craft.result_plant_id = result_plant.id
  AND craft.ai_generated = true;

WITH lineage(source_title, result_title) AS (
  VALUES
    ('Fairy Lantern', 'Himalayan Cobra Lily'),
    ('Arctic Poppy', 'Snow Lotus'),
    ('Snow Lotus', 'Frost Flower'),
    ('Cape Sundew', 'Rainbow Plant'),
    ('Lightning Jewel Orchid', 'Hurricane Palm'),
    ('Hurricane Palm', 'Pink Rain Lily'),
    ('Torch Ginger', 'Firecracker Plant'),
    ('Firecracker Plant', 'Flame Azalea'),
    ('Smoke Bush', 'Ashy Hydrangea'),
    ('Ashy Hydrangea', 'European Ash'),
    ('Peacock Begonia', 'Blue Oil Fern'),
    ('Blue Oil Fern', 'Peacock Spikemoss'),
    ('Living Rock Cactus', 'Earth Star Bromeliad'),
    ('Earth Star Bromeliad', 'Peanut Plant')
)
UPDATE plantbook2_plants result_plant
SET parent_plant_id = source_plant.id
FROM lineage
JOIN plantbook2_plants source_plant
  ON source_plant.title = lineage.source_title
WHERE result_plant.title = lineage.result_title
  AND result_plant.ai_generated = true;

-- Recalculate every tier after deepening the generated families.
WITH RECURSIVE family AS (
  SELECT id, 1 AS next_tier
  FROM plantbook2_plants
  WHERE parent_plant_id IS NULL

  UNION ALL

  SELECT child.id, family.next_tier + 1
  FROM plantbook2_plants child
  JOIN family ON child.parent_plant_id = family.id
)
UPDATE plantbook2_plants plant
SET tier = family.next_tier
FROM family
WHERE plant.id = family.id
  AND plant.tier IS DISTINCT FROM family.next_tier;

CREATE UNIQUE INDEX IF NOT EXISTS idx_plantbook2_crafts_unique_ingredients
  ON plantbook2_crafts(plant_id, element_id);

NOTIFY pgrst, 'reload schema';
