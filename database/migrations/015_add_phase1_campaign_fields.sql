ALTER TABLE campaigns
    ADD COLUMN IF NOT EXISTS workspace_id UUID,
    ADD COLUMN IF NOT EXISTS created_by UUID,
    ADD COLUMN IF NOT EXISTS start_date DATE,
    ADD COLUMN IF NOT EXISTS end_date DATE,
    ADD COLUMN IF NOT EXISTS default_flow_id UUID,
    ADD COLUMN IF NOT EXISTS settings_json JSONB NOT NULL DEFAULT '{}'::jsonb;

UPDATE campaigns
SET
    created_by = COALESCE(created_by, user_id),
    settings_json = COALESCE(settings_json, '{}'::jsonb);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_campaigns_created_by'
    ) THEN
        ALTER TABLE campaigns
            ADD CONSTRAINT fk_campaigns_created_by
            FOREIGN KEY (created_by)
            REFERENCES users(id)
            ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_campaigns_default_flow'
    ) THEN
        ALTER TABLE campaigns
            ADD CONSTRAINT fk_campaigns_default_flow
            FOREIGN KEY (default_flow_id)
            REFERENCES flows(id)
            ON DELETE SET NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_campaigns_created_by
ON campaigns(created_by, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_campaigns_default_flow
ON campaigns(default_flow_id);
