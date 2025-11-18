-- Storage bucket for Garden species imagery
INSERT INTO storage.buckets (id, name, public)
VALUES ('garden-species', 'garden-species', true)
ON CONFLICT (id) DO NOTHING;

-- Allow anyone to view garden photos
CREATE POLICY "Allow public read on garden-species"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'garden-species');

-- Allow uploads from the anon key (matches other content buckets)
CREATE POLICY "Allow uploads to garden-species"
  ON storage.objects
  FOR INSERT
  WITH CHECK (bucket_id = 'garden-species');

-- Allow deletes on garden-species (protects unwanted files)
CREATE POLICY "Allow deletes on garden-species"
  ON storage.objects
  FOR DELETE
  USING (bucket_id = 'garden-species');
