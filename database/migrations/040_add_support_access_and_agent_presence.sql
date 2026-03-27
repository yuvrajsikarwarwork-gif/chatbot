CREATE TABLE IF NOT EXISTS support_access (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    granted_by UUID REFERENCES users(id) ON DELETE SET NULL,
    reason TEXT,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_support_access_workspace_user
ON support_access(workspace_id, user_id);

CREATE INDEX IF NOT EXISTS idx_support_access_user_expires_at
ON support_access(user_id, expires_at DESC);

CREATE TABLE IF NOT EXISTS agent_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
    project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
    login_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    logout_time TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'online',
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT agent_sessions_status_check
        CHECK (status IN ('online', 'idle', 'offline'))
);

CREATE INDEX IF NOT EXISTS idx_agent_sessions_user_status
ON agent_sessions(user_id, status, login_time DESC);

CREATE INDEX IF NOT EXISTS idx_agent_sessions_workspace_status
ON agent_sessions(workspace_id, status, login_time DESC);

CREATE TABLE IF NOT EXISTS agent_activity (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
    last_action TEXT,
    last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    active_chats INTEGER NOT NULL DEFAULT 0,
    idle_seconds INTEGER NOT NULL DEFAULT 0,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, workspace_id)
);

CREATE INDEX IF NOT EXISTS idx_agent_activity_workspace_updated_at
ON agent_activity(workspace_id, updated_at DESC);

CREATE OR REPLACE FUNCTION touch_support_access_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_support_access_updated_at ON support_access;
CREATE TRIGGER trg_support_access_updated_at
BEFORE UPDATE ON support_access
FOR EACH ROW
EXECUTE FUNCTION touch_support_access_updated_at();

DROP TRIGGER IF EXISTS trg_agent_sessions_updated_at ON agent_sessions;
CREATE TRIGGER trg_agent_sessions_updated_at
BEFORE UPDATE ON agent_sessions
FOR EACH ROW
EXECUTE FUNCTION touch_support_access_updated_at();

DROP TRIGGER IF EXISTS trg_agent_activity_updated_at ON agent_activity;
CREATE TRIGGER trg_agent_activity_updated_at
BEFORE UPDATE ON agent_activity
FOR EACH ROW
EXECUTE FUNCTION touch_support_access_updated_at();
