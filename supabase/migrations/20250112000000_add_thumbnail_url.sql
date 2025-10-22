-- Add thumbnail_url column to cat_pictures table
ALTER TABLE cat_pictures
ADD COLUMN thumbnail_url TEXT;

-- Add thumbnail_url column to arena_blocks table
ALTER TABLE arena_blocks
ADD COLUMN thumbnail_url TEXT;
