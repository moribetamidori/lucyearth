-- Generalize recipe variations so every dish is just a scalable ingredient list.
-- Previous recipe variation JSON used flour-specific baker percentages. Convert those
-- formulas into concrete ingredient amounts while keeping variation tabs.
UPDATE recipes
SET variations = converted.variations
FROM (
  SELECT
    recipes.id,
    COALESCE(jsonb_agg(converted_variation.variation ORDER BY converted_variation.ordinality), '[]'::jsonb) AS variations
  FROM recipes
  CROSS JOIN LATERAL jsonb_array_elements(recipes.variations) WITH ORDINALITY AS source_variation(value, ordinality)
  CROSS JOIN LATERAL (
    WITH source_ingredients AS (
      SELECT
        source_variation.value,
        COALESCE((source_variation.value ->> 'total_flour_grams')::numeric, 1) AS total_flour_grams
    ),
    converted_ingredients AS (
      SELECT
        jsonb_agg(ingredient ORDER BY sort_order) AS ingredients,
        (jsonb_agg(ingredient ORDER BY sort_order) -> 0 ->> 'id') AS first_ingredient_id
      FROM (
        SELECT
          flour.ordinality AS sort_order,
          jsonb_build_object(
            'id', COALESCE(flour.value ->> 'id', gen_random_uuid()::text),
            'name', COALESCE(flour.value ->> 'name', ''),
            'amount', ROUND(
              (COALESCE((flour.value ->> 'percent')::numeric, 0) / 100)
              * source_ingredients.total_flour_grams,
              3
            ),
            'unit', 'g'
          ) AS ingredient
        FROM source_ingredients
        CROSS JOIN LATERAL jsonb_array_elements(COALESCE(source_ingredients.value -> 'flour_blend', '[]'::jsonb)) WITH ORDINALITY AS flour(value, ordinality)
        WHERE source_ingredients.value ? 'flour_blend'

        UNION ALL

        SELECT
          1000 + ingredient.ordinality AS sort_order,
          jsonb_build_object(
            'id', COALESCE(ingredient.value ->> 'id', gen_random_uuid()::text),
            'name', COALESCE(ingredient.value ->> 'name', ''),
            'amount', ROUND(
              (COALESCE((ingredient.value ->> 'percent_of_flour')::numeric, 0) / 100)
              * source_ingredients.total_flour_grams,
              3
            ),
            'unit', 'g'
          ) AS ingredient
        FROM source_ingredients
        CROSS JOIN LATERAL jsonb_array_elements(COALESCE(source_ingredients.value -> 'ingredients', '[]'::jsonb)) WITH ORDINALITY AS ingredient(value, ordinality)
        WHERE source_ingredients.value ? 'flour_blend'

        UNION ALL

        SELECT
          ingredient.ordinality AS sort_order,
          jsonb_build_object(
            'id', COALESCE(ingredient.value ->> 'id', gen_random_uuid()::text),
            'name', COALESCE(ingredient.value ->> 'name', ''),
            'amount', COALESCE((ingredient.value ->> 'amount')::numeric, 0),
            'unit', CASE
              WHEN lower(COALESCE(ingredient.value ->> 'unit', 'g')) = 'lb' THEN 'lb'
              ELSE 'g'
            END
          ) AS ingredient
        FROM source_ingredients
        CROSS JOIN LATERAL jsonb_array_elements(COALESCE(source_ingredients.value -> 'ingredients', '[]'::jsonb)) WITH ORDINALITY AS ingredient(value, ordinality)
        WHERE NOT (source_ingredients.value ? 'flour_blend')
      ) AS ingredient_rows
      WHERE ingredient ->> 'name' <> ''
        AND COALESCE((ingredient ->> 'amount')::numeric, 0) > 0
    )
    SELECT
      source_variation.ordinality,
      jsonb_build_object(
        'id', COALESCE(source_variation.value ->> 'id', gen_random_uuid()::text),
        'name', COALESCE(NULLIF(source_variation.value ->> 'name', ''), 'Variation'),
        'scale_anchor_ingredient_id', COALESCE(
          source_variation.value ->> 'scale_anchor_ingredient_id',
          converted_ingredients.first_ingredient_id
        ),
        'ingredients', COALESCE(converted_ingredients.ingredients, '[]'::jsonb)
      ) AS variation
    FROM converted_ingredients
  ) AS converted_variation
  WHERE jsonb_typeof(recipes.variations) = 'array'
  GROUP BY recipes.id
) AS converted
WHERE recipes.id = converted.id;

NOTIFY pgrst, 'reload schema';
