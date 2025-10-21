-- Add user_number field to anon_users table
ALTER TABLE anon_users ADD COLUMN IF NOT EXISTS user_number INTEGER;

-- Create a sequence for auto-incrementing user numbers
CREATE SEQUENCE IF NOT EXISTS user_number_seq START WITH 1;

-- Populate existing users with sequential numbers based on creation order
UPDATE anon_users
SET user_number = subquery.row_num
FROM (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at ASC) as row_num
  FROM anon_users
  WHERE user_number IS NULL
) AS subquery
WHERE anon_users.id = subquery.id;

-- Create a function to auto-assign user numbers
CREATE OR REPLACE FUNCTION assign_user_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.user_number IS NULL THEN
    NEW.user_number := nextval('user_number_seq');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create a trigger to automatically assign user numbers on insert
DROP TRIGGER IF EXISTS assign_user_number_trigger ON anon_users;
CREATE TRIGGER assign_user_number_trigger
  BEFORE INSERT ON anon_users
  FOR EACH ROW
  EXECUTE FUNCTION assign_user_number();

-- Set the sequence to the correct value (max existing user_number + 1)
SELECT setval('user_number_seq', COALESCE((SELECT MAX(user_number) FROM anon_users), 0) + 1, false);
