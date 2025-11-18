-- Create substack_articles table to store outbound posts
CREATE TABLE IF NOT EXISTS substack_articles (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  link TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()) NOT NULL
);

-- Helpful indexes for ordering/filtering
CREATE INDEX IF NOT EXISTS idx_substack_articles_created_at
  ON substack_articles(created_at DESC);

-- Enable row level security
ALTER TABLE substack_articles ENABLE ROW LEVEL SECURITY;

-- Allow CRUD actions from the anon key (matches other content tables)
CREATE POLICY "Allow all operations on substack_articles"
  ON substack_articles
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Keep updated_at in sync
CREATE TRIGGER update_substack_articles_updated_at
  BEFORE UPDATE ON substack_articles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
