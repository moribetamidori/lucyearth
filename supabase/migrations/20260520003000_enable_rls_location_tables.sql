ALTER TABLE public.location_pins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.location_pin_images ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all operations on location_pins"
  ON public.location_pins;

CREATE POLICY "Allow all operations on location_pins"
  ON public.location_pins
  FOR ALL
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all operations on location_pin_images"
  ON public.location_pin_images;

CREATE POLICY "Allow all operations on location_pin_images"
  ON public.location_pin_images
  FOR ALL
  USING (true)
  WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
