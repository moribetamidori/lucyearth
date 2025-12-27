-- Wishlist items: store items with image, title, link, and purchased status
CREATE TABLE IF NOT EXISTS wishlist_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  image_url TEXT,
  link_url TEXT,
  is_purchased BOOLEAN NOT NULL DEFAULT FALSE,
  order_index INTEGER NOT NULL DEFAULT 0,
  anon_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW())
);

CREATE INDEX IF NOT EXISTS idx_wishlist_items_order
  ON wishlist_items(is_purchased, order_index);

ALTER TABLE wishlist_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations on wishlist_items"
  ON wishlist_items
  FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE TRIGGER update_wishlist_items_updated_at
  BEFORE UPDATE ON wishlist_items
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Public storage bucket for wishlist images
INSERT INTO storage.buckets (id, name, public)
VALUES ('wishlist-images', 'wishlist-images', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Allow public access to wishlist images" ON storage.objects
  FOR SELECT
  USING (bucket_id = 'wishlist-images');

CREATE POLICY "Allow authenticated uploads to wishlist images" ON storage.objects
  FOR INSERT
  WITH CHECK (bucket_id = 'wishlist-images');

CREATE POLICY "Allow authenticated deletes from wishlist images" ON storage.objects
  FOR DELETE
  USING (bucket_id = 'wishlist-images');
