-- Add birth_year column to women_profiles table
ALTER TABLE women_profiles ADD COLUMN IF NOT EXISTS birth_year INTEGER;

-- Create index for chronological sorting
CREATE INDEX IF NOT EXISTS idx_women_profiles_birth_year ON women_profiles (birth_year);
