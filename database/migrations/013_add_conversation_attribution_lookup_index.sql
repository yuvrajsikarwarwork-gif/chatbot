CREATE INDEX IF NOT EXISTS idx_conversations_attribution_lookup
ON conversations(
    contact_id,
    channel,
    campaign_id,
    channel_id,
    entry_point_id,
    updated_at DESC
);
