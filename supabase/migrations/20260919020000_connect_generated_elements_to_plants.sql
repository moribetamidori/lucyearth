-- Keep all existing combinations and add three real-world plant curiosities for
-- each generated element fusion.
CREATE TEMP TABLE plantbook2_new_element_plants (
  source_title TEXT NOT NULL,
  element_title TEXT NOT NULL,
  result_title TEXT NOT NULL,
  scientific_name TEXT NOT NULL
) ON COMMIT DROP;

INSERT INTO plantbook2_new_element_plants VALUES
  ('Ghost Plant', 'Mist', 'Ghost Orchid', 'Dendrophylax lindenii'),
  ('Ghost Orchid', 'Mist', 'Fairy Lantern', 'Thismia rodwayi'),
  ('Ghost Plant', 'Mist', 'Himalayan Cobra Lily', 'Arisaema consanguineum'),
  ('Snow Plant', 'Frost', 'Arctic Poppy', 'Papaver radicatum'),
  ('Snow Plant', 'Frost', 'Snow Lotus', 'Saussurea involucrata'),
  ('Snow Plant', 'Frost', 'Frost Flower', 'Verbesina virginica'),
  ('Daisy', 'Dew', 'Roundleaf Sundew', 'Drosera rotundifolia'),
  ('Roundleaf Sundew', 'Dew', 'Cape Sundew', 'Drosera capensis'),
  ('Roundleaf Sundew', 'Dew', 'Rainbow Plant', 'Byblis gigantea'),
  ('Dancing Plant', 'Storm', 'Lightning Jewel Orchid', 'Macodes petola'),
  ('Dancing Plant', 'Storm', 'Hurricane Palm', 'Dictyosperma album'),
  ('Dancing Plant', 'Storm', 'Pink Rain Lily', 'Zephyranthes carinata'),
  ('Flame Lily', 'Ember', 'Torch Ginger', 'Etlingera elatior'),
  ('Flame Lily', 'Ember', 'Firecracker Plant', 'Russelia equisetiformis'),
  ('Flame Lily', 'Ember', 'Flame Azalea', 'Rhododendron calendulaceum'),
  ('Dead Man''s Fingers', 'Ash', 'Smoke Bush', 'Cotinus coggygria'),
  ('Dead Man''s Fingers', 'Ash', 'Ashy Hydrangea', 'Hydrangea cinerea'),
  ('Dead Man''s Fingers', 'Ash', 'European Ash', 'Fraxinus excelsior'),
  ('Rainbow Eucalyptus', 'Aurora', 'Peacock Begonia', 'Begonia pavonina'),
  ('Rainbow Eucalyptus', 'Aurora', 'Blue Oil Fern', 'Microsorum thailandicum'),
  ('Rainbow Eucalyptus', 'Aurora', 'Jewel Alocasia', 'Alocasia azlanii'),
  ('Living Stone', 'Soil', 'Living Rock Cactus', 'Ariocarpus fissuratus'),
  ('Living Stone', 'Soil', 'Earth Star Bromeliad', 'Cryptanthus bivittatus'),
  ('Living Stone', 'Soil', 'Peanut Plant', 'Arachis hypogaea');

DO $$
DECLARE
  inserted_count INTEGER;
  unresolved_count INTEGER;
BEGIN
  LOOP
    INSERT INTO plantbook2_plants (
      title, tier, parent_plant_id, ai_generated, curation_status
    )
    SELECT suggestion.result_title, source_plant.tier + 1, source_plant.id, true, 'pending'
    FROM plantbook2_new_element_plants suggestion
    JOIN plantbook2_plants source_plant ON source_plant.title = suggestion.source_title
    WHERE NOT EXISTS (
      SELECT 1 FROM plantbook2_plants existing
      WHERE lower(existing.title) = lower(suggestion.result_title)
    );
    GET DIAGNOSTICS inserted_count = ROW_COUNT;
    EXIT WHEN inserted_count = 0;
  END LOOP;

  SELECT count(*) INTO unresolved_count
  FROM plantbook2_new_element_plants suggestion
  WHERE NOT EXISTS (
    SELECT 1 FROM plantbook2_plants plant
    WHERE lower(plant.title) = lower(suggestion.result_title)
  );
  IF unresolved_count > 0 THEN
    RAISE EXCEPTION '% generated-element plants have unresolved sources', unresolved_count;
  END IF;
END $$;

INSERT INTO plantbook2_crafts (
  plant_id, element_id, result_plant_id, notes, ai_generated, curation_status
)
SELECT
  source_plant.id,
  element.id,
  result_plant.id,
  'Real-world taxon: ' || suggestion.scientific_name || '.',
  true,
  'pending'
FROM plantbook2_new_element_plants suggestion
JOIN plantbook2_plants source_plant ON source_plant.title = suggestion.source_title
JOIN plantbook2_elements element ON element.title = suggestion.element_title
JOIN plantbook2_plants result_plant ON result_plant.title = suggestion.result_title
WHERE result_plant.ai_generated = true
  AND NOT EXISTS (
    SELECT 1 FROM plantbook2_crafts craft
    WHERE craft.result_plant_id = result_plant.id
  );

-- A generated element can now own generated recipe branches. Rejecting it
-- removes those AI branches first, while human-authored dependencies still
-- block deletion through the same safety checks as recipe curation.
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
  dependent_craft_id UUID;
BEGIN
  IF item_kind = 'element' THEN
    IF NOT EXISTS (
      SELECT 1 FROM plantbook2_elements
      WHERE id = item_id AND ai_generated = true
    ) THEN
      RAISE EXCEPTION 'Generated element not found';
    END IF;

    LOOP
      SELECT id INTO dependent_craft_id
      FROM plantbook2_crafts
      WHERE element_id = item_id AND ai_generated = true
      LIMIT 1;
      EXIT WHEN NOT FOUND;
      PERFORM delete_plantbook2_ai_suggestion('craft', dependent_craft_id);
    END LOOP;

    DELETE FROM plantbook2_elements
    WHERE id = item_id AND ai_generated = true;
  ELSIF item_kind = 'craft' THEN
    SELECT result_plant_id INTO result_id
    FROM plantbook2_crafts
    WHERE id = item_id AND ai_generated = true;
    IF NOT FOUND THEN RAISE EXCEPTION 'Generated recipe not found'; END IF;

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

GRANT EXECUTE ON FUNCTION delete_plantbook2_ai_suggestion(TEXT, UUID) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
