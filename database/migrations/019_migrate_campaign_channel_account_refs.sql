ALTER TABLE campaign_channels
    ADD COLUMN IF NOT EXISTS platform_account_ref_id UUID;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_campaign_channels_platform_account'
    ) THEN
        ALTER TABLE campaign_channels
            ADD CONSTRAINT fk_campaign_channels_platform_account
            FOREIGN KEY (platform_account_ref_id)
            REFERENCES platform_accounts(id)
            ON DELETE SET NULL;
    END IF;
END $$;

INSERT INTO platform_accounts (
    user_id,
    workspace_id,
    platform_type,
    name,
    phone_number,
    account_id,
    token,
    business_id,
    status,
    metadata
)
SELECT
    cc.user_id,
    c.workspace_id,
    COALESCE(cc.platform_type, cc.platform) AS platform_type,
    COALESCE(NULLIF(cc.name, ''), cc.platform_account_id) AS name,
    CASE
        WHEN COALESCE(cc.platform_type, cc.platform) = 'whatsapp'
            THEN NULLIF(cc.platform_account_id, '')
        ELSE NULL
    END AS phone_number,
    NULLIF(cc.platform_account_id, '') AS account_id,
    NULLIF(cc.config->>'accessToken', '') AS token,
    NULLIF(cc.config->>'businessId', '') AS business_id,
    COALESCE(NULLIF(cc.status, ''), 'active') AS status,
    jsonb_build_object(
        'migrated_from', 'campaign_channels.platform_account_id',
        'campaign_channel_id', cc.id
    ) AS metadata
FROM campaign_channels cc
JOIN campaigns c ON c.id = cc.campaign_id
WHERE NULLIF(cc.platform_account_id, '') IS NOT NULL
  AND NOT EXISTS (
      SELECT 1
      FROM platform_accounts pa
      WHERE pa.user_id = cc.user_id
        AND pa.platform_type = COALESCE(cc.platform_type, cc.platform)
        AND pa.account_id = cc.platform_account_id
  );

UPDATE campaign_channels cc
SET platform_account_ref_id = pa.id
FROM platform_accounts pa
WHERE cc.platform_account_ref_id IS NULL
  AND pa.user_id = cc.user_id
  AND pa.platform_type = COALESCE(cc.platform_type, cc.platform)
  AND pa.account_id = cc.platform_account_id;

CREATE INDEX IF NOT EXISTS idx_campaign_channels_account_ref
ON campaign_channels(platform_account_ref_id);
