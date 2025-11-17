-- Create child_calendar_entries table for CHILD.CAL
CREATE TABLE IF NOT EXISTS child_calendar_entries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  date DATE NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'none' CHECK (status IN ('none', 'yes', 'maybe', 'no')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Index for fast lookups by date
CREATE INDEX IF NOT EXISTS idx_child_calendar_entries_date ON child_calendar_entries(date);

-- Enable Row Level Security and add an open policy (adjust later if auth rules change)
ALTER TABLE child_calendar_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all operations on child_calendar_entries" ON child_calendar_entries FOR ALL USING (true);
