ALTER TABLE campaign_channels
    ADD COLUMN IF NOT EXISTS platform_type TEXT,
    ADD COLUMN IF NOT EXISTS platform_account_id TEXT,
    ADD COLUMN IF NOT EXISTS flow_id UUID,
    ADD COLUMN IF NOT EXISTS list_id UUID,
    ADD COLUMN IF NOT EXISTS settings_json JSONB NOT NULL DEFAULT '{}'::jsonb;

UPDATE campaign_channels
SET
    platform_type = COALESCE(platform_type, platform),
    flow_id = COALESCE(flow_id, default_flow_id),
    settings_json = COALESCE(settings_json, '{}'::jsonb);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_campaign_channels_flow'
    ) THEN
        ALTER TABLE campaign_channels
            ADD CONSTRAINT fk_campaign_channels_flow
            FOREIGN KEY (flow_id)
            REFERENCES flows(id)
            ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_campaign_channels_list'
    ) THEN
        ALTER TABLE campaign_channels
            ADD CONSTRAINT fk_campaign_channels_list
            FOREIGN KEY (list_id)
            REFERENCES lists(id)
            ON DELETE SET NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_campaign_channels_platform_type
ON campaign_channels(campaign_id, platform_type, status);

CREATE INDEX IF NOT EXISTS idx_campaign_channels_account
ON campaign_channels(platform_type, platform_account_id);
