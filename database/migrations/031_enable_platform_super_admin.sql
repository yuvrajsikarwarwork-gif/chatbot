ALTER TABLE users
    ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user';

UPDATE users
SET role = COALESCE(NULLIF(role, ''), 'user')
WHERE role IS NULL OR role = '';
