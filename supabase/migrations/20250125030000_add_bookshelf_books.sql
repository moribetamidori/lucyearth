-- Pixel bookshelf: store book dimensions, color, and cover art
CREATE TABLE IF NOT EXISTS bookshelf_books (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  author TEXT,
  spine_color TEXT NOT NULL DEFAULT '#d9d2c5',
  height INTEGER NOT NULL DEFAULT 180 CHECK (height > 0),
  width INTEGER NOT NULL DEFAULT 22 CHECK (width > 0),
  length INTEGER NOT NULL DEFAULT 120 CHECK (length > 0),
  cover_url TEXT,
  spine_texture TEXT,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW())
);

CREATE INDEX IF NOT EXISTS idx_bookshelf_books_order
  ON bookshelf_books(order_index);

ALTER TABLE bookshelf_books ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations on bookshelf_books"
  ON bookshelf_books
  FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE TRIGGER update_bookshelf_books_updated_at
  BEFORE UPDATE ON bookshelf_books
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Public storage bucket for book covers
INSERT INTO storage.buckets (id, name, public)
VALUES ('book-covers', 'book-covers', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Allow public access to book covers" ON storage.objects
  FOR SELECT
  USING (bucket_id = 'book-covers');

CREATE POLICY "Allow authenticated uploads to book covers" ON storage.objects
  FOR INSERT
  WITH CHECK (bucket_id = 'book-covers');

CREATE POLICY "Allow authenticated deletes from book covers" ON storage.objects
  FOR DELETE
  USING (bucket_id = 'book-covers');
