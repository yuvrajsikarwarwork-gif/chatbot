ALTER TABLE optimizer_alert_events
ADD COLUMN IF NOT EXISTS acknowledged_at TIMESTAMPTZ NULL,
ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ NULL,
ADD COLUMN IF NOT EXISTS acknowledged_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS resolved_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS status_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_optimizer_alert_events_status
ON optimizer_alert_events (workspace_id, status, created_at DESC);
