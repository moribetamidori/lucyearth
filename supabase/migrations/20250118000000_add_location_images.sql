-- Add image_url field to location_pins table
ALTER TABLE location_pins
ADD COLUMN image_url TEXT;

-- Create storage bucket for location images
INSERT INTO storage.buckets (id, name, public)
VALUES ('location-images', 'location-images', true)
ON CONFLICT (id) DO NOTHING;

-- Set up storage policies for location images
CREATE POLICY "Public Access"
ON storage.objects FOR SELECT
USING (bucket_id = 'location-images');

CREATE POLICY "Authenticated users can upload location images"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'location-images');

CREATE POLICY "Users can update their own location images"
ON storage.objects FOR UPDATE
USING (bucket_id = 'location-images');

CREATE POLICY "Users can delete their own location images"
ON storage.objects FOR DELETE
USING (bucket_id = 'location-images');
