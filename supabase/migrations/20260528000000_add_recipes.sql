-- Recipes: image-backed cards with structured ingredient measurements.
CREATE TABLE IF NOT EXISTS recipes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  ingredients JSONB NOT NULL DEFAULT '[]'::jsonb,
  image_url TEXT,
  anon_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW()),
  CONSTRAINT recipes_name_not_blank CHECK (btrim(name) <> ''),
  CONSTRAINT recipes_ingredients_array CHECK (jsonb_typeof(ingredients) = 'array')
);

CREATE INDEX IF NOT EXISTS idx_recipes_created_at
  ON recipes(created_at DESC);

ALTER TABLE recipes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations on recipes"
  ON recipes
  FOR ALL
  USING (true)
  WITH CHECK (true);

DROP TRIGGER IF EXISTS update_recipes_updated_at ON recipes;
CREATE TRIGGER update_recipes_updated_at
  BEFORE UPDATE ON recipes
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Public storage bucket for recipe images.
INSERT INTO storage.buckets (id, name, public)
VALUES ('recipe-images', 'recipe-images', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Allow public access to recipe images"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'recipe-images');

CREATE POLICY "Allow uploads to recipe images"
  ON storage.objects
  FOR INSERT
  WITH CHECK (bucket_id = 'recipe-images');

CREATE POLICY "Allow deletes from recipe images"
  ON storage.objects
  FOR DELETE
  USING (bucket_id = 'recipe-images');

NOTIFY pgrst, 'reload schema';
