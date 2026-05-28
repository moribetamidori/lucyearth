-- Upgrade recipes from a flat ingredient list to variation formulas.
ALTER TABLE recipes
  ADD COLUMN IF NOT EXISTS variations JSONB NOT NULL DEFAULT '[]'::jsonb;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'recipes'
      AND column_name = 'ingredients'
  ) THEN
    EXECUTE $migration$
      WITH item_rows AS (
        SELECT
          recipes.id AS recipe_id,
          item.value AS item,
          item.ordinality AS order_index,
          btrim(COALESCE(item.value ->> 'name', '')) AS item_name,
          CASE
            WHEN lower(COALESCE(item.value ->> 'unit', 'g')) = 'lb'
              THEN COALESCE((item.value ->> 'amount')::numeric, 0) * 453.59237
            ELSE COALESCE((item.value ->> 'amount')::numeric, 0)
          END AS grams
        FROM recipes
        CROSS JOIN LATERAL jsonb_array_elements(recipes.ingredients) WITH ORDINALITY AS item(value, ordinality)
        WHERE jsonb_typeof(recipes.ingredients) = 'array'
      ),
      classified AS (
        SELECT
          *,
          lower(item_name) LIKE '%flour%'
            OR lower(item_name) LIKE '%rye%'
            OR lower(item_name) LIKE '%wheat%' AS is_flour
        FROM item_rows
        WHERE item_name <> '' AND grams > 0
      ),
      totals AS (
        SELECT
          recipe_id,
          SUM(grams) FILTER (WHERE is_flour) AS flour_grams
        FROM classified
        GROUP BY recipe_id
      ),
      formulas AS (
        SELECT
          recipes.id AS recipe_id,
          GREATEST(COALESCE(totals.flour_grams, 0), 1) AS total_flour_grams,
          COALESCE(
            (
              SELECT jsonb_agg(
                jsonb_build_object(
                  'id', classified.item ->> 'id',
                  'name', classified.item_name,
                  'percent', classified.grams / GREATEST(COALESCE(totals.flour_grams, 0), 1) * 100
                )
                ORDER BY classified.order_index
              )
              FROM classified
              WHERE classified.recipe_id = recipes.id
                AND classified.is_flour
            ),
            jsonb_build_array(
              jsonb_build_object(
                'id', gen_random_uuid()::text,
                'name', 'Bread flour',
                'percent', 100
              )
            )
          ) AS flour_blend,
          COALESCE(
            (
              SELECT jsonb_agg(
                jsonb_build_object(
                  'id', classified.item ->> 'id',
                  'name', classified.item_name,
                  'percent_of_flour', classified.grams / GREATEST(COALESCE(totals.flour_grams, 0), 1) * 100
                )
                ORDER BY classified.order_index
              )
              FROM classified
              WHERE classified.recipe_id = recipes.id
                AND NOT classified.is_flour
            ),
            '[]'::jsonb
          ) AS ingredients
        FROM recipes
        LEFT JOIN totals ON totals.recipe_id = recipes.id
      )
      UPDATE recipes
      SET variations = jsonb_build_array(
        jsonb_build_object(
          'id', gen_random_uuid()::text,
          'name', 'Classic',
          'total_flour_grams', formulas.total_flour_grams,
          'flour_blend', formulas.flour_blend,
          'ingredients', formulas.ingredients
        )
      )
      FROM formulas
      WHERE recipes.id = formulas.recipe_id
        AND jsonb_typeof(recipes.variations) = 'array'
        AND jsonb_array_length(recipes.variations) = 0
    $migration$;
  END IF;
END $$;

ALTER TABLE recipes
  DROP CONSTRAINT IF EXISTS recipes_ingredients_array;

ALTER TABLE recipes
  DROP CONSTRAINT IF EXISTS recipes_variations_array;

ALTER TABLE recipes
  ADD CONSTRAINT recipes_variations_array CHECK (jsonb_typeof(variations) = 'array');

ALTER TABLE recipes
  DROP COLUMN IF EXISTS ingredients;

NOTIFY pgrst, 'reload schema';
