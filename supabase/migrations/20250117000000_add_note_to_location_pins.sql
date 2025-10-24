-- Add note field to location_pins table
ALTER TABLE location_pins
ADD COLUMN note TEXT;
