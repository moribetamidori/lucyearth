-- Allow editing of existing FindMe highlights
CREATE POLICY "Allow update access to findme entries" ON public.findme_entries
  FOR UPDATE USING (true)
  WITH CHECK (true);
