-- Create storage bucket for poop images
INSERT INTO storage.buckets (id, name, public)
VALUES ('poop-images', 'poop-images', true)
ON CONFLICT (id) DO NOTHING;

-- Create storage policy to allow all operations (adjust based on your auth needs)
CREATE POLICY "Allow all operations on poop-images bucket"
ON storage.objects FOR ALL
USING (bucket_id = 'poop-images');

-- Add is_emoji column to distinguish between emojis and uploaded images
ALTER TABLE poop_images
ADD COLUMN IF NOT EXISTS is_emoji BOOLEAN DEFAULT false;

-- Update existing emoji entries
UPDATE poop_images SET is_emoji = true WHERE is_emoji IS NULL;
