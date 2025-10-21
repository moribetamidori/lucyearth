-- Create arena_collections table
CREATE TABLE IF NOT EXISTS public.arena_collections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  anon_id text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create arena_blocks table (images within collections)
CREATE TABLE IF NOT EXISTS public.arena_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id uuid REFERENCES public.arena_collections(id) ON DELETE CASCADE,
  image_url text NOT NULL,
  anon_id text,
  created_at timestamptz DEFAULT now()
);

-- Create storage bucket for arena images
INSERT INTO storage.buckets (id, name, public)
VALUES ('arena-blocks', 'arena-blocks', true)
ON CONFLICT (id) DO NOTHING;

-- Enable RLS
ALTER TABLE public.arena_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.arena_blocks ENABLE ROW LEVEL SECURITY;

-- RLS policies for arena_collections (allow all operations)
CREATE POLICY "Allow all operations on arena_collections"
ON public.arena_collections
FOR ALL
USING (true)
WITH CHECK (true);

-- RLS policies for arena_blocks (allow all operations)
CREATE POLICY "Allow all operations on arena_blocks"
ON public.arena_blocks
FOR ALL
USING (true)
WITH CHECK (true);

-- Storage policies for arena-blocks bucket
CREATE POLICY "Allow public read access to arena-blocks"
ON storage.objects FOR SELECT
USING (bucket_id = 'arena-blocks');

CREATE POLICY "Allow public insert access to arena-blocks"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'arena-blocks');

CREATE POLICY "Allow public delete access to arena-blocks"
ON storage.objects FOR DELETE
USING (bucket_id = 'arena-blocks');

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_arena_collections_created_at ON public.arena_collections(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_arena_blocks_collection_id ON public.arena_blocks(collection_id);
CREATE INDEX IF NOT EXISTS idx_arena_blocks_created_at ON public.arena_blocks(created_at DESC);

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_arena_collection_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_arena_collection_updated_at_trigger
BEFORE UPDATE ON public.arena_collections
FOR EACH ROW
EXECUTE FUNCTION update_arena_collection_updated_at();
