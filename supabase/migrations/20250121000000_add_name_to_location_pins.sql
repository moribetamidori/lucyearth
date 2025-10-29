-- Add name field to location_pins table
ALTER TABLE location_pins
ADD COLUMN name TEXT;

-- Optional: Add a comment explaining the field
COMMENT ON COLUMN location_pins.name IS 'Display name for the location pin';
