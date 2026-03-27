ALTER TABLE templates
  ADD COLUMN IF NOT EXISTS campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_templates_campaign_id
  ON templates(campaign_id);
