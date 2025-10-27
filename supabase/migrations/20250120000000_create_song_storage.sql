-- Create storage bucket for song files
INSERT INTO storage.buckets (id, name, public)
VALUES ('songs', 'songs', true)
ON CONFLICT (id) DO NOTHING;

-- Create storage bucket for song covers
INSERT INTO storage.buckets (id, name, public)
VALUES ('song-covers', 'song-covers', true)
ON CONFLICT (id) DO NOTHING;

-- Set up storage policies for songs bucket
CREATE POLICY "Allow public access to songs" ON storage.objects
  FOR SELECT
  USING (bucket_id = 'songs');

CREATE POLICY "Allow authenticated uploads to songs" ON storage.objects
  FOR INSERT
  WITH CHECK (bucket_id = 'songs');

CREATE POLICY "Allow authenticated deletes from songs" ON storage.objects
  FOR DELETE
  USING (bucket_id = 'songs');

-- Set up storage policies for song-covers bucket
CREATE POLICY "Allow public access to song covers" ON storage.objects
  FOR SELECT
  USING (bucket_id = 'song-covers');

CREATE POLICY "Allow authenticated uploads to song covers" ON storage.objects
  FOR INSERT
  WITH CHECK (bucket_id = 'song-covers');

CREATE POLICY "Allow authenticated deletes from song covers" ON storage.objects
  FOR DELETE
  USING (bucket_id = 'song-covers');
