-- Add polygon boundary json to FindMe entries
ALTER TABLE public.findme_entries
ADD COLUMN boundary_geojson JSONB;

-- Optional: store area for quick filtering
ALTER TABLE public.findme_entries
ADD COLUMN area_sq_km DOUBLE PRECISION;
