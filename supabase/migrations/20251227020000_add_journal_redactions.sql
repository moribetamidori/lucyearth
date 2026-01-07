-- Add redactions column to journal_entries table
-- Stores array of {start, end} character ranges to redact

ALTER TABLE journal_entries
ADD COLUMN redactions JSONB DEFAULT '[]';

-- Add comment for documentation
COMMENT ON COLUMN journal_entries.redactions IS 'Array of {start: number, end: number} objects representing character ranges to redact';
