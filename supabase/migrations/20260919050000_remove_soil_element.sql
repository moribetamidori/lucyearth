-- Soil does not belong in the element system. Preserve every plant and recipe
-- by moving its three combinations to Root before removing only the element.
UPDATE plantbook2_crafts craft
SET element_id = root_element.id
FROM plantbook2_elements soil_element, plantbook2_elements root_element
WHERE soil_element.title = 'Soil'
  AND root_element.title = 'Root'
  AND craft.element_id = soil_element.id;

DELETE FROM plantbook2_elements
WHERE title = 'Soil' AND ai_generated = true;

NOTIFY pgrst, 'reload schema';
