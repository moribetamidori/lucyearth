ALTER TABLE sport_entries
  ADD COLUMN IF NOT EXISTS sets_count INTEGER CHECK (sets_count IS NULL OR sets_count >= 1),
  ADD COLUMN IF NOT EXISTS reps_count INTEGER CHECK (reps_count IS NULL OR reps_count >= 1);

NOTIFY pgrst, 'reload schema';
