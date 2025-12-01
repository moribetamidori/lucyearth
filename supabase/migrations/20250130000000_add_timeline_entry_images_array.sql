-- Support multiple images per timeline entry
ALTER TABLE timeline_entries
  ADD COLUMN IF NOT EXISTS image_urls TEXT[],
  ADD COLUMN IF NOT EXISTS image_filenames TEXT[];

-- Backfill the array fields from the legacy single-image columns
UPDATE timeline_entries
SET
  image_urls = CASE
    WHEN image_urls IS NULL AND image_url IS NOT NULL THEN ARRAY[image_url]
    ELSE image_urls
  END,
  image_filenames = CASE
    WHEN image_filenames IS NULL AND image_filename IS NOT NULL THEN ARRAY[image_filename]
    ELSE image_filenames
  END;
