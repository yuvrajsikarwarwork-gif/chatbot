CREATE TABLE IF NOT EXISTS project_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT project_users_role_check
        CHECK (role IN ('project_admin', 'editor', 'agent', 'viewer', 'workspace_owner', 'admin', 'user')),
    CONSTRAINT project_users_status_check
        CHECK (status IN ('active', 'inactive', 'invited')),
    CONSTRAINT project_users_project_user_key
        UNIQUE (project_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_project_users_workspace_user_status
ON project_users(workspace_id, user_id, status);

CREATE INDEX IF NOT EXISTS idx_project_users_project_role_status
ON project_users(project_id, role, status);

DROP TRIGGER IF EXISTS trg_project_users_updated_at ON project_users;
CREATE TRIGGER trg_project_users_updated_at
BEFORE UPDATE ON project_users
FOR EACH ROW
EXECUTE FUNCTION touch_projects_layer_updated_at();

INSERT INTO project_users (
    workspace_id,
    project_id,
    user_id,
    role,
    status,
    created_by
)
SELECT
    upa.workspace_id,
    upa.project_id,
    upa.user_id,
    upa.role,
    upa.status,
    upa.created_by
FROM user_project_access upa
ON CONFLICT (project_id, user_id) DO UPDATE
SET
    role = EXCLUDED.role,
    status = EXCLUDED.status,
    created_by = EXCLUDED.created_by,
    updated_at = NOW();

CREATE TABLE IF NOT EXISTS support_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    requested_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    target_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    reason TEXT NOT NULL,
    requested_expires_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'open',
    resolved_by UUID REFERENCES users(id) ON DELETE SET NULL,
    resolved_at TIMESTAMPTZ,
    resolution_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT support_requests_status_check
        CHECK (status IN ('open', 'approved', 'denied', 'closed'))
);

CREATE INDEX IF NOT EXISTS idx_support_requests_workspace_status_created
ON support_requests(workspace_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_support_requests_requested_by_created
ON support_requests(requested_by, created_at DESC);

DROP TRIGGER IF EXISTS trg_support_requests_updated_at ON support_requests;
CREATE TRIGGER trg_support_requests_updated_at
BEFORE UPDATE ON support_requests
FOR EACH ROW
EXECUTE FUNCTION touch_projects_layer_updated_at();
