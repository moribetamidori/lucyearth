-- Create poop_images table
CREATE TABLE IF NOT EXISTS poop_images (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  image_url TEXT NOT NULL,
  label TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Create calendar_entries table
CREATE TABLE IF NOT EXISTS calendar_entries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  date DATE NOT NULL UNIQUE,
  poop_image_id UUID REFERENCES poop_images(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Create index on date for faster lookups
CREATE INDEX IF NOT EXISTS calendar_entries_date_idx ON calendar_entries(date);

-- Enable Row Level Security
ALTER TABLE poop_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_entries ENABLE ROW LEVEL SECURITY;

-- Create policies (allow all operations for now - adjust based on your auth needs)
CREATE POLICY "Allow all operations on poop_images" ON poop_images FOR ALL USING (true);
CREATE POLICY "Allow all operations on calendar_entries" ON calendar_entries FOR ALL USING (true);
