-- Create table for multiple images per location pin
CREATE TABLE location_pin_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pin_id INTEGER NOT NULL REFERENCES location_pins(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create index for faster queries
CREATE INDEX idx_location_pin_images_pin_id ON location_pin_images(pin_id);
CREATE INDEX idx_location_pin_images_order ON location_pin_images(pin_id, display_order);

-- Migrate existing images from location_pins to location_pin_images
INSERT INTO location_pin_images (pin_id, image_url, display_order)
SELECT id, image_url, 0
FROM location_pins
WHERE image_url IS NOT NULL;

-- Drop the image_url column from location_pins (keeping the table structure cleaner)
ALTER TABLE location_pins DROP COLUMN image_url;

COMMENT ON TABLE location_pin_images IS 'Stores multiple images for each location pin';
