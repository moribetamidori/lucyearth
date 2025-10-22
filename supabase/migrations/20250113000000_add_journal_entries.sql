-- Create journal_entries table
CREATE TABLE journal_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  anon_id TEXT,
  entry_text TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add indexes for performance
CREATE INDEX idx_journal_entries_anon_id ON journal_entries(anon_id);
CREATE INDEX idx_journal_entries_created_at ON journal_entries(created_at DESC);

-- Enable Row Level Security
ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Enable read access for all users" ON journal_entries
  FOR SELECT USING (true);

CREATE POLICY "Enable insert for all users" ON journal_entries
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Enable update for all users" ON journal_entries
  FOR UPDATE USING (true);

CREATE POLICY "Enable delete for all users" ON journal_entries
  FOR DELETE USING (true);

-- Auto-update updated_at timestamp
CREATE TRIGGER update_journal_entries_updated_at
  BEFORE UPDATE ON journal_entries
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
