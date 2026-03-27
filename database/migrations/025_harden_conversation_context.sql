CREATE UNIQUE INDEX IF NOT EXISTS uq_conversations_context_isolation
ON conversations(
  contact_id,
  channel,
  COALESCE(campaign_id, '00000000-0000-0000-0000-000000000000'::uuid),
  COALESCE(channel_id, '00000000-0000-0000-0000-000000000000'::uuid),
  COALESCE(entry_point_id, '00000000-0000-0000-0000-000000000000'::uuid),
  COALESCE(flow_id, '00000000-0000-0000-0000-000000000000'::uuid),
  COALESCE(list_id, '00000000-0000-0000-0000-000000000000'::uuid)
);
