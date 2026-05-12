-- Stonks is a shared tracker, not per-browser anonymous user state.
-- Seed the shared row set from existing per-anon rows so current progress remains visible.
WITH ranked_entries AS (
  SELECT
    entry_year,
    month_index,
    k_made,
    active,
    ROW_NUMBER() OVER (
      PARTITION BY entry_year, month_index
      ORDER BY updated_at DESC, created_at DESC
    ) AS rank
  FROM public.stonks_monthly_entries
  WHERE anon_id <> 'shared'
),
shared_entries AS (
  SELECT
    'shared'::text AS anon_id,
    entry_year,
    month_index,
    k_made,
    active
  FROM ranked_entries
  WHERE rank = 1
)
INSERT INTO public.stonks_monthly_entries (
  anon_id,
  entry_year,
  month_index,
  k_made,
  active
)
SELECT
  anon_id,
  entry_year,
  month_index,
  k_made,
  active
FROM shared_entries
ON CONFLICT (anon_id, entry_year, month_index)
DO UPDATE SET
  k_made = EXCLUDED.k_made,
  active = EXCLUDED.active,
  updated_at = NOW();

NOTIFY pgrst, 'reload schema';
