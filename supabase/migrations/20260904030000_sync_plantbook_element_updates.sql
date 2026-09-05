-- Keep legacy element display columns synchronized when a shared element is
-- edited. element_id remains the source of truth for current clients.
CREATE OR REPLACE FUNCTION sync_plantbook_element_references()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE plantbook_entries
  SET
    element_title = NEW.title,
    element_image_url = NEW.image_url,
    element_image_path = NEW.image_path
  WHERE element_id = NEW.id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sync_plantbook_element_references_trigger ON plantbook_elements;
CREATE TRIGGER sync_plantbook_element_references_trigger
  AFTER UPDATE OF title, image_url, image_path ON plantbook_elements
  FOR EACH ROW
  EXECUTE FUNCTION sync_plantbook_element_references();

NOTIFY pgrst, 'reload schema';
