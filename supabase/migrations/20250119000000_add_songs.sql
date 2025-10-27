-- Create songs table
CREATE TABLE IF NOT EXISTS songs (
  id BIGSERIAL PRIMARY KEY,
  anon_id TEXT NOT NULL,
  title TEXT NOT NULL,
  artist TEXT,
  album TEXT,
  duration NUMERIC,
  file_url TEXT NOT NULL,
  cover_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()) NOT NULL
);

-- Create index on anon_id for faster queries
CREATE INDEX idx_songs_anon_id ON songs(anon_id);

-- Enable Row Level Security
ALTER TABLE songs ENABLE ROW LEVEL SECURITY;

-- Create policy to allow all operations (since we're using anon_id)
CREATE POLICY "Allow all operations on songs" ON songs
  FOR ALL
  USING (true)
  WITH CHECK (true);
