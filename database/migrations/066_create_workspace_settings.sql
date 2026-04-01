CREATE TABLE IF NOT EXISTS workspace_settings (
    workspace_id UUID PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
    smtp_host TEXT NULL,
    smtp_port INTEGER NULL,
    smtp_user TEXT NULL,
    smtp_pass TEXT NULL,
    smtp_from TEXT NULL,
    created_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,
    updated_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT workspace_settings_smtp_port_positive CHECK (smtp_port IS NULL OR smtp_port > 0)
);

CREATE OR REPLACE FUNCTION touch_workspace_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_workspace_settings_updated_at ON workspace_settings;

CREATE TRIGGER trg_workspace_settings_updated_at
BEFORE UPDATE ON workspace_settings
FOR EACH ROW
EXECUTE FUNCTION touch_workspace_settings_updated_at();
