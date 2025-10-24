-- Create douban_ratings table
CREATE TABLE IF NOT EXISTS douban_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  anon_id TEXT,
  title TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('movie', 'tv', 'book', 'music', 'game')),
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  image_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create index on anon_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_douban_ratings_anon_id ON douban_ratings(anon_id);

-- Create index on category for filtering
CREATE INDEX IF NOT EXISTS idx_douban_ratings_category ON douban_ratings(category);

-- Create index on created_at for sorting
CREATE INDEX IF NOT EXISTS idx_douban_ratings_created_at ON douban_ratings(created_at DESC);

-- Enable Row Level Security
ALTER TABLE douban_ratings ENABLE ROW LEVEL SECURITY;

-- Create policy to allow all operations (since we're using anon users)
CREATE POLICY "Enable all operations for douban_ratings" ON douban_ratings
  FOR ALL
  USING (true)
  WITH CHECK (true);
