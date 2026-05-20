-- Correct sports logs that used a UTC-derived default date.
-- Only changes rows where the saved achieved_on date exactly matches the
-- UTC calendar date of creation, but differs from the New York local date.
UPDATE sport_entries
SET achieved_on = (created_at AT TIME ZONE 'America/New_York')::date
WHERE achieved_on = (created_at AT TIME ZONE 'UTC')::date
  AND achieved_on <> (created_at AT TIME ZONE 'America/New_York')::date;

NOTIFY pgrst, 'reload schema';
