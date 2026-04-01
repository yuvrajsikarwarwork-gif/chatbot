ALTER TABLE bots
  ADD COLUMN IF NOT EXISTS settings_json JSONB NOT NULL DEFAULT '{}'::jsonb;

UPDATE bots
SET settings_json = COALESCE(settings_json, '{}'::jsonb);
