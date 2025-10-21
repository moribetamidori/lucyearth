-- Create activity_logs table to track user actions
CREATE TABLE IF NOT EXISTS activity_logs (
  id BIGSERIAL PRIMARY KEY,
  anon_id TEXT NOT NULL,
  action TEXT NOT NULL,
  details TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index on anon_id for faster queries
CREATE INDEX idx_activity_logs_anon_id ON activity_logs(anon_id);

-- Create index on created_at for sorting
CREATE INDEX idx_activity_logs_created_at ON activity_logs(created_at DESC);

-- Enable RLS
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;

-- Create policy to allow anyone to insert logs
CREATE POLICY "Allow insert for all users" ON activity_logs
  FOR INSERT
  TO public
  WITH CHECK (true);

-- Create policy to allow users to read their own logs
CREATE POLICY "Allow read own logs" ON activity_logs
  FOR SELECT
  TO public
  USING (true);
