-- Higher-tier elements are made by fusing two elements from the same tier.
ALTER TABLE plantbook2_elements
  ADD COLUMN IF NOT EXISTS second_parent_element_id UUID
  REFERENCES plantbook2_elements(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_plantbook2_elements_second_parent
  ON plantbook2_elements(second_parent_element_id);

NOTIFY pgrst, 'reload schema';
