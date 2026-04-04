CREATE TABLE IF NOT EXISTS optimizer_alert_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    flow_id UUID NULL REFERENCES flows(id) ON DELETE SET NULL,
    node_id TEXT NOT NULL,
    alert_type TEXT NOT NULL DEFAULT 'failure_spike',
    window_start TIMESTAMPTZ NOT NULL,
    window_end TIMESTAMPTZ NOT NULL,
    total_attempts INTEGER NOT NULL DEFAULT 0,
    failure_count INTEGER NOT NULL DEFAULT 0,
    failure_rate NUMERIC(10,4) NOT NULL DEFAULT 0,
    avg_confidence NUMERIC(10,4) NULL,
    sample_inputs JSONB NOT NULL DEFAULT '[]'::jsonb,
    cooldown_until TIMESTAMPTZ NULL,
    notified_channels JSONB NOT NULL DEFAULT '[]'::jsonb,
    status TEXT NOT NULL DEFAULT 'triggered',
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_optimizer_alert_events_workspace
ON optimizer_alert_events (workspace_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_optimizer_alert_events_node
ON optimizer_alert_events (workspace_id, node_id, alert_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_optimizer_alert_events_cooldown
ON optimizer_alert_events (workspace_id, node_id, alert_type, cooldown_until DESC);
