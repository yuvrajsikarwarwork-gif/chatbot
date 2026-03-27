ALTER TABLE conversations
    ADD COLUMN IF NOT EXISTS platform TEXT;

UPDATE conversations
SET
    channel = CASE WHEN channel = 'web' THEN 'website' ELSE channel END,
    platform = CASE
        WHEN COALESCE(platform, channel) = 'web' THEN 'website'
        ELSE COALESCE(platform, channel)
    END,
    context_json = jsonb_set(
        COALESCE(context_json, '{}'::jsonb),
        '{platform}',
        to_jsonb(
            CASE
                WHEN COALESCE(context_json->>'platform', platform, channel) = 'web' THEN 'website'
                ELSE COALESCE(context_json->>'platform', platform, channel, 'whatsapp')
            END
        ),
        true
    )
WHERE channel = 'web'
   OR platform IS NULL
   OR platform = 'web'
   OR context_json->>'platform' = 'web'
   OR context_json->>'platform' IS NULL;

UPDATE leads
SET platform = CASE WHEN platform = 'web' THEN 'website' ELSE platform END
WHERE platform = 'web';

UPDATE campaign_channels
SET platform = CASE WHEN platform = 'web' THEN 'website' ELSE platform END
WHERE platform = 'web';

UPDATE entry_points
SET platform = CASE WHEN platform = 'web' THEN 'website' ELSE platform END
WHERE platform = 'web';

UPDATE lists
SET platform = CASE WHEN platform = 'web' THEN 'website' ELSE platform END
WHERE platform = 'web';

UPDATE integrations
SET channel = CASE WHEN channel = 'web' THEN 'website' ELSE channel END
WHERE channel = 'web';

UPDATE templates
SET platform_type = CASE WHEN platform_type = 'web' THEN 'website' ELSE platform_type END
WHERE platform_type = 'web';
