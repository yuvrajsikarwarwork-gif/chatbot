ALTER TABLE lists
DROP CONSTRAINT IF EXISTS uq_lists_user_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_lists_campaign_key_normalized
ON lists(campaign_id, lower(list_key));

CREATE UNIQUE INDEX IF NOT EXISTS uq_lists_entry_point_system
ON lists(entry_point_id)
WHERE entry_point_id IS NOT NULL
  AND is_system = true;
