CREATE TABLE IF NOT EXISTS error_handlers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    flow_id UUID NOT NULL REFERENCES flows(id) ON DELETE CASCADE,
    node_id UUID NULL,
    error_type TEXT NOT NULL,
    target_flow_id UUID NOT NULL REFERENCES flows(id) ON DELETE CASCADE,
    target_node_id UUID NULL,
    priority INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_error_lookup
ON error_handlers (workspace_id, flow_id, error_type)
WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_error_handlers_target
ON error_handlers (workspace_id, target_flow_id, priority DESC, updated_at DESC);

CREATE OR REPLACE FUNCTION touch_error_handlers_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_error_handlers_updated_at ON error_handlers;
CREATE TRIGGER trigger_error_handlers_updated_at
BEFORE UPDATE ON error_handlers
FOR EACH ROW
EXECUTE FUNCTION touch_error_handlers_updated_at();
