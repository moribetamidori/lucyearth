-- Remove the persisted scale anchor. Scaling is now selected ad hoc in the UI.
UPDATE recipes
SET variations = converted.variations
FROM (
  SELECT
    recipes.id,
    COALESCE(
      jsonb_agg(
        source_variation.value - 'scale_anchor_ingredient_id'
        ORDER BY source_variation.ordinality
      ),
      '[]'::jsonb
    ) AS variations
  FROM recipes
  CROSS JOIN LATERAL jsonb_array_elements(recipes.variations) WITH ORDINALITY AS source_variation(value, ordinality)
  WHERE jsonb_typeof(recipes.variations) = 'array'
  GROUP BY recipes.id
) AS converted
WHERE recipes.id = converted.id;

NOTIFY pgrst, 'reload schema';
