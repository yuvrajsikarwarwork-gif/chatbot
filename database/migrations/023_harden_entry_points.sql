CREATE UNIQUE INDEX IF NOT EXISTS uq_entry_points_channel_key_normalized
ON entry_points(channel_id, lower(entry_key));

CREATE UNIQUE INDEX IF NOT EXISTS uq_entry_points_channel_source_ref
ON entry_points(channel_id, lower(source_ref))
WHERE source_ref IS NOT NULL
  AND btrim(source_ref) <> '';
