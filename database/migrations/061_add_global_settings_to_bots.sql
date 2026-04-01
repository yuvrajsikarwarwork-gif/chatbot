ALTER TABLE bots
  ADD COLUMN IF NOT EXISTS global_settings JSONB NOT NULL DEFAULT '{}'::jsonb;

UPDATE bots
SET global_settings = COALESCE(global_settings, settings_json, '{}'::jsonb),
    updated_at = NOW()
WHERE COALESCE(global_settings, '{}'::jsonb) = '{}'::jsonb
  AND COALESCE(settings_json, '{}'::jsonb) <> '{}'::jsonb;
