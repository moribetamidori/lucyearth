-- Add spine font color and size controls for bookshelf books
ALTER TABLE bookshelf_books
  ADD COLUMN IF NOT EXISTS spine_font_color TEXT NOT NULL DEFAULT '#0f172a',
  ADD COLUMN IF NOT EXISTS spine_font_size INTEGER NOT NULL DEFAULT 12 CHECK (spine_font_size > 6 AND spine_font_size <= 32);
