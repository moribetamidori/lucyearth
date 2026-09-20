-- Add provenance and a review queue for generated Plantbook II suggestions.
-- Existing records remain human-authored and approved. Generated records keep
-- their provenance even after approval so the UI can label them honestly.

ALTER TABLE plantbook2_plants
  ADD COLUMN IF NOT EXISTS ai_generated BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS curation_status TEXT NOT NULL DEFAULT 'approved';

ALTER TABLE plantbook2_elements
  ADD COLUMN IF NOT EXISTS ai_generated BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS curation_status TEXT NOT NULL DEFAULT 'approved';

ALTER TABLE plantbook2_crafts
  ADD COLUMN IF NOT EXISTS ai_generated BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS curation_status TEXT NOT NULL DEFAULT 'approved';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'plantbook2_plants_curation_status_check') THEN
    ALTER TABLE plantbook2_plants ADD CONSTRAINT plantbook2_plants_curation_status_check
      CHECK (curation_status IN ('pending', 'approved'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'plantbook2_elements_curation_status_check') THEN
    ALTER TABLE plantbook2_elements ADD CONSTRAINT plantbook2_elements_curation_status_check
      CHECK (curation_status IN ('pending', 'approved'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'plantbook2_crafts_curation_status_check') THEN
    ALTER TABLE plantbook2_crafts ADD CONSTRAINT plantbook2_crafts_curation_status_check
      CHECK (curation_status IN ('pending', 'approved'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_plantbook2_elements_ai_review
  ON plantbook2_elements(ai_generated, curation_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_plantbook2_crafts_ai_review
  ON plantbook2_crafts(ai_generated, curation_status, created_at DESC);

-- Approve a generated element or recipe atomically. Recipe approval also keeps
-- the generated result plant in sync with its recipe.
CREATE OR REPLACE FUNCTION set_plantbook2_ai_curation(
  item_kind TEXT,
  item_id UUID,
  next_status TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  result_id UUID;
BEGIN
  IF next_status NOT IN ('pending', 'approved') THEN
    RAISE EXCEPTION 'Invalid curation status';
  END IF;

  IF item_kind = 'element' THEN
    UPDATE plantbook2_elements
    SET curation_status = next_status
    WHERE id = item_id AND ai_generated = true;
    IF NOT FOUND THEN RAISE EXCEPTION 'Generated element not found'; END IF;
  ELSIF item_kind = 'craft' THEN
    SELECT result_plant_id INTO result_id
    FROM plantbook2_crafts
    WHERE id = item_id AND ai_generated = true;
    IF NOT FOUND THEN RAISE EXCEPTION 'Generated recipe not found'; END IF;

    -- A kept descendant needs its generated ancestors, so approve the full
    -- path back to the first human-authored plant.
    WITH RECURSIVE lineage AS (
      SELECT id, parent_plant_id
      FROM plantbook2_plants
      WHERE id = result_id
      UNION ALL
      SELECT parent.id, parent.parent_plant_id
      FROM plantbook2_plants parent
      JOIN lineage child ON child.parent_plant_id = parent.id
      WHERE parent.ai_generated = true
    )
    UPDATE plantbook2_plants plant
    SET curation_status = next_status
    FROM lineage
    WHERE plant.id = lineage.id AND plant.ai_generated = true;

    WITH RECURSIVE lineage AS (
      SELECT id, parent_plant_id
      FROM plantbook2_plants
      WHERE id = result_id
      UNION ALL
      SELECT parent.id, parent.parent_plant_id
      FROM plantbook2_plants parent
      JOIN lineage child ON child.parent_plant_id = parent.id
      WHERE parent.ai_generated = true
    )
    UPDATE plantbook2_crafts craft
    SET curation_status = next_status
    FROM lineage
    WHERE craft.result_plant_id = lineage.id AND craft.ai_generated = true;
  ELSE
    RAISE EXCEPTION 'Unsupported curation item kind';
  END IF;
END;
$$;

-- Delete one generated suggestion. Rejecting a generated recipe also removes
-- its generated descendants; human-authored dependencies safely block it.
CREATE OR REPLACE FUNCTION delete_plantbook2_ai_suggestion(
  item_kind TEXT,
  item_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  result_id UUID;
BEGIN
  IF item_kind = 'element' THEN
    DELETE FROM plantbook2_elements
    WHERE id = item_id AND ai_generated = true;
    IF NOT FOUND THEN RAISE EXCEPTION 'Generated element not found'; END IF;
  ELSIF item_kind = 'craft' THEN
    SELECT result_plant_id INTO result_id
    FROM plantbook2_crafts
    WHERE id = item_id AND ai_generated = true;
    IF NOT FOUND THEN RAISE EXCEPTION 'Generated recipe not found'; END IF;

    -- Rejecting a branch removes its generated descendants too. Human-authored
    -- recipes or characters that depend on the branch block the operation.
    IF EXISTS (
      WITH RECURSIVE subtree AS (
        SELECT id FROM plantbook2_plants WHERE id = result_id
        UNION ALL
        SELECT child.id
        FROM plantbook2_plants child
        JOIN subtree parent ON child.parent_plant_id = parent.id
      )
      SELECT 1
      FROM subtree
      JOIN plantbook2_plants plant ON plant.id = subtree.id
      WHERE plant.ai_generated = false
    ) THEN
      RAISE EXCEPTION 'This branch contains a human-authored plant';
    END IF;

    IF EXISTS (
      WITH RECURSIVE subtree AS (
        SELECT id FROM plantbook2_plants WHERE id = result_id
        UNION ALL
        SELECT child.id
        FROM plantbook2_plants child
        JOIN subtree parent ON child.parent_plant_id = parent.id
      )
      SELECT 1 FROM plantbook2_characters character
      JOIN subtree ON subtree.id = character.base_plant_id
    ) OR EXISTS (
      WITH RECURSIVE subtree AS (
        SELECT id FROM plantbook2_plants WHERE id = result_id
        UNION ALL
        SELECT child.id
        FROM plantbook2_plants child
        JOIN subtree parent ON child.parent_plant_id = parent.id
      )
      SELECT 1
      FROM plantbook2_crafts craft
      JOIN subtree ON subtree.id = craft.plant_id
      WHERE craft.ai_generated = false
    ) THEN
      RAISE EXCEPTION 'This branch is used by a human-authored character or recipe';
    END IF;

    WITH RECURSIVE subtree AS (
      SELECT id FROM plantbook2_plants WHERE id = result_id
      UNION ALL
      SELECT child.id
      FROM plantbook2_plants child
      JOIN subtree parent ON child.parent_plant_id = parent.id
    )
    DELETE FROM plantbook2_crafts craft
    USING subtree
    WHERE craft.result_plant_id = subtree.id AND craft.ai_generated = true;

    WITH RECURSIVE subtree AS (
      SELECT id FROM plantbook2_plants WHERE id = result_id
      UNION ALL
      SELECT child.id
      FROM plantbook2_plants child
      JOIN subtree parent ON child.parent_plant_id = parent.id
    )
    DELETE FROM plantbook2_plants plant
    USING subtree
    WHERE plant.id = subtree.id AND plant.ai_generated = true;
  ELSE
    RAISE EXCEPTION 'Unsupported curation item kind';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION set_plantbook2_ai_curation(TEXT, UUID, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION delete_plantbook2_ai_suggestion(TEXT, UUID) TO anon, authenticated;

-- Eight independently removable element fusions bring the archive from 22 to
-- 30 elements. Their parents are existing elements, so rejecting one does not
-- break another generated suggestion.
WITH element_suggestions(title, first_parent, second_parent) AS (
  VALUES
    ('Mist', 'Rain', 'Wind'),
    ('Frost', 'Ice', 'Wind'),
    ('Dew', 'Moon', 'Rain'),
    ('Storm', 'Rain', 'Lightning'),
    ('Ember', 'Heat', 'Lava'),
    ('Ash', 'Decay', 'Lava'),
    ('Aurora', 'Night', 'Radiation'),
    ('Soil', 'Root', 'Mineral')
)
INSERT INTO plantbook2_elements (
  title, tier, parent_element_id, second_parent_element_id,
  ai_generated, curation_status
)
SELECT
  suggestion.title,
  GREATEST(first_element.tier, second_element.tier) + 1,
  first_element.id,
  second_element.id,
  true,
  'pending'
FROM element_suggestions suggestion
JOIN plantbook2_elements first_element ON first_element.title = suggestion.first_parent
JOIN plantbook2_elements second_element ON second_element.title = suggestion.second_parent
WHERE NOT EXISTS (
  SELECT 1 FROM plantbook2_elements existing
  WHERE lower(existing.title) = lower(suggestion.title)
);

-- Each generated result is a documented real-world taxon. Several suggestions
-- use earlier generated results to make surprising multi-tier collections.
CREATE TEMP TABLE plantbook2_ai_plant_suggestions (
  source_title TEXT NOT NULL,
  element_title TEXT NOT NULL,
  result_title TEXT NOT NULL,
  scientific_name TEXT NOT NULL
) ON COMMIT DROP;

INSERT INTO plantbook2_ai_plant_suggestions VALUES
  ('Clover', 'Sun', 'Red Clover', 'Trifolium pratense'),
  ('Clover', 'Moon', 'White Clover', 'Trifolium repens'),
  ('Clover', 'Heat', 'Crimson Clover', 'Trifolium incarnatum'),
  ('Clover', 'Rain', 'Alsike Clover', 'Trifolium hybridum'),
  ('Clover', 'Milk', 'Strawberry Clover', 'Trifolium fragiferum'),
  ('Clover', 'Root', 'Subterranean Clover', 'Trifolium subterraneum'),
  ('Clover', 'Sun', 'Sweet Clover', 'Melilotus officinalis'),
  ('Clover', 'Root', 'Alfalfa', 'Medicago sativa'),
  ('Clover', 'Wind', 'Bird''s-foot Trefoil', 'Lotus corniculatus'),
  ('Clover', 'Shade', 'Wood Sorrel', 'Oxalis acetosella'),
  ('Clover', 'Night', 'Purple Shamrock', 'Oxalis triangularis'),
  ('Clover', 'Rain', 'Creeping Woodsorrel', 'Oxalis corniculata'),
  ('Clover', 'Pulse', 'Dancing Plant', 'Codariocalyx motorius'),
  ('Clover', 'Drought', 'Resurrection Plant', 'Selaginella lepidophylla'),
  ('Resurrection Plant', 'Sun', 'Living Stone', 'Lithops aucampiae'),
  ('Living Stone', 'Drought', 'Baseball Plant', 'Euphorbia obesa'),
  ('Clover', 'Shade', 'Ghost Plant', 'Monotropa uniflora'),
  ('Clover', 'Ice', 'Snow Plant', 'Sarcodes sanguinea'),
  ('Clover', 'Star', 'Doll''s Eyes', 'Actaea pachypoda'),
  ('Clover', 'Thorn', 'Cobra Lily', 'Darlingtonia californica'),

  ('Elephant Ear', 'Night', 'Black Velvet Alocasia', 'Alocasia reginula'),
  ('Elephant Ear', 'Rainbow', 'Zebrina Alocasia', 'Alocasia zebrina'),
  ('Elephant Ear', 'Ice', 'Silver Dragon Alocasia', 'Alocasia baginda'),
  ('Elephant Ear', 'Root', 'Hooded Dwarf Elephant Ear', 'Alocasia cucullata'),
  ('Elephant Ear', 'Moon', 'Mirror Plant', 'Alocasia cuprea'),
  ('Elephant Ear', 'Star', 'Kris Plant', 'Alocasia sanderiana'),
  ('Elephant Ear', 'Radiation', 'Giant Elephant Ear', 'Colocasia gigantea'),
  ('Elephant Ear', 'Thorn', 'Arrowleaf Elephant Ear', 'Xanthosoma sagittifolium'),
  ('Daisy', 'Sun', 'German Chamomile', 'Matricaria chamomilla'),
  ('Daisy', 'Moon', 'Roman Chamomile', 'Chamaemelum nobile'),
  ('Daisy', 'Night', 'Black Bat Flower', 'Tacca chantrieri'),
  ('Daisy', 'Rainbow', 'Jade Vine', 'Strongylodon macrobotrys'),
  ('Daisy', 'Night', 'Monkey Orchid', 'Dracula simia'),
  ('Monkey Orchid', 'Wind', 'Flying Duck Orchid', 'Caleana major'),
  ('Monkey Orchid', 'Butterfly', 'Bee Orchid', 'Ophrys apifera'),
  ('Daisy', 'Rainbow', 'Parrot Flower', 'Impatiens psittacina'),
  ('Daisy', 'Ice', 'Darwin''s Slipper', 'Calceolaria uniflora'),
  ('Daisy', 'Decay', 'Starfish Flower', 'Stapelia gigantea'),
  ('Daisy', 'Wind', 'Parachute Plant', 'Ceropegia sandersonii'),
  ('Daisy', 'Heat', 'Hooker''s Lips', 'Palicourea elata'),
  ('Flying Duck Orchid', 'Root', 'Naked Man Orchid', 'Orchis italica'),
  ('Bee Orchid', 'Wind', 'White Egret Orchid', 'Pecteilis radiata'),
  ('Daisy', 'Night', 'Chocolate Cosmos', 'Cosmos atrosanguineus'),
  ('Daisy', 'Rain', 'Skeleton Flower', 'Diphylleia grayi'),
  ('Daisy', 'Thorn', 'Green Birdflower', 'Crotalaria cunninghamii'),

  ('Wildflowers', 'Decay', 'Titan Arum', 'Amorphophallus titanum'),
  ('Titan Arum', 'Night', 'Voodoo Lily', 'Amorphophallus konjac'),
  ('Voodoo Lily', 'Root', 'Hydnora', 'Hydnora africana'),
  ('Wildflowers', 'Drought', 'Welwitschia', 'Welwitschia mirabilis'),
  ('Wildflowers', 'Lava', 'Dragon''s Blood Tree', 'Dracaena cinnabari'),
  ('Wildflowers', 'Rainbow', 'Rainbow Eucalyptus', 'Eucalyptus deglupta'),
  ('Wildflowers', 'Pulse', 'Cannonball Tree', 'Couroupita guianensis'),
  ('Wildflowers', 'Root', 'Sausage Tree', 'Kigelia africana'),
  ('Wildflowers', 'Thorn', 'Sandbox Tree', 'Hura crepitans'),
  ('Wildflowers', 'Cycle', 'Monkey Puzzle Tree', 'Araucaria araucana'),
  ('Wildflowers', 'Cycle', 'Wollemi Pine', 'Wollemia nobilis'),
  ('Wildflowers', 'Pulse', 'Jabuticaba', 'Plinia cauliflora'),
  ('Wildflowers', 'Night', 'Black Sapote', 'Diospyros nigra'),
  ('Wildflowers', 'Pulse', 'Miracle Fruit', 'Synsepalum dulcificum'),
  ('Wildflowers', 'Thorn', 'Buddha''s Hand', 'Citrus medica'),
  ('Wildflowers', 'Shade', 'Swiss Cheese Plant', 'Monstera deliciosa'),
  ('Wildflowers', 'Radiation', 'Corkscrew Albuca', 'Albuca spiralis'),
  ('Wildflowers', 'Wind', 'Traveller''s Palm', 'Ravenala madagascariensis'),
  ('Wildflowers', 'Heat', 'Red Spider Lily', 'Lycoris radiata'),
  ('Wildflowers', 'Ice', 'Sapphire Tower', 'Puya alpestris'),
  ('Wildflowers', 'Sun', 'King Protea', 'Protea cynaroides'),
  ('Wildflowers', 'Pulse', 'Red Kangaroo Paw', 'Anigozanthos manglesii'),
  ('Wildflowers', 'Lava', 'Flame Lily', 'Gloriosa superba'),
  ('Wildflowers', 'Butterfly', 'Bird of Paradise', 'Strelitzia reginae'),
  ('Wildflowers', 'Radiation', 'Attenborough''s Pitcher Plant', 'Nepenthes attenboroughii'),

  ('Duckweed', 'Sun', 'Sacred Lotus', 'Nelumbo nucifera'),
  ('Duckweed', 'Moon', 'Yellow Pond Lily', 'Nuphar lutea'),
  ('Duckweed', 'Pulse', 'Waterwheel Plant', 'Aldrovanda vesiculosa'),
  ('Waterwheel Plant', 'Decay', 'Common Bladderwort', 'Utricularia vulgaris'),
  ('Duckweed', 'Rainbow', 'Mosaic Plant', 'Ludwigia sedioides'),
  ('Duckweed', 'Star', 'Water Snowflake', 'Nymphoides indica'),
  ('Duckweed', 'Sun', 'Yellow Floating Heart', 'Nymphoides peltata'),
  ('Duckweed', 'Heat', 'Giant Salvinia', 'Salvinia molesta'),
  ('Duckweed', 'Thorn', 'Water Soldier', 'Stratiotes aloides'),
  ('Duckweed', 'Night', 'Purple Bladderwort', 'Utricularia purpurea'),
  ('Duckweed', 'Pulse', 'Mosquito Fern', 'Azolla filiculoides'),
  ('Duckweed', 'Thorn', 'Hornwort', 'Ceratophyllum demersum'),
  ('Duckweed', 'Wind', 'Eelgrass', 'Zostera marina'),
  ('Duckweed', 'Rain', 'Canadian Waterweed', 'Elodea canadensis'),
  ('Duckweed', 'Cycle', 'European Water Clover', 'Marsilea quadrifolia'),

  ('White Mushroom', 'Wind', 'Octopus Stinkhorn', 'Clathrus archeri'),
  ('Octopus Stinkhorn', 'Root', 'Basket Fungus', 'Ileodictyon cibarium'),
  ('Octopus Stinkhorn', 'Shade', 'Veiled Lady', 'Phallus indusiatus'),
  ('White Mushroom', 'Decay', 'Bleeding Tooth Fungus', 'Hydnellum peckii'),
  ('Basket Fungus', 'Star', 'Devil''s Cigar', 'Chorioactis geaster'),
  ('White Mushroom', 'Decay', 'Dead Man''s Fingers', 'Xylaria polymorpha'),
  ('Octopus Stinkhorn', 'Pulse', 'Dog Stinkhorn', 'Mutinus caninus'),
  ('White Mushroom', 'Rainbow', 'Wrinkled Peach', 'Rhodotus palmatus'),
  ('White Mushroom', 'Rainbow', 'Violet Coral Fungus', 'Clavaria zollingeri'),
  ('White Mushroom', 'Moon', 'Bioluminescent Bitter Oyster', 'Panellus stipticus'),
  ('White Mushroom', 'Cycle', 'Bird''s Nest Fungus', 'Crucibulum laeve'),
  ('White Mushroom', 'Heat', 'Orange Peel Fungus', 'Aleuria aurantia'),
  ('White Mushroom', 'Cycle', 'Reishi', 'Ganoderma lucidum'),
  ('White Mushroom', 'Rain', 'Wood Ear', 'Auricularia auricula-judae'),
  ('White Mushroom', 'Thorn', 'Coral Tooth Fungus', 'Hericium coralloides'),
  ('White Mushroom', 'Sun', 'Parasol Mushroom', 'Macrolepiota procera'),
  ('White Mushroom', 'Shade', 'Wood Blewit', 'Lepista nuda'),
  ('White Mushroom', 'Ice', 'Matsutake', 'Tricholoma matsutake'),
  ('White Mushroom', 'Night', 'Black Truffle', 'Tuber melanosporum'),
  ('White Mushroom', 'Pulse', 'Giant Puffball', 'Calvatia gigantea'),
  ('White Mushroom', 'Heat', 'Scarlet Elf Cup', 'Sarcoscypha coccinea'),
  ('White Mushroom', 'Moon', 'Amethyst Deceiver', 'Laccaria amethystina'),
  ('White Mushroom', 'Decay', 'Green Elf Cup', 'Chlorociboria aeruginascens'),
  ('White Mushroom', 'Star', 'Collared Earthstar', 'Geastrum triplex');

DO $$
DECLARE
  inserted_count INTEGER;
  unresolved_count INTEGER;
BEGIN
  LOOP
    INSERT INTO plantbook2_plants (
      title, tier, parent_plant_id, ai_generated, curation_status
    )
    SELECT
      suggestion.result_title,
      source_plant.tier + 1,
      source_plant.id,
      true,
      'pending'
    FROM plantbook2_ai_plant_suggestions suggestion
    JOIN plantbook2_plants source_plant ON source_plant.title = suggestion.source_title
    WHERE NOT EXISTS (
      SELECT 1 FROM plantbook2_plants existing
      WHERE lower(existing.title) = lower(suggestion.result_title)
    );

    GET DIAGNOSTICS inserted_count = ROW_COUNT;
    EXIT WHEN inserted_count = 0;
  END LOOP;

  SELECT count(*) INTO unresolved_count
  FROM plantbook2_ai_plant_suggestions suggestion
  WHERE NOT EXISTS (
    SELECT 1 FROM plantbook2_plants plant
    WHERE lower(plant.title) = lower(suggestion.result_title)
  );

  IF unresolved_count > 0 THEN
    RAISE EXCEPTION '% Plantbook II suggestions have unresolved source plants', unresolved_count;
  END IF;
END $$;

INSERT INTO plantbook2_crafts (
  plant_id, element_id, result_plant_id, notes,
  ai_generated, curation_status
)
SELECT
  source_plant.id,
  element.id,
  result_plant.id,
  'Real-world taxon: ' || suggestion.scientific_name || '.',
  true,
  'pending'
FROM plantbook2_ai_plant_suggestions suggestion
JOIN plantbook2_plants source_plant ON source_plant.title = suggestion.source_title
JOIN plantbook2_elements element ON element.title = suggestion.element_title
JOIN plantbook2_plants result_plant ON result_plant.title = suggestion.result_title
WHERE result_plant.ai_generated = true
  AND NOT EXISTS (
    SELECT 1 FROM plantbook2_crafts craft
    WHERE craft.result_plant_id = result_plant.id
  );

NOTIFY pgrst, 'reload schema';
