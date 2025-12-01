-- Add highlight color and extra rating metrics to findme_entries
ALTER TABLE public.findme_entries
  ADD COLUMN highlight_color TEXT NOT NULL DEFAULT '#6366f1',
  ADD COLUMN food_rating SMALLINT NOT NULL DEFAULT 3,
  ADD COLUMN culture_rating SMALLINT NOT NULL DEFAULT 3,
  ADD COLUMN livability_rating SMALLINT NOT NULL DEFAULT 3;
