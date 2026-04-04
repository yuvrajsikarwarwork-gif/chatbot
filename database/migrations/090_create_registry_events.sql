CREATE TABLE IF NOT EXISTS registry_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    flow_id UUID NULL,
    node_id TEXT NULL,
    handler_id UUID NULL,
    target_flow_id UUID NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_registry_events_workspace
ON registry_events (workspace_id, event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_registry_events_flow
ON registry_events (workspace_id, flow_id, node_id, created_at DESC);
