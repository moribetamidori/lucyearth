-- Add notes column to calendar_entries table
ALTER TABLE calendar_entries
ADD COLUMN IF NOT EXISTS notes TEXT;
