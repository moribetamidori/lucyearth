-- PCEA: free-form event location (address or place name), used to draw the day's driving route.
alter table public.pcea_events
  add column location text check (location is null or char_length(btrim(location)) between 1 and 300);
