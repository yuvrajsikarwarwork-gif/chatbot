ALTER TABLE templates
  ADD COLUMN IF NOT EXISTS meta_template_id TEXT,
  ADD COLUMN IF NOT EXISTS meta_template_name TEXT,
  ADD COLUMN IF NOT EXISTS meta_last_synced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS meta_payload JSONB;

CREATE INDEX IF NOT EXISTS idx_templates_meta_template_id
  ON templates(meta_template_id);

CREATE INDEX IF NOT EXISTS idx_templates_meta_template_name
  ON templates(meta_template_name);
