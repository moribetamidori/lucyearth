-- Remove the unique constraint on date to allow multiple entries per day
-- Drop the old primary key constraint on date
ALTER TABLE calendar_entries DROP CONSTRAINT IF EXISTS calendar_entries_pkey;

-- Drop the unique key constraint on date
ALTER TABLE calendar_entries DROP CONSTRAINT IF EXISTS calendar_entries_date_key;

-- Add an id column as the new primary key
ALTER TABLE calendar_entries ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid() PRIMARY KEY;

-- Create an index on date for better query performance
CREATE INDEX IF NOT EXISTS idx_calendar_entries_date ON calendar_entries(date);
