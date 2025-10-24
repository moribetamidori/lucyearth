-- Create location_pins table
CREATE TABLE IF NOT EXISTS location_pins (
  id BIGSERIAL PRIMARY KEY,
  anon_id TEXT NOT NULL,
  location TEXT NOT NULL,
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index on anon_id for faster lookups
CREATE INDEX idx_location_pins_anon_id ON location_pins(anon_id);

-- Create index on timestamp for chronological queries
CREATE INDEX idx_location_pins_timestamp ON location_pins(timestamp DESC);
