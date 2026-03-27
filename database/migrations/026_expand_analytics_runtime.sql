CREATE TABLE IF NOT EXISTS analytics_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_id UUID,
  conversation_id UUID,
  event_type TEXT NOT NULL,
  event_payload JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE analytics_events
  ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS channel_id UUID REFERENCES campaign_channels(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS entry_point_id UUID REFERENCES entry_points(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS flow_id UUID REFERENCES flows(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS list_id UUID REFERENCES lists(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS lead_id TEXT,
  ADD COLUMN IF NOT EXISTS platform TEXT,
  ADD COLUMN IF NOT EXISTS event_name TEXT,
  ADD COLUMN IF NOT EXISTS actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_analytics_bot'
  ) THEN
    ALTER TABLE analytics_events
      ADD CONSTRAINT fk_analytics_bot
      FOREIGN KEY (bot_id)
      REFERENCES bots(id)
      ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_analytics_conversation'
  ) THEN
    ALTER TABLE analytics_events
      ADD CONSTRAINT fk_analytics_conversation
      FOREIGN KEY (conversation_id)
      REFERENCES conversations(id)
      ON DELETE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS lead_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE SET NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  lead_id TEXT,
  campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
  channel_id UUID REFERENCES campaign_channels(id) ON DELETE SET NULL,
  entry_point_id UUID REFERENCES entry_points(id) ON DELETE SET NULL,
  list_id UUID REFERENCES lists(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_analytics_events_workspace_created
ON analytics_events(workspace_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_analytics_events_campaign_created
ON analytics_events(campaign_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_analytics_events_event_name
ON analytics_events(event_name, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_lead_logs_workspace_created
ON lead_logs(workspace_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_lead_logs_campaign_created
ON lead_logs(campaign_id, created_at DESC);
