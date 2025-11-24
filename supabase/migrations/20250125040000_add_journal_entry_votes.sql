-- Add upvote count to journal entries
ALTER TABLE journal_entries
ADD COLUMN upvote_count INTEGER NOT NULL DEFAULT 0;

-- Table to track per-anon journal entry votes
CREATE TABLE journal_entry_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id UUID NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  anon_id TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE (entry_id, anon_id)
);

-- Helpful indexes
CREATE INDEX idx_journal_entry_votes_entry_id ON journal_entry_votes(entry_id);
CREATE INDEX idx_journal_entry_votes_anon_id ON journal_entry_votes(anon_id);

-- Enable Row Level Security
ALTER TABLE journal_entry_votes ENABLE ROW LEVEL SECURITY;

-- Policies - open to all anonymous users
CREATE POLICY "Allow select for all users" ON journal_entry_votes
  FOR SELECT USING (true);

CREATE POLICY "Allow insert for all users" ON journal_entry_votes
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow delete for all users" ON journal_entry_votes
  FOR DELETE USING (true);

-- Functions to keep journal_entries.upvote_count in sync
CREATE OR REPLACE FUNCTION increment_journal_entry_upvote_count()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE journal_entries
  SET upvote_count = upvote_count + 1,
      updated_at = NOW()
  WHERE id = NEW.entry_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION decrement_journal_entry_upvote_count()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE journal_entries
  SET upvote_count = GREATEST(upvote_count - 1, 0),
      updated_at = NOW()
  WHERE id = OLD.entry_id;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- Triggers to update counts on vote insert/delete
CREATE TRIGGER journal_entry_upvote_insert
AFTER INSERT ON journal_entry_votes
FOR EACH ROW
EXECUTE FUNCTION increment_journal_entry_upvote_count();

CREATE TRIGGER journal_entry_upvote_delete
AFTER DELETE ON journal_entry_votes
FOR EACH ROW
EXECUTE FUNCTION decrement_journal_entry_upvote_count();
