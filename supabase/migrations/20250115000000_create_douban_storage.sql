-- Create storage bucket for douban images
INSERT INTO storage.buckets (id, name, public)
VALUES ('douban-images', 'douban-images', true)
ON CONFLICT (id) DO NOTHING;

-- Set up storage policy to allow all operations
CREATE POLICY "Enable all operations for douban-images" ON storage.objects
  FOR ALL
  USING (bucket_id = 'douban-images')
  WITH CHECK (bucket_id = 'douban-images');
